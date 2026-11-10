"use server";

import { and, asc, count, eq, inArray, max, ne, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  categories,
  cocktailPassports,
  menuItems,
  menuViews,
  orderLines,
  orders,
  paymentEvents,
  paymentOrders,
  payments,
  tableSessions,
  tables,
  users,
  venues,
  waiterCalls,
  wheelSpins,
  type Venue,
} from "@/db/schema";
import {
  createSessionToken,
  hashPassword,
  logoutUser,
  requireAdmin,
  requireUser,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import {
  closeTableSession,
  openSessionForTable,
  VENUE_PLANS,
} from "@/lib/core";
import { clearLimit, hitLimit, ipFromForwarded } from "@/lib/rate-limit";
import { ensureSeeded } from "@/lib/seed";
import { randomPin, siteUrl } from "@/lib/site";
import { notifyOperator } from "@/lib/tg";
import { demoBlocked, resolvePaymentAlert, vivaCreds } from "@/lib/payments";
import { openSecret, sealSecret } from "@/lib/secrets";
import {
  credentialsComplete,
  fetchWebhookKey,
  getAccessToken,
  VivaError,
  type VivaEnv,
} from "@/lib/viva";
import { slugify } from "@/lib/util";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ActionRes {
  error?: string;
  ok?: boolean;
  id?: string;
  /** Free-form confirmation line for the UI (e.g. "Connected — merchant AMBROSIA"). */
  notice?: string;
}

function uniqueViolation(err: unknown) {
  return (err as { code?: string })?.code === "23505";
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const TOO_MANY_LOGINS = "Too many attempts. Please wait 15 minutes and try again.";

async function callerIp(): Promise<string> {
  return ipFromForwarded((await headers()).get("x-forwarded-for"));
}

/**
 * Password guessing brake, counted in the database so it holds across server
 * instances: 8 attempts per account and 30 per address in 15 minutes. The
 * per-account count is cleared by a successful login.
 */
async function loginThrottled(email: string): Promise<boolean> {
  const byIp = await hitLimit(`login-ip:${await callerIp()}`, 30, LOGIN_WINDOW_MS);
  const byEmail = await hitLimit(`login:${email}`, 8, LOGIN_WINDOW_MS);
  return byIp.limited || byEmail.limited;
}

async function getOwnerVenue(): Promise<Venue> {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(venues)
    .where(eq(venues.owner_id, user.id))
    .limit(1);
  if (rows.length === 0) redirect("/");
  // While pending/rejected the venue is read-only — bounce every edit to the
  // dashboard, whose layout renders the review screen instead of the app.
  if (rows[0].status !== "active") redirect("/dashboard");
  return rows[0];
}

// ---------------------------------------------------------------- auth

export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<ActionRes> {
  await ensureSeeded();
  const email = (input.email ?? "").trim().toLowerCase();
  const password = input.password ?? "";
  if (!email || !password) return { error: "Enter your email and password." };
  if (email.length > 200 || password.length > 200) return { error: "Wrong email or password." };
  if (await loginThrottled(email)) return { error: TOO_MANY_LOGINS };
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Wrong email or password." };
  }
  await clearLimit(`login:${email}`);
  const token = await createSessionToken(user.id);
  await setSessionCookie(token);
  // Platform admins land in the panel; venue owners always go to their dashboard.
  redirect(user.is_admin ? "/admin" : "/dashboard");
}

/**
 * Sign-in for the platform-admin entrance (/admin/login).
 * Same credential check as `loginAction`, but a session is only created when
 * the account actually has `is_admin` — a valid owner login is rejected with a
 * clear message and stays logged out.
 */
export async function adminLoginAction(input: {
  email: string;
  password: string;
}): Promise<ActionRes> {
  await ensureSeeded();
  const email = (input.email ?? "").trim().toLowerCase();
  const password = input.password ?? "";
  if (!email || !password) return { error: "Enter your email and password." };
  if (email.length > 200 || password.length > 200) return { error: "Invalid email or password." };
  if (await loginThrottled(email)) return { error: TOO_MANY_LOGINS };
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  // One answer for a wrong password and for a correct password on a non-admin
  // account, so this door does not confirm an owner's password to a guesser.
  if (!user || !(await verifyPassword(password, user.password_hash)) || !user.is_admin) {
    return { error: "Invalid email or password." };
  }
  await clearLimit(`login:${email}`);
  const token = await createSessionToken(user.id);
  await setSessionCookie(token);
  redirect("/admin");
}

export async function signupAction(input: {
  name: string;
  email: string;
  password: string;
  venueName: string;
  slug: string;
}): Promise<ActionRes> {
  await ensureSeeded();
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const password = input.password ?? "";
  const venueName = (input.venueName ?? "").trim();
  let slug = slugify(input.slug || venueName);
  if (!name) return { error: "Please enter your name." };
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email." };
  if (password.length < 10) return { error: "Password must be at least 10 characters." };
  if (name.length > 120 || email.length > 200 || password.length > 200 || venueName.length > 120) {
    return { error: "One of the fields is too long." };
  }
  if ((await hitLimit(`signup-ip:${await callerIp()}`, 5, 60 * 60 * 1000)).limited) {
    return { error: "Too many sign-ups from this connection. Please try again in an hour." };
  }
  if (!venueName) return { error: "Please name your venue." };
  if (!slug) return { error: "Please choose a URL slug for your venue." };
  if (slug === "ambrosia") return { error: "That slug is taken. Try another." };

  const takenUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (takenUser.length > 0) return { error: "An account with this email already exists." };
  const takenSlug = await db.select().from(venues).where(eq(venues.slug, slug)).limit(1);
  if (takenSlug.length > 0) return { error: "That venue URL is taken. Try another slug." };

  const passwordHash = await hashPassword(password);
  try {
    const user = await db
      .insert(users)
      .values({ email, name, password_hash: passwordHash })
      .returning();
    const venue = await db
      .insert(venues)
      .values({
        owner_id: user[0].id,
        slug,
        name: venueName,
        tagline: "Welcome — edit your venue details in Settings",
        // Random per venue: a shared default PIN would open every new bar screen.
        bar_pin: randomPin(),
        // New venues start unpublished and gated behind the approval queue.
        is_published: false,
        status: "pending",
      })
      .returning();
    await db.insert(tables).values(
      Array.from({ length: 8 }, (_, i) => ({
        venue_id: venue[0].id,
        label: String(i + 1),
        sort_order: i + 1,
      })).concat([{ venue_id: venue[0].id, label: "Bar", sort_order: 9 }]),
    );
    const token = await createSessionToken(user[0].id);
    await setSessionCookie(token);
    await notifyOperator(
      [
        "🆕 Ordavo — new venue application",
        `${venueName}  (${slug})`,
        `${name} — ${email}`,
        `${siteUrl()}/admin`,
      ].join("\n"),
    );
  } catch (err) {
    if (uniqueViolation(err)) return { error: "Email or venue URL already in use." };
    return { error: errText(err) };
  }
  redirect("/dashboard");
}

export async function logoutAction() {
  await logoutUser();
  redirect("/");
}

// ---------------------------------------------------------------- settings

const WEAK_PINS = new Set(["1234", "4321", "123456", "654321", "0123", "1212"]);

const OWNER_EDITABLE_FIELDS = [
  "name",
  "tagline",
  "description",
  "currency",
  "accent_color",
  "logo_url",
  "address",
  "phone",
  "hours",
  "instagram",
  "wifi_name",
  "wifi_password",
  "bar_pin",
  "is_published",
] as const;

export async function updateVenueAction(
  fields: Partial<{
    name: string;
    tagline: string;
    description: string;
    currency: string;
    accent_color: string;
    logo_url: string;
    address: string;
    phone: string;
    hours: string;
    instagram: string;
    wifi_name: string;
    wifi_password: string;
    bar_pin: string;
    is_published: boolean;
  }>,
): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  // Server actions are public POST endpoints: the TypeScript type above does not
  // constrain what a client sends. Copy only the fields an owner may change, so
  // plan, slug, owner, payment flags and Viva credentials cannot be set here.
  const safe: Record<string, unknown> = {};
  for (const k of OWNER_EDITABLE_FIELDS) {
    if (k in (fields as Record<string, unknown>)) {
      safe[k] = (fields as Record<string, unknown>)[k];
    }
  }
  const built = buildVenuePatch(safe);
  if ("error" in built) return { error: built.error };
  try {
    await db.update(venues).set(built.patch).where(eq(venues.id, venue.id));
  } catch (err) {
    return { error: errText(err) };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Validate + normalise a venue profile patch. Shared by the owner settings
 * action and the platform-admin editor so both enforce identical rules.
 */
function buildVenuePatch(
  fields: Record<string, unknown>,
): { patch: Record<string, unknown> } | { error: string } {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    patch[k] = v;
  }
  if ("bar_pin" in patch) {
    const pin = String(patch.bar_pin ?? "");
    if (!/^\d{4,6}$/.test(pin)) return { error: "Bar PIN must be 4–6 digits." };
    if (WEAK_PINS.has(pin) || /^(\d)\1+$/.test(pin)) {
      return { error: "That PIN is too easy to guess. Choose another one." };
    }
    patch.bar_pin = pin;
  }
  if ("name" in patch) {
    const name = String(patch.name ?? "").trim();
    if (!name) return { error: "Venue name is required." };
    patch.name = name;
  }
  if ("accent_color" in patch) {
    const c = String(patch.accent_color);
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return { error: "Accent must be a hex colour." };
  }
  if ("is_published" in patch) patch.is_published = Boolean(patch.is_published);
  if ("currency" in patch) {
    const cur = String(patch.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) return { error: "Currency must be a 3-letter code." };
    patch.currency = cur;
  }
  if ("plan" in patch) {
    const plan = String(patch.plan).trim().toLowerCase();
    if (!(VENUE_PLANS as readonly string[]).includes(plan)) {
      return { error: `Plan must be one of: ${VENUE_PLANS.join(", ")}.` };
    }
    patch.plan = plan;
  }
  return { patch };
}

// ---------------------------------------------------------------- categories

export async function saveCategoryAction(input: {
  id?: string;
  name: string;
  nameAlt?: string;
  description?: string;
  descriptionAlt?: string;
  isVisible?: boolean;
}): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  const name = (input.name ?? "").trim();
  if (!name) return { error: "Category name is required." };
  try {
    if (input.id) {
      await db
        .update(categories)
        .set({
          name,
          name_alt: input.nameAlt ?? "",
          description: input.description ?? "",
          description_alt: input.descriptionAlt ?? "",
          is_visible: input.isVisible ?? true,
        })
        .where(and(eq(categories.id, input.id), eq(categories.venue_id, venue.id)));
    } else {
      const agg = await db
        .select({ m: max(categories.sort_order) })
        .from(categories)
        .where(eq(categories.venue_id, venue.id));
      await db.insert(categories).values({
        venue_id: venue.id,
        name,
        name_alt: input.nameAlt ?? "",
        description: input.description ?? "",
        description_alt: input.descriptionAlt ?? "",
        sort_order: (agg[0].m ?? -1) + 1,
        is_visible: input.isVisible ?? true,
      });
    }
  } catch (err) {
    return { error: errText(err) };
  }
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

export async function deleteCategoryAction(id: string): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.venue_id, venue.id)));
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

