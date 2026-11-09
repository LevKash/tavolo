import { randomUUID } from "crypto";
import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  paymentEvents,
  paymentOrders,
  payments,
  tableSessions,
  venues,
  type Payment,
  type Venue,
} from "@/db/schema";
import { notifyOperator } from "@/lib/tg";
import {
  createPaymentOrder,
  credentialsComplete,
  endpointsFor,
  findPaidTransactionIdsByOrderCode,
  retrieveTransaction,
  VivaError,
  type VivaCredentials,
  type VivaEnv,
  type VivaTransaction,
} from "@/lib/viva";

/**
 * Payments by ORDER, not by table.
 *
 * - Every tap on Pay creates a NEW `payments` row with its own `merchant_trns`
 *   and a frozen list of the orders it covers. Nothing is ever overwritten, so
 *   an older checkout that is paid late is still recognised.
 * - Money is tied to a row ONLY by the reference we chose (`merchant_trns`,
 *   echoed by Viva on the transaction), after re-reading the transaction from
 *   Viva with the venue's own credentials. A request body is never trusted.
 * - Settling marks just the covered orders as paid. It does NOT change their
 *   kitchen status and does NOT close the table: staff see a PAID badge, ring
 *   the fiscal receipt in their own system, and close the table themselves.
 */

/** Orders a guest can pay for: accepted by the bar, not yet paid. */
export const PAYABLE_STATUSES = ["new", "making", "served"] as const;
/** A repeated tap within this window reuses the open checkout. */
export const REUSE_WINDOW_MS = 10 * 60 * 1000;
const EXPIRE_AFTER_MS = 24 * 60 * 60 * 1000;

export function vivaCreds(v: Venue): VivaCredentials {
  return {
    env: (v.viva_env === "live" ? "live" : "demo") as VivaEnv,
    clientId: v.viva_client_id,
    clientSecret: v.viva_client_secret,
    merchantId: v.viva_merchant_id,
    sourceCode: v.viva_source_code,
    apiKey: v.viva_api_key ?? "",
  };
}

export const toCents = (euros: number) => Math.round(Number(euros) * 100);

type Executor = Pick<typeof db, "select">;

/**
 * What the table still owes: accepted, unpaid orders of the table's OPEN
 * session(s), in whole cents. Orders left over in a closed session never count,
 * so the next guest is not charged for a previous sitting.
 */
export async function loadPayable(exec: Executor, venueId: string, tableId: string) {
  const open = await exec
    .select({ id: tableSessions.id })
    .from(tableSessions)
    .where(
      and(
        eq(tableSessions.venue_id, venueId),
        eq(tableSessions.table_id, tableId),
        eq(tableSessions.status, "open"),
      ),
    );
  if (open.length === 0) return { items: [] as { id: string; cents: number }[], totalCents: 0 };
  const rows = await exec
    .select({ id: orders.id, total: orders.total })
    .from(orders)
    .where(
      and(
        eq(orders.venue_id, venueId),
        eq(orders.table_id, tableId),
        inArray(
          orders.session_id,
          open.map((s) => s.id),
        ),
        inArray(orders.status, [...PAYABLE_STATUSES]),
        ne(orders.payment_status, "paid"),
      ),
    )
    .orderBy(asc(orders.created_at));
  const items = rows
    .map((r) => ({ id: r.id, cents: toCents(r.total) }))
    .filter((r) => r.cents > 0);
  return { items, totalCents: items.reduce((s, i) => s + i.cents, 0) };
}

export async function recordEvent(e: {
  source: string;
  outcome: string;
  venueId?: string | null;
  paymentId?: string | null;
  transactionId?: string;
  detail?: string;
}) {
  try {
    await db.insert(paymentEvents).values({
      source: e.source,
      outcome: e.outcome,
      venue_id: e.venueId ?? null,
      payment_id: e.paymentId ?? null,
      transaction_id: e.transactionId ?? "",
      detail: (e.detail ?? "").slice(0, 500),
    });
  } catch (err) {
    console.error("[payments] could not record event:", (err as Error).message);
  }
}

// ------------------------------------------------------------- create

export type CreatePaymentResult =
  | {
      ok: true;
      checkoutUrl: string;
      paymentId: string;
      amountCents: number;
      items: number;
      reused: boolean;
    }
  | {
      ok: false;
      error:
        | "nothing_to_pay"
        | "payments_not_configured"
        | "payment_in_progress"
        | "payment_provider_error";
      detail?: string;
    };

