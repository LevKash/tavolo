import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/viva", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/viva")>();
  return {
    ...real,
    createPaymentOrder: vi.fn(),
    retrieveTransaction: vi.fn(),
    findPaidTransactionIdsByOrderCode: vi.fn(),
    cancelPaymentOrder: vi.fn(),
  };
});
vi.mock("@/lib/tg", () => ({ notifyOperator: vi.fn() }));

import { db, pool } from "@/db";
import {
  orders,
  paymentEvents,
  paymentOrders,
  payments,
  tableSessions,
  tables,
  users,
  venues,
  type Payment,
} from "@/db/schema";
import {
  createPayment,
  listPaymentAlerts,
  processWebhook,
  reconcileVenue,
  resolvePaymentAlert,
  settlePayment,
  vivaCreds,
} from "@/lib/payments";
import { isSealed, openSecret, sealSecret } from "@/lib/secrets";
import { notifyOperator } from "@/lib/tg";
import {
  cancelPaymentOrder,
  createPaymentOrder,
  findPaidTransactionIdsByOrderCode,
  retrieveTransaction,
  VivaError,
  type VivaTransaction,
} from "@/lib/viva";

const createdVenues: string[] = [];
const createdUsers: string[] = [];

async function fixture(over: Partial<typeof venues.$inferInsert> = {}) {
  const tag = randomUUID().slice(0, 8);
  const [user] = await db
    .insert(users)
    .values({ email: `s2-${tag}@test.local`, name: "Test", password_hash: "x" })
    .returning();
  const [venue] = await db
    .insert(venues)
    .values({
      owner_id: user.id,
      slug: `s2-${tag}`,
      name: "Test Bar",
      is_published: true,
      status: "active",
      payments_enabled: true,
      viva_env: "demo",
      viva_client_id: "cid",
      viva_client_secret: "secret",
      viva_merchant_id: `m-${tag}`,
      viva_source_code: "1234",
      viva_api_key: "key",
      ...over,
    })
    .returning();
  const [table] = await db.insert(tables).values({ venue_id: venue.id, label: "12" }).returning();
  const [session] = await db
    .insert(tableSessions)
    .values({ venue_id: venue.id, table_id: table.id })
    .returning();
  createdVenues.push(venue.id);
  createdUsers.push(user.id);
  const addOrder = async (total: number, status = "new") =>
    (
      await db
        .insert(orders)
        .values({ venue_id: venue.id, table_id: table.id, session_id: session.id, status, total })
        .returning()
    )[0];
  const pay = () => createPayment({ venue, tableId: table.id, tableLabel: "12", lang: "en-GB" });
  return { venue, table, session, addOrder, pay };
}

function txFor(p: Payment, over: Partial<VivaTransaction> = {}): VivaTransaction {
  return {
    transactionId: randomUUID(),
    orderCode: p.order_code,
    merchantTrns: p.merchant_trns,
    statusId: "F",
    amountCents: p.amount_cents,
    currencyCode: "978",
    paid: true,
    ...over,
  };
}
const getPayment = async (id: string) =>
  (await db.select().from(payments).where(eq(payments.id, id)))[0];
const getOrder = async (id: string) =>
  (await db.select().from(orders).where(eq(orders.id, id)))[0];

/** A table with one order, paid by card: returns the settled payment and its transaction. */
async function paidTable(amount = 20) {
  const f = await fixture();
  const order = await f.addOrder(amount);
  const res = await f.pay();
  if (!res.ok) throw new Error("setup");
  const tx = txFor(await getPayment(res.paymentId));
  expect((await settlePayment(res.paymentId, tx, "webhook")).outcome).toBe("paid");
  return { ...f, order, paymentId: res.paymentId, tx };
}

