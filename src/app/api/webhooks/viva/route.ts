import { NextRequest, NextResponse } from "next/server";
import { processWebhook } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Legacy shared webhook URL, kept so venues already pointed here keep working.
 * Viva posts the same payload for every merchant, so the venue is found from the
 * MerchantId in the body. New setups should use the per-venue URL
 * /api/webhooks/viva/<token> shown in Settings → Payments, which also supports
 * Viva's URL verification.
 */
export async function GET() {
  return NextResponse.json({ error: "use_venue_webhook_url" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: true, ignored: "non_json" });
  }
  const r = await processWebhook(null, payload);
  return NextResponse.json(r.body, { status: r.status });
}
