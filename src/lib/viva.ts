/**
 * Viva Wallet (Viva.com) Smart Checkout client.
 *
 * Design notes — read before changing anything:
 *
 *  1. Ordavo is NOT a payment facilitator. Each venue uses its OWN Viva merchant
 *     account; money lands directly on the venue's bank account and Ordavo only
 *     creates payment orders and reads their status. This keeps us out of PCI
 *     scope, out of the money flow, and out of the venue's bookkeeping.
 *
 *  2. We never build a payment URL that carries an amount. Guests must not be
 *     able to edit "?amount=" in a URL. The amount is computed server-side from
 *     the live table session and frozen into a Viva payment order; Viva then
 *     owns the amount and hands us back only a 16-digit order code.
 *
 *  3. Order codes are 16-digit integers above JS MAX_SAFE_INTEGER, so they are
 *     always treated as strings. Never JSON.parse/Number() them.
 */

export type VivaEnv = "demo" | "live";

/** Everything we need from a venue row to talk to its Viva account. */
export interface VivaCredentials {
  env: VivaEnv;
  clientId: string;
  clientSecret: string;
  merchantId: string;
  sourceCode: string;
  /** Required only for the legacy Basic-auth order lookup (`/api/orders/<code>`). */
  apiKey?: string;
}

interface VivaEndpoints {
  /** OAuth2 token endpoint. */
  auth: string;
  /** Smart Checkout order creation. */
  orders: string;
  /** Transaction lookup. */
  transactions: string;
  /** Host the guest is redirected to for the hosted payment page. */
  checkout: string;
  /** Base of the legacy v1 API (Basic auth) — used for the webhook key only. */
  legacyApi: string;
}

const ENDPOINTS: Record<VivaEnv, VivaEndpoints> = {
  demo: {
    auth: "https://demo-accounts.vivapayments.com/connect/token",
    orders: "https://demo-api.vivapayments.com/checkout/v2/orders",
    transactions: "https://demo-api.vivapayments.com/checkout/v2/transactions",
    checkout: "https://demo.vivapayments.com/web/checkout",
    legacyApi: "https://demo.vivapayments.com",
  },
  live: {
    auth: "https://accounts.vivapayments.com/connect/token",
    orders: "https://api.vivapayments.com/checkout/v2/orders",
    transactions: "https://api.vivapayments.com/checkout/v2/transactions",
    checkout: "https://www.vivapayments.com/web/checkout",
    legacyApi: "https://www.vivapayments.com",
  },
};

export function endpointsFor(env: VivaEnv): VivaEndpoints {
  return ENDPOINTS[env] ?? ENDPOINTS.demo;
}

/**
 * Build the Viva credential bundle from a venue row. Returns nulls for missing
 * pieces so callers can use credentialsComplete() to gate the feature.
 */
export function vivaConfigFromVenue(v: {
  viva_env: string | null;
  viva_client_id: string | null;
  viva_client_secret: string | null;
  viva_merchant_id: string | null;
  viva_source_code: string | null;
}): VivaCredentials {
  return {
    env: v.viva_env === "live" ? "live" : "demo",
    clientId: v.viva_client_id ?? "",
    clientSecret: v.viva_client_secret ?? "",
    merchantId: v.viva_merchant_id ?? "",
    sourceCode: v.viva_source_code ?? "",
  };
}

/**
 * A venue can take payments once the merchant pair is present. `sourceCode` is
 * optional: Viva falls back to the merchant's default payment source, and a
 * wrong/unknown code is rejected with 403 (verified against demo-api 2026-11-03).
 */
