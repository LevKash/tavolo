import { randomUUID } from "crypto";
import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  paymentEvents,
  paymentOrders,
  payments,
  tableSessions,
  tables,
  venues,
  type Payment,
  type Venue,
} from "@/db/schema";
import { openSecret } from "@/lib/secrets";
import { paymentsAllowed } from "@/lib/site";
import { notifyOperator } from "@/lib/tg";
import type { PaymentAlertView } from "@/lib/types";
import { formatTableLabel } from "@/lib/util";
import {
  cancelPaymentOrder,
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
    // Stored encrypted (see lib/secrets.ts); legacy plaintext rows read as-is.
    clientSecret: openSecret(v.viva_client_secret, v.id),
    merchantId: v.viva_merchant_id,
    sourceCode: v.viva_source_code,
    apiKey: openSecret(v.viva_api_key, v.id),
  };
}

/**
 * A venue left on Viva's DEMO environment must not take "payments" from real
 * guests once payments are live: demo money is not money, yet the bar would see
 * PAID. Only venues named in VIVA_DEMO_VENUES (comma-separated slugs, e.g. our
 * own demo venue) may run demo checkouts on a live deployment.
 */
export function demoBlocked(v: Pick<Venue, "slug" | "viva_env">): boolean {
  if (v.viva_env === "live" || !paymentsAllowed()) return false;
  const allowed = (process.env.VIVA_DEMO_VENUES ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return !allowed.includes(v.slug);
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
        | "payments_demo_mode"
        | "bill_changed"
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
  if (demoBlocked(venue)) return { ok: false, error: "payments_demo_mode" };

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
    // Older checkouts for a DIFFERENT bill (an order was added since). They are
    // cancelled at Viva below, so the table cannot pay the same orders twice.
    const superseded: Payment[] = [];
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
      if (p.amount_cents !== totalCents) {
        superseded.push(p);
        continue;
      }
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
      superseded.push(p);
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
        env: creds.env,
      })
      .returning();
    await tx
      .insert(paymentOrders)
      .values(items.map((i) => ({ payment_id: id, order_id: i.id, amount_cents: i.cents })));
    return { kind: "new" as const, payment: row, count: items.length, superseded };
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

  const p = prepared.payment;

  // Step 2, outside the lock: retire the older checkouts of this table. A
  // checkout that cannot be cancelled may have just been paid; in that case the
  // bill is no longer what we computed, so stop and let the guest tap Pay again.
  for (const old of prepared.superseded) {
    if (!old.order_code) continue;
    if (await cancelPaymentOrder(creds, old.order_code)) {
      await db
        .update(payments)
        .set({ status: "cancelled", note: "superseded" })
        .where(and(eq(payments.id, old.id), eq(payments.status, "pending")));
      continue;
    }
    let paidNow = false;
    try {
      const ids = await findPaidTransactionIdsByOrderCode(creds, old.order_code);
      for (const id of ids) {
        const r = await confirmTransaction(venue, id, "precheck");
        if (r.outcome === "paid" || r.outcome === "already") paidNow = true;
      }
    } catch (err) {
      console.error("[payments] could not check a superseded checkout:", (err as Error).message);
    }
    if (paidNow) {
      await db
        .update(payments)
        .set({ status: "failed", note: "bill_changed" })
        .where(eq(payments.id, p.id));
      return { ok: false, error: "bill_changed" };
    }
    // Neither cancelled nor paid (Viva unreachable): it expires by itself within
    // its 15-minute payment timeout. Leave a trace on the new attempt.
    await db
      .update(payments)
      .set({ note: `older_checkout_not_cancelled:${old.id}` })
      .where(eq(payments.id, p.id));
  }

  // Step 3: create the order at the venue's Viva account.
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

/** Tell the operator, at most once every 10 minutes per venue, that Viva refuses a venue's keys. */
async function alertRejectedCredentials(venue: Venue, status: number | undefined, what: string) {
  if (status !== 401 && status !== 403) return;
  if (Date.now() - (lastAuthAlert.get(venue.id) ?? 0) <= 600_000) return;
  lastAuthAlert.set(venue.id, Date.now());
  await alertOperator(
    `Viva rejected the ${what} of ${venue.name} (${status}). Payments there are NOT being recorded until they are fixed.`,
  );
}

