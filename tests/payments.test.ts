import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/viva", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/viva")>();
  return {
    ...real,
    createPaymentOrder: vi.fn(),
    retrieveTransaction: vi.fn(),
    findPaidTransactionIdsByOrderCode: vi.fn(),
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
  type Venue,
} from "@/db/schema";
import {
  createPayment,
  loadPayable,
  processWebhook,
  settleFromTransaction,
  settlePayment,
} from "@/lib/payments";
import { notifyOperator } from "@/lib/tg";
import {
  createPaymentOrder,
  findPaidTransactionIdsByOrderCode,
  retrieveTransaction,
  VivaError,
  type VivaTransaction,
} from "@/lib/viva";

const createdVenues: string[] = [];
const createdUsers: string[] = [];

async function fixture() {
  const tag = randomUUID().slice(0, 8);
  const [user] = await db
    .insert(users)
    .values({ email: `t-${tag}@test.local`, name: "Test", password_hash: "x" })
    .returning();
  const [venue] = await db
    .insert(venues)
    .values({
      owner_id: user.id,
      slug: `t-${tag}`,
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
        .values({
          venue_id: venue.id,
          table_id: table.id,
          session_id: session.id,
          status,
          total,
        })
        .returning()
    )[0];

  const pay = () =>
    createPayment({ venue, tableId: table.id, tableLabel: "12", lang: "en-GB" });
  return { user, venue, table, session, addOrder, pay };
}

/** What Viva would return for a paid transaction of this payment. */
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

let codeCounter = 3_000_000_000_000_000;
beforeEach(() => {
  vi.mocked(createPaymentOrder).mockReset();
  vi.mocked(retrieveTransaction).mockReset();
  vi.mocked(notifyOperator).mockReset();
  vi.mocked(findPaidTransactionIdsByOrderCode).mockReset();
  vi.mocked(createPaymentOrder).mockImplementation(async () => {
    const orderCode = String(++codeCounter);
    return { orderCode, checkoutUrl: `https://demo.vivapayments.com/web/checkout?ref=${orderCode}` };
  });
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

describe("creating a payment", () => {
  it("charges exactly the accepted, unpaid orders (in cents) and freezes them", async () => {
    const f = await fixture();
    const a = await f.addOrder(13.5, "new");
    const b = await f.addOrder(7.1, "served");
    await f.addOrder(40, "pending_confirm"); // not accepted by the bar yet
    await f.addOrder(5, "declined");

    const res = await f.pay();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.amountCents).toBe(2060);
    expect(res.items).toBe(2);

    const args = vi.mocked(createPaymentOrder).mock.calls[0][1];
    expect(args.amountCents).toBe(2060);
    const p = await getPayment(res.paymentId);
    expect(args.merchantTrns).toBe(p.merchant_trns);
    expect(p.merchant_trns).toBe(`ordavo:${p.id}`);

    const links = await db.select().from(paymentOrders).where(eq(paymentOrders.payment_id, p.id));
    expect(links.map((l) => l.order_id).sort()).toEqual([a.id, b.id].sort());
  });

  it("reports nothing to pay when no order is payable", async () => {
    const f = await fixture();
    await f.addOrder(10, "pending_confirm");
    const res = await f.pay();
    expect(res).toMatchObject({ ok: false, error: "nothing_to_pay" });
    expect(createPaymentOrder).not.toHaveBeenCalled();
  });

  it("a double tap reuses the open checkout instead of creating another", async () => {
    const f = await fixture();
    await f.addOrder(10);
    const first = await f.pay();
    const second = await f.pay();
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.reused).toBe(true);
    expect(second.checkoutUrl).toBe(first.checkoutUrl);
    expect(createPaymentOrder).toHaveBeenCalledTimes(1);
  });

  it("two simultaneous taps still create exactly one payment", async () => {
    const f = await fixture();
    await f.addOrder(10);
    const [x, y] = await Promise.all([f.pay(), f.pay()]);
    expect(x.ok && y.ok).toBe(true);
    expect(createPaymentOrder).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(payments).where(eq(payments.table_id, f.table.id));
    expect(rows).toHaveLength(1);
  });

  it("a changed bill gets a NEW payment and keeps the old one", async () => {
    const f = await fixture();
    await f.addOrder(10);
    const first = await f.pay();
    await f.addOrder(5);
    const second = await f.pay();
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.paymentId).not.toBe(first.paymentId);
    expect(second.amountCents).toBe(1500);
    expect((await getPayment(first.paymentId)).status).toBe("pending");
  });

  it("marks the attempt failed when Viva refuses, so a retry works", async () => {
    const f = await fixture();
    await f.addOrder(10);
    vi.mocked(createPaymentOrder).mockRejectedValueOnce(new Error("boom"));
    const bad = await f.pay();
    expect(bad).toMatchObject({ ok: false, error: "payment_provider_error" });
    const good = await f.pay();
    expect(good.ok).toBe(true);
  });
});

