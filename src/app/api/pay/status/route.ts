import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tableSessions, tables } from "@/db/schema";
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
    .limit(1);

  // No open session means the table was closed — most likely right after payment.
  if (rows.length === 0) {
    return NextResponse.json({ open: false, status: "closed", paid: true });
  }

  // The live bill is the server-side sum of the session's open orders — the same
  // figure /api/pay/session will charge. payment_amount only records a settled
  // charge, so it is empty until the webhook lands.
  const totals = await runningSessionTotals(venue.id, [rows[0].id]);
  const due = totals.get(rows[0].id) ?? 0;

  return NextResponse.json({
    open: true,
    status: rows[0].status,
    paid: rows[0].status === "paid",
    amount: due,
    amountPaid: Number(rows[0].amount ?? 0),
    paidAt: rows[0].paid_at ? rows[0].paid_at.toISOString() : null,
  });
}
