import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { buildDashboardDto } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(venues)
    .where(eq(venues.owner_id, user.id))
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No venue" }, { status: 404 });
  }
  const dto = await buildDashboardDto(rows[0]);
  return NextResponse.json(dto);
}