describe("settling a payment", () => {
  it("marks only the covered orders paid, keeps their status, keeps the table open", async () => {
    const f = await fixture();
    const o1 = await f.addOrder(13.5, "making");
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);

    const r = await settlePayment(p.id, txFor(p), "test");
    expect(r).toMatchObject({ outcome: "paid", settled: 1 });

    const after = await getOrder(o1.id);
    expect(after.payment_status).toBe("paid");
    expect(after.status).toBe("making"); // the bar still has to make it
    expect(after.payment_id).toBe(p.id);
    expect(after.paid_amount).toBe(13.5);

    const sess = (await db.select().from(tableSessions).where(eq(tableSessions.id, f.session.id)))[0];
    expect(sess.status).toBe("open"); // paying never closes the table
    const pay = await getPayment(p.id);
    expect(pay.status).toBe("paid");
    expect(pay.needs_attention).toBe(false);
  });

  it("is idempotent: the same notification twice changes nothing", async () => {
    const f = await fixture();
    await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    const tx = txFor(p);
    const [a, b] = await Promise.all([settlePayment(p.id, tx, "t1"), settlePayment(p.id, tx, "t2")]);
    expect([a.outcome, b.outcome].sort()).toEqual(["already", "paid"]);
    expect((await getPayment(p.id)).status).toBe("paid");
  });

  it("an order added after the payment was created is NOT marked paid", async () => {
    const f = await fixture();
    const paidOne = await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const late = await f.addOrder(8); // guest orders again while on the Viva page
    await settlePayment(res.paymentId, txFor(await getPayment(res.paymentId)), "test");
    expect((await getOrder(paidOne.id)).payment_status).toBe("paid");
    expect((await getOrder(late.id)).payment_status).toBe("unpaid");
    const due = await loadPayable(db, f.venue.id, f.table.id);
    expect(due.totalCents).toBe(800);
  });

  it("an OLD checkout paid after a newer one was created is still recorded", async () => {
    const f = await fixture();
    const o1 = await f.addOrder(10);
    const first = await f.pay();
    const o2 = await f.addOrder(5);
    const second = await f.pay();
    if (!first.ok || !second.ok) throw new Error("setup");

    // The guest pays the FIRST checkout (an old tab).
    const r = await settlePayment(first.paymentId, txFor(await getPayment(first.paymentId)), "webhook");
    expect(r.outcome).toBe("paid");
    expect((await getOrder(o1.id)).payment_status).toBe("paid");
    expect((await getOrder(o2.id)).payment_status).toBe("unpaid");
  });

  it("round two is paid separately and the first round is not charged again", async () => {
    const f = await fixture();
    await f.addOrder(10);
    const r1 = await f.pay();
    if (!r1.ok) throw new Error("setup");
    await settlePayment(r1.paymentId, txFor(await getPayment(r1.paymentId)), "test");

    await f.addOrder(6);
    const r2 = await f.pay();
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.amountCents).toBe(600);
  });

  it("rejects a transaction that was already used for another payment (replay)", async () => {
    const f = await fixture();
    await f.addOrder(1);
    const cheap = await f.pay();
    if (!cheap.ok) throw new Error("setup");
    const pCheap = await getPayment(cheap.paymentId);
    const txCheap = txFor(pCheap);
    await settlePayment(pCheap.id, txCheap, "test");

    // A second, bigger bill; the attacker replays the cheap transaction on it.
    const f2 = await fixture();
    const big = await f2.addOrder(100);
    const res = await f2.pay();
    if (!res.ok) throw new Error("setup");
    const pBig = await getPayment(res.paymentId);
    const r = await settlePayment(
      pBig.id,
      { ...txCheap, merchantTrns: pBig.merchant_trns, amountCents: pBig.amount_cents },
      "test",
    );
    expect(r.outcome).toBe("rejected");
    expect(r.reason).toContain("transaction_reused");
    expect((await getOrder(big.id)).payment_status).toBe("unpaid");
    expect((await getPayment(pBig.id)).needs_attention).toBe(true);
    expect(notifyOperator).toHaveBeenCalled();
  });

  it("rejects an underpaid transaction and leaves the orders unpaid", async () => {
    const f = await fixture();
    const o = await f.addOrder(40);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    const r = await settlePayment(p.id, txFor(p, { amountCents: 100 }), "test");
    expect(r.outcome).toBe("rejected");
    expect((await getOrder(o.id)).payment_status).toBe("unpaid");
    expect((await getPayment(p.id)).status).toBe("pending");
  });

  it("does nothing for a transaction that is not paid", async () => {
    const f = await fixture();
    const o = await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    const r = await settlePayment(p.id, txFor(p, { paid: false, statusId: "E" }), "test");
    expect(r.outcome).toBe("rejected");
    expect((await getOrder(o.id)).payment_status).toBe("unpaid");
  });

  it("rejects a non-euro currency", async () => {
    const f = await fixture();
    await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    const r = await settlePayment(p.id, txFor(p, { currencyCode: "826" }), "test");
    expect(r.outcome).toBe("rejected");
  });
});

