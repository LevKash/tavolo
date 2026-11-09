import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, tableSessions } from "@/db/schema";
import { barDenied, checkBarAccess } from "@/lib/pin";

export const dynamic = "force-dynamic";

/** Decline a suspicious order -> discard it; close the session only if nothing else is live in it. */
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
  const now = new Date();
  // One transaction under the table lock. Only THIS order is discarded. The
  // session closes too (a prank at an empty table) only when nothing else live
  // is left in it; otherwise an accepted order from the same table would vanish
  // from the queue together with the declined one.
  const sessionClosed = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`session:${order.table_id}`}))`);
    await tx
      .update(orders)
      .set({ status: "declined", closed_at: now })
      .where(and(eq(orders.id, id), eq(orders.status, "pending_confirm")));
    const live = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.session_id, order.session_id),
          inArray(orders.status, ["pending_confirm", "new", "making", "served"]),
        ),
      )
      .limit(1);
    if (live.length > 0) return false;
    await tx
      .update(tableSessions)
      .set({ status: "closed", closed_at: now })
      .where(eq(tableSessions.id, order.session_id));
    return true;
  });
  return NextResponse.json({ ok: true, status: "declined", sessionClosed });
}
