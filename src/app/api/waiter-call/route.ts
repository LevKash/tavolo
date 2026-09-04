import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { tables, waiterCalls } from "@/db/schema";
import { getVenueBySlug, openSessionForTable } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { slug?: string; tableId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const slug = (body.slug ?? "").trim();
  const tableId = body.tableId ?? "";
  if (!slug || !tableId) {
    return NextResponse.json(
      { error: "slug and tableId are required" },
      { status: 400 },
    );
  }
  const venue = await getVenueBySlug(slug);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  const tbl = await db
    .select()
    .from(tables)
    .where(eq(tables.id, tableId))
    .limit(1);
  if (tbl.length === 0 || tbl[0].venue_id !== venue.id) {
    return NextResponse.json(
      { error: "Table not found at this venue" },
      { status: 404 },
    );
  }
  const session = await openSessionForTable(venue.id, tableId);

  // Dedupe: an unresolved call for the same open session is enough.
  const open = await db
    .select()
    .from(waiterCalls)
    .where(
      and(
        eq(waiterCalls.session_id, session.id),
        isNull(waiterCalls.resolved_at),
      ),
    )
    .limit(1);
  if (open.length > 0) {
    return NextResponse.json({ ok: true, alreadyActive: true, callId: open[0].id });
  }
  const created = await db
    .insert(waiterCalls)
    .values({
      venue_id: venue.id,
      table_id: tableId,
      session_id: session.id,
    })
    .returning();
  return NextResponse.json({ ok: true, callId: created[0].id });
}
