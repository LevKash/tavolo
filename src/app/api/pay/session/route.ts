import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, tableSessions, tables, venues } from "@/db/schema";
import { getVenueBySlug } from "@/lib/core";
import {
  createPaymentOrder,
  credentialsComplete,
  endpointsFor,
  normalizeClientId,
  type VivaEnv,
} from "@/lib/viva";

export const dynamic = "force-dynamic";

/**
 * Creates a Viva payment order for a table's open session.
 *
 * The guest never sends an amount. We recompute it here from the orders that are
 * actually on the table, so a tampered client cannot pay €1 for a €40 bill.
 */
export async function POST(req: NextRequest) {
  let body: { slug?: string; tableId?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slug = (body.slug ?? "").trim();
  const tableId = (body.tableId ?? "").trim();
  if (!slug || !tableId) {
    return NextResponse.json({ error: "slug and tableId are required" }, { status: 400 });
  }

  // Public origin for Viva's return URLs. Prefer the forwarded host so the same
  // code works on Vercel, on a custom domain and on localhost.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;

  const venue = await getVenueBySlug(slug);
  if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  if (!venue.is_published) {
    return NextResponse.json({ error: "Menu is offline" }, { status: 403 });
  }
  if (!venue.payments_enabled) {
    return NextResponse.json({ error: "payments_disabled" }, { status: 409 });
  }

  const tbl = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1);
  if (tbl.length === 0 || tbl[0].venue_id !== venue.id) {
    return NextResponse.json({ error: "Table not found at this venue" }, { status: 404 });
  }

  const sessions = await db
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.table_id, tableId), eq(tableSessions.status, "open")))
    .limit(1);
  if (sessions.length === 0) {
    return NextResponse.json({ error: "no_open_session" }, { status: 409 });
  }
  const session = sessions[0];

  // NOTE: no per-session `alreadyPaid` shortcut. A table can have several open
  // sessions, and one of them being settled must not block paying the rest —
  // "nothing left to pay" is decided by the summed amount below.
  // Live sum of what the guest actually consumed. `pending_confirm` orders are
  // not yet accepted by the bar, so they are excluded from the payable amount.
  const openSessions = await db
    .select({ id: tableSessions.id })
    .from(tableSessions)
    .where(and(eq(tableSessions.table_id, tableId), eq(tableSessions.status, "open")));
  if (openSessions.length === 0) {
    return NextResponse.json({ error: "no_open_session" }, { status: 409 });
  }

  // Charge the whole TABLE, not one session row: duplicate/rolling sessions
  // split a single sitting into several rows, and charging only one of them
  // under-bills the guest. Orders already settled (payment_status = 'paid') are
  // excluded, so a second round only pays for what is still open.
  const sums = await db
    .select({
      total: sql<number>`coalesce(sum(${orders.total}), 0)`,
      n: sql<number>`count(*)`,
    })
    .from(orders)
    .where(
      and(
        inArray(
          orders.session_id,
          openSessions.map((s) => s.id),
        ),
        inArray(orders.status, ["pending_confirm", "new", "making", "served"] as const),
        ne(orders.payment_status, "paid"),
      ),
    );

  const total = Number(sums[0]?.total ?? 0);
  const count = Number(sums[0]?.n ?? 0);
  if (!(total > 0) || count === 0) {
    return NextResponse.json({ error: "nothing_to_pay" }, { status: 409 });
  }

  const amountCents = Math.round(total * 100);
  // `total` is now summed across every open session of the table and already
  // excludes paid orders, so it is the single source of truth. The old guard
  // compared it against one session's stale payment_amount and could block a
  // legitimate table-wide payment — drop it rather than serve a false 409.

  const creds = {
    env: (venue.viva_env === "live" ? "live" : "demo") as VivaEnv,
    clientId: normalizeClientId(venue.viva_client_id),
    clientSecret: venue.viva_client_secret,
    merchantId: venue.viva_merchant_id,
    sourceCode: venue.viva_source_code,
  };
  if (!credentialsComplete(creds)) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 409 });
  }

  const tableLabel = tbl[0].label;
  const lang = body.lang === "el" ? "el-GR" : "en-GB";

  // ── Duplicate-charge guard ────────────────────────────────────────────────
  // Viva keys its payment order on `merchantTrns` and hands back the SAME
  // orderCode for an identical value. Reusing one merchantTrns per session made
  // a second tap on Pay hit the already-paid order — the guest was charged
  // twice while Ordavo only ever recorded one transaction. Two rules fix that:
  //   1. every payment gets a unique merchantTrns/orderCode (below);
  //   2. a tap that arrives while a recent checkout is still open reuses that
  //      checkout instead of creating a parallel one (double-click protection).
  const PAYMENT_REUSE_MS = 5 * 60 * 1000;
  const reuseCheckout = async () => {
    const pendingSession = await db
      .select()
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.table_id, tableId),
          eq(tableSessions.status, "open"),
          eq(tableSessions.payment_status, "pending"),
        ),
      )
      .limit(1);
    if (pendingSession.length === 0) return null;
    const p = pendingSession[0];
    if (!p.payment_order_code) return null;
    if (Number(p.payment_amount ?? 0) !== total) return null;
    // A checkout that has been abandoned for longer than the reuse window is
    // stale: let a fresh order be created instead of serving a dead ref.
    const createdMs = new Date(p.payment_created_at ?? p.opened_at ?? 0).getTime();
    if (!(Date.now() - createdMs < PAYMENT_REUSE_MS)) return null;
    return {
      ok: true,
      checkoutUrl: `${endpointsFor(creds.env).checkout}?ref=${encodeURIComponent(p.payment_order_code)}`,
      orderCode: p.payment_order_code,
      amount: total,
      items: count,
      table: tableLabel,
      reused: true,
    };
  };

  const early = await reuseCheckout();
  if (early) return NextResponse.json(early);

  // Atomic claim on the session before talking to Viva. Two simultaneous taps
  // both passed the read-only check above and each created its own payment
  // order — a conditional UPDATE is the only way to make exactly one of them
  // win, because Postgres serialises the row lock for us.
  const claimToken = randomUUID();
  const claimed = await db
    .update(tableSessions)
    .set({ payment_order_code: `claim:${claimToken}`, payment_amount: total })
    .where(
      and(
        eq(tableSessions.id, session.id),
        eq(tableSessions.status, "open"),
        sql`coalesce(${tableSessions.payment_order_code}, '') NOT LIKE 'claim:%'`,
      ),
    )
    .returning({ id: tableSessions.id });
  if (claimed.length === 0) {
    // Another request is already creating the checkout. Give it a moment, then
    // hand its ref back to this caller instead of opening a second one.
    await new Promise((r) => setTimeout(r, 1200));
    const loser = await reuseCheckout();
    if (loser) return NextResponse.json(loser);
    return NextResponse.json({ error: "payment_in_progress" }, { status: 409 });
  }

  try {
    // One reference per payment attempt, kept on the session so `pay/confirm` can
    // find this exact transaction later — Viva re-mints the order code on every
    // redirect, so the code alone cannot identify the payment that settled.
    const merchantTrns = `ordavo:${session.id}:${randomUUID()}`;
    const created = await createPaymentOrder(creds, {
      amountCents,
      customerTrns: `${venue.name} · Table ${tableLabel} · ${count} item${count === 1 ? "" : "s"}`,
      // UNIQUE per payment. Viva dedupes on this value: a repeated string
      // returns the previous orderCode, which is how the same transaction got
      // charged twice. The session id stays as a human-readable prefix so the
      // merchant portal can still be reconciled with an Ordavo session.
      merchantTrns,
      requestLang: lang,
      // Both URLs keep ?table= so the guest lands back on their own table
      // instead of the bare host — otherwise the table looks "reset".
      successUrl: `${origin}/m/${venue.slug}?table=${tbl[0].id}&paid=1`,
      failureUrl: `${origin}/m/${venue.slug}?table=${tbl[0].id}&s=failed`,
    });

    await db
      .update(tableSessions)
      .set({
        // A NEW payment must not inherit the previous payment's transaction id:
        // `pay/confirm` treats a stored id as a fallback when the guest returns
        // without one, and an old id resolves to the OLD order code → 409
        // `order_mismatch`, leaving the session stuck in `pending` forever.
        // (Seen in production 2026-11-03: 2nd payment of €16 never settled.)
        payment_status: "pending",
        payment_order_code: created.orderCode,
        payment_merchant_trns: merchantTrns,
        payment_amount: total,
        payment_created_at: new Date(),
        payment_transaction_id: "",
      })
      .where(eq(tableSessions.id, session.id));

    return NextResponse.json({
      ok: true,
      checkoutUrl: created.checkoutUrl,
      orderCode: created.orderCode,
      amount: total,
      items: count,
      table: tableLabel,
    });
  } catch (err) {
    const e = err as Error & { body?: string; status?: number };
    console.error("[pay/session] viva error:", e.message, e.body ?? "");
    // Release the claim so the guest can retry. Leaving `claim:<uuid>` in the
    // column would make every later tap look like a payment already in flight.
    await db
      .update(tableSessions)
      .set({ payment_order_code: "", payment_amount: null })
      .where(
        and(
          eq(tableSessions.id, session.id),
          eq(tableSessions.payment_order_code, `claim:${claimToken}`),
        ),
      );
    return NextResponse.json(
      { error: "payment_provider_error", detail: e.message },
      { status: 502 },
    );
  }
}