let codeCounter = 4_000_000_000_000_000;
beforeEach(() => {
  for (const m of [createPaymentOrder, retrieveTransaction, notifyOperator, findPaidTransactionIdsByOrderCode, cancelPaymentOrder]) {
    vi.mocked(m).mockReset();
  }
  vi.mocked(createPaymentOrder).mockImplementation(async () => {
    const orderCode = String(++codeCounter);
    return { orderCode, checkoutUrl: `https://demo.vivapayments.com/web/checkout?ref=${orderCode}` };
  });
  vi.mocked(findPaidTransactionIdsByOrderCode).mockResolvedValue([]);
  vi.mocked(cancelPaymentOrder).mockResolvedValue(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  if (createdVenues.length) {
    await db.delete(paymentEvents).where(inArray(paymentEvents.venue_id, createdVenues));
    const pids = (
      await db.select({ id: payments.id }).from(payments).where(inArray(payments.venue_id, createdVenues))
    ).map((p) => p.id);
    if (pids.length) await db.delete(paymentOrders).where(inArray(paymentOrders.payment_id, pids));
    await db.delete(payments).where(inArray(payments.venue_id, createdVenues));
    await db.delete(venues).where(inArray(venues.id, createdVenues));
  }
  if (createdUsers.length) await db.delete(users).where(inArray(users.id, createdUsers));
  await pool.end();
});

describe("a table cannot pay the same orders twice", () => {
  it("when the old checkout was paid a moment ago, the new one is not handed out", async () => {
    const f = await fixture();
    const o1 = await f.addOrder(20);
    const first = await f.pay();
    if (!first.ok) throw new Error("setup");
    const old = await getPayment(first.paymentId);
    await f.addOrder(10);

    // Phone A has just paid the first checkout: Viva refuses to cancel it and
    // reports its transaction. (The pre-check a moment earlier still saw nothing.)
    const paidTx = txFor(old);
    vi.mocked(cancelPaymentOrder).mockResolvedValue(false);
    vi.mocked(findPaidTransactionIdsByOrderCode)
      .mockResolvedValueOnce([])
      .mockResolvedValue([paidTx.transactionId]);
    vi.mocked(retrieveTransaction).mockResolvedValue(paidTx);

    const second = await f.pay();
    expect(second).toMatchObject({ ok: false, error: "bill_changed" });
    expect((await getPayment(first.paymentId)).status).toBe("paid");
    expect((await getOrder(o1.id)).payment_status).toBe("paid");

    // Tapping Pay again now charges only what is really left.
    vi.mocked(cancelPaymentOrder).mockResolvedValue(true);
    const third = await f.pay();
    expect(third).toMatchObject({ ok: true, amountCents: 1000 });
  });

  it("a second successful transaction on a paid checkout is flagged for refund, once", async () => {
    const t = await paidTable(20);
    const again = txFor(await getPayment(t.paymentId));
    const r1 = await settlePayment(t.paymentId, again, "webhook");
    const r2 = await settlePayment(t.paymentId, again, "reconcile");
    expect([r1.outcome, r2.outcome]).toEqual(["duplicate", "duplicate"]);
    expect(vi.mocked(notifyOperator)).toHaveBeenCalledTimes(1);

    const alerts = await listPaymentAlerts(t.venue.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "double_payment", refunded: 20, tableLabel: "Table 12" });

    // The same notification for the ORIGINAL transaction stays a plain repeat.
    expect((await settlePayment(t.paymentId, t.tx, "webhook")).outcome).toBe("already");
  });

  it("two checkouts that overlap show up as a double payment for the venue", async () => {
    const f = await fixture();
    await f.addOrder(20);
    const first = await f.pay();
    await f.addOrder(10);
    // Viva could not be reached to cancel the first checkout.
    vi.mocked(cancelPaymentOrder).mockResolvedValue(false);
    const second = await f.pay();
    if (!first.ok || !second.ok) throw new Error("setup");
    await settlePayment(second.paymentId, txFor(await getPayment(second.paymentId)), "webhook");
    await settlePayment(first.paymentId, txFor(await getPayment(first.paymentId)), "webhook");
    const alerts = await listPaymentAlerts(f.venue.id);
    expect(alerts.map((a) => a.kind)).toEqual(["double_payment"]);
  });
});

