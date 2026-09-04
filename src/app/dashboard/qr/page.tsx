import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tables, venues } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatTableLabel } from "@/lib/util";
import DashQr from "@/components/dash-qr";

export const dynamic = "force-dynamic";

export default async function DashboardQrPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(venues)
    .where(eq(venues.owner_id, user.id))
    .limit(1);
  if (rows.length === 0) return null;
  const venue = rows[0];
  const tableRows = await db
    .select()
    .from(tables)
    .where(eq(tables.venue_id, venue.id))
    .orderBy(asc(tables.sort_order));

  return (
    <DashQr
      slug={venue.slug}
      venueName={venue.name}
      tables={tableRows.map((t) => ({
        id: t.id,
        label: formatTableLabel(t.label),
      }))}
    />
  );
}