export async function createPayment(args: {
  venue: Venue;
  tableId: string;
  tableLabel: string;
  lang: "el-GR" | "en-GB";
}): Promise<CreatePaymentResult> {
  const { venue, tableId, tableLabel, lang } = args;
  const creds = vivaCreds(venue);
  // The API key is required: it powers the webhook verification and the check
  // that recovers a payment whose notification was lost.
  if (!credentialsComplete(creds) || !creds.apiKey) {
    return { ok: false, error: "payments_not_configured" };
  }

  // An earlier checkout for this table may already be paid at Viva but not yet
  // recorded (lost webhook). Settle it first, so the guest is never asked to pay
  // for the same orders twice.
  await settleOlderPending(venue, tableId).catch((err) =>
    console.error("[payments] pre-check failed:", (err as Error).message),
  );

  // Step 1, under a per-table lock: work out what is owed and either reuse a
  // still-open checkout for exactly the same orders or insert a new attempt.
  const prepared = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pay:${tableId}`}))`);
    const { items, totalCents } = await loadPayable(tx, venue.id, tableId);
    if (items.length === 0) return { kind: "none" as const };

    const ids = items.map((i) => i.id).sort();
    const open = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.venue_id, venue.id),
          eq(payments.table_id, tableId),
          eq(payments.status, "pending"),
          gt(payments.created_at, new Date(Date.now() - REUSE_WINDOW_MS)),
        ),
      )
      .orderBy(desc(payments.created_at));
    for (const p of open) {
      // An attempt that never reached Viva (the request died) must not lock the
      // table out: retire it and create a fresh one.
      if (!p.order_code && Date.now() - p.created_at.getTime() > 30_000) {
        await tx
          .update(payments)
          .set({ status: "failed", note: "stale_unfinished" })
          .where(eq(payments.id, p.id));
        continue;
      }
      if (p.amount_cents !== totalCents) continue;
      const covered = (
        await tx
          .select({ id: paymentOrders.order_id })
          .from(paymentOrders)
          .where(eq(paymentOrders.payment_id, p.id))
      )
        .map((r) => r.id)
        .sort();
      if (covered.length === ids.length && covered.every((v, i) => v === ids[i])) {
        return { kind: "reuse" as const, payment: p, count: items.length };
      }
    }

    const id = randomUUID();
    const [row] = await tx
      .insert(payments)
      .values({
        id,
        venue_id: venue.id,
        table_id: tableId,
        merchant_trns: `ordavo:${id}`,
        amount_cents: totalCents,
      })
      .returning();
    await tx
      .insert(paymentOrders)
      .values(items.map((i) => ({ payment_id: id, order_id: i.id, amount_cents: i.cents })));
    return { kind: "new" as const, payment: row, count: items.length };
  });

  if (prepared.kind === "none") return { ok: false, error: "nothing_to_pay" };

  const checkoutFor = (code: string) =>
    `${endpointsFor(creds.env).checkout}?ref=${encodeURIComponent(code)}`;

  if (prepared.kind === "reuse") {
    // The first tap may still be waiting for Viva; give it a moment.
    let code = prepared.payment.order_code;
    for (let i = 0; i < 8 && !code; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const fresh = await db
        .select({ code: payments.order_code, status: payments.status })
        .from(payments)
        .where(eq(payments.id, prepared.payment.id))
        .limit(1);
      if (fresh[0]?.status === "failed") break;
      code = fresh[0]?.code ?? "";
    }
    if (!code) return { ok: false, error: "payment_in_progress" };
    return {
      ok: true,
      checkoutUrl: checkoutFor(code),
      paymentId: prepared.payment.id,
      amountCents: prepared.payment.amount_cents,
      items: prepared.count,
      reused: true,
    };
  }

  // Step 2, outside the lock: create the order at the venue's Viva account.
  const p = prepared.payment;
  try {
    const created = await createPaymentOrder(creds, {
      amountCents: p.amount_cents,
      customerTrns: `${venue.name} · Table ${tableLabel} · ${prepared.count} item${prepared.count === 1 ? "" : "s"}`,
      merchantTrns: p.merchant_trns,
      requestLang: lang,
    });
    await db.update(payments).set({ order_code: created.orderCode }).where(eq(payments.id, p.id));
    return {
      ok: true,
      checkoutUrl: created.checkoutUrl,
      paymentId: p.id,
      amountCents: p.amount_cents,
      items: prepared.count,
      reused: false,
    };
  } catch (err) {
    const e = err as Error & { body?: string };
    console.error("[payments] viva order creation failed:", e.message, e.body ?? "");
    await db
      .update(payments)
      .set({ status: "failed", note: `create_failed:${e.message}`.slice(0, 200) })
      .where(eq(payments.id, p.id));
    return { ok: false, error: "payment_provider_error", detail: e.message };
  }
}