describe("demo mode on a live deployment", () => {
  it("a venue left on Demo is not offered card payment once payments are live", async () => {
    vi.stubEnv("PAYMENTS_LIVE", "1");
    const f = await fixture({ viva_env: "demo" });
    await f.addOrder(10);
    expect(await f.pay()).toMatchObject({ ok: false, error: "payments_demo_mode" });
    expect(vi.mocked(createPaymentOrder)).not.toHaveBeenCalled();

    // Our own demo venue is allowed by name.
    vi.stubEnv("VIVA_DEMO_VENUES", `other, ${f.venue.slug}`);
    expect((await f.pay()).ok).toBe(true);
  });

  it("a Live venue pays normally and the payment remembers its environment", async () => {
    vi.stubEnv("PAYMENTS_LIVE", "1");
    const f = await fixture({ viva_env: "live" });
    await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("expected ok");
    expect((await getPayment(res.paymentId)).env).toBe("live");
  });
});

describe("refunds made in Viva", () => {
  const reversalBody = (t: Awaited<ReturnType<typeof paidTable>>, reversalId: string) => ({
    EventTypeId: 1797,
    EventData: {
      TransactionId: reversalId,
      ParentId: t.tx.transactionId,
      OrderCode: Number(t.tx.orderCode),
      Amount: -20,
      StatusId: "F",
      MerchantTrns: null,
      TransactionTypeId: 7,
    },
  });

  it("a reversal notification marks the payment refunded and tells the venue", async () => {
    const t = await paidTable(20);
    const reversalId = randomUUID();
    vi.mocked(retrieveTransaction).mockResolvedValue(
      txFor(await getPayment(t.paymentId), { transactionId: reversalId, amountCents: -2000, merchantTrns: "" }),
    );
    const first = await processWebhook(t.venue, reversalBody(t, reversalId));
    const repeat = await processWebhook(t.venue, reversalBody(t, reversalId));
    expect(first).toMatchObject({ status: 200, body: { outcome: "refunded" } });
    expect(repeat).toMatchObject({ status: 200, body: { outcome: "already" } });

    const p = await getPayment(t.paymentId);
    expect(p).toMatchObject({ status: "refunded", refunded_cents: 2000, needs_attention: true });
    // Whether the guest still owes the order is the venue's call: it stays paid.
    expect((await getOrder(t.order.id)).payment_status).toBe("paid");
    expect(vi.mocked(notifyOperator)).toHaveBeenCalledTimes(1);

    const alerts = await listPaymentAlerts(t.venue.id);
    expect(alerts[0]).toMatchObject({ kind: "refunded", refunded: 20 });
    expect(await resolvePaymentAlert(t.venue.id, t.paymentId)).toBe(true);
    expect(await listPaymentAlerts(t.venue.id)).toHaveLength(0);
    // Another venue cannot clear it.
    const other = await fixture();
    expect(await resolvePaymentAlert(other.venue.id, t.paymentId)).toBe(false);
  });

  it("a partial refund keeps the payment paid", async () => {
    const t = await paidTable(20);
    const reversalId = randomUUID();
    vi.mocked(retrieveTransaction).mockResolvedValue(
      txFor(await getPayment(t.paymentId), { transactionId: reversalId, amountCents: -500 }),
    );
    await processWebhook(t.venue, reversalBody(t, reversalId));
    expect(await getPayment(t.paymentId)).toMatchObject({ status: "paid", refunded_cents: 500 });
  });

  it("a refund transaction can never settle a pending payment", async () => {
    const f = await fixture();
    const o = await f.addOrder(20);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const r = await settlePayment(
      res.paymentId,
      txFor(await getPayment(res.paymentId), { amountCents: -2000 }),
      "reconcile",
    );
    expect(r).toMatchObject({ outcome: "rejected", reason: "not_a_payment" });
    expect((await getOrder(o.id)).payment_status).toBe("unpaid");
  });
});

