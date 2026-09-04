import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  cocktailPassports,
  menuItems,
  menuViews,
  orderLines,
  orders,
  tableSessions,
  tables,
  users,
  venues,
  waiterCalls,
  wheelSpins,
  type Order,
  type TableSession,
  type Venue,
} from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import type {
  BarPayload,
  CallView,
  CategoryPublic,
  DashboardDto,
  DashTableRow,
  ItemPublic,
  LinePublic,
  MenuPublic,
  OpenSessionView,
  PassportView,
  PendingOrderView,
  QueueOrderView,
  VenuePublic,
} from "@/lib/types";
import { formatTableLabel, orderRef, startOfToday } from "@/lib/util";

// ---------------------------------------------------------------- venue

export function toVenuePublic(v: Venue): VenuePublic {
  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    tagline: v.tagline,
    description: v.description,
    currency: v.currency,
    accentColor: v.accent_color,
    logoUrl: v.logo_url,
    address: v.address,
    phone: v.phone,
    hours: v.hours,
    instagram: v.instagram,
    wifiName: v.wifi_name,
    wifiPassword: v.wifi_password,
    published: v.is_published,
    passportEnabled: v.passport_enabled,
  };
}

export async function getVenueBySlug(slug: string): Promise<Venue | null> {
  await ensureSeeded();
  // Only active venues are reachable publicly — pending/rejected ones 404 everywhere
  const rows = await db
    .select()
    .from(venues)
    .where(and(eq(venues.slug, slug), eq(venues.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

export async function getVenueById(id: string): Promise<Venue | null> {
  const rows = await db.select().from(venues).where(eq(venues.id, id)).limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- platform admin

/** Lifecycle of a venue. Only `active` venues resolve at /m, /bar, /staff. */
export const VENUE_STATUSES = ["pending", "active", "rejected", "archived"] as const;
export type VenueStatus = (typeof VENUE_STATUSES)[number];

export function isVenueStatus(value: unknown): value is VenueStatus {
  return (
    typeof value === "string" &&
    (VENUE_STATUSES as readonly string[]).includes(value)
  );
}

/** Plans an admin may assign. */
export const VENUE_PLANS = ["free", "pro"] as const;

/** Compact owner projection — never leaks password hashes to pages. */
export interface OwnerLite {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
}

export interface AdminVenueRow {
  venue: Venue;
  owner: OwnerLite | null;
}

const ownerLite = {
  id: users.id,
  email: users.email,
  name: users.name,
  is_admin: users.is_admin,
};

/**
 * Every venue on the platform (all statuses), newest first, with its owner.
 * `q` matches name / slug / owner email (case-insensitive substring).
 */
export async function listVenuesForAdmin(opts: {
  q?: string;
  status?: VenueStatus;
} = {}): Promise<AdminVenueRow[]> {
  const q = (opts.q ?? "").trim();
  const filters = [];
  if (opts.status) filters.push(eq(venues.status, opts.status));
  if (q) {
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(
      or(
        ilike(venues.name, like),
        ilike(venues.slug, like),
        ilike(users.email, like),
      ),
    );
  }
  const rows = await db
    .select({ venue: venues, owner: ownerLite })
    .from(venues)
    .leftJoin(users, eq(venues.owner_id, users.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(venues.created_at));
  return rows.map((r) => ({ venue: r.venue, owner: r.owner ?? null }));
}

/** One venue + owner for the admin editor, regardless of status. */
export async function getVenueForAdmin(
  id: string,
): Promise<AdminVenueRow | null> {
  const rows = await db
    .select({ venue: venues, owner: ownerLite })
    .from(venues)
    .leftJoin(users, eq(venues.owner_id, users.id))
    .where(eq(venues.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  return { venue: rows[0].venue, owner: rows[0].owner ?? null };
}

/** Venue counts per status — drives the tab badges in /admin. */
export async function countVenuesByStatus(): Promise<Record<VenueStatus, number>> {
  const rows = await db
    .select({ status: venues.status, n: count() })
    .from(venues)
    .groupBy(venues.status);
  const out: Record<VenueStatus, number> = {
    pending: 0,
    active: 0,
    rejected: 0,
    archived: 0,
  };
  for (const r of rows) {
    if (isVenueStatus(r.status)) out[r.status] = Number(r.n);
  }
  return out;
}

/** All platform admins (is_admin = true), oldest first. */
export async function listAdminUsers(): Promise<OwnerLite[]> {
  return db
    .select(ownerLite)
    .from(users)
    .where(eq(users.is_admin, true))
    .orderBy(asc(users.created_at));
}

export interface AccountRow {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  createdAt: Date;
  venueCount: number;
}

/** Every account (all roles), oldest first, with how many venues they own. */
export async function listAllAccounts(): Promise<AccountRow[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      is_admin: users.is_admin,
      createdAt: users.created_at,
      venueCount: count(venues.id),
    })
    .from(users)
    .leftJoin(venues, eq(venues.owner_id, users.id))
    .groupBy(users.id)
    .orderBy(asc(users.created_at));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    is_admin: r.is_admin,
    createdAt: r.createdAt,
    venueCount: Number(r.venueCount),
  }));
}

// ---------------------------------------------------------------- passport

/** Passport guest ids are client-generated UUIDs kept in localStorage. */
const GUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuestId(value: unknown): value is string {
  return typeof value === "string" && GUEST_ID_RE.test(value);
}

/** Every 10th cocktail is free. */
export const PASSPORT_EVERY = 10;

function passportViewFor(stamps: number, freeServed: number): PassportView {
  return {
    enabled: true,
    stamps,
    progress: stamps % PASSPORT_EVERY,
    freeServed,
    nextFreeIn: PASSPORT_EVERY - (stamps % PASSPORT_EVERY),
  };
}

/** Snapshot of a guest's passport at a venue, or null when not applicable. */
export async function getPassport(
  venueId: string,
  guestId: string | null | undefined,
  enabled: boolean,
): Promise<PassportView | null> {
  if (!enabled || !isGuestId(guestId)) return null;
  const rows = await db
    .select()
    .from(cocktailPassports)
    .where(
      and(
        eq(cocktailPassports.venue_id, venueId),
        eq(cocktailPassports.guest_id, guestId),
      ),
    )
    .limit(1);
  const p = rows[0];
  return passportViewFor(p?.stamps ?? 0, p?.free_served ?? 0);
}

// ---------------------------------------------------------------- sessions

export async function getOpenSession(
  venueId: string,
  tableId: string,
): Promise<TableSession | null> {
  const rows = await db
    .select()
    .from(tableSessions)
    .where(
      and(
        eq(tableSessions.venue_id, venueId),
        eq(tableSessions.table_id, tableId),
        eq(tableSessions.status, "open"),
      ),
    )
    .orderBy(desc(tableSessions.opened_at))
    .limit(1);
  return rows[0] ?? null;
}

/** Open a session for a table if none is open (like a waiter opening a POS table). */
export async function openSessionForTable(
  venueId: string,
  tableId: string,
): Promise<TableSession> {
  const existing = await getOpenSession(venueId, tableId);
  if (existing) return existing;
  const rows = await db
    .insert(tableSessions)
    .values({ venue_id: venueId, table_id: tableId })
    .returning();
  return rows[0];
}

export async function isSessionTrusted(sessionId: string): Promise<boolean> {
  const rows = await db
    .select({ n: count() })
    .from(orders)
    .where(
      and(
        eq(orders.session_id, sessionId),
        inArray(orders.status, ["new", "making", "served", "closed"]),
      ),
    );
  return rows[0].n > 0;
}

const OPEN_ORDER_STATUS = ["new", "making", "served"] as const;

export async function runningSessionTotals(venueId: string, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({
      session_id: orders.session_id,
      total: sql<number>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.venue_id, venueId),
        inArray(orders.session_id, sessionIds),
        inArray(orders.status, [...OPEN_ORDER_STATUS]),
      ),
    )
    .groupBy(orders.session_id);
  return new Map(rows.map((r) => [r.session_id, Number(r.total)]));
}

/** Close a table (payment done at the cash desk). Ends the session. */
export async function closeTableSession(venueId: string, tableId: string) {
  const session = await getOpenSession(venueId, tableId);
  if (!session) return null;
  const now = new Date();
  await db
    .update(orders)
    .set({ status: "declined", closed_at: now })
    .where(
      and(
        eq(orders.session_id, session.id),
        eq(orders.status, "pending_confirm"),
      ),
    );
  await db
    .update(orders)
    .set({ status: "closed", closed_at: now })
    .where(
      and(
        eq(orders.session_id, session.id),
        inArray(orders.status, ["new", "making", "served"]),
      ),
    );
  await db
    .update(tableSessions)
    .set({ status: "closed", closed_at: now })
    .where(eq(tableSessions.id, session.id));
  return session;
}

// ---------------------------------------------------------------- menu

export async function buildMenu(venue: Venue): Promise<MenuPublic> {
  const catRows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.venue_id, venue.id), eq(categories.is_visible, true)))
    .orderBy(asc(categories.sort_order));
  const itemRows = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.venue_id, venue.id))
    .orderBy(asc(menuItems.sort_order));
  const byCat = new Map<string, ItemPublic[]>();
  for (const it of itemRows) {
    const list = byCat.get(it.category_id) ?? [];
    list.push({
      id: it.id,
      categoryId: it.category_id,
      name: it.name,
      nameAlt: it.name_alt,
      description: it.description,
      descriptionAlt: it.description_alt,
      price: it.price,
      tags: it.tags ?? [],
      allergens: it.allergens ?? [],
      imageUrl: it.image_url,
      isAvailable: it.is_available,
    });
    byCat.set(it.category_id, list);
  }
  const cats: CategoryPublic[] = catRows.map((c) => ({
    id: c.id,
    name: c.name,
    nameAlt: c.name_alt,
    description: c.description,
    descriptionAlt: c.description_alt,
    kind: c.kind,
    items: byCat.get(c.id) ?? [],
  }));
  return { venue: toVenuePublic(venue), categories: cats };
}

