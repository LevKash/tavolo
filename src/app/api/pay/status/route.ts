import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { orderLines, orders, tableSessions, tables } from "@/db/schema";
import { getVenueBySlug, runningSessionTotals } from "@/lib/core";

export const dynamic = "force-dynamic";

/**
 * Poll target for the guest screen while they are on the Viva payment page.
 * The webhook is the source of truth; this endpoint just reads what it wrote so
 * the UI can flip to "Paid" without depending on the browser redirect timing.
 */
export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim();
  const tableId = (req.nextUrl.searchParams.get("tableId") ?? "").trim();
  if (!slug || !tableId) {
    return NextResponse.json({ error: "slug and tableId are required" }, { status: 400 });
  }

  const venue = await getVenueBySlug(slug);
  if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });

  const tbl = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1);
  if (tbl.length === 0 || tbl[0].venue_id !== venue.id) {
    return NextResponse.json({ error: "Table not found at this venue" }, { status: 404 });
  }

  const rows = await db
    .select({
      id: tableSessions.id,
      status: tableSessions.payment_status,
      amount: tableSessions.payment_amount,
      paid_at: tableSessions.paid_at,
    })
    .from(tableSessions)
    .where(and(eq(tableSessions.table_id, tableId), eq(tableSessions.status, "open")))
    .orderBy(desc(tableSessions.opened_at))
    .limit(1);

  // No open session means the table was closed — most likely right after payment.
  if (rows.length === 0) {
    return NextResponse.json({ open: false, status: "closed", paid: true });
  }

  // The bill belongs to the TABLE, not to one session row. Duplicate open
  // sessions used to hide whole rounds of orders (the guest paid €69.50 and was
  // still shown €116), so sum across every open session of this table.
  const openSessions = await db
    .select({ id: tableSessions.id })
    .from(tableSessions)
    .where(and(eq(tableSessions.table_id, tableId), eq(tableSessions.status, "open")));
  const totals = await runningSessionTotals(
    venue.id,
    openSessions.map((s) => s.id),
  );
  const due =
    Math.round(
      [...totals.values()].reduce((sum, v) => sum + v, 0) * 100,
    ) / 100;

  // Itemised bill for the guest sheet. Without this the sheet shows a bare
  // "STILL TO PAY €14.00" and the guest has to take the number on faith — which
  // is exactly the "€96 out of nowhere" complaint. Guest history is keyed by
  // the phone's guest_id, so a new phone / cleared storage saw no lines at all;
  // this list comes from the table, so it is identical for every phone.
  const unpaid = await db
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
          orders.session_id,
          openSessions.map((s) => s.id),
        ),
        inArray(orders.status, ["pending_confirm", "new", "making", "served"] as const),
        ne(orders.payment_status, "paid"),
      ),
    )
    .orderBy(asc(orders.created_at), asc(orderLines.id));

  // Collapse identical rows (two rounds of the same beer read as one line with
  // qty 2 instead of two near-identical lines).
  const merged = new Map<string, { name: string; price: number; qty: number }>();
  for (const l of unpaid) {
    const key = `${l.name}|${l.price}`;
    const cur = merged.get(key);
    if (cur) cur.qty += l.qty;
    else merged.set(key, { name: l.name, price: Number(l.price), qty: l.qty });
  }
  const billLines = [...merged.values()];

  return NextResponse.json({
    open: true,
    status: rows[0].status,
    paid: rows[0].status === "paid",
    amount: due,
    amountPaid: Number(rows[0].amount ?? 0),
    paidAt: rows[0].paid_at ? rows[0].paid_at.toISOString() : null,
    lines: billLines,
  });
}