describe("the safety net cannot fail silently", () => {
  async function agedPending(hours: number) {
    const f = await fixture();
    const o = await f.addOrder(15);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    await db
      .update(payments)
      .set({ created_at: new Date(Date.now() - hours * 3600_000) })
      .where(eq(payments.id, res.paymentId));
    return { ...f, o, paymentId: res.paymentId };
  }

  it("a rejected API key alerts the operator and is not recorded as a check", async () => {
    const t = await agedPending(1);
    vi.mocked(findPaidTransactionIdsByOrderCode).mockRejectedValue(
      new VivaError("Viva order lookup failed (401)", "", 401),
    );
    await reconcileVenue(t.venue);
    expect(vi.mocked(notifyOperator)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(notifyOperator).mock.calls[0][0])).toContain("API key");
    const p = await getPayment(t.paymentId);
    expect(p.last_checked_at).toBeNull();
    expect(p.status).toBe("pending");
  });

  it("a checkout older than a day gets one last look at Viva before it is written off", async () => {
    const t = await agedPending(25);
    const tx = txFor(await getPayment(t.paymentId));
    vi.mocked(findPaidTransactionIdsByOrderCode).mockResolvedValue([tx.transactionId]);
    vi.mocked(retrieveTransaction).mockResolvedValue(tx);
    await reconcileVenue(t.venue);
    expect((await getPayment(t.paymentId)).status).toBe("paid");
    expect((await getOrder(t.o.id)).payment_status).toBe("paid");
  });

  it("...and expires once Viva has confirmed nothing was paid", async () => {
    const t = await agedPending(25);
    await reconcileVenue(t.venue);
    expect((await getPayment(t.paymentId)).status).toBe("expired");
  });

  it("a notification for a venue with incomplete credentials asks Viva to retry", async () => {
    const f = await fixture({ viva_client_secret: "" });
    const r = await processWebhook(f.venue, { EventData: { TransactionId: randomUUID() } });
    expect(r.status).toBe(500);
    expect(vi.mocked(notifyOperator)).toHaveBeenCalledTimes(1);
  });
});

describe("venue secrets at rest", () => {
  const venueId = randomUUID();

  it("round-trips with the key and is bound to the venue", () => {
    vi.stubEnv("VENUE_SECRETS_KEY", randomBytes(32).toString("base64"));
    const sealed = sealSecret("s3cret-value", venueId);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("s3cret-value");
    expect(sealSecret("s3cret-value", venueId)).not.toBe(sealed); // fresh IV each time
    expect(openSecret(sealed, venueId)).toBe("s3cret-value");
    expect(sealSecret(sealed, venueId)).toBe(sealed); // never double-encrypted
    // Copied onto another venue's row, or tampered with, it does not open.
    expect(() => openSecret(sealed, randomUUID())).toThrow();
    expect(() => openSecret(sealed.slice(0, -2) + "AA", venueId)).toThrow();
  });

  it("reads legacy plaintext, and refuses an encrypted value without the key", () => {
    vi.stubEnv("VENUE_SECRETS_KEY", randomBytes(32).toString("base64"));
    const sealed = sealSecret("abc", venueId);
    expect(openSecret("plain-old-value", venueId)).toBe("plain-old-value");
    expect(openSecret("", venueId)).toBe("");
    vi.stubEnv("VENUE_SECRETS_KEY", "");
    expect(() => openSecret(sealed, venueId)).toThrow();
    expect(sealSecret("abc", venueId)).toBe("abc"); // no key: stored as-is, with a warning
  });

  it("payments read an encrypted venue row transparently", async () => {
    vi.stubEnv("VENUE_SECRETS_KEY", randomBytes(32).toString("base64"));
    const f = await fixture();
    const [row] = await db
      .update(venues)
      .set({
        viva_client_secret: sealSecret("the-secret", f.venue.id),
        viva_api_key: sealSecret("the-key", f.venue.id),
      })
      .where(eq(venues.id, f.venue.id))
      .returning();
    expect(row.viva_client_secret).not.toContain("the-secret");
    expect(vivaCreds(row)).toMatchObject({ clientSecret: "the-secret", apiKey: "the-key" });
  });
});
