import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, menuItems, venues } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getVenueById } from "@/lib/core";
import DashMenu, { type CatEditorCat } from "@/components/dash-menu";

export const dynamic = "force-dynamic";

export default async function DashboardMenuPage() {
  const user = await requireUser();
  const venueRows = await db
    .select()
    .from(venues)
    .where(eq(venues.owner_id, user.id))
    .limit(1);
  if (venueRows.length === 0) return null;
  const venue = await getVenueById(venueRows[0].id);
  if (!venue) return null;

  const catRows = await db
    .select()
    .from(categories)
    .where(eq(categories.venue_id, venue.id))
    .orderBy(asc(categories.sort_order));
  const itemRows = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.venue_id, venue.id))
    .orderBy(asc(menuItems.sort_order));

  const cats: CatEditorCat[] = catRows.map((c) => ({
    id: c.id,
    name: c.name,
    nameAlt: c.name_alt,
    description: c.description,
    descriptionAlt: c.description_alt,
    isVisible: c.is_visible,
    items: [],
  }));
  const byCat = new Map(cats.map((c) => [c.id, c]));
  for (const it of itemRows) {
    byCat.get(it.category_id)?.items.push({
      id: it.id,
      name: it.name,
      nameAlt: it.name_alt,
      description: it.description,
      descriptionAlt: it.description_alt,
      price: it.price,
      tags: it.tags ?? [],
      allergens: it.allergens ?? [],
      imageUrl: it.image_url,
      isAvailable: it.is_available,
      categoryId: it.category_id,
    });
  }

  return (
    <DashMenu
      venue={{ name: venue.name, currency: venue.currency }}
      categories={cats}
    />
  );
}