export async function logMenuView(venueId: string, tableId: string | null) {
  await db
    .insert(menuViews)
    .values({ venue_id: venueId, table_id: tableId })
    .catch(() => undefined);
}

// ---------------------------------------------------------------- bar payload

type OrderWithTable = Order & { tableLabel: string };

async function loadOrdersByStatus(
  venueId: string,
  statuses: Order["status"][],
): Promise<OrderWithTable[]> {
  const rows = await db
    .select({
      order: orders,
      label: tables.label,
    })
    .from(orders)
    .innerJoin(tables, eq(orders.table_id, tables.id))
    .where(
      and(eq(orders.venue_id, venueId), inArray(orders.status, statuses)),
    )
    .orderBy(desc(orders.created_at));
  return rows.map((r) => ({ ...r.order, tableLabel: r.label }));
}

async function loadLines(orderIds: string[]): Promise<Map<string, LinePublic[]>> {
  const map = new Map<string, LinePublic[]>();
  if (orderIds.length === 0) return map;
  const rows = await db
    .select()
    .from(orderLines)
    .where(inArray(orderLines.order_id, orderIds))
    .orderBy(asc(orderLines.id));
  for (const l of rows) {
    const list = map.get(l.order_id) ?? [];
    list.push({ name: l.name_snapshot, price: l.price_snapshot, qty: l.qty });
    map.set(l.order_id, list);
  }
  return map;
}