/** Ask Viva about this table's still-pending checkouts and settle any that were paid. */
async function settleOlderPending(venue: Venue, tableId: string) {
  const creds = vivaCreds(venue);
  const pending = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.venue_id, venue.id),
        eq(payments.table_id, tableId),
        eq(payments.status, "pending"),
        ne(payments.order_code, ""),
        gt(payments.created_at, new Date(Date.now() - EXPIRE_AFTER_MS)),
      ),
    )
    .orderBy(desc(payments.created_at))
    .limit(5);
  for (const p of pending) {
    const ids = await findPaidTransactionIdsByOrderCode(creds, p.order_code);
    for (const id of ids) await confirmTransaction(venue, id, "precheck");
  }
}

// ------------------------------------------------------------- settle

export type SettleResult = {
  outcome: "paid" | "already" | "foreign" | "unmatched" | "rejected";
  paymentId?: string;
  settled?: number;
  reason?: string;
};

async function alertOperator(text: string) {
  await notifyOperator(`⚠️ Ordavo payments\n${text}`);
}

/**
 * Settle one payment from a transaction that was just re-read from Viva.
 * Idempotent: a second call for a paid payment changes nothing.
 */
export async function settlePayment(
  paymentId: string,
  tx: VivaTransaction,
  source: string,
): Promise<SettleResult> {
  let flagged = "";
  let eventVenueId: string | undefined;
  const result = await db.transaction(async (trx): Promise<SettleResult> => {
    const [p] = await trx
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .for("update");
    if (!p) return { outcome: "unmatched" };
    eventVenueId = p.venue_id;
    if (p.status === "paid") return { outcome: "already", paymentId: p.id, settled: 0 };

    const now = new Date();
    if (!tx.paid) {
      await trx.update(payments).set({ last_checked_at: now }).where(eq(payments.id, p.id));
      return { outcome: "rejected", paymentId: p.id, reason: `status_${tx.statusId || "unknown"}` };
    }

    const reject = async (reason: string): Promise<SettleResult> => {
      flagged = reason;
      await trx
        .update(payments)
        .set({ needs_attention: true, note: reason.slice(0, 200), last_checked_at: now })
        .where(eq(payments.id, p.id));
      return { outcome: "rejected", paymentId: p.id, reason };
    };

    if (tx.currencyCode !== "978") return reject(`currency:${tx.currencyCode || "missing"}`);

    // The same transaction can never settle two payments.
    const dup = await trx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.transaction_id, tx.transactionId), ne(payments.id, p.id)))
      .limit(1);
    if (dup.length > 0) return reject(`transaction_reused:${tx.transactionId}`);

    if (tx.amountCents < p.amount_cents) {
      return reject(`underpaid:${tx.amountCents}/${p.amount_cents}`);
    }

    const links = await trx
      .select({ order_id: paymentOrders.order_id })
      .from(paymentOrders)
      .where(eq(paymentOrders.payment_id, p.id));
    // Orders already closed or declined (table settled at the desk, or the bar
    // refused the order) when the money arrives: a human must reconcile this.
    const dead = links.length
      ? await trx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              inArray(
                orders.id,
                links.map((l) => l.order_id),
              ),
              inArray(orders.status, ["closed", "declined"]),
            ),
          )
      : [];
    const updated = links.length
      ? await trx
          .update(orders)
          .set({
            payment_status: "paid",
            paid_at: now,
            payment_id: p.id,
            paid_amount: sql`${orders.total}`,
          })
          .where(
            and(
              inArray(
                orders.id,
                links.map((l) => l.order_id),
              ),
              ne(orders.payment_status, "paid"),
            ),
          )
          .returning({ id: orders.id })
      : [];

    const notes: string[] = [];
    const overlap = links.length - updated.length;
    if (overlap > 0) notes.push(`overlap:${overlap}`);
    if (dead.length > 0) notes.push(`paid_after_close:${dead.length}`);
    if (notes.length) flagged = notes.join(",");
    // Extra on top of the bill is usually a tip: recorded, not an alert.
    const extra = tx.amountCents > p.amount_cents ? `overpaid:${tx.amountCents - p.amount_cents}` : "";

    await trx
      .update(payments)
      .set({
        status: "paid",
        transaction_id: tx.transactionId,
        paid_at: now,
        last_checked_at: now,
        needs_attention: notes.length > 0,
        note: [...notes, extra].filter(Boolean).join(","),
      })
      .where(eq(payments.id, p.id));
    return { outcome: "paid", paymentId: p.id, settled: updated.length };
  }).catch(async (err: unknown): Promise<SettleResult> => {
    // Only a unique-index race (the same transaction on two payments) is a
    // verdict. Any other failure (connection reset, cold start, deadlock) is
    // thrown, so the webhook answers 500 and Viva retries instead of the payment
    // being silently dropped.
    if ((err as { code?: string }).code === "23505") {
      flagged = "transaction_reused:unique_violation";
      return { outcome: "rejected", paymentId, reason: flagged };
    }
    throw err;
  });

  await recordEvent({
    source,
    outcome: result.outcome === "rejected" ? `rejected:${result.reason ?? ""}` : result.outcome,
    venueId: eventVenueId,
    paymentId: result.paymentId ?? paymentId,
    transactionId: tx.transactionId,
    detail: flagged,
  });
  if (flagged) {
    await alertOperator(
      `Payment ${paymentId} (${source}) needs a look: ${flagged}\nViva transaction ${tx.transactionId}`,
    );
  }
  return result;
}

