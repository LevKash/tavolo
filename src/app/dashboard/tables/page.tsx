import { eq } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { buildDashboardDto } from "@/lib/core";
import DashTables from "@/components/dash-tables";

export const dynamic = "force-dynamic";

export default async function DashboardTablesPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(venues)
    .where(eq(venues.owner_id, user.id))
    .limit(1);
  if (rows.length === 0) return null;
  const dto = await buildDashboardDto(rows[0]);
  return <DashTables slug={dto.venue.slug} tables={dto.tables} />;
}