export async function buildBarPayload(venue: Venue): Promise<BarPayload> {
  const venuePub = toVenuePublic(venue);

  const tableRows = await db
    .select()
    .from(tables)
    .where(eq(tables.venue_id, venue.id))
    .orderBy(asc(tables.sort_order));

  const sessionRows = await db
    .select()
    .from(tableSessions)
    .where(
      and(eq(tableSessions.venue_id, venue.id), eq(tableSessions.status, "open")),
    )
    .orderBy(asc(tableSessions.opened_at));
  const sessionByTable = new Map(
    sessionRows.map((s) => [s.table_id, s] as const),
  );
  const sessionIds = sessionRows.map((s) => s.id);
  const totals = await runningSessionTotals(venue.id, sessionIds);

  const openSessions: OpenSessionView[] = sessionRows
    .map((s) => {
      const t = tableRows.find((x) => x.id === s.table_id);
      return {
        id: s.id,
        tableId: s.table_id,
        tableLabel: t ? formatTableLabel(t.label) : "?",
        openedAt: s.opened_at.toISOString(),
        total: totals.get(s.id) ?? 0,
        pendingCount: 0,
      };
    })
    .filter((s): s is OpenSessionView => Boolean(s));

  const allOrderRows = await loadOrdersByStatus(venue.id, [
    "pending_confirm",
    "new",
    "making",
    "served",
  ]);
  const openIds = new Set(sessionIds);
  const relevant = allOrderRows.filter((o) => openIds.has(o.session_id));
  const lineMap = await loadLines(relevant.map((o) => o.id));

  const pending: PendingOrderView[] = [];
  const queue: QueueOrderView[] = [];
  for (const o of relevant) {
    const base = {
      id: o.id,
      ref: orderRef(o.id),
      tableId: o.table_id,
      tableLabel: o.tableLabel,
      source: o.source === "wheel" ? ("wheel" as const) : ("menu" as const),
      note: o.note,
      total: o.total,
      createdAt: o.created_at.toISOString(),
      lines: lineMap.get(o.id) ?? [],
    };
    if (o.status === "pending_confirm") {
      pending.push(base);
    } else {
      queue.push({ ...base, status: o.status as QueueOrderView["status"] });
    }
  }

  // Fill pending counts on open sessions.
  const pendingBySession = new Map<string, number>();
  for (const o of relevant) {
    if (o.status === "pending_confirm") {
      pendingBySession.set(
        o.session_id,
        (pendingBySession.get(o.session_id) ?? 0) + 1,
      );
    }
  }
  for (const s of openSessions) {
    s.pendingCount = pendingBySession.get(s.id) ?? 0;
  }

  const callRows = await db
    .select({
      call: waiterCalls,
      label: tables.label,
    })
    .from(waiterCalls)
    .innerJoin(tables, eq(waiterCalls.table_id, tables.id))
    .where(
      and(
        eq(waiterCalls.venue_id, venue.id),
        sql`${waiterCalls.resolved_at} is null`,
      ),
    )
    .orderBy(desc(waiterCalls.created_at));
  const calls: CallView[] = callRows.map((r) => ({
    id: r.call.id,
    tableId: r.call.table_id,
    tableLabel: r.label,
    createdAt: r.call.created_at.toISOString(),
  }));

  const today = await todayStats(venue.id);

  return {
    venue: venuePub,
    tables: tableRows.map((t) => ({ id: t.id, label: formatTableLabel(t.label) })),
    today: { orders: today.orders, revenue: today.revenue },
    pending,
    queue,
    openSessions,
    calls,
  };
}

