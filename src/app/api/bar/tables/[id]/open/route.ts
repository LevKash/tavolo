import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tables } from "@/db/schema";
import { openSessionForTable } from "@/lib/core";
import { checkBarAccess } from "@/lib/pin";

export const dynamic = "force-dynamic";

/** Manually open a table for guests without phones (classic POS behaviour). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: { slug?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const venue = await checkBarAccess(body.slug ?? "", body.pin ?? "");
  if (!venue) {
    return NextResponse.json({ error: "Invalid venue or PIN" }, { status: 401 });
  }
  const tbl = await db
    .select()
    .from(tables)
    .where(and(eq(tables.id, id), eq(tables.venue_id, venue.id)))
    .limit(1);
  if (tbl.length === 0) {
    return NextResponse.json({ error: "Table not found" }, { status: 404 });
  }
  const session = await openSessionForTable(venue.id, id);
  return NextResponse.json({ ok: true, sessionId: session.id });
}