export function credentialsComplete(c: Partial<VivaCredentials> | null): boolean {
  return Boolean(c && c.clientId && c.clientSecret && c.merchantId);
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Access tokens are valid for 3600s; cache per client id so a burst of guests
// closing tables does not hammer the auth endpoint.
const tokenCache = new Map<string, CachedToken>();

export async function getAccessToken(
  creds: Pick<VivaCredentials, "env" | "clientId" | "clientSecret">,
): Promise<string> {
  const cacheKey = `${creds.env}:${creds.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await fetch(endpointsFor(creds.env).auth, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new VivaError(`Viva auth failed (${res.status})`, raw, res.status);
  }

  let json: { access_token?: string; expires_in?: number };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new VivaError("Viva auth returned non-JSON", raw, res.status);
  }
  if (!json.access_token) throw new VivaError("Viva auth returned no access_token", raw, 502);

  tokenCache.set(cacheKey, {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

export class VivaError extends Error {
  constructor(
    message: string,
    readonly body: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VivaError";
  }
}

export interface CreateOrderArgs {
  /** Amount in EUR cents — already multiplied and rounded server-side. */
  amountCents: number;
  /** Free-text description shown on the guest's payment page. */
  customerTrns: string;
  /** Our own reference (table session id) echoed back by Viva. */
  merchantTrns?: string;
  /** Phone/email are optional; Viva asks the guest on the page if missing. */
  customerEmail?: string;
  /** "el-GR" | "en-GB" — the language the checkout page renders in. */
  requestLang?: string;
  /** Where Viva sends the guest after a successful payment. */
  successUrl?: string;
  /** Where Viva sends the guest when the payment fails or is cancelled. */
  failureUrl?: string;
}

export interface CreatedOrder {
  orderCode: string;
  /** Where to send the guest — the hosted payment page. */
  checkoutUrl: string;
}

/**
 * Creates a payment order at the venue's Viva account and returns the hosted
 * checkout URL. The amount is fixed inside the order; the returned URL is a
 * plain `?ref=<orderCode>` and carries no tamperable amount.
 */
export async function createPaymentOrder(
  creds: VivaCredentials,
  args: CreateOrderArgs,
): Promise<CreatedOrder> {
  const token = await getAccessToken(creds);
  const ep = endpointsFor(creds.env);

  const body = {
    amount: args.amountCents,
    customerTrns: args.customerTrns.slice(0, 128),
    merchantTrns: args.merchantTrns ?? "",
    // Omitted when empty: Viva then uses the merchant's default payment source.
    ...(creds.sourceCode ? { sourceCode: creds.sourceCode } : {}),
    ...(args.customerEmail ? { customerEmail: args.customerEmail } : {}),
    // Without these Viva drops the guest on the bare host after paying, losing
    // ?table= — the table then "resets". Keep both URLs pointing back at the
    // menu with the table id intact.
    ...(args.successUrl ? { successUrl: args.successUrl } : {}),
    ...(args.failureUrl ? { failureUrl: args.failureUrl } : {}),
    requestLang: args.requestLang ?? "en-GB",
    // Smart Checkout requires this when the order is created server-side.
    allowRecurring: false,
    preauth: false,
  };

  const res = await fetch(ep.orders, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new VivaError(`Viva order creation failed (${res.status})`, raw, res.status);
  }

  let json: { orderCode?: number | string };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new VivaError("Viva order creation returned non-JSON", raw, res.status);
  }
  if (!json.orderCode) {
    throw new VivaError("Viva order creation returned no orderCode", raw, 502);
  }

  // String() on a 16-digit number is safe here only because Viva serialises the
  // value; we never do arithmetic on it afterwards.
  const orderCode = String(json.orderCode);
  return { orderCode, checkoutUrl: `${ep.checkout}?ref=${encodeURIComponent(orderCode)}` };
}

export interface VivaTransaction {
  transactionId: string;
  orderCode: string;
  /** Viva statusId: 'F' = finalised/success, 'E' = error, 'P' = pending, 'A' | 'M' = in progress. */
  statusId: string;
  amount: number;
  currencyCode: string;
  paid: boolean;
}

/**
 * Fetches the account's webhook verification key.
 *
 * Viva validates a webhook URL by calling it with a bare GET and expecting the
 * response body to be the account's key, obtained separately from the API:
 *
 *   GET {legacyApi}/api/messages/config/token   (Basic MerchantId:ApiKey)
 *   → { "Key": "B3248222FDCD1885AEAFE51CCC1B5607F00903F6" }
 *
 * Note this uses the legacy API key, NOT the OAuth Smart Checkout credentials —
 * they are different auth schemes and the OAuth token cannot mint this key.
 */
export async function fetchWebhookKey(creds: {
  env: VivaEnv;
  merchantId: string;
  apiKey: string;
}): Promise<string> {
  if (!creds.merchantId || !creds.apiKey) return "";
  const ep = endpointsFor(creds.env);
  const basic = Buffer.from(`${creds.merchantId}:${creds.apiKey}`).toString("base64");
  const res = await fetch(`${ep.legacyApi}/api/messages/config/token`, {
    headers: { Authorization: `Basic ${basic}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new VivaError(
      `Viva webhook key failed (${res.status})`,
      await res.text(),
      res.status,
    );
  }
  const json = (await res.json()) as { Key?: string; key?: string };
  return json.Key ?? json.key ?? "";
}

/**
 * Fetches one transaction — used as the webhook fallback and for manual verify.
 */
