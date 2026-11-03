import { NextResponse } from "next/server";
import { db } from "@/db";
import { tableSessions, venues, tables } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Guest return URL for Viva Smart Checkout.
 *
 * Viva ignores `successUrl` / `failureUrl` sent in the Create Payment Order
 * body — the return address lives in the merchant's **payment source**
 * (Sales → Online Payments → Websites/Apps), one fixed pair per source.
 *
 * Our real return URL is per-table and per-session (`/m/<slug>?table=<uuid>`),
 * which changes constantly and cannot be configured statically. So the payment
 * source points here, and we resolve the guest's table from the one thing Viva
 * always gives back: `s` = the payment order code we created.
 *
 *   success → https://ordavo.vercel.app/r?venue=ambrosia&s={OrderCode}&t={TransactionId}
 *   failure → https://ordavo.vercel.app/r?venue=ambrosia&s={OrderCode}&t={TransactionId}&fail=1
 *
 * The guest lands on a dedicated confirmation page (`/thanks`), not straight
 * back into the menu: dropping them back into the menu left them on a screen
 * that still showed the old bill and no obvious way to keep ordering.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.searchParams;

  const s = qs.get("s") ?? qs.get("orderCode") ?? "";
  const t = qs.get("t") ?? qs.get("transactionId") ?? "";
  const fail = qs.has("fail") || qs.has("failure");

  // Viva's callback sometimes arrives without our own `venue` param (the
  // payment source URL is shared per venue, so we pass it there). Fall back to
  // resolving the venue from the payment order code.
  let slug = qs.get("venue") ?? "";

  const origin = url.origin;

  try {
    if (s) {
      const rows = await db
        .select({
          sessionId: tableSessions.id,
          tableId: tableSessions.table_id,
          venueSlug: venues.slug,
          tableLabel: tables.label,
          amount: tableSessions.payment_amount,
        })
        .from(tableSessions)
        .innerJoin(tables, eq(tables.id, tableSessions.table_id))
        .innerJoin(venues, eq(venues.id, tables.venue_id))
        .where(eq(tableSessions.payment_order_code, s))
        .limit(1);

      if (rows.length) {
        const r = rows[0];
        const target = new URL(`${origin}/thanks`, origin);
        target.searchParams.set("venue", r.venueSlug);
        target.searchParams.set("table", r.tableId);
        if (r.tableLabel) target.searchParams.set("label", r.tableLabel);
        if (r.amount != null) target.searchParams.set("amount", String(r.amount));
        if (fail) target.searchParams.set("status", "failed");
        else target.searchParams.set("status", "paid");
        if (t) target.searchParams.set("t", t);
        if (s) target.searchParams.set("s_code", s);
        return NextResponse.redirect(target, 303);
      }

      if (!slug) {
        // Unknown order — the payment source may be shared across venues, so we
        // cannot guess the bar. Send the guest to a neutral page rather than a
        // broken menu.
        return NextResponse.redirect(new URL("/r/unknown", origin), 303);
      }
    }
  } catch {
    // fall through to the slug-based redirect below
  }

  if (slug) {
    const target = new URL(`${origin}/thanks`, origin);
    target.searchParams.set("venue", slug);
    if (fail) target.searchParams.set("status", "failed");
    else target.searchParams.set("status", "paid");
    if (t) target.searchParams.set("t", t);
    return NextResponse.redirect(target, 303);
  }

  return NextResponse.redirect(new URL("/r/unknown", origin), 303);
}