describe("matching a Viva transaction to a payment", () => {
  it("ignores transactions that are not ours (card terminal sales)", async () => {
    const f = await fixture();
    const o = await f.addOrder(10);
    const r = await settleFromTransaction(
      f.venue,
      {
        transactionId: randomUUID(),
        orderCode: "1234567890123456",
        merchantTrns: "pos-sale-77",
        statusId: "F",
        amountCents: 1000,
        currencyCode: "978",
        paid: true,
      },
      "webhook",
    );
    expect(r.outcome).toBe("foreign");
    expect((await getOrder(o.id)).payment_status).toBe("unpaid");
    expect(notifyOperator).not.toHaveBeenCalled();
  });

  it("alerts when it carries our reference but matches no payment", async () => {
    const f = await fixture();
    const r = await settleFromTransaction(
      f.venue,
      {
        transactionId: randomUUID(),
        orderCode: "1",
        merchantTrns: `ordavo:${randomUUID()}`,
        statusId: "F",
        amountCents: 1000,
        currencyCode: "978",
        paid: true,
      },
      "webhook",
    );
    expect(r.outcome).toBe("unmatched");
    expect(notifyOperator).toHaveBeenCalled();
  });

  it("never settles another venue's payment", async () => {
    const a = await fixture();
    const b = await fixture();
    const o = await a.addOrder(10);
    const res = await a.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    const r = await settleFromTransaction(b.venue, txFor(p), "webhook");
    expect(r.outcome).toBe("unmatched");
    expect((await getOrder(o.id)).payment_status).toBe("unpaid");
  });
});