export async function moveCategoryAction(
  id: string,
  dir: -1 | 1,
): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  const list = await db
    .select()
    .from(categories)
    .where(eq(categories.venue_id, venue.id))
    .orderBy(asc(categories.sort_order));
  const idx = list.findIndex((c) => c.id === id);
  const swapWith = idx + dir;
  if (idx < 0 || swapWith < 0 || swapWith >= list.length) return { ok: true };
  const a = list[idx];
  const b = list[swapWith];
  await db.transaction(async (tx) => {
    await tx.update(categories).set({ sort_order: b.sort_order }).where(eq(categories.id, a.id));
    await tx.update(categories).set({ sort_order: a.sort_order }).where(eq(categories.id, b.id));
  });
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

// ---------------------------------------------------------------- items

export interface ItemInput {
  id?: string;
  categoryId: string;
  name: string;
  nameAlt?: string;
  description?: string;
  descriptionAlt?: string;
  price: number;
  tags: string[];
  allergens: string[];
  imageUrl?: string;
  isAvailable?: boolean;
}

export async function saveItemAction(input: ItemInput): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  const name = (input.name ?? "").trim();
  const price = Number(input.price);
  if (!name) return { error: "Item name is required." };
  if (!Number.isFinite(price) || price < 0) return { error: "Enter a valid price." };
  const cat = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, input.categoryId), eq(categories.venue_id, venue.id)))
    .limit(1);
  if (cat.length === 0) return { error: "Category not found." };
  try {
    if (input.id) {
      await db
        .update(menuItems)
        .set({
          category_id: input.categoryId,
          name,
          name_alt: input.nameAlt ?? "",
          description: input.description ?? "",
          description_alt: input.descriptionAlt ?? "",
          price,
          tags: input.tags ?? [],
          allergens: input.allergens ?? [],
          image_url: input.imageUrl ?? "",
          is_available: input.isAvailable ?? true,
        })
        .where(and(eq(menuItems.id, input.id), eq(menuItems.venue_id, venue.id)));
    } else {
      const agg = await db
        .select({ m: max(menuItems.sort_order) })
        .from(menuItems)
        .where(eq(menuItems.category_id, input.categoryId));
      await db.insert(menuItems).values({
        venue_id: venue.id,
        category_id: input.categoryId,
        name,
        name_alt: input.nameAlt ?? "",
        description: input.description ?? "",
        description_alt: input.descriptionAlt ?? "",
        price,
        tags: input.tags ?? [],
        allergens: input.allergens ?? [],
        image_url: input.imageUrl ?? "",
        is_available: input.isAvailable ?? true,
        sort_order: (agg[0].m ?? -1) + 1,
      });
    }
  } catch (err) {
    return { error: errText(err) };
  }
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

