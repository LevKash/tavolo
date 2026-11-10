import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tables } from "@/db/schema";
import { getVenueBySlug } from "@/lib/core";
import { createPayment } from "@/lib/payments";
import { clientIp, rateLimited, UUID_RE } from "@/lib/rate-limit";
import { paymentsAllowed } from "@/lib/site";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  nothing_to_pay: "Nothing to pay right now. Orders can be paid once the bar has accepted them.",
  payments_not_configured: "Card payment is not available at this venue.",
  payments_demo_mode: "Card payment is not available at this venue yet.",
  bill_changed: "The bill has just changed. Please tap Pay again.",
  payment_in_progress: "A payment is already being prepared. Please wait a moment and try again.",
  payment_provider_error: "The payment service did not answer. Please try again.",
};

/**
 * Starts a payment for what a table currently owes.
 *
 * The guest never sends an amount. The server works it out from the table's
 * accepted, unpaid orders, freezes that list into a `payments` row and opens a
 * Viva checkout for exactly that sum. Paying a round does not close the table.
 */
export async function POST(req: NextRequest) {
  let body: { slug?: unknown; tableId?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const tableId = typeof body.tableId === "string" ? body.tableId.trim() : "";
  if (!slug || !UUID_RE.test(tableId)) {
    return NextResponse.json({ error: "slug and tableId are required" }, { status: 400 });
  }
  if (rateLimited(`pay-session:${clientIp(req)}`, 12, 60_000)) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const venue = await getVenueBySlug(slug);
  if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  if (!venue.is_published) return NextResponse.json({ error: "Menu is offline" }, { status: 403 });
  if (!paymentsAllowed() || !venue.payments_enabled) {
    return NextResponse.json({ error: "payments_disabled" }, { status: 409 });
  }

  const tbl = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1);
  if (tbl.length === 0 || tbl[0].venue_id !== venue.id) {
    return NextResponse.json({ error: "Table not found at this venue" }, { status: 404 });
  }

  const res = await createPayment({
    venue,
    tableId,
    tableLabel: tbl[0].label,
    lang: body.lang === "el" ? "el-GR" : "en-GB",
  });
  if (!res.ok) {
    const status = res.error === "payment_provider_error" ? 502 : 409;
    return NextResponse.json(
      { error: res.error, message: MESSAGES[res.error] ?? "Payment could not be started." },
      { status },
    );
  }
  return NextResponse.json({
    ok: true,
    checkoutUrl: res.checkoutUrl,
    amount: res.amountCents / 100,
    items: res.items,
    table: tbl[0].label,
    reused: res.reused,
  });
}
