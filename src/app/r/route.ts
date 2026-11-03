import { NextResponse } from "next/server";
import { db } from "@/db";
import { tableSessions, venues, tables } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Static return URL for Viva Smart Checkout.
 *
 * Viva ignores `successUrl` / `failureUrl` sent in the Create Payment Order
 * body — the return address lives in the merchant's **payment source**
 * (Sales → Online Payments → Websites/Apps), one fixed pair per source.
 *
 * Our real return URL is per-table and per-session (`/m/<slug>?table=<uuid>`),
 * which changes constantly and cannot be configured statically. So the payment
 * source points here, and we rebuild the per-guest URL from the one thing Viva
 * always gives back: `s` = the payment order code we created.
 *
 *   success → /r?venue=ambrosia&s=8885718966372608&t=<transactionId>
 *   failure → /r?venue=ambrosia&s=8885718966372608&fail=1
 *
 * `t` (transaction id) is forwarded so the guest app can reconcile against the
 * Viva API even when the webhook never arrived. The `t`/`s` params are kept on
 * the final URL for the same reason.
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
        })
        .from(tableSessions)
        .innerJoin(tables, eq(tables.id, tableSessions.table_id))
        .innerJoin(venues, eq(venues.id, tables.venue_id))
        .where(eq(tableSessions.payment_order_code, s))
        .limit(1);

      if (rows.length) {
        const r = rows[0];
        const target = new URL(
          `${origin}/m/${r.venueSlug}`,
          origin,
        );
        target.searchParams.set("table", r.tableId);
        if (fail) target.searchParams.set("s", "failed");
        else target.searchParams.set("paid", "1");
        if (t) target.searchParams.set("t", t);
        target.searchParams.set("s_code", s);
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
    const target = new URL(`${origin}/m/${slug}`, origin);
    if (fail) target.searchParams.set("s", "failed");
    else target.searchParams.set("paid", "1");
    if (t) target.searchParams.set("t", t);
    return NextResponse.redirect(target, 303);
  }

  return NextResponse.redirect(new URL("/r/unknown", origin), 303);
}
