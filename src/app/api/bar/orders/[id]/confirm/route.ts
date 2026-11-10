import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, tableSessions } from "@/db/schema";
import { barDenied, checkBarAccess } from "@/lib/pin";
import { isUuid } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Confirm the first order of a new session -> trusted, enters the bar queue. */
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
  const venue = await checkBarAccess(body.slug ?? "", body.pin ?? "", req);
  if (!venue) {
    return barDenied(body.slug ?? "", req);
  }
  // A malformed id can never match a row; answer 404 instead of a database error.
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.venue_id, venue.id)))
    .limit(1);
  const order = row[0];
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "pending_confirm") {
    return NextResponse.json(
      { error: "This order is not awaiting confirmation" },
      { status: 409 },
    );
  }
  // Conditional update: if another screen declined (or confirmed) this order a
  // moment ago, nothing is changed and the caller is told so.
  const changed = await db
    .update(orders)
    .set({ status: "new" })
    .where(and(eq(orders.id, id), eq(orders.venue_id, venue.id), eq(orders.status, "pending_confirm")))
    .returning({ id: orders.id });
  if (changed.length === 0) {
    return NextResponse.json(
      { error: "This order is not awaiting confirmation" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, status: "new" });
}
