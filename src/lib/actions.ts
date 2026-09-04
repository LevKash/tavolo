"use server";

import { and, asc, count, eq, inArray, max, ne, sql } from "drizzle-orm";
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
  requireUser,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import {
  closeTableSession,
  openSessionForTable,
  VENUE_PLANS,
} from "@/lib/core";
import { ensureSeeded } from "@/lib/seed";
import { notifyOperator } from "@/lib/tg";
import { slugify } from "@/lib/util";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ActionRes {
  error?: string;
  ok?: boolean;
  id?: string;
}

function uniqueViolation(err: unknown) {
  return (err as { code?: string })?.code === "23505";
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong";
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
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Wrong email or password." };
  }
  const token = await createSessionToken(user.id);
  await setSessionCookie(token);
  redirect("/dashboard");
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
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
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
        bar_pin: "1234",
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
        "https://ordavo.app/admin",
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
  const built = buildVenuePatch(fields);
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
  const item = await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
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

// ---------------------------------------------------------------- dashboard extras

export async function purgeTableSessionsAction(tableId: string): Promise<ActionRes> {
  const venue = await getOwnerVenue();
  await db
    .delete(tableSessions)
    .where(
      and(
        eq(tableSessions.venue_id, venue.id),
        eq(tableSessions.table_id, tableId),
      ),
    );
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------- admin queue

async function requireAdmin() {
  const user = await requireUser();
  if (!user.is_admin) redirect("/dashboard");
  return user;
}

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
