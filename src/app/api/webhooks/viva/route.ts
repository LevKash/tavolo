import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, tableSessions, venues } from "@/db/schema";
import { closeTableSession, settlePaidOrders } from "@/lib/core";
import {
  credentialsComplete,
  fetchWebhookKey,
  normalizeClientId,
  retrieveTransaction,
  type VivaEnv,
} from "@/lib/viva";

export const dynamic = "force-dynamic";

/**
 * Webhook URL verification.
 *
 * Viva does not send us a challenge value. Instead it sends a bare GET to this
 * URL and expects us to independently fetch the account's webhook key from the
 * Viva API (`GET {api}/api/messages/config/token`, Basic auth with
 * MerchantId:ApiKey) and echo it back as JSON: { "Key": "<hex>" }.
 *
 * If we cannot prove the key (no API key configured, API error), we return 401
 * so Viva's UI shows "URL not verified" instead of a silently broken hook.
 */
export async function GET(req: NextRequest) {
  console.log(`[viva-webhook] GET verify hit: ${req.nextUrl.search.slice(0, 200)}`);

  // The verification key is account-wide, not per-venue, so any venue with an
  // API key configured can mint it.
  const rows = await db
    .select({
      merchantId: venues.viva_merchant_id,
      apiKey: venues.viva_api_key,
      env: venues.viva_env,
    })
    .from(venues)
    .limit(50);

  const candidate = rows.find((r) => r.merchantId && r.apiKey && r.env !== "live");
  const key = candidate
    ? await fetchWebhookKey({
        env: (candidate.env === "live" ? "live" : "demo") as VivaEnv,
        merchantId: candidate.merchantId,
        apiKey: candidate.apiKey,
      })
    : "";

  if (!key) {
    console.warn("[viva-webhook] verification failed: no API key or API rejected it");
    return NextResponse.json({ error: "verification_failed" }, { status: 401 });
  }

  // Viva accepts the key under either casing; send both to be safe.
  return NextResponse.json({ Key: key, key });
}

/**
 * Viva "Transaction Payment Created" webhook.
 *
 * One URL serves every tenant: Viva posts the same payload for all merchants, so
 * we route by `MerchantId` to find which venue was paid.
 *
 * This handler is deliberately tolerant — Viva retries on non-2xx, so we return
 * 200 for "nothing useful for us" cases and only 500 on genuine failures.
 */