describe("webhook", () => {
  const body = (data: Record<string, unknown>) => ({ EventTypeId: 1796, EventData: data });

  it("a forged body without a transaction id settles nothing", async () => {
    const f = await fixture();
    const o = await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    const out = await processWebhook(
      f.venue,
      body({ OrderCode: p.order_code, StatusId: "F", MerchantId: f.venue.viva_merchant_id }),
    );
    expect(out.status).toBe(200);
    expect(out.body.ignored).toBe("no_transaction_id");
    expect((await getOrder(o.id)).payment_status).toBe("unpaid");
    expect(retrieveTransaction).not.toHaveBeenCalled();
  });

  it("a forged body naming a transaction Viva does not confirm settles nothing", async () => {
    const f = await fixture();
    const o = await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    vi.mocked(retrieveTransaction).mockResolvedValueOnce(
      txFor(p, { paid: false, statusId: "E" }),
    );
    const out = await processWebhook(
      f.venue,
      body({ TransactionId: randomUUID(), StatusId: "F", OrderCode: p.order_code }),
    );
    expect(out.status).toBe(200);
    expect((await getOrder(o.id)).payment_status).toBe("unpaid");
  });

  it("a genuine notification is verified with Viva and settles the covered orders", async () => {
    const f = await fixture();
    const o = await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    const tx = txFor(p);
    vi.mocked(retrieveTransaction).mockResolvedValueOnce(tx);
    const out = await processWebhook(f.venue, body({ TransactionId: tx.transactionId }));
    expect(out).toMatchObject({ status: 200, body: { ok: true, outcome: "paid" } });
    expect((await getOrder(o.id)).payment_status).toBe("paid");
    expect(retrieveTransaction).toHaveBeenCalledTimes(1);
  });

  it("asks Viva to retry (500) when verification fails for a server-side reason", async () => {
    const f = await fixture();
    vi.mocked(retrieveTransaction).mockRejectedValueOnce(new Error("network down"));
    const out = await processWebhook(f.venue, body({ TransactionId: randomUUID() }));
    expect(out.status).toBe(500);
  });

  it("routes the legacy shared URL by MerchantId", async () => {
    const f = await fixture();
    const o = await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    const tx = txFor(p);
    vi.mocked(retrieveTransaction).mockResolvedValueOnce(tx);
    const out = await processWebhook(
      null,
      body({ TransactionId: tx.transactionId, MerchantId: f.venue.viva_merchant_id }),
    );
    expect(out.body.outcome).toBe("paid");
    expect((await getOrder(o.id)).payment_status).toBe("paid");
  });
});