export { formatTableLabel } from "@/lib/util";

export interface TodayStats {
  orders: number;
  revenue: number;
  avgTicket: number;
  spins: number;
}

export async function todayStats(venueId: string): Promise<TodayStats> {
  const since = startOfToday();
  const orderAgg = await db
    .select({
      n: count(),
      total: sql<number>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.venue_id, venueId),
        inArray(orders.status, ["new", "making", "served", "closed"]),
        sql`${orders.created_at} >= ${since}`,
      ),
    );
  const spinAgg = await db
    .select({ n: count() })
    .from(wheelSpins)
    .where(and(eq(wheelSpins.venue_id, venueId), sql`${wheelSpins.spun_at} >= ${since}`));
  const n = orderAgg[0].n;
  const revenue = Number(orderAgg[0].total);
  return {
    orders: n,
    revenue,
    avgTicket: n > 0 ? revenue / n : 0,
    spins: spinAgg[0].n,
  };
}

// ---------------------------------------------------------------- dashboard

export async function buildDashboardDto(venue: Venue): Promise<DashboardDto> {
  const venuePub = toVenuePublic(venue);
  const tableRows = await db
    .select()
    .from(tables)
    .where(eq(tables.venue_id, venue.id))
    .orderBy(asc(tables.sort_order));
  const openRows = await db
    .select()
    .from(tableSessions)
    .where(
      and(eq(tableSessions.venue_id, venue.id), eq(tableSessions.status, "open")),
    );
  const openById = new Map(openRows.map((s) => [s.table_id, s]));
  const sessionIds = openRows.map((s) => s.id);
  const totals = await runningSessionTotals(venue.id, sessionIds);

  const tablesView: DashTableRow[] = tableRows.map((t) => {
    const s = openById.get(t.id);
    return {
      id: t.id,
      label: formatTableLabel(t.label),
      status: s ? "open" : "free",
      sessionId: s?.id ?? null,
      openedAt: s ? s.opened_at.toISOString() : null,
      sessionTotal: s ? (totals.get(s.id) ?? 0) : 0,
    };
  });

  const since = startOfToday();
  const today = await todayStats(venue.id);

  const byTableRows = await db
    .select({
      label: tables.label,
      n: count(),
      total: sql<number>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(orders)
    .innerJoin(tables, eq(orders.table_id, tables.id))
    .where(
      and(
        eq(orders.venue_id, venue.id),
        inArray(orders.status, ["new", "making", "served", "closed"]),
        sql`${orders.created_at} >= ${since}`,
      ),
    )
    .groupBy(tables.label)
    .orderBy(desc(sql`coalesce(sum(${orders.total}), 0)`));

  const confirmedIds = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.venue_id, venue.id),
        inArray(orders.status, ["new", "making", "served", "closed"]),
        sql`${orders.created_at} >= ${since}`,
      ),
    );
  const topRows =
    confirmedIds.length === 0
      ? []
      : await db
          .select({
            name: orderLines.name_snapshot,
            qty: sql<number>`sum(${orderLines.qty})`,
            total: sql<number>`sum(${orderLines.price_snapshot} * ${orderLines.qty})`,
          })
          .from(orderLines)
          .where(inArray(orderLines.order_id, confirmedIds.map((r) => r.id)))
          .groupBy(orderLines.name_snapshot)
          .orderBy(desc(sql`sum(${orderLines.qty})`))
          .limit(5);

  const pendingCount = await db
    .select({ n: count() })
    .from(orders)
    .where(
      and(
        eq(orders.venue_id, venue.id),
        eq(orders.status, "pending_confirm"),
      ),
    );

  return {
    venue: venuePub,
    tables: tablesView,
    today: {
      orders: today.orders,
      revenue: today.revenue,
      avgTicket: today.avgTicket,
      spins: today.spins,
      byTable: byTableRows.map((r) => ({
        label: formatTableLabel(r.label),
        orders: r.n,
        revenue: Number(r.total),
      })),
      topItems: topRows.map((r) => ({
        name: r.name,
        qty: Number(r.qty),
        total: Number(r.total),
      })),
    },
    openSessionsCount: openRows.length,
    pendingCount: pendingCount[0].n,
  };
}

