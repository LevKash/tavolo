import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { getVenueBySlug } from "@/lib/core";
import { confirmTransaction, reconcileVenue, vivaCreds } from "@/lib/payments";
import { clientIp, rateLimited, UUID_RE } from "@/lib/rate-limit";
import { credentialsComplete } from "@/lib/viva";

export const dynamic = "force-dynamic";

/**
 * Lets a returning guest's screen ask "was my payment recorded?".
 *
 * Whatever the caller sends, the answer comes from Viva: a transaction id is
 * re-read from Viva with the venue's own credentials and matched to a payment by
 * the reference WE created, so a guest cannot mark a bill paid by calling this.
 * Without a transaction id it only reports what we already know (and nudges the
 * reconciliation that asks Viva about pending checkouts).
 */
export async function POST(req: NextRequest) {
  let body: { slug?: unknown; tableId?: unknown; transactionId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const tableId = typeof body.tableId === "string" ? body.tableId.trim() : "";
  const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
  if (!slug) return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  if (!transactionId && !UUID_RE.test(tableId)) {
    return NextResponse.json({ ok: false, error: "missing_target" }, { status: 400 });
  }
  if (rateLimited(`pay-confirm:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ ok: false, error: "too_many_requests" }, { status: 429 });
  }

  const venue = await getVenueBySlug(slug);
  if (!venue) return NextResponse.json({ ok: false, error: "unknown_venue" }, { status: 404 });
  if (!credentialsComplete(vivaCreds(venue))) {
    return NextResponse.json({ ok: false, error: "no_credentials" }, { status: 400 });
  }

  if (transactionId) {
    if (!/^[0-9a-f-]{8,64}$/i.test(transactionId)) {
      return NextResponse.json({ ok: false, error: "bad_transaction_id" }, { status: 400 });
    }
    try {
      const r = await confirmTransaction(venue, transactionId, "confirm");
      return NextResponse.json({
        ok: true,
        paid: r.outcome === "paid" || r.outcome === "already",
        outcome: r.outcome,
      });
    } catch (err) {
      console.error("[pay/confirm] verify failed:", (err as Error).message);
      return NextResponse.json({ ok: false, error: "viva_error" }, { status: 502 });
    }
  }

  await reconcileVenue(venue).catch(() => undefined);
  const [latest] = await db
    .select({ status: payments.status })
    .from(payments)
    .where(and(eq(payments.venue_id, venue.id), eq(payments.table_id, tableId)))
    .orderBy(desc(payments.created_at))
    .limit(1);
  return NextResponse.json({
    ok: true,
    paid: latest?.status === "paid",
    pending: latest?.status === "pending",
  });
}
