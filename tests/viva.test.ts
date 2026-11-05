import { afterEach, describe, expect, it, vi } from "vitest";
import { retrieveTransaction, createPaymentOrder } from "@/lib/viva";

const creds = {
  env: "demo" as const,
  clientId: "cid-viva-test",
  clientSecret: "secret",
  merchantId: "m",
  sourceCode: "1234",
};

function mockFetch(transactionBody: string, orderBody = '{"orderCode":3951699402972601}') {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/connect/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    }
    if (url.includes("/checkout/v2/orders")) return new Response(orderBody, { status: 200 });
    return new Response(transactionBody, { status: 200 });
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Viva response parsing (shapes taken from a real demo transaction)", () => {
  it("converts the euro amount to cents", async () => {
    mockFetch(
      '{"transactionId":"abc-123","orderCode":3951699402972601,"statusId":"F","amount":13.5,"currencyCode":"978","merchantTrns":"ordavo:xyz"}',
    );
    const tx = await retrieveTransaction(creds, "abc-123");
    expect(tx.amountCents).toBe(1350);
    expect(tx.paid).toBe(true);
    expect(tx.merchantTrns).toBe("ordavo:xyz");
    expect(tx.currencyCode).toBe("978");
  });

  it("rounds amounts like 16.38 and 10 to whole cents without drift", async () => {
    mockFetch('{"transactionId":"a","statusId":"F","amount":16.38,"currencyCode":"978"}');
    expect((await retrieveTransaction({ ...creds, clientId: "x1" }, "a")).amountCents).toBe(1638);
    vi.restoreAllMocks();
    mockFetch('{"transactionId":"a","statusId":"F","amount":10,"currencyCode":"978"}');
    expect((await retrieveTransaction({ ...creds, clientId: "x2" }, "a")).amountCents).toBe(1000);
  });

  it("only status F counts as paid", async () => {
    for (const status of ["E", "P", "A", "M", "R", ""]) {
      vi.restoreAllMocks();
      mockFetch(`{"transactionId":"a","statusId":"${status}","amount":5,"currencyCode":"978"}`);
      const tx = await retrieveTransaction({ ...creds, clientId: `s-${status}` }, "a");
      expect(tx.paid).toBe(false);
    }
  });

  it("keeps 16-digit order codes exact even above MAX_SAFE_INTEGER", async () => {
    mockFetch(
      '{"transactionId":"a","orderCode":9876543210987654,"statusId":"F","amount":1,"currencyCode":"978"}',
      '{"orderCode":9876543210987654}',
    );
    const tx = await retrieveTransaction({ ...creds, clientId: "big1" }, "a");
    expect(tx.orderCode).toBe("9876543210987654");
    const created = await createPaymentOrder({ ...creds, clientId: "big1" }, {
      amountCents: 100,
      customerTrns: "x",
      merchantTrns: "ordavo:1",
    });
    expect(created.orderCode).toBe("9876543210987654");
  });

  it("treats a missing merchantTrns as empty, never as ours", async () => {
    mockFetch('{"transactionId":"a","statusId":"F","amount":5,"currencyCode":"978","merchantTrns":null}');
    const tx = await retrieveTransaction({ ...creds, clientId: "mt1" }, "a");
    expect(tx.merchantTrns).toBe("");
  });
});