// ------------------------------------------------------------- settle

export type SettleResult = {
  outcome: "paid" | "already" | "duplicate" | "refunded" | "foreign" | "unmatched" | "rejected";
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
    const now = new Date();
    // A refund or reversal is not a payment and must never settle anything.
    if (tx.paid && tx.amountCents <= 0) {
      return { outcome: "rejected", paymentId: p.id, reason: "not_a_payment" };
    }
    if (p.status === "paid" || p.status === "refunded") {
      // A SECOND successful transaction on a checkout that is already paid: the
      // guest was charged twice. Nothing more to settle, but a human must
      // refund it, so it is flagged once and shown to the venue.
      if (tx.paid && p.transaction_id && tx.transactionId !== p.transaction_id) {
        const mark = `second_transaction:${tx.transactionId}:${tx.amountCents}`;
        if (!p.note.includes(`second_transaction:${tx.transactionId}`)) {
          flagged = mark;
          await trx
            .update(payments)
            .set({
              needs_attention: true,
              note: [p.note, mark].filter(Boolean).join(",").slice(0, 500),
              last_checked_at: now,
            })
            .where(eq(payments.id, p.id));
        }
        return { outcome: "duplicate", paymentId: p.id, settled: 0 };
      }
      return { outcome: "already", paymentId: p.id, settled: 0 };
    }

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

// ------------------------------------------------------------- refunds

/** Viva webhook event: "Transaction Reversal Created" (money went back to the guest). */
const EVENT_REVERSAL = "1797";

/**
 * Record a refund / reversal made in Viva.
 *
 * It never un-pays the orders: whether the guest still owes them is a human
 * decision (a refund of a double charge leaves the bill settled; a refund of a
 * cancelled round does not). The payment is marked, flagged for attention and
 * shown to the venue, which must also issue the credit note itself.
 * Idempotent per reversal transaction.
 */
export async function recordRefund(
  venue: Venue,
  ref: { reversalId: string; parentId: string; orderCode: string; cents: number },
  source: string,
): Promise<SettleResult> {
  const where = [];
  if (ref.parentId) where.push(eq(payments.transaction_id, ref.parentId));
  if (/^\d{6,20}$/.test(ref.orderCode)) where.push(eq(payments.order_code, ref.orderCode));
  if (where.length === 0) return { outcome: "unmatched" };
  const [found] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.venue_id, venue.id), or(...where)))
    .orderBy(desc(payments.created_at))
    .limit(1);
  if (!found) {
    // A refund of a card-terminal sale or of another system's payment.
    await recordEvent({ source, venueId: venue.id, outcome: "foreign", transactionId: ref.reversalId });
    return { outcome: "foreign" };
  }

  const mark = `refund:${ref.reversalId}`;
  let amountText = "";
  const result = await db.transaction(async (trx): Promise<SettleResult> => {
    const [p] = await trx.select().from(payments).where(eq(payments.id, found.id)).for("update");
    if (!p) return { outcome: "unmatched" };
    if (p.note.includes(mark)) return { outcome: "already", paymentId: p.id };
    // An amount we could not read is treated as a full refund: over-warning a
    // human is the safe direction.
    const cents = ref.cents > 0 ? ref.cents : p.amount_cents;
    const total = p.refunded_cents + cents;
    amountText = `${(cents / 100).toFixed(2)} EUR${ref.cents > 0 ? "" : " (amount not confirmed)"}`;
    await trx
      .update(payments)
      .set({
        refunded_cents: total,
        refunded_at: new Date(),
        status: p.status === "paid" && total >= p.amount_cents ? "refunded" : p.status,
        needs_attention: true,
        note: [p.note, mark].filter(Boolean).join(",").slice(0, 500),
      })
      .where(eq(payments.id, p.id));
    return { outcome: "refunded", paymentId: p.id };
  });

  await recordEvent({
    source,
    venueId: venue.id,
    paymentId: result.paymentId,
    transactionId: ref.reversalId,
    outcome: result.outcome,
    detail: amountText,
  });
  if (result.outcome === "refunded") {
    await alertOperator(
      `Refund of ${amountText} at ${venue.name} for payment ${result.paymentId}. The orders stay marked paid; the venue must check the bill and issue the credit note.`,
    );
  }
  return result;
}

// ------------------------------------------------------------- webhook

