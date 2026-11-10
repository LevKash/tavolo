import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, tableSessions } from "@/db/schema";
import { barDenied, checkBarAccess } from "@/lib/pin";
import { isUuid } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const TRANSITIONS: Record<string, string[]> = {
  new: ["making"],
  making: ["served"],
  served: ["closed"],
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: { slug?: string; pin?: string; status?: string };
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
  const next = body.status ?? "";
  // Valid targets are every status some state can move to (TRANSITIONS is keyed
  // by the CURRENT status, so checking the key of `next` rejected "closed").
  const validTargets = new Set(Object.values(TRANSITIONS).flat());
  if (!validTargets.has(next)) {
    return NextResponse.json({ error: "Invalid target status" }, { status: 400 });
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
  // Server-side rule: unconfirmed orders can never be started.
  const allowed = TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(next)) {
    return NextResponse.json(
      { error: `Order cannot move from "${order.status}" to "${next}"` },
      { status: 409 },
    );
  }
  const session = await db
    .select()
    .from(tableSessions)
    .where(eq(tableSessions.id, order.session_id))
    .limit(1);
  if (session.length === 0 || session[0].status !== "open") {
    return NextResponse.json(
      { error: "This table session is closed" },
      { status: 409 },
    );
  }
  // Conditional on the status we just read, so two screens tapping at once
  // cannot move the order two steps or resurrect a closed one.
  const changed = await db
    .update(orders)
    .set({
      status: next,
      closed_at: next === "closed" ? new Date() : order.closed_at,
    })
    .where(and(eq(orders.id, id), eq(orders.venue_id, venue.id), eq(orders.status, order.status)))
    .returning({ id: orders.id });
  if (changed.length === 0) {
    return NextResponse.json(
      { error: "This order was just changed on another screen" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, status: next });
}