// ---------------------------------------------------------------- order placement

export interface PlaceOrderInput {
  venueId: string;
  tableId: string;
  lines: { itemId: string; qty: number; pairOf?: string }[];
  note?: string;
  source?: "menu" | "wheel";
  /** Client-generated UUID (localStorage) that owns the guest's passport. */
  guestId?: string;
  /** Client-reported epoch ms of when the guest first opened the menu
   *  (used only to honour the 5-minute first-order welcome deal). */
  firstSeenAt?: number;
}

export interface PlaceOrderResult {
  orderId: string;
  ref: string;
  status: Order["status"];
  total: number;
  isFirstOfSession: boolean;
  /** True when the −10% first-order welcome deal was applied to total. */
  firstOrderDiscount: boolean;
  /** Updated passport snapshot when this order banked cocktail stamps. */
  passport?: PassportView;
  /** Free cocktail units granted by THIS order (client receipt mirror). */
  freeGranted: number;
  createdAt: Date;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const venueId = input.venueId;
  const tableId = input.tableId;

  const result = await db.transaction(async (tx) => {
    // Re-check open session inside the transaction.
    const openRows = await tx
      .select()
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.venue_id, venueId),
          eq(tableSessions.table_id, tableId),
          eq(tableSessions.status, "open"),
        ),
      )
      .limit(1);
    let session: TableSession;
    if (openRows.length > 0) {
      session = openRows[0];
    } else {
      const created = await tx
        .insert(tableSessions)
        .values({ venue_id: venueId, table_id: tableId })
        .returning();
      session = created[0];
    }

    const venueFlags = await tx
      .select({ passport_enabled: venues.passport_enabled })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    const passportEnabled = venueFlags[0]?.passport_enabled ?? false;

    const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
    if (itemIds.length === 0) throw new Error("empty_order");
    const items = await tx
      .select()
      .from(menuItems)
      .where(
        and(
          eq(menuItems.venue_id, venueId),
          inArray(menuItems.id, itemIds),
          eq(menuItems.is_available, true),
        ),
      );
    const itemById = new Map(items.map((i) => [i.id, i]));
    if (itemById.size !== itemIds.length) throw new Error("item_unavailable");

    let total = 0;
    const lineValues: {
      order_id: string;
      menu_item_id: string;
      name_snapshot: string;
      price_snapshot: number;
      qty: number;
    }[] = [];
    const orderId = crypto.randomUUID();
    for (const l of input.lines) {
      const item = itemById.get(l.itemId)!;
      if (!Number.isFinite(l.qty) || l.qty < 1 || l.qty > 20) {
        throw new Error("bad_qty");
      }
      // Pair deal: a line flagged pairOf gets −10% when its pair item is part
      // of the same order. Priced server-side from the DB (client prices are
      // never trusted) so UI and receipt always agree.
      const pairId = l.pairOf?.trim();
      const isPair = !!pairId && pairId !== l.itemId && itemById.has(pairId);
      const unit = isPair
        ? Math.round(item.price * 0.9 * 100) / 100
        : item.price;
      total += unit * l.qty;
      lineValues.push({
        order_id: orderId,
        menu_item_id: item.id,
        name_snapshot: item.name,
        price_snapshot: unit,
        qty: l.qty,
      });
    }
    total = Math.round(total * 100) / 100;

    // ── Cocktail passport ──
    // One stamp per cocktail unit (category kind === "cocktail"); every 10th
    // cocktail is free. Stamps persist per guest across visits (guestId lives
    // in the guest's localStorage). Free units are the cheapest cocktail
    // unit(s) of this order and are written as €0 lines on the receipt.
    // Priced entirely server-side from DB rows; the client only mirrors.
    let passport: PassportView | null = null;
    let passportFreeThis = 0;
    const passportGuest = (input.guestId ?? "").trim();
    if (passportEnabled && isGuestId(passportGuest)) {
      const catRows = await tx
        .select({ id: categories.id, kind: categories.kind })
        .from(categories)
        .where(eq(categories.venue_id, venueId));
      const kindByCat = new Map(catRows.map((r) => [r.id, r.kind]));
      const isCocktailLine = (itemId: string) =>
        kindByCat.get(itemById.get(itemId)?.category_id ?? "") === "cocktail";

      const pRows = await tx
        .select()
        .from(cocktailPassports)
        .where(
          and(
            eq(cocktailPassports.venue_id, venueId),
            eq(cocktailPassports.guest_id, passportGuest),
          ),
        )
        .limit(1);
      const prevStamps = pRows[0]?.stamps ?? 0;
      const prevFree = pRows[0]?.free_served ?? 0;
      const cockQty = input.lines
        .filter((l) => isCocktailLine(l.itemId))
        .reduce((sum, l) => sum + (l.qty > 0 ? l.qty : 0), 0);
      if (cockQty > 0) {
        const before = Math.floor(prevStamps / PASSPORT_EVERY);
        const after = Math.floor((prevStamps + cockQty) / PASSPORT_EVERY);
        const freeGranted = after - before;
        passportFreeThis = freeGranted;

        if (freeGranted > 0) {
          const units: { lIdx: number; unit: number }[] = [];
          input.lines.forEach((l, lIdx) => {
            if (!isCocktailLine(l.itemId) || !(l.qty > 0)) return;
            const item = itemById.get(l.itemId)!;
            const pairId = l.pairOf?.trim();
            const isPair =
              !!pairId && pairId !== l.itemId && itemById.has(pairId);
            const unit = isPair
              ? Math.round(item.price * 0.9 * 100) / 100
              : item.price;
            for (let i = 0; i < l.qty; i++) units.push({ lIdx, unit });
          });
          units.sort((a, b) => a.unit - b.unit);
          const freeUnits = units.slice(0, freeGranted);
          const freeByLine = new Map<number, number>();
          let saved = 0;
          for (const f of freeUnits) {
            freeByLine.set(f.lIdx, (freeByLine.get(f.lIdx) ?? 0) + 1);
            saved += f.unit;
          }
          saved = Math.round(saved * 100) / 100;
          if (saved > 0) {
            total = Math.round((total - saved) * 100) / 100;
            const out: typeof lineValues = [];
            lineValues.forEach((lv, lIdx) => {
              const freeN = freeByLine.get(lIdx) ?? 0;
              if (freeN <= 0) out.push(lv);
              else if (freeN >= lv.qty)
                out.push({ ...lv, price_snapshot: 0 });
              else {
                out.push({ ...lv, qty: lv.qty - freeN });
                out.push({ ...lv, qty: freeN, price_snapshot: 0 });
              }
            });
            lineValues.length = 0;
            lineValues.push(...out);
          }
        }

        const newStamps = prevStamps + cockQty;
        const newFree = prevFree + freeGranted;
        if (pRows.length > 0) {
          await tx
            .update(cocktailPassports)
            .set({
              stamps: newStamps,
              free_served: newFree,
              updated_at: new Date(),
            })
            .where(eq(cocktailPassports.id, pRows[0].id));
        } else {
          await tx
            .insert(cocktailPassports)
            .values({
              venue_id: venueId,
              guest_id: passportGuest,
              stamps: newStamps,
              free_served: newFree,
            });
        }
        passport = passportViewFor(newStamps, newFree);
      }
    }

    // Trusted session? Then this order goes straight to the bar queue.
    const trustRows = await tx
      .select({ n: count() })
      .from(orders)
      .where(
        and(
          eq(orders.session_id, session.id),
          inArray(orders.status, ["new", "making", "served", "closed"]),
        ),
      );
    const trusted = trustRows[0].n > 0;
    const status: Order["status"] = trusted ? "new" : "pending_confirm";

    // First-order welcome deal: −10% off when this really is the session's
    // first order AND the guest sends it within 5 minutes of first opening
    // the menu (client reports firstSeenAt; the server enforces the window
    // and the first-order rule, so the client can never self-serve it).
    const nowMs = Date.now();
    const firstSeenAt = input.firstSeenAt;
    const firstOrderBonus =
      !trusted &&
      typeof firstSeenAt === "number" &&
      Number.isFinite(firstSeenAt) &&
      firstSeenAt - nowMs <= 60_000 && // client clock may run a little ahead
      nowMs - firstSeenAt <= 5 * 60_000;
    if (firstOrderBonus) {
      total = Math.round(total * 0.9 * 100) / 100;
    }

    const created = await tx
      .insert(orders)
      .values({
        id: orderId,
        venue_id: venueId,
        table_id: tableId,
        session_id: session.id,
        status,
        source: input.source ?? "menu",
        note: input.note ?? "",
        total,
      })
      .returning();
    await tx.insert(orderLines).values(lineValues);
    return { order: created[0], trusted, firstOrderBonus, passport, passportFreeThis };
  });

  return {
    orderId: result.order.id,
    ref: orderRef(result.order.id),
    status: result.order.status,
    total: result.order.total,
    isFirstOfSession: !result.trusted,
    firstOrderDiscount: result.firstOrderBonus,
    freeGranted: result.passportFreeThis ?? 0,
    passport: result.passport ?? undefined,
    createdAt: result.order.created_at,
  };
}

/** Public view of one order for the guest status screen. */
export async function getOrderViewById(orderId: string) {
  const rows = await db
    .select({ order: orders, label: tables.label })
    .from(orders)
    .innerJoin(tables, eq(orders.table_id, tables.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (rows.length === 0) return null;
  const o = rows[0].order;
  const lineRows = await db
    .select()
    .from(orderLines)
    .where(eq(orderLines.order_id, orderId))
    .orderBy(asc(orderLines.id));
  return {
    id: o.id,
    ref: orderRef(o.id),
    status: o.status,
    source: o.source === "wheel" ? ("wheel" as const) : ("menu" as const),
    note: o.note,
    total: o.total,
    createdAt: o.created_at.toISOString(),
    closedAt: o.closed_at ? o.closed_at.toISOString() : null,
    tableLabel: rows[0].label,
    lines: lineRows.map((l) => ({
      name: l.name_snapshot,
      price: l.price_snapshot,
      qty: l.qty,
    })),
  };
}
