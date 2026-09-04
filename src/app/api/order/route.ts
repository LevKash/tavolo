import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tables } from "@/db/schema";
import { getVenueBySlug, placeOrder } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    slug?: string;
    tableId?: string;
    lines?: { itemId: string; qty: number; pairOf?: string }[];
    note?: string;
    source?: "menu" | "wheel";
    guestId?: string;
    firstSeenAt?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const slug = (body.slug ?? "").trim();
  const tableId = body.tableId ?? "";
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!slug || !tableId || lines.length === 0) {
    return NextResponse.json(
      { error: "slug, tableId and lines are required" },
      { status: 400 },
    );
  }
  const venue = await getVenueBySlug(slug);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  if (!venue.is_published) {
    return NextResponse.json({ error: "Menu is offline" }, { status: 403 });
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
  try {
    const order = await placeOrder({
      venueId: venue.id,
      tableId,
      lines,
      note: (body.note ?? "").slice(0, 300),
      source: body.source === "wheel" ? "wheel" : "menu",
      guestId: typeof body.guestId === "string" ? body.guestId : undefined,
      firstSeenAt:
        typeof body.firstSeenAt === "number" ? body.firstSeenAt : undefined,
    });
    return NextResponse.json({
      ok: true,
      order: {
        id: order.orderId,
        ref: order.ref,
        status: order.status,
        total: order.total,
        isFirstOfSession: order.isFirstOfSession,
        firstOrderDiscount: order.firstOrderDiscount,
        freeGranted: order.freeGranted,
        passport: order.passport ?? null,
        createdAt: order.createdAt.toISOString(),
      },
    });
  } catch (err) {
    const message =
      (err as Error).message === "item_unavailable"
        ? "One of the items is sold out — refresh the menu and try again."
        : (err as Error).message === "empty_order"
          ? "Your order is empty."
          : "Could not place the order. Please try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
