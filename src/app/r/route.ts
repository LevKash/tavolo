import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, venues } from "@/db/schema";
import { confirmTransaction } from "@/lib/payments";
import { clientIp, rateLimited } from "@/lib/rate-limit";

/**
 * Guest return URL for Viva Smart Checkout (set in the venue's Viva payment
 * source, one fixed pair per source):
 *
 *   success → https://<site>/r?venue=<slug>&s={OrderCode}&t={TransactionId}
 *   failure → https://<site>/r?venue=<slug>&s={OrderCode}&t={TransactionId}&fail=1
 *
 * The redirect is only a hint. On success we ask Viva about the transaction id
 * right here, on the server, so the payment is recorded even if the guest's
 * browser never runs any JavaScript and the webhook is late. The guest then
 * lands on /thanks, which shows what our own records say.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.searchParams;
  const s = qs.get("s") ?? qs.get("orderCode") ?? "";
  const t = qs.get("t") ?? qs.get("transactionId") ?? "";
  const slug = qs.get("venue") ?? "";
  const fail = qs.has("fail") || qs.has("failure");

  if (rateLimited(`return:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.redirect(new URL("/r/unknown", url.origin), 303);
  }

  try {
    if (slug && (s || t)) {
      const [venue] = await db.select().from(venues).where(eq(venues.slug, slug)).limit(1);
      if (venue) {
        let paymentId = "";
        // Ask Viva about the transaction whatever the redirect claims: a failure
        // redirect can still hide a payment that went through.
        if (/^[0-9a-f-]{8,64}$/i.test(t)) {
          try {
            const r = await confirmTransaction(venue, t, "return");
            paymentId = r.paymentId ?? "";
          } catch (err) {
            console.error("[r] verify failed:", (err as Error).message);
          }
        }
        if (!paymentId && /^\d{6,20}$/.test(s)) {
          const [p] = await db
            .select({ id: payments.id })
            .from(payments)
            .where(and(eq(payments.venue_id, venue.id), eq(payments.order_code, s)))
            .limit(1);
          paymentId = p?.id ?? "";
        }
        if (paymentId) {
          const target = new URL("/thanks", url.origin);
          target.searchParams.set("p", paymentId);
          if (fail) target.searchParams.set("status", "failed");
          return NextResponse.redirect(target, 303);
        }
      }
    }
  } catch (err) {
    console.error("[r] error:", (err as Error).message);
  }
  return NextResponse.redirect(new URL("/r/unknown", url.origin), 303);
}