/** Find the payment a verified Viva transaction belongs to, then settle it. */
export async function settleFromTransaction(
  venue: Venue,
  tx: VivaTransaction,
  source: string,
): Promise<SettleResult> {
  if (!tx.merchantTrns.startsWith("ordavo:")) {
    // Not ours: a card-terminal sale or another system on the same Viva account.
    await recordEvent({
      source,
      venueId: venue.id,
      outcome: "foreign",
      transactionId: tx.transactionId,
    });
    return { outcome: "foreign" };
  }

  const [found] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.merchant_trns, tx.merchantTrns), eq(payments.venue_id, venue.id)))
    .limit(1);

  if (!found) {
    // Two venues can share one Viva account; the other one owns this reference.
    const [other] = await db
      .select({ venue_id: payments.venue_id })
      .from(payments)
      .where(eq(payments.merchant_trns, tx.merchantTrns))
      .limit(1);
    await recordEvent({
      source,
      venueId: venue.id,
      outcome: other ? "other_venue" : "unmatched",
      transactionId: tx.transactionId,
      detail: tx.merchantTrns,
    });
    if (!other) {
      await alertOperator(
        `Viva transaction ${tx.transactionId} (${tx.amountCents / 100} EUR) for ${venue.name} carries our reference ${tx.merchantTrns} but matches no payment. Check it by hand.`,
      );
    }
    return { outcome: "unmatched" };
  }
  return settlePayment(found.id, tx, source);
}

/** Verify a transaction id with Viva, then settle. Throws on provider errors. */
export async function confirmTransaction(
  venue: Venue,
  transactionId: string,
  source: string,
): Promise<SettleResult> {
  const tx = await retrieveTransaction(vivaCreds(venue), transactionId);
  return settleFromTransaction(venue, tx, source);
}

// ------------------------------------------------------------- webhook

const lastAuthAlert = new Map<string, number>();

/**
 * Process a Viva webhook body. `venueHint` is set when the URL carries a venue
 * token; the legacy shared URL passes null and we route by MerchantId.
 * Returns the HTTP status Viva should see: 200 for "handled or nothing for us"
 * and 500 for everything that could be transient or fixable (database trouble,
 * Viva not answering, rejected credentials), so Viva retries those.
 */
