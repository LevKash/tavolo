import { eq } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getVenueById, toVenuePublic } from "@/lib/core";
import DashSettings, { type SettingsData } from "@/components/dash-settings";

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(venues)
    .where(eq(venues.owner_id, user.id))
    .limit(1);
  if (rows.length === 0) return null;
  const venue = await getVenueById(rows[0].id);
  if (!venue) return null;

  const data: SettingsData = {
    ...toVenuePublic(venue),
    barPin: venue.bar_pin,
    plan: venue.plan,
  };
  return <DashSettings venue={data} />;
}
