import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, venues, type Venue } from "@/db/schema";
import { confirmTransaction } from "@/lib/payments";
import { clientIp, rateLimited } from "@/lib/rate-limit";

/**
 * Guest return URL for Viva Smart Checkout (set in the venue's Viva payment
 * source, one fixed pair per source):
 *
 *   success → https://<site>/r?venue=<slug>
 *   failure → https://<site>/r?venue=<slug>&fail=1
 *
 * Viva appends `t=<transaction id>&s=<order code>` (and more) to these itself.
 * Older setups saved the URL with `{OrderCode}` placeholders; those still work.
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
  // A name can arrive twice: when the return URL saved in Viva already carries
  // `s=` / `t=` (with a placeholder), Viva appends its own real values after
  // them, and qs.get() would return the placeholder. Take the first value that
  // has the right shape instead.
  const pick = (names: string[], shape: RegExp) =>
    names.flatMap((n) => qs.getAll(n)).find((v) => shape.test(v)) ?? "";
  const s = pick(["s", "orderCode"], /^\d{6,20}$/);
  const t = pick(["t", "transactionId"], /^[0-9a-f-]{8,64}$/i);
  const slug = qs.get("venue") ?? "";
  const fail = qs.has("fail") || qs.has("failure");

  if (rateLimited(`return:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.redirect(new URL("/r/unknown", url.origin), 303);
  }

  try {
    // Viva's return URL is configured once per payment source and may or may not
    // carry our `venue` parameter, so the payment is found by the order code
    // (which we stored when the checkout was created), narrowed to the venue when
    // one is given.
    let venue: Venue | undefined;
    let found: { id: string; venue_id: string } | undefined;
    if (/^\d{6,20}$/.test(s)) {
      const [slugVenue] = slug
        ? await db.select().from(venues).where(eq(venues.slug, slug)).limit(1)
        : [];
      const rows = await db
        .select({ id: payments.id, venue_id: payments.venue_id })
        .from(payments)
        .where(
          slugVenue
            ? and(eq(payments.order_code, s), eq(payments.venue_id, slugVenue.id))
            : eq(payments.order_code, s),
        )
        .orderBy(desc(payments.created_at))
        .limit(1);
      found = rows[0];
      if (found) {
        venue =
          slugVenue ?? (await db.select().from(venues).where(eq(venues.id, found.venue_id)).limit(1))[0];
      }
    } else if (slug) {
      [venue] = await db.select().from(venues).where(eq(venues.slug, slug)).limit(1);
    }

    if (venue) {
      let paymentId = found?.id ?? "";
      // Ask Viva about the transaction whatever the redirect claims: a failure
      // redirect can still hide a payment that went through.
      if (/^[0-9a-f-]{8,64}$/i.test(t)) {
        try {
          const r = await confirmTransaction(venue, t, "return");
          paymentId = r.paymentId ?? paymentId;
        } catch (err) {
          console.error("[r] verify failed:", (err as Error).message);
        }
      }
      if (paymentId) {
        const target = new URL("/thanks", url.origin);
        target.searchParams.set("p", paymentId);
        if (fail) target.searchParams.set("status", "failed");
        return NextResponse.redirect(target, 303);
      }
    }
  } catch (err) {
    console.error("[r] error:", (err as Error).message);
  }
  // Names and shapes only, never values: enough to see what Viva really sent.
  const shape = [...qs.entries()]
    .map(([k, v]) => `${k.slice(0, 20)}:${/^\d+$/.test(v) ? `digits${v.length}` : /^[0-9a-f-]{8,64}$/i.test(v) ? "id" : `text${v.length}`}`)
    .join(" ");
  console.warn(`[r] no payment matched; query shape: ${shape || "(empty)"}`);
  return NextResponse.redirect(new URL("/r/unknown", url.origin), 303);
}