export async function POST(req: NextRequest) {
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    console.warn("[viva-webhook] non-JSON payload:", raw.slice(0, 500));
    return NextResponse.json({ ok: true, ignored: "non_json" });
  }

  // Viva wraps the actual transaction in `EventData` and keeps only metadata
  // (`EventTypeId`, `MessageId`, `Created`…) at the top level. Reading the top
  // level alone made every field empty, so payments were accepted with
  // `200 ignored: no_order_code` and never reached the database. Some payload
  // shapes (and the ISV/test sender) flatten the body instead — read both.
  const envelope = payload;
  const envelopeEventData = envelope["EventData"];
  const data =
    envelopeEventData && typeof envelopeEventData === "object"
      ? (envelopeEventData as Record<string, unknown>)
      : {};
  const str = (k: string) => {
    for (const src of [data, envelope]) {
      const v = src[k];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return "";
  };

  const merchantId = str("MerchantId");
  const orderCode = str("OrderCode") || str("ParentOrderCode");
  const transactionId = str("TransactionId");
  const statusId = (str("StatusId") || str("statusId")).toUpperCase();
  const eventType = str("EventTypeId") || str("eventTypeId");

  console.log(
    `[viva-webhook] event=${eventType} merchant=${merchantId} order=${orderCode} tx=${transactionId} status=${statusId}`,
  );

  if (!orderCode) return NextResponse.json({ ok: true, ignored: "no_order_code" });

  // Route to the tenant. MerchantId is optional in some payloads, so fall back
  // to the session we stored the order for: Viva re-mints the OrderCode on every
  // checkout, but `merchantTrns` is ours and survives.
  let venueRows = merchantId
    ? await db.select().from(venues).where(eq(venues.viva_merchant_id, merchantId)).limit(1)
    : [];
  let resolvedByTrns = false;
  if (venueRows.length === 0) {
    const merchantTrns = str("MerchantTrns") || str("MerchantTrns2");
    if (merchantTrns) {
      const byTrns = await db
        .select({ venue: venues })
        .from(tableSessions)
        .innerJoin(venues, eq(tableSessions.venue_id, venues.id))
        .where(eq(tableSessions.payment_merchant_trns, merchantTrns))
        .limit(1);
      if (byTrns.length > 0) {
        venueRows = [byTrns[0].venue];
        resolvedByTrns = true;
      }
    }
  }
  if (venueRows.length === 0) {
    // Unknown merchant: accept the event, do not retry forever.
    console.warn("[viva-webhook] unknown merchant", merchantId, str("MerchantTrns"));
    return NextResponse.json({ ok: true, ignored: "unknown_merchant" });
  }
  const venue = venueRows[0];

  // Find the session by OrderCode when we know it, otherwise by our own
  // MerchantTrns. The second path is the one that recovers payments that were
  // created before the order code got overwritten (repeated checkouts).
  let sessions = orderCode
    ? await db
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.payment_order_code, orderCode))
        .limit(1)
    : [];
  if (sessions.length === 0) {
    const merchantTrns = str("MerchantTrns") || str("MerchantTrns2");
    if (merchantTrns) {
      sessions = await db
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.payment_merchant_trns, merchantTrns))
        .limit(1);
    }
  }
  if (sessions.length === 0) {
    console.warn("[viva-webhook] no session for order", orderCode, str("MerchantTrns"));
    return NextResponse.json({ ok: true, ignored: "unknown_order" });
  }
  const session = sessions[0];
  if (!resolvedByTrns && session.venue_id !== venue.id) {
    console.warn("[viva-webhook] order/venue mismatch", orderCode);
    return NextResponse.json({ ok: true, ignored: "mismatch" });
  }

  // Never trust the webhook body alone for money: re-read the transaction from
  // the API and use THAT status. Webhooks can be replayed or spoofed.
  const creds = {
    env: (venue.viva_env === "live" ? "live" : "demo") as VivaEnv,
    clientId: normalizeClientId(venue.viva_client_id),
    clientSecret: venue.viva_client_secret,
    merchantId: venue.viva_merchant_id,
    sourceCode: venue.viva_source_code,
  };
  if (!credentialsComplete(creds)) {
    console.error("[viva-webhook] venue has incomplete Viva credentials", venue.id);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  let paid = statusId === "F";
  let txId = transactionId;
  if (transactionId) {
    try {
      const tx = await retrieveTransaction(creds, transactionId);
      paid = tx.paid;
      txId = tx.transactionId;
      // `session.payment_amount` is stored in the currency's major unit (euros),
      // while Viva reports the transaction amount in minor units (cents).
      const expected = Math.round(Number(session.payment_amount ?? 0) * 100);
      if (tx.amount && expected && tx.amount !== expected) {
        console.warn(
          `[viva-webhook] amount mismatch session=${session.id} expected=${expected} got=${tx.amount}`,
        );
      }
    } catch (err) {
      console.error("[viva-webhook] verify failed:", (err as Error).message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  if (!paid) {
    await db
      .update(tableSessions)
      .set({ payment_status: statusId === "E" ? "failed" : "pending" })
      .where(eq(tableSessions.id, session.id));
    return NextResponse.json({ ok: true, paid: false });
  }

  await db
    .update(tableSessions)
    .set({
      payment_status: "paid",
      payment_transaction_id: txId,
      paid_at: new Date(),
    })
    .where(eq(tableSessions.id, session.id));

  // Stamp every order this payment covered as settled. Without this the same
  // drinks stay "open" and get billed again on the next round.
  const covered = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.session_id, session.id),
        inArray(orders.status, ["new", "making", "served", "pending_confirm"]),
      ),
    );
  const settled = await settlePaidOrders(
    session.venue_id,
    covered.map((o) => o.id),
  );
  console.log(`[viva-webhook] settled ${settled} orders for session ${session.id}`);

  // Auto-close the table: the whole point of pay-at-table is that nobody has to
  // walk over with a terminal. Only close if it is still open.
  const stillOpen = await db
    .select({ id: tableSessions.id })
    .from(tableSessions)
    .where(and(eq(tableSessions.id, session.id), eq(tableSessions.status, "open")))
    .limit(1);
  if (stillOpen.length > 0) {
    await closeTableSession(session.venue_id, session.table_id);
    console.log(`[viva-webhook] session ${session.id} paid ${session.payment_amount}€ and closed`);
  }

  return NextResponse.json({ ok: true, paid: true });
}
