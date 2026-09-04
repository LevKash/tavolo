"use server";

import { and, asc, eq, max, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  categories,
  menuItems,
  tableSessions,
  tables,
  users,
  venues,
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
import { closeTableSession, openSessionForTable } from "@/lib/core";
import { ensureSeeded } from "@/lib/seed";
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
  if ("name" in patch && !String(patch.name).trim()) return { error: "Venue name is required." };
  if ("accent_color" in patch) {
    const c = String(patch.accent_color);
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return { error: "Accent must be a hex colour." };
  }
  if ("is_published" in patch) patch.is_published = Boolean(patch.is_published);
  if ("currency" in patch) patch.currency = String(patch.currency).toUpperCase();
  try {
    await db.update(venues).set(patch).where(eq(venues.id, venue.id));
  } catch (err) {
    return { error: errText(err) };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
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
