import { eq } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { buildDashboardDto } from "@/lib/core";
import DashToday from "@/components/dash-today";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(venues)
    .where(eq(venues.owner_id, user.id))
    .limit(1);
  if (rows.length === 0) {
    return (
      <p className="text-fog">
        No venue yet — create one from <a className="text-gold-2 underline" href="/signup">signup</a>.
      </p>
    );
  }
  const dto = await buildDashboardDto(rows[0]);
  return <DashToday initial={dto} />;
}