export async function deleteItemAction(id: string): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  await db
    .delete(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.venue_id, venue.id)));
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

export async function moveItemAction(
  id: string,
  dir: -1 | 1,
): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  if (dir !== -1 && dir !== 1) return { error: "Invalid direction." };
  const item = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.venue_id, venue.id)))
    .limit(1);
  if (item.length === 0) return { ok: true };
  const list = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.category_id, item[0].category_id))
    .orderBy(asc(menuItems.sort_order));
  const idx = list.findIndex((i) => i.id === id);
  const swapWith = idx + dir;
  if (idx < 0 || swapWith < 0 || swapWith >= list.length) return { ok: true };
  const a = list[idx];
  const b = list[swapWith];
  await db.transaction(async (tx) => {
    await tx.update(menuItems).set({ sort_order: b.sort_order }).where(eq(menuItems.id, a.id));
    await tx.update(menuItems).set({ sort_order: a.sort_order }).where(eq(menuItems.id, b.id));
  });
  revalidatePath("/dashboard/menu");
  return { ok: true };
}

// ---------------------------------------------------------------- tables

export async function saveTableAction(input: {
  id?: string;
  label: string;
}): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  const label = (input.label ?? "").trim();
  if (!label) return { error: "Table label is required." };
  try {
    if (input.id) {
      const dup = await db
        .select()
        .from(tables)
        .where(
          and(eq(tables.venue_id, venue.id), eq(tables.label, label), sql`${tables.id} != ${input.id}`),
        )
        .limit(1);
      if (dup.length > 0) return { error: `Table "${label}" already exists.` };
      await db
        .update(tables)
        .set({ label })
        .where(and(eq(tables.id, input.id), eq(tables.venue_id, venue.id)));
    } else {
      const dup = await db
        .select()
        .from(tables)
        .where(and(eq(tables.venue_id, venue.id), eq(tables.label, label)))
        .limit(1);
      if (dup.length > 0) return { error: `Table "${label}" already exists.` };
      const agg = await db
        .select({ m: max(tables.sort_order) })
        .from(tables)
        .where(eq(tables.venue_id, venue.id));
      const [inserted] = await db
        .insert(tables)
        .values({
          venue_id: venue.id,
          label,
          sort_order: (agg[0].m ?? 0) + 1,
        })
        .returning({ id: tables.id });
      revalidatePath("/dashboard/tables");
      revalidatePath("/dashboard/qr");
      return { ok: true, id: inserted?.id };
    }
  } catch (err) {
    return { error: errText(err) };
  }
  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard/qr");
  return { ok: true };
}

