import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, tableSessions, venues } from "@/db/schema";
import { settlePaidOrders } from "@/lib/core";
import {
  credentialsComplete,
  retrieveOrderState,
  retrieveTransaction,
  type VivaCredentials,
  type VivaEnv,
} from "@/lib/viva";

export const dynamic = "force-dynamic";

/**
 * Server-side payment confirmation, independent of the webhook.
 *
 * Viva's webhook is the primary notification channel, but it is not something we
 * control: on a cold Vercel function, a misregistered hook, or a merchant-level
 * outage the POST simply never arrives, and the guest is left having paid while
 * the bill still shows as unpaid. This endpoint closes that gap by asking Viva
 * directly.
 *
 * It is safe to call repeatedly: the transaction status comes from Viva, never
 * from the caller, so a guest cannot mark a bill paid by hitting this URL. The
 * worst a spammer achieves is re-reading a transaction they already paid for.
 *
 * Two ways to identify what to confirm, in order of trust:
 *   - `transactionId`: the `t=` value Viva appends to the success URL. Exact.
 *   - `tableId` + `slug`: what we have when the guest comes back to the menu.
 *     We look up the stored payment order code and re-read that transaction.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const str = (k: string) => {
    const v = body[k];
    return v === undefined || v === null ? "" : String(v).trim();
  };

  const slug = str("slug");
  const tableId = str("tableId");
  const transactionId = str("transactionId");

  if (!slug) return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  if (!transactionId && !tableId) {
    return NextResponse.json({ ok: false, error: "missing_target" }, { status: 400 });
  }

  const venueRows = await db
    .select()
    .from(venues)
    .where(eq(venues.slug, slug))
    .limit(1);
  if (venueRows.length === 0) {
    return NextResponse.json({ ok: false, error: "unknown_venue" }, { status: 404 });
  }
  const venue = venueRows[0];

  const creds = {
    env: (venue.viva_env === "live" ? "live" : "demo") as VivaEnv,
    clientId: venue.viva_client_id,
    clientSecret: venue.viva_client_secret,
    merchantId: venue.viva_merchant_id,
    sourceCode: venue.viva_source_code,
    apiKey: venue.viva_api_key ?? "",
  } as VivaCredentials;
  if (!credentialsComplete(creds)) {
    return NextResponse.json({ ok: false, error: "no_credentials" }, { status: 400 });
  }

  // Find the session we are confirming. A known transaction id is exact; a table
  // is a hint and must still resolve to a session that actually has a payment
  // order attached, otherwise there is nothing to verify against.
  const session = await (async () => {
    if (transactionId) {
      const exact = await db
        .select()
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.venue_id, venue.id),
            eq(tableSessions.payment_transaction_id, transactionId),
          ),
        )
        .limit(1);
      if (exact.length > 0) return exact[0];
    }

    if (!tableId) return null;

    const rows = await db
      .select()
      .from(tableSessions)
      .where(and(eq(tableSessions.venue_id, venue.id), eq(tableSessions.table_id, tableId)))
      .orderBy(tableSessions.opened_at);
    const pending = rows.filter((s) => s.payment_order_code && s.payment_status !== "paid");
    return pending.length > 0 ? pending[pending.length - 1] : null;
  })();

  if (!session) {
    return NextResponse.json({ ok: false, error: "no_session" }, { status: 404 });
  }

  if (session.payment_status === "paid") {
    return NextResponse.json({ ok: true, paid: true, amount: Number(session.payment_amount ?? 0), already: true });
  }

  // Ask Viva. `transactionId` from the success URL is authoritative. The stored
  // one is only a fallback for a webhook-driven confirm, and even then only when
  // it still belongs to the CURRENT payment order — otherwise a stale id from an
  // earlier payment resolves to an earlier order code and 409s the guest for
  // good.
  let txId = transactionId || session.payment_transaction_id || "";

  if (!txId) {
    // No transaction id yet — normal when the guest lands back from Viva and the
    // return URL only carried the order code. Ask Viva about the ORDER instead of
    // giving up: a paid order reports StateId 3 and settles the bill. Without this
    // the guest pays, comes back, and the table still shows an unpaid bill.
    const orderState = session.payment_order_code
      ? await retrieveOrderState(creds, session.payment_order_code).catch(() => null)
      : null;

    if (!orderState) {
      return NextResponse.json(
        { ok: false, error: "no_transaction", hint: "transaction id required on first confirmation" },
        { status: 409 },
      );
    }

    if (!orderState.paid) {
      return NextResponse.json({ ok: true, paid: false, statusId: orderState.stateId });
    }

    const now = new Date();
    await db
      .update(tableSessions)
      .set({
        payment_status: "paid",
        payment_transaction_id: orderState.transactionId || "",
        paid_at: now,
      })
      .where(eq(tableSessions.id, session.id));

    const covered = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.session_id, session.id),
          inArray(orders.status, ["pending_confirm", "new", "making", "served"]),
        ),
      );
    const settledByOrder = await settlePaidOrders(
      venue.id,
      covered.map((o) => o.id),
    );

    console.log(
      `[pay/confirm] session=${session.id} order=${session.payment_order_code} paid=${orderState.amount}€ settled=${settledByOrder} via=order-state`,
    );

    return NextResponse.json({
      ok: true,
      paid: true,
      amount: Number(session.payment_amount ?? orderState.amount ?? 0),
      settled: settledByOrder,
    });
  }

  let tx;
  try {
    tx = await retrieveTransaction(creds, txId);
  } catch (err) {
    console.error("[pay/confirm] retrieve failed:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "viva_error" }, { status: 502 });
  }

  if (!tx.paid) {
    await db
      .update(tableSessions)
      .set({ payment_status: "pending", payment_transaction_id: txId })
      .where(eq(tableSessions.id, session.id));
    return NextResponse.json({ ok: true, paid: false, statusId: tx.statusId });
  }

  // A paid transaction that belongs to a DIFFERENT payment order must not settle
  // this session. Without this check a guest who paid twice (or a transaction
  // reused from an earlier checkout) could zero out a bill it never covered.
  if (
    session.payment_order_code &&
    tx.orderCode &&
    String(tx.orderCode) !== String(session.payment_order_code)
  ) {
    console.warn(
      `[pay/confirm] order mismatch session=${session.id} stored=${session.payment_order_code} tx=${tx.orderCode}`,
    );
    return NextResponse.json(
      { ok: false, error: "order_mismatch", paid: false },
      { status: 409 },
    );
  }

  const now = new Date();
  await db
    .update(tableSessions)
    .set({ payment_status: "paid", payment_transaction_id: txId, paid_at: now })
    .where(eq(tableSessions.id, session.id));

  // Stamp every order this payment covered, exactly like the webhook does, so a
  // confirmed payment cannot be billed twice.
  const covered = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.session_id, session.id),
        inArray(orders.status, ["pending_confirm", "new", "making", "served"]),
      ),
    );
  const settled = await settlePaidOrders(
    venue.id,
    covered.map((o) => o.id),
  );

  console.log(
    `[pay/confirm] session=${session.id} tx=${txId} paid=${tx.amount}€ settled=${settled} via=${transactionId ? "return" : "table"}`,
  );

  return NextResponse.json({ ok: true, paid: true, amount: Number(session.payment_amount ?? 0), settled });
}