export async function processWebhook(
  venueHint: Venue | null,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const eventData = payload["EventData"];
  const data =
    eventData && typeof eventData === "object" ? (eventData as Record<string, unknown>) : {};
  const str = (k: string) => {
    for (const src of [data, payload]) {
      const v = src[k];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return "";
  };
  const transactionId = str("TransactionId");
  const merchantId = str("MerchantId");

  if (!transactionId) {
    // Nothing to verify; deliberately not stored (anyone can POST here).
    return { status: 200, body: { ok: true, ignored: "no_transaction_id" } };
  }

  let candidates: Venue[] = venueHint ? [venueHint] : [];
  if (candidates.length === 0 && merchantId) {
    candidates = await db
      .select()
      .from(venues)
      .where(sql`lower(${venues.viva_merchant_id}) = ${merchantId.toLowerCase()}`)
      .limit(5);
  }
  if (candidates.length === 0) {
    console.warn("[viva-webhook] unknown merchant", merchantId);
    return { status: 200, body: { ok: true, ignored: "unknown_merchant" } };
  }

  let last: SettleResult = { outcome: "unmatched" };
  for (const venue of candidates) {
    const creds = vivaCreds(venue);
    if (!credentialsComplete(creds)) {
      await recordEvent({ source: "webhook", venueId: venue.id, outcome: "error", transactionId, detail: "no_credentials" });
      continue;
    }
    let tx: VivaTransaction;
    try {
      tx = await retrieveTransaction(creds, transactionId);
    } catch (err) {
      const e = err as Error & { status?: number };
      await recordEvent({
        source: "webhook",
        venueId: venue.id,
        outcome: "error",
        transactionId,
        detail: `viva_${e.status ?? "network"}:${e.message}`,
      });
      // Rejected credentials mean EVERY payment of this venue is going
      // unrecorded: tell a human (at most once every 10 minutes per venue).
      if ((e.status === 401 || e.status === 403) && Date.now() - (lastAuthAlert.get(venue.id) ?? 0) > 600_000) {
        lastAuthAlert.set(venue.id, Date.now());
        await alertOperator(`Viva rejected the credentials of ${venue.name} (${e.status}). Payments there are NOT being recorded until they are fixed.`);
      }
      if (candidates.length > 1) continue; // another venue on this account may own it
      return { status: 500, body: { ok: false } };
    }
    try {
      last = await settleFromTransaction(venue, tx, "webhook");
    } catch (err) {
      await recordEvent({ source: "webhook", venueId: venue.id, outcome: "error", transactionId, detail: (err as Error).message });
      return { status: 500, body: { ok: false } };
    }
    if (last.outcome === "paid" || last.outcome === "already") break;
  }
  return { status: 200, body: { ok: true, outcome: last.outcome } };
}

// ------------------------------------------------------------- reconcile

const lastReconcile = new Map<string, number>();

/**
 * Safety net for a lost webhook: for payments still pending after two minutes,
 * ask Viva (legacy API, needs the venue's API key) whether the order was paid,
 * verify any transaction found, and settle it. Also expires checkouts that were
 * never paid. Throttled to once a minute per venue; called from the bar's poll.
 */
export async function reconcileVenue(venue: Venue): Promise<void> {
  const nowMs = Date.now();
  if (nowMs - (lastReconcile.get(venue.id) ?? 0) < 60_000) return;
  lastReconcile.set(venue.id, nowMs);

  await db
    .update(payments)
    .set({ status: "expired" })
    .where(
      and(
        eq(payments.venue_id, venue.id),
        eq(payments.status, "pending"),
        lt(payments.created_at, new Date(nowMs - EXPIRE_AFTER_MS)),
      ),
    );

  // Keep the audit table bounded.
  await db
    .delete(paymentEvents)
    .where(lt(paymentEvents.received_at, new Date(nowMs - 90 * 24 * 60 * 60 * 1000)));

  const creds = vivaCreds(venue);
  if (!credentialsComplete(creds) || !creds.apiKey) return;

  const pending = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.venue_id, venue.id),
        eq(payments.status, "pending"),
        lt(payments.created_at, new Date(nowMs - 2 * 60 * 1000)),
        gt(payments.created_at, new Date(nowMs - EXPIRE_AFTER_MS)),
        ne(payments.order_code, ""),
      ),
    )
    .orderBy(sql`${payments.last_checked_at} asc nulls first`, asc(payments.created_at))
    .limit(10);
  for (const p of pending) {
    try {
      const ids = await findPaidTransactionIdsByOrderCode(creds, p.order_code);
      for (const id of ids) await confirmTransaction(venue, id, "reconcile");
      await db.update(payments).set({ last_checked_at: new Date() }).where(eq(payments.id, p.id));
    } catch (err) {
      console.error("[payments] reconcile failed:", (err as Error).message);
    }
  }
}