export async function deleteTableAction(id: string): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  await db
    .delete(tables)
    .where(and(eq(tables.id, id), eq(tables.venue_id, venue.id)));
  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard/qr");
  return { ok: true };
}

export async function openTableAction(tableId: string): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  const tbl = await db
    .select()
    .from(tables)
    .where(and(eq(tables.id, tableId), eq(tables.venue_id, venue.id)))
    .limit(1);
  if (tbl.length === 0) return { error: "Table not found." };
  await openSessionForTable(venue.id, tableId);
  revalidatePath("/dashboard/tables");
  return { ok: true };
}

export async function closeTableAction(tableId: string): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  const tbl = await db
    .select()
    .from(tables)
    .where(and(eq(tables.id, tableId), eq(tables.venue_id, venue.id)))
    .limit(1);
  if (tbl.length === 0) return { error: "Table not found." };
  await closeTableSession(venue.id, tableId);
  revalidatePath("/dashboard/tables");
  return { ok: true };
}

// ---------------------------------------------------------------- admin queue


async function reviewVenue(venueId: string, status: "active" | "rejected") {
  await requireAdmin();
  if (!venueId) return { error: "Missing venue id." };
  const rows = await db
    .update(venues)
    .set({ status })
    .where(and(eq(venues.id, venueId), eq(venues.status, "pending")))
    .returning({ id: venues.id });
  if (rows.length === 0) return { error: "Venue not found or already reviewed." };
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function approveVenueAction(venueId: string): Promise<ActionRes> {
  return reviewVenue(venueId, "active");
}

export async function rejectVenueAction(venueId: string): Promise<ActionRes> {
  return reviewVenue(venueId, "rejected");
}

// ---------------------------------------------------------------- platform admin · venues

/** Every path that renders venue data — bust them all after an admin edit. */
function revalidateVenueEverywhere(slug: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/m/${slug}`);
  revalidatePath(`/bar/${slug}`);
  revalidatePath(`/staff/${slug}`);
}

/** Base fields a platform admin may edit on ANY venue (not just their own). */
export async function adminUpdateVenueAction(
  venueId: string,
  fields: Partial<{
    name: string;
    tagline: string;
    description: string;
    address: string;
    phone: string;
    hours: string;
    instagram: string;
    logo_url: string;
    accent_color: string;
    currency: string;
    plan: string;
    is_published: boolean;
  }>,
): Promise<ActionRes> {
  await requireAdmin();
  if (!venueId) return { error: "Missing venue id." };
  // Whitelist — admins never touch bar_pin / wifi / slug / owner from here.
  const allowed = [
    "name",
    "tagline",
    "description",
    "address",
    "phone",
    "hours",
    "instagram",
    "logo_url",
    "accent_color",
    "currency",
    "plan",
    "is_published",
  ] as const;
  const picked: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in fields) picked[k] = fields[k];
  }
  const built = buildVenuePatch(picked);
  if ("error" in built) return { error: built.error };
  if (Object.keys(built.patch).length === 0) return { error: "Nothing to save." };
  try {
    const rows = await db
      .update(venues)
      .set(built.patch)
      .where(eq(venues.id, venueId))
      .returning({ slug: venues.slug });
    if (rows.length === 0) return { error: "Venue not found." };
    revalidateVenueEverywhere(rows[0].slug);
  } catch (err) {
    return { error: errText(err) };
  }
  return { ok: true };
}

/**
 * Soft delete: status → "archived". The venue stops resolving at /m, /bar and
 * /staff immediately, the owner sees the review gate, and every table session,
 * order and analytics row stays in the database untouched. Nothing cascades.
 */
export async function adminArchiveVenueAction(venueId: string): Promise<ActionRes> {
  await requireAdmin();
  if (!venueId) return { error: "Missing venue id." };
  const rows = await db
    .update(venues)
    .set({ status: "archived" })
    .where(and(eq(venues.id, venueId), ne(venues.status, "archived")))
    .returning({ slug: venues.slug });
  if (rows.length === 0) return { error: "Venue not found or already archived." };
  revalidateVenueEverywhere(rows[0].slug);
  return { ok: true };
}

/** Undo an archive (or a rejection): status → "active", venue is live again. */
export async function adminRestoreVenueAction(venueId: string): Promise<ActionRes> {
  await requireAdmin();
  if (!venueId) return { error: "Missing venue id." };
  const rows = await db
    .update(venues)
    .set({ status: "active" })
    .where(and(eq(venues.id, venueId), inArray(venues.status, ["archived", "rejected"])))
    .returning({ slug: venues.slug });
  if (rows.length === 0) return { error: "Venue not found or not archived/rejected." };
  revalidateVenueEverywhere(rows[0].slug);
  return { ok: true };
}

/**
 * Hard delete — the only irreversible venue action. Wipes the venue row and
 * every child row (menu categories/items, tables, sessions, orders, line
 * items, waiter calls, views, wheel spins, passports) in one transaction.
 * Children are deleted explicitly so this works even if the database lacks
 * FK cascade constraints. If the owner is left with no venues at all, their
 * account is deleted too (web sessions cascade) so the email frees up for a
 * fresh signup. The last remaining admin is never deleted.
 */
export async function adminDeleteVenueAction(venueId: string): Promise<ActionRes> {
  await requireAdmin();
  if (!venueId) return { error: "Missing venue id." };
  try {
    const rows = await db
      .select({ slug: venues.slug, ownerId: venues.owner_id })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (rows.length === 0) return { error: "Venue not found." };
    const { slug, ownerId } = rows[0];
    await db.transaction(async (tx) => {
      // Line items hang off orders, which hang off the venue.
      const venueOrderIds = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.venue_id, venueId));
      if (venueOrderIds.length > 0) {
        await tx
          .delete(orderLines)
          .where(
            inArray(
              orderLines.order_id,
              venueOrderIds.map((r) => r.id),
            ),
          );
      }
      // Payment records reference the venue without a cascade (history must not
      // vanish when a table is deleted), so they go explicitly with the venue.
      const payIds = (
        await tx.select({ id: payments.id }).from(payments).where(eq(payments.venue_id, venueId))
      ).map((r) => r.id);
      if (payIds.length) await tx.delete(paymentOrders).where(inArray(paymentOrders.payment_id, payIds));
      await tx.delete(paymentEvents).where(eq(paymentEvents.venue_id, venueId));
      await tx.delete(payments).where(eq(payments.venue_id, venueId));
      await tx.delete(orders).where(eq(orders.venue_id, venueId));
      await tx.delete(tableSessions).where(eq(tableSessions.venue_id, venueId));
      await tx.delete(waiterCalls).where(eq(waiterCalls.venue_id, venueId));
      await tx.delete(menuViews).where(eq(menuViews.venue_id, venueId));
      await tx.delete(wheelSpins).where(eq(wheelSpins.venue_id, venueId));
      await tx.delete(cocktailPassports).where(eq(cocktailPassports.venue_id, venueId));
      await tx.delete(menuItems).where(eq(menuItems.venue_id, venueId));
      await tx.delete(categories).where(eq(categories.venue_id, venueId));
      await tx.delete(tables).where(eq(tables.venue_id, venueId));
      await tx.delete(venues).where(eq(venues.id, venueId));
      // Orphan owner (no venues left, not the last admin) → account goes too,
      // so their email can be used for a brand-new signup.
      const [{ n: remainingVenues }] = await tx
        .select({ n: count() })
        .from(venues)
        .where(eq(venues.owner_id, ownerId));
      if (Number(remainingVenues) === 0) {
        const [owner] = await tx
          .select({ isAdmin: users.is_admin })
          .from(users)
          .where(eq(users.id, ownerId))
          .limit(1);
        if (owner) {
          let canDelete = true;
          if (owner.isAdmin) {
            const [{ n: admins }] = await tx
              .select({ n: count() })
              .from(users)
              .where(eq(users.is_admin, true));
            if (Number(admins) <= 1) canDelete = false;
          }
          if (canDelete) {
            await tx.delete(users).where(eq(users.id, ownerId)); // sessions cascade
          }
        }
      }
    });
    revalidateVenueEverywhere(slug);
  } catch (err) {
    return { error: errText(err) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- platform admin · admins

/** Grant is_admin to an existing account, looked up by email. */
export async function promoteAdminAction(emailInput: string): Promise<ActionRes> {
  await requireAdmin();
  const email = (emailInput ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email." };
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const target = rows[0];
  if (!target) {
    return {
      error: `No account with ${email}. They need to sign up first — then promote them here.`,
    };
  }
  if (target.is_admin) return { error: `${email} is already an admin.` };
  await db.update(users).set({ is_admin: true }).where(eq(users.id, target.id));
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: target.id };
}

/** Revoke is_admin. You cannot demote yourself or the last remaining admin. */
export async function demoteAdminAction(userId: string): Promise<ActionRes> {
  const me = await requireAdmin();
  if (!userId) return { error: "Missing user id." };
  if (userId === me.id) return { error: "You can't demote yourself." };
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.is_admin, true));
  if (Number(n) <= 1) return { error: "There must always be at least one admin." };
  const rows = await db
    .update(users)
    .set({ is_admin: false })
    .where(and(eq(users.id, userId), eq(users.is_admin, true)))
    .returning({ id: users.id });
  if (rows.length === 0) return { error: "User not found or not an admin." };
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Permanently remove an account that owns no venues (e.g. one orphaned by a
 * venue hard-delete), freeing its email for a fresh signup. Accounts that
 * still own venues must be cleaned up via the venue's "Delete forever"
 * first. You cannot delete yourself or the last remaining admin.
 */
export async function adminDeleteAccountAction(userId: string): Promise<ActionRes> {
  const me = await requireAdmin();
  if (!userId) return { error: "Missing user id." };
  if (userId === me.id) {
    return { error: "You can't delete your own account. Ask another admin." };
  }
  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ email: users.email, isAdmin: users.is_admin })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!target) return { error: "Account not found." };
      const [{ n: venuesOwned }] = await tx
        .select({ n: count() })
        .from(venues)
        .where(eq(venues.owner_id, userId));
      if (Number(venuesOwned) > 0) {
        return {
          error: `${target.email} still owns venues — delete those first (Venues → Delete forever).`,
        };
      }
      if (target.isAdmin) {
        const [{ n: admins }] = await tx
          .select({ n: count() })
          .from(users)
          .where(eq(users.is_admin, true));
        if (Number(admins) <= 1) {
          return { error: "There must always be at least one admin." };
        }
      }
      await tx.delete(users).where(eq(users.id, userId)); // sessions cascade
      revalidatePath("/admin", "layout");
      revalidatePath("/dashboard", "layout");
      return { ok: true };
    });
  } catch (err) {
    return { error: errText(err) };
  }
}

// ---------------------------------------------------------------- payments (Viva)

/**
 * Save the venue's own Viva Wallet merchant credentials.
 *
 * The secret is painted onto the row as-is for now — encrypting it at rest is the
 * obvious next hardening step, but the secret never leaves the server (it is
 * never put in VenuePublic), so a DB dump is the only way it can leak.
 */
export async function saveVivaSettingsAction(input: {
  clientId: string;
  clientSecret: string;
  apiKey?: string;
  merchantId: string;
  sourceCode: string;
  env: string;
  enabled: boolean;
}): Promise<ActionRes> {
  try {
    const venue = await getOwnerVenue();
    const clientId = (input.clientId ?? "").trim();
    const clientSecret = (input.clientSecret ?? "").trim();
    const apiKey = String(input.apiKey ?? "").trim();
    const merchantId = (input.merchantId ?? "").trim();
    const sourceCode = (input.sourceCode ?? "").trim();
    const env: VivaEnv = input.env === "live" ? "live" : "demo";

    if (!/^\d{4}$/.test(sourceCode)) {
      return { error: "Source code must be exactly 4 digits (e.g. 5521)." };
    }
    // Keep the stored secret when the field is left blank (the UI never echoes it).
    const existing = await db
      .select({ s: venues.viva_client_secret, k: venues.viva_api_key })
      .from(venues)
      .where(eq(venues.id, venue.id))
      .limit(1);
    // Secrets are stored encrypted. A value kept from before is re-sealed too, so
    // saving the form is enough to migrate an old plaintext row.
    const secret = sealSecret(clientSecret || openSecret(existing[0]?.s, venue.id), venue.id);
    const storedApiKey = sealSecret(apiKey || openSecret(existing[0]?.k, venue.id), venue.id);
    if (!clientId || !secret || !merchantId) {
      return { error: "Client ID, Client Secret and Merchant ID are all required." };
    }
    if (input.enabled && !(apiKey || existing[0]?.k)) {
      return { error: "The Viva API Key is required to take card payments." };
    }

    await db
      .update(venues)
      .set({
        viva_client_id: clientId,
        viva_client_secret: secret,
        // Blank keeps the stored key (the UI never echoes it).
        viva_api_key: storedApiKey,
        viva_merchant_id: merchantId,
        viva_source_code: sourceCode,
        viva_env: env,
        payments_enabled: Boolean(input.enabled),
      })
      .where(eq(venues.id, venue.id));

    revalidatePath("/dashboard/settings/payments");
    revalidatePath("/dashboard", "layout");
    const demoNote =
      input.enabled && demoBlocked({ slug: venue.slug, viva_env: env })
        ? " Note: in Demo mode guests are NOT offered card payment. Switch to Live when you are ready to take real money."
        : "";
    return { ok: true, notice: `Saved. Run “Test connection” to confirm the keys work.${demoNote}` };
  } catch (err) {
    return { error: errText(err) };
  }
}

/**
 * Check BOTH sets of keys against Viva: the OAuth pair (creates checkouts,
 * verifies transactions) and the API key (webhook verification and the search
 * that recovers a payment whose notification was lost). A green result with a
 * wrong API key used to leave payments unrecorded without anyone noticing.
 */
export async function testVivaConnectionAction(): Promise<ActionRes> {
  try {
    const venue = await getOwnerVenue();
    const cfg = vivaCreds(venue);
    if (!credentialsComplete(cfg)) {
      return { error: "Fill in Client ID, Client Secret and Merchant ID first." };
    }
    try {
      const token = await getAccessToken(cfg);
      if (!token) return { error: "Viva returned an empty token." };
    } catch (err) {
      if (err instanceof VivaError) {
        return { error: `Viva rejected the Client ID / Client Secret (${err.status}). Check them and the Demo/Live switch.` };
      }
      throw err;
    }
    if (!cfg.apiKey) {
      return { error: "Client ID and Secret work, but the API Key is missing. It is required to take card payments." };
    }
    try {
      const key = await fetchWebhookKey({ env: cfg.env, merchantId: cfg.merchantId, apiKey: cfg.apiKey });
      if (!key) return { error: "Viva returned no webhook key for this Merchant ID / API Key." };
    } catch (err) {
      if (err instanceof VivaError) {
        return { error: `Client ID and Secret work, but Viva rejected the Merchant ID / API Key (${err.status}). Without them lost payments cannot be recovered.` };
      }
      throw err;
    }
    return {
      ok: true,
      notice: `Connected to Viva (${cfg.env}): both key pairs work. Merchant ${cfg.merchantId}.`,
    };
  } catch (err) {
    return { error: errText(err) };
  }
}

/** The owner has dealt with a flagged payment (refunded it, fixed the receipt). */
export async function resolvePaymentAlertAction(paymentId: string): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  if (typeof paymentId !== "string" || !/^[0-9a-f-]{36}$/i.test(paymentId)) {
    return { error: "Payment not found." };
  }
  const ok = await resolvePaymentAlert(venue.id, paymentId);
  if (!ok) return { error: "Payment not found." };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
