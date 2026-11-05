import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { venues } from "@/db/schema";
import { processWebhook } from "@/lib/payments";
import { fetchWebhookKey } from "@/lib/viva";

export const dynamic = "force-dynamic";

async function venueByToken(token: string) {
  if (!/^[0-9a-f]{20,64}$/i.test(token)) return null;
  const rows = await db.select().from(venues).where(eq(venues.webhook_token, token)).limit(1);
  return rows[0] ?? null;
}

/**
 * Viva's URL verification: a bare GET that expects this venue's own webhook key
 * ({ "Key": ... }), fetched with the venue's MerchantId + API key. Because the
 * URL names the venue, each venue verifies against its own Viva account, live or
 * demo.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const venue = await venueByToken(token);
  if (!venue || !venue.viva_merchant_id || !venue.viva_api_key) {
    return NextResponse.json({ error: "verification_failed" }, { status: 401 });
  }
  try {
    const key = await fetchWebhookKey({
      env: venue.viva_env === "live" ? "live" : "demo",
      merchantId: venue.viva_merchant_id,
      apiKey: venue.viva_api_key,
    });
    if (!key) return NextResponse.json({ error: "verification_failed" }, { status: 401 });
    return NextResponse.json({ Key: key, key });
  } catch (err) {
    console.error("[viva-webhook] key fetch failed:", (err as Error).message);
    return NextResponse.json({ error: "verification_failed" }, { status: 401 });
  }
}

/** Payment notification for one venue. The body is only a pointer to verify. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const venue = await venueByToken(token);
  if (!venue) return NextResponse.json({ ok: true, ignored: "unknown_venue" });

  let payload: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: true, ignored: "non_json" });
  }
  const r = await processWebhook(venue, payload);
  return NextResponse.json(r.body, { status: r.status });
}