const lastAuthAlert = new Map<string, number>();

/**
 * Process a Viva webhook body. `venueHint` is set when the URL carries a venue
 * token; the legacy shared URL passes null and we route by MerchantId.
 * Returns the HTTP status Viva should see: 200 for "handled or nothing for us"
 * and 500 for everything that could be transient or fixable (database trouble,
 * Viva not answering, rejected or missing credentials), so Viva retries those.
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
  const isReversal = String(payload["EventTypeId"] ?? "") === EVENT_REVERSAL;

  if (!/^[0-9a-f-]{8,64}$/i.test(transactionId)) {
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
    console.warn("[viva-webhook] unknown merchant");
    return { status: 200, body: { ok: true, ignored: "unknown_merchant" } };
  }

  let last: SettleResult = { outcome: "unmatched" };
  // Something went wrong for a venue that might own this payment. If nobody
  // ends up settling it, Viva must retry rather than believe it was handled.
  let failed = false;
  for (const venue of candidates) {
    let creds: VivaCredentials;
    try {
      creds = vivaCreds(venue);
    } catch (err) {
      await recordEvent({ source: "webhook", venueId: venue.id, outcome: "error", transactionId, detail: (err as Error).message });
      failed = true;
      continue;
    }
    if (!credentialsComplete(creds)) {
      await recordEvent({ source: "webhook", venueId: venue.id, outcome: "error", transactionId, detail: "no_credentials" });
      if (Date.now() - (lastAuthAlert.get(venue.id) ?? 0) > 600_000) {
        lastAuthAlert.set(venue.id, Date.now());
        await alertOperator(`Viva sent a payment notification for ${venue.name}, but its Viva credentials are incomplete. Payments there are NOT being recorded.`);
      }
      failed = true;
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
      // Rejected credentials mean EVERY payment of this venue is going unrecorded.
      await alertRejectedCredentials(venue, e.status, "credentials");
      failed = true;
      continue; // another venue on this account may own it
    }
    try {
      if (isReversal || (tx.paid && tx.amountCents < 0)) {
        last = await recordRefund(
          venue,
          {
            reversalId: tx.transactionId,
            parentId: str("ParentId"),
            orderCode: tx.orderCode || str("OrderCode"),
            cents: Math.abs(tx.amountCents),
          },
          "webhook",
        );
      } else {
        last = await settleFromTransaction(venue, tx, "webhook");
      }
    } catch (err) {
      await recordEvent({ source: "webhook", venueId: venue.id, outcome: "error", transactionId, detail: (err as Error).message });
      return { status: 500, body: { ok: false } };
    }
    if (["paid", "already", "duplicate", "refunded"].includes(last.outcome)) {
      return { status: 200, body: { ok: true, outcome: last.outcome } };
    }
  }
  if (failed) return { status: 500, body: { ok: false } };
  return { status: 200, body: { ok: true, outcome: last.outcome } };
}

// ------------------------------------------------------------- reconcile

const lastReconcile = new Map<string, number>();
/** A pending checkout gets its last look this long after it was created... */
const FINAL_CHECK_AFTER_MS = EXPIRE_AFTER_MS;
/** ...and is given up on here even if Viva could never be asked. */
const GIVE_UP_AFTER_MS = 3 * EXPIRE_AFTER_MS;

/**
 * Safety net for a lost webhook: for payments still pending after two minutes,
 * ask Viva (legacy API, needs the venue's API key) whether the order was paid,
 * verify any transaction found, and settle it. A checkout is only written off
 * as expired AFTER Viva was asked once more past the 24-hour mark, so a payment
 * whose notification was lost is not silently dropped. Throttled to once a
 * minute per venue; called from the bar's poll.
 */
