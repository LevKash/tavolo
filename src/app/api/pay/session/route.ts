import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, tableSessions, tables, venues } from "@/db/schema";
import { getVenueBySlug } from "@/lib/core";
import { createPaymentOrder, credentialsComplete, type VivaEnv } from "@/lib/viva";

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

  // Already paid — nothing to charge, just report it.
  if (session.payment_status === "paid") {
    return NextResponse.json({
      ok: true,
      alreadyPaid: true,
      amount: Number(session.payment_amount ?? 0),
    });
  }

  // Live sum of what the guest actually consumed. `pending_confirm` orders are
  // not yet accepted by the bar, so they are excluded from the payable amount.
  const sums = await db
    .select({
      total: sql<number>`coalesce(sum(${orders.total}), 0)`,
      n: sql<number>`count(*)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.session_id, session.id),
        inArray(orders.status, ["new", "making", "served"] as const),
      ),
    );

  const total = Number(sums[0]?.total ?? 0);
  const count = Number(sums[0]?.n ?? 0);
  if (!(total > 0) || count === 0) {
    return NextResponse.json({ error: "nothing_to_pay" }, { status: 409 });
  }

  const amountCents = Math.round(total * 100);

  const creds = {
    env: (venue.viva_env === "live" ? "live" : "demo") as VivaEnv,
    clientId: venue.viva_client_id,
    clientSecret: venue.viva_client_secret,
    merchantId: venue.viva_merchant_id,
    sourceCode: venue.viva_source_code,
  };
  if (!credentialsComplete(creds)) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 409 });
  }

  const tableLabel = tbl[0].label;
  const lang = body.lang === "el" ? "el-GR" : "en-GB";

  try {
    const created = await createPaymentOrder(creds, {
      amountCents,
      customerTrns: `${venue.name} · Table ${tableLabel} · ${count} item${count === 1 ? "" : "s"}`,
      // Our own trace id: lets a human reconcile an Ordavo session with a Viva
      // transaction in the merchant portal without sharing guest data.
      merchantTrns: `ordavo:${session.id}`,
      requestLang: lang,
    });

    await db
      .update(tableSessions)
      .set({
        payment_status: "pending",
        payment_order_code: created.orderCode,
        payment_amount: total,
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
    return NextResponse.json(
      { error: "payment_provider_error", detail: e.message },
      { status: 502 },
    );
  }
}
