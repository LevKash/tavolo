import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tables } from "@/db/schema";
import { getVenueBySlug, placeOrder } from "@/lib/core";
import { reportError } from "@/lib/monitor";
import { clientIp, hitLimit, isUuid, rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_LINES = 40;

export async function POST(req: NextRequest) {
  // Nothing in the body is trusted: every field is checked for type and shape
  // here, so a malformed request is a 400 and never a database error.
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const tableId = isUuid(body.tableId) ? body.tableId : "";
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (!slug || !tableId || rawLines.length === 0) {
    return NextResponse.json(
      { error: "slug, tableId and lines are required" },
      { status: 400 },
    );
  }
  if (rawLines.length > MAX_LINES) {
    return NextResponse.json({ error: "Too many items in one order." }, { status: 400 });
  }
  const lines: { itemId: string; qty: number; pairOf?: string }[] = [];
  for (const raw of rawLines) {
    const l = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!isUuid(l.itemId) || !Number.isInteger(l.qty) || (l.qty as number) < 1 || (l.qty as number) > 20) {
      return NextResponse.json({ error: "Invalid order line." }, { status: 400 });
    }
    lines.push({
      itemId: l.itemId,
      qty: l.qty as number,
      pairOf: isUuid(l.pairOf) ? l.pairOf : undefined,
    });
  }
  // Burst guard per address (in memory; guests on the venue wifi share one
  // address, so it is generous) and a durable limit per table.
  if (rateLimited(`order-ip:${clientIp(req)}`, 40, 60_000)) {
    return NextResponse.json({ error: "Too many orders. Please wait a moment." }, { status: 429 });
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
  if ((await hitLimit(`order-table:${tableId}`, 12, 60_000)).limited) {
    return NextResponse.json({ error: "Too many orders. Please wait a moment." }, { status: 429 });
  }
  try {
    const order = await placeOrder({
      venueId: venue.id,
      tableId,
      lines,
      note: typeof body.note === "string" ? body.note.slice(0, 300) : "",
      source: body.source === "wheel" ? "wheel" : "menu",
      guestId: typeof body.guestId === "string" ? body.guestId : undefined,
      firstSeenAt:
        typeof body.firstSeenAt === "number" ? body.firstSeenAt : undefined,
      clientKey:
        isUuid(body.clientKey) ? body.clientKey : undefined,
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
    const known = ["item_unavailable", "empty_order", "bad_qty"].includes((err as Error).message);
    if (!known) await reportError("/api/order", err, { method: "POST" });
    const message =
      (err as Error).message === "item_unavailable"
        ? "One of the items is sold out — refresh the menu and try again."
        : (err as Error).message === "empty_order"
          ? "Your order is empty."
          : "Could not place the order. Please try again.";
    // Unexpected failures are 500 so they show up in the logs and the client can
    // safely retry (the idempotency key prevents a duplicate).
    return NextResponse.json({ error: message }, { status: known ? 400 : 500 });
  }
}
