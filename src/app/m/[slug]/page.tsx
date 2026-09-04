import { notFound } from "next/navigation";
import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { tables } from "@/db/schema";
import { buildMenu, getVenueBySlug, logMenuView, openSessionForTable } from "@/lib/core";
import GuestApp from "./guest-app";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GuestMenuPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const rawTable = Array.isArray(sp.table) ? sp.table[0] : sp.table;

  const venue = await getVenueBySlug(slug);
  if (!venue) notFound();

  // Resolve the scanned table: the QR embeds the uuid, but labels work too
  // (handy for demos such as /m/ambrosia?table=12).
  let table: { id: string; label: string } | null = null;
  if (rawTable && venue.is_published) {
    const rows = rawTable.length === 36
      ? await db
          .select()
          .from(tables)
          .where(and(eq(tables.venue_id, venue.id), eq(tables.id, rawTable)))
          .limit(1)
      : await db
          .select()
          .from(tables)
          .where(
            and(
              eq(tables.venue_id, venue.id),
              or(eq(tables.label, rawTable), ilike(tables.label, rawTable)),
            ),
          )
          .limit(1);
    if (rows.length > 0) {
      table = { id: rows[0].id, label: rows[0].label };
      // Scanning opens the table automatically, like a waiter opening a POS tab.
      await openSessionForTable(venue.id, rows[0].id);
      await logMenuView(venue.id, rows[0].id);
    }
  }

  if (!venue.is_published) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <p className="serif text-4xl font-semibold text-cream">{venue.name}</p>
          <p className="mt-3 text-fog">This menu is currently offline. Please ask the staff.</p>
        </div>
      </main>
    );
  }

  const menu = await buildMenu(venue);
  return (
    <GuestApp
      menu={menu}
      table={table}
      key={table?.id ?? "venue"}
    />
  );
}
