import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, tableSessions } from "@/db/schema";
import { checkBarAccess } from "@/lib/pin";

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
  const venue = await checkBarAccess(body.slug ?? "", body.pin ?? "");
  if (!venue) {
    return NextResponse.json({ error: "Invalid venue or PIN" }, { status: 401 });
  }
  const next = body.status ?? "";
  if (!TRANSITIONS[next]) {
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
  await db
    .update(orders)
    .set({
      status: next,
      closed_at: next === "closed" ? new Date() : order.closed_at,
    })
    .where(eq(orders.id, id));
  return NextResponse.json({ ok: true, status: next });
}