describe("review fixes", () => {
  it("does not bill orders left over in a closed session", async () => {
    const f = await fixture();
    const [oldSession] = await db
      .insert(tableSessions)
      .values({ venue_id: f.venue.id, table_id: f.table.id, status: "closed" })
      .returning();
    await db.insert(orders).values({
      venue_id: f.venue.id,
      table_id: f.table.id,
      session_id: oldSession.id,
      status: "new",
      total: 99,
    });
    await f.addOrder(10);
    const due = await loadPayable(db, f.venue.id, f.table.id);
    expect(due.totalCents).toBe(1000);
  });

  it("refuses to start a payment without the venue's API key", async () => {
    const f = await fixture();
    await db.update(venues).set({ viva_api_key: "" }).where(eq(venues.id, f.venue.id));
    await f.addOrder(10);
    const res = await createPayment({
      venue: { ...f.venue, viva_api_key: "" },
      tableId: f.table.id,
      tableLabel: "12",
      lang: "en-GB",
    });
    expect(res).toMatchObject({ ok: false, error: "payments_not_configured" });
  });

  it("settles an earlier checkout that was paid at Viva before creating a new one", async () => {
    const f = await fixture();
    const o = await f.addOrder(10);
    const first = await f.pay();
    if (!first.ok) throw new Error("setup");
    const p = await getPayment(first.paymentId);
    const tx = txFor(p);
    vi.mocked(findPaidTransactionIdsByOrderCode).mockResolvedValueOnce([tx.transactionId]);
    vi.mocked(retrieveTransaction).mockResolvedValueOnce(tx);

    const again = await f.pay(); // guest taps Pay again, webhook was lost
    expect(again).toMatchObject({ ok: false, error: "nothing_to_pay" });
    expect((await getOrder(o.id)).payment_status).toBe("paid");
    expect(createPaymentOrder).toHaveBeenCalledTimes(1);
  });

  it("an attempt that never reached Viva does not lock the table out", async () => {
    const f = await fixture();
    const o = await f.addOrder(10);
    const [dead] = await db
      .insert(payments)
      .values({
        venue_id: f.venue.id,
        table_id: f.table.id,
        merchant_trns: `ordavo:${randomUUID()}`,
        amount_cents: 1000,
        created_at: new Date(Date.now() - 120_000),
      })
      .returning();
    await db.insert(paymentOrders).values({ payment_id: dead.id, order_id: o.id, amount_cents: 1000 });
    const res = await f.pay();
    expect(res.ok).toBe(true);
    expect((await getPayment(dead.id)).status).toBe("failed");
  });

  it("flags a payment that arrives after the table was settled at the desk", async () => {
    const f = await fixture();
    const o = await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    await db.update(orders).set({ status: "closed" }).where(eq(orders.id, o.id));
    const p = await getPayment(res.paymentId);
    await settlePayment(p.id, txFor(p), "test");
    const after = await getPayment(p.id);
    expect(after.needs_attention).toBe(true);
    expect(after.note).toContain("paid_after_close");
    expect(notifyOperator).toHaveBeenCalled();
  });

  it("a tip on top of the bill is recorded but not an alert", async () => {
    const f = await fixture();
    await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    await settlePayment(p.id, txFor(p, { amountCents: p.amount_cents + 100 }), "test");
    const after = await getPayment(p.id);
    expect(after.status).toBe("paid");
    expect(after.needs_attention).toBe(false);
    expect(after.note).toContain("overpaid:100");
  });

  it("fails closed when Viva reports no currency", async () => {
    const f = await fixture();
    await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    const r = await settlePayment(p.id, txFor(p, { currencyCode: "" }), "test");
    expect(r.outcome).toBe("rejected");
  });

  it("treats a transaction without our reference as foreign, not unmatched", async () => {
    const f = await fixture();
    const r = await settleFromTransaction(
      f.venue,
      {
        transactionId: randomUUID(),
        orderCode: "999",
        merchantTrns: "",
        statusId: "F",
        amountCents: 500,
        currencyCode: "978",
        paid: true,
      },
      "webhook",
    );
    expect(r.outcome).toBe("foreign");
    expect(notifyOperator).not.toHaveBeenCalled();
  });

  it("a database error while settling makes the webhook answer 500 so Viva retries", async () => {
    const f = await fixture();
    await f.addOrder(10);
    const res = await f.pay();
    if (!res.ok) throw new Error("setup");
    const tx = txFor(await getPayment(res.paymentId));
    vi.mocked(retrieveTransaction).mockResolvedValueOnce(tx);
    const spy = vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("connection reset"));
    const out = await processWebhook(f.venue, {
      EventData: { TransactionId: tx.transactionId },
    });
    spy.mockRestore();
    expect(out.status).toBe(500);
    expect((await getPayment(res.paymentId)).status).toBe("pending");
  });

  it("rejected Viva credentials make the webhook answer 500 and alert the operator", async () => {
    const f = await fixture();
    vi.mocked(retrieveTransaction).mockRejectedValueOnce(
      Object.assign(new VivaError("Viva auth failed (401)", "", 401)),
    );
    const out = await processWebhook(f.venue, { EventData: { TransactionId: randomUUID() } });
    expect(out.status).toBe(500);
    expect(notifyOperator).toHaveBeenCalled();
  });

  it("two venues on one Viva account: the legacy URL finds the owner of the payment", async () => {
    const a = await fixture();
    const b = await fixture();
    await db
      .update(venues)
      .set({ viva_merchant_id: a.venue.viva_merchant_id })
      .where(eq(venues.id, b.venue.id));
    const o = await a.addOrder(10);
    const res = await a.pay();
    if (!res.ok) throw new Error("setup");
    const p = await getPayment(res.paymentId);
    const tx = txFor(p);
    vi.mocked(retrieveTransaction).mockResolvedValue(tx);
    const out = await processWebhook(null, {
      EventData: { TransactionId: tx.transactionId, MerchantId: a.venue.viva_merchant_id },
    });
    vi.mocked(retrieveTransaction).mockReset();
    expect(out.body.outcome).toBe("paid");
    expect((await getOrder(o.id)).payment_status).toBe("paid");
    expect(notifyOperator).not.toHaveBeenCalled();
  });
});

describe("venue type", () => {
  it("new venues get their own webhook token", async () => {
    const f = await fixture();
    const v: Venue = (await db.select().from(venues).where(eq(venues.id, f.venue.id)))[0];
    expect(v.webhook_token).toMatch(/^[0-9a-f]{32}$/);
  });
});
