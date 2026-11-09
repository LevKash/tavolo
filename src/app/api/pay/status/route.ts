import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { orderLines, orders, payments, tableSessions, tables } from "@/db/schema";
import { getVenueBySlug } from "@/lib/core";
import { loadPayable, PAYABLE_STATUSES } from "@/lib/payments";
import { UUID_RE } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Polled by the guest screen: what the table still owes and the state of the
 * latest payment. Everything is read from our own tables, which the webhook and
 * the return page fill in after verifying with Viva.
 */
export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim();
  const tableId = (req.nextUrl.searchParams.get("tableId") ?? "").trim();
  if (!slug || !UUID_RE.test(tableId)) {
    return NextResponse.json({ error: "slug and tableId are required" }, { status: 400 });
  }
  const venue = await getVenueBySlug(slug);
  if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });

  const tbl = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1);
  if (tbl.length === 0 || tbl[0].venue_id !== venue.id) {
    return NextResponse.json({ error: "Table not found at this venue" }, { status: 404 });
  }

  const open = await db
    .select({ id: tableSessions.id })
    .from(tableSessions)
    .where(and(eq(tableSessions.table_id, tableId), eq(tableSessions.status, "open")))
    .limit(1);

  const { items, totalCents } = await loadPayable(db, venue.id, tableId);

  // Orders the bar has not accepted yet: shown to the guest, not yet payable.
  const waiting = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.venue_id, venue.id),
        eq(orders.table_id, tableId),
        eq(orders.status, "pending_confirm"),
      ),
    );

  let billLines: { name: string; price: number; qty: number }[] = [];
  if (items.length > 0) {
    const lines = await db
      .select({
        name: orderLines.name_snapshot,
        price: orderLines.price_snapshot,
        qty: orderLines.qty,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orderLines.order_id, orders.id))
      .where(
        and(
          inArray(
            orders.id,
            items.map((i) => i.id),
          ),
          inArray(orders.status, [...PAYABLE_STATUSES]),
          ne(orders.payment_status, "paid"),
        ),
      )
      .orderBy(asc(orders.created_at), asc(orderLines.id));
    const merged = new Map<string, { name: string; price: number; qty: number }>();
    for (const l of lines) {
      const key = `${l.name}|${l.price}`;
      const cur = merged.get(key);
      if (cur) cur.qty += l.qty;
      else merged.set(key, { name: l.name, price: Number(l.price), qty: l.qty });
    }
    billLines = [...merged.values()];
  }

  const [latest] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.venue_id, venue.id), eq(payments.table_id, tableId)))
    .orderBy(desc(payments.created_at))
    .limit(1);

  const recentlyPaid =
    latest?.status === "paid" &&
    latest.paid_at !== null &&
    Date.now() - latest.paid_at.getTime() < 60 * 60 * 1000;

  return NextResponse.json({
    open: open.length > 0,
    status: latest?.status ?? "unpaid",
    // "Paid" only while nothing new is owed: a second round must show Pay again.
    paid: Boolean(recentlyPaid) && totalCents === 0,
    amount: totalCents / 100,
    amountPaid: latest?.status === "paid" ? latest.amount_cents / 100 : 0,
    paidAt: latest?.paid_at ? latest.paid_at.toISOString() : null,
    awaitingConfirmation: waiting.length,
    lines: billLines,
  });
}