export async function reconcileVenue(venue: Venue): Promise<void> {
  const nowMs = Date.now();
  if (nowMs - (lastReconcile.get(venue.id) ?? 0) < 60_000) return;
  lastReconcile.set(venue.id, nowMs);

  // Keep the audit table bounded.
  await db
    .delete(paymentEvents)
    .where(lt(paymentEvents.received_at, new Date(nowMs - 90 * 24 * 60 * 60 * 1000)));

  const expire = () =>
    db
      .update(payments)
      .set({ status: "expired" })
      .where(
        and(
          eq(payments.venue_id, venue.id),
          eq(payments.status, "pending"),
          or(
            // Never reached Viva: nothing to ask about.
            and(eq(payments.order_code, ""), lt(payments.created_at, new Date(nowMs - EXPIRE_AFTER_MS))),
            // Viva was asked after the checkout could no longer be paid.
            and(
              lt(payments.created_at, new Date(nowMs - FINAL_CHECK_AFTER_MS)),
              sql`${payments.last_checked_at} > ${payments.created_at} + interval '1 millisecond' * ${FINAL_CHECK_AFTER_MS}`,
            ),
            lt(payments.created_at, new Date(nowMs - GIVE_UP_AFTER_MS)),
          ),
        ),
      );

  let creds: VivaCredentials;
  try {
    creds = vivaCreds(venue);
  } catch (err) {
    console.error("[payments] reconcile: cannot read credentials:", (err as Error).message);
    return;
  }
  if (!credentialsComplete(creds) || !creds.apiKey) {
    await expire();
    return;
  }

  const pending = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.venue_id, venue.id),
        eq(payments.status, "pending"),
        lt(payments.created_at, new Date(nowMs - 2 * 60 * 1000)),
        gt(payments.created_at, new Date(nowMs - GIVE_UP_AFTER_MS)),
        ne(payments.order_code, ""),
      ),
    )
    .orderBy(sql`${payments.last_checked_at} asc nulls first`, asc(payments.created_at))
    .limit(10);
  for (const p of pending) {
    try {
      const ids = await findPaidTransactionIdsByOrderCode(creds, p.order_code);
      for (const id of ids) await confirmTransaction(venue, id, "reconcile");
      // Stamped only when Viva actually answered.
      await db.update(payments).set({ last_checked_at: new Date() }).where(eq(payments.id, p.id));
    } catch (err) {
      const e = err as Error & { status?: number };
      console.error("[payments] reconcile failed:", e.message);
      await alertRejectedCredentials(venue, e.status, "API key");
      if (e.status === 401 || e.status === 403) break; // every further lookup would fail too
    }
  }
  await expire();
}

// ------------------------------------------------------------- attention list

function alertKind(note: string, refundedCents: number): PaymentAlertView["kind"] {
  if (note.includes("second_transaction") || note.includes("overlap")) return "double_payment";
  if (refundedCents > 0 || note.includes("refund:")) return "refunded";
  if (note.includes("paid_after_close")) return "paid_after_close";
  if (note.includes("underpaid")) return "underpaid";
  return "other";
}

/**
 * Payments of the last 14 days a human must look at, newest first. Shown on the
 * bar screen and the owner's dashboard: the venue, not the operator, is the one
 * who can refund in Viva and correct the receipt.
 */
export async function listPaymentAlerts(venueId: string): Promise<PaymentAlertView[]> {
  const rows = await db
    .select({ p: payments, label: tables.label })
    .from(payments)
    .leftJoin(tables, eq(tables.id, payments.table_id))
    .where(
      and(
        eq(payments.venue_id, venueId),
        eq(payments.needs_attention, true),
        gt(payments.created_at, new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)),
      ),
    )
    .orderBy(desc(payments.created_at))
    .limit(20);
  return rows.map(({ p, label }) => {
    const kind = alertKind(p.note, p.refunded_cents);
    // For a second transaction on one checkout the note carries what to return.
    const second = /second_transaction:[^:,]+:(\d+)/.exec(p.note);
    const back =
      kind === "refunded"
        ? p.refunded_cents
        : second
          ? Number(second[1])
          : kind === "double_payment"
            ? p.amount_cents
            : 0;
    return {
      id: p.id,
      tableLabel: label ? formatTableLabel(label) : "?",
      kind,
      amount: p.amount_cents / 100,
      refunded: back / 100,
      at: (p.refunded_at ?? p.paid_at ?? p.created_at).toISOString(),
    };
  });
}

/** The venue has dealt with a flagged payment: take it off the list. */
export async function resolvePaymentAlert(venueId: string, paymentId: string): Promise<boolean> {
  const rows = await db
    .update(payments)
    .set({ needs_attention: false })
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.venue_id, venueId),
        eq(payments.needs_attention, true),
      ),
    )
    .returning({ id: payments.id });
  return rows.length > 0;
}