/**
 * Reads the state of a payment ORDER (not a transaction). Needed when the guest
 * returns from the hosted checkout without a usable transaction id: the order
 * still reports whether it was paid, so a paid bill can settle instead of
 * sitting unpaid forever.
 *
 * Viva order states: 0 = pending, 1 = expired, 2 = canceled, 3 = paid.
 * Older deployments also use letter codes, so both are accepted.
 */
/**
 * Look up a successful payment by the reference WE chose (`merchantTrns`).
 *
 * This is the only reliable way to settle a bill: Viva mints a fresh `orderCode`
 * every time the guest opens checkout, so the code stored on the session is
 * frequently not the one that was paid. `merchantTrns` is written by us at
 * payment-creation time and appears on every transaction, so it survives
 * re-mints. The transactions endpoint only accepts a date range — pass the day
 * the payment was started.
 */
export async function findPaidTransactionByMerchantTrns(
  creds: VivaCredentials,
  merchantTrns: string,
  day: Date,
): Promise<{ paid: boolean; transactionId: string; amount: number; statusId: string }> {
  const ep = endpointsFor(creds.env);
  const auth = Buffer.from(`${creds.merchantId}:${creds.apiKey ?? ""}`).toString("base64");
  const iso = day.toISOString().slice(0, 10);
  // The endpoint wants whole days (YYYY-MM-DD). Search a small window around the
  // payment date so a payment that started just before midnight still matches.
  const from = new Date(day.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = new Date(day.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url =
    `${ep.legacyApi}/api/transactions/?dateFrom=${from}&dateTo=${to}` +
    `&merchantTrns=${encodeURIComponent(merchantTrns)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new VivaError(`Viva transactions lookup failed (${res.status})`, raw, res.status);
  }
  const json = JSON.parse(raw) as {
    Transactions?: {
      TransactionId?: string;
      StatusId?: string;
      Amount?: number;
      MerchantTrns?: string;
    }[];
  };
  // Viva ignores the merchantTrns filter, so narrow client-side. Status 'F' is a
  // captured payment; anything else (pending, cancelled, refunded) does not
  // settle a bill.
  const match = (json.Transactions ?? []).find(
    (t) => t.MerchantTrns === merchantTrns && String(t.StatusId ?? "").toUpperCase() === "F",
  );
  return {
    paid: Boolean(match),
    transactionId: String(match?.TransactionId ?? ""),
    amount: Number(match?.Amount ?? 0),
    statusId: String(match?.StatusId ?? ""),
  };
}

export async function retrieveOrderState(
  creds: VivaCredentials,
  orderCode: string,
): Promise<{ paid: boolean; stateId: string; amount: number; transactionId: string }> {
  const ep = endpointsFor(creds.env);
  const auth = Buffer.from(`${creds.merchantId}:${creds.apiKey ?? ""}`).toString("base64");
  const res = await fetch(`${ep.legacyApi}/api/orders/${encodeURIComponent(orderCode)}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new VivaError(`Viva retrieve order failed (${res.status})`, raw, res.status);
  }
  const json = JSON.parse(raw) as {
    OrderCode?: number | string;
    StateId?: number | string;
    RequestAmount?: number;
    Amount?: number;
    Transactions?: { TransactionId?: string }[];
  };
  const stateId = String(json.StateId ?? "");
  // 3 (or legacy 'F') means the order is fully paid.
  const paid = stateId === "3" || stateId.toUpperCase() === "F";
  return {
    paid,
    stateId,
    amount: Number(json.RequestAmount ?? json.Amount ?? 0),
    transactionId: String(json.Transactions?.[0]?.TransactionId ?? ""),
  };
}

export async function retrieveTransaction(
  creds: VivaCredentials,
  transactionId: string,
): Promise<VivaTransaction> {
  const token = await getAccessToken(creds);
  const ep = endpointsFor(creds.env);
  const res = await fetch(`${ep.transactions}/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new VivaError(`Viva retrieve transaction failed (${res.status})`, raw, res.status);
  }
  const json = JSON.parse(raw) as {
    transactionId?: string;
    orderCode?: number | string;
    statusId?: string;
    amount?: number;
    currencyCode?: string;
  };
  const statusId = String(json.statusId ?? "");
  return {
    transactionId: String(json.transactionId ?? transactionId),
    orderCode: String(json.orderCode ?? ""),
    statusId,
    amount: Number(json.amount ?? 0),
    currencyCode: String(json.currencyCode ?? ""),
    // Viva reports statusId 'F' once the payment is fully captured.
    paid: statusId.toUpperCase() === "F",
  };
}
