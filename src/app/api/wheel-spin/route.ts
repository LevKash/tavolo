import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { menuItems, tables, wheelSpins } from "@/db/schema";
import { getVenueBySlug, openSessionForTable } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { slug?: string; tableId?: string; itemId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const slug = (body.slug ?? "").trim();
  const tableId = body.tableId ?? "";
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  const venue = await getVenueBySlug(slug);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  let itemId: string | null = body.itemId ?? null;
  if (itemId) {
    const it = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.id, itemId))
      .limit(1);
    if (it.length === 0 || it[0].venue_id !== venue.id) itemId = null;
  }

  let sessionId: string | null = null;
  if (tableId) {
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
    sessionId = session.id;
  }

  await db.insert(wheelSpins).values({
    venue_id: venue.id,
    table_id: tableId || null,
    menu_item_id: itemId,
  });
  return NextResponse.json({ ok: true, sessionId });
}
