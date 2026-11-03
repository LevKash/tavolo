import Link from "next/link";
import { db } from "@/db";
import { tableSessions, tables, venues } from "@/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";

/**
 * Post-payment confirmation page.
 *
 * The guest comes here from `/r` after Viva sends them back. Purpose: one clear
 * confirmation, one obvious action — return to the menu and keep ordering.
 *
 * Deliberately no JS: the guest is on an unfamiliar device right after typing
 * card details, so this page must render even on a flaky connection, and the
 * link must work even if hydration never happens.
 *
 * The table id is re-resolved here rather than trusted from the query string.
 * A payment source configured with a bare `venue` (or with literal
 * `{TransactionId}` placeholders) still redirects here, and without this
 * fallback the "back to my menu" button degraded to `/m/<slug>` — a menu with
 * no table attached, where the guest cannot order or pay. `s_code` is the
 * payment order code we created for that table, so it is the reliable key.
 */
export const dynamic = "force-dynamic";

type Search = {
  venue?: string;
  table?: string;
  label?: string;
  amount?: string;
  status?: string;
  t?: string;
  s_code?: string;
};

async function resolveTable(sp: Search) {
  if (sp.table) {
    // `/r` passes `label`, but a hand-written or third-party return URL may only
    // carry the table id. Without a label the page degrades to a bare amount and
    // the guest cannot tell which table was paid, so look the number up.
    let label = sp.label ?? "";
    if (!label) {
      try {
        const rows = await db
          .select({ label: tables.label })
          .from(tables)
          .where(eq(tables.id, sp.table))
          .limit(1);
        label = rows[0]?.label ?? "";
      } catch {
        label = "";
      }
    }
    return { tableId: sp.table, label, amount: sp.amount };
  }

  // Viva does NOT echo our order code back on redirect: it mints a fresh
  // `orderCode` for the checkout, so `s` almost never matches
  // `table_sessions.payment_order_code`. The stable join key is our own session
  // id, which we embed in `merchantTrns` as `ordavo:<sessionId>:<nonce>`.
  const candidates: string[] = [];

  const code = sp.s_code ?? "";
  if (code) candidates.push(code);

  for (const key of candidates) {
    try {
      const rows = await db
        .select({
          tableId: tableSessions.table_id,
          label: tables.label,
          amount: tableSessions.payment_amount,
          slug: venues.slug,
        })
        .from(tableSessions)
        .innerJoin(tables, eq(tables.id, tableSessions.table_id))
        .innerJoin(venues, eq(venues.id, tables.venue_id))
        .where(eq(tableSessions.payment_order_code, key))
        .limit(1);

      if (rows.length) {
        const r = rows[0];
        return {
          tableId: r.tableId,
          label: r.label ?? "",
          amount: r.amount != null ? String(r.amount) : undefined,
          venue: r.slug,
        };
      }
    } catch {
      /* fall through to the next strategy */
    }
  }

  // Last resort: the newest session we created a payment for in the last day.
  // Better a correct table than a dead end — `/r` only lands here right after a
  // checkout, so "most recent payment" is the guest standing at that table.
  try {
    const rows = await db
      .select({
        tableId: tableSessions.table_id,
        label: tables.label,
        amount: tableSessions.payment_amount,
        slug: venues.slug,
      })
      .from(tableSessions)
      .innerJoin(tables, eq(tables.id, tableSessions.table_id))
      .innerJoin(venues, eq(venues.id, tables.venue_id))
      .where(
        and(
          eq(venues.slug, sp.venue ?? ""),
          isNotNull(tableSessions.payment_created_at),
        ),
      )
      .orderBy(desc(tableSessions.payment_created_at))
      .limit(1);

    if (rows.length) {
      const r = rows[0];
      return {
        tableId: r.tableId,
        label: r.label ?? "",
        amount: r.amount != null ? String(r.amount) : undefined,
        venue: r.slug,
      };
    }
  } catch {
    /* give up below */
  }

  return null;
}

export default async function Thanks({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const failed = sp.status === "failed";
  const resolved = await resolveTable(sp);

  const tableId = resolved?.tableId ?? "";
  const venue = resolved?.venue ?? sp.venue ?? "";
  const amountRaw = resolved?.amount ?? sp.amount;
  const amount = amountRaw ? Number(amountRaw) : null;
  const label = resolved?.label || (sp.label ?? "");

  const back = new URLSearchParams();
  if (tableId) back.set("table", tableId);
  const backHref = `/m/${venue}${back.toString() ? `?${back}` : ""}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-full border text-4xl ${
          failed
            ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
            : "border-good/40 bg-good/10 text-good"
        }`}
        aria-hidden="true"
      >
        {failed ? "!" : "✓"}
      </div>

      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-serif)] text-3xl font-semibold tracking-tight">
          {failed ? "Payment not completed" : "Thank you for your payment"}
        </h1>
        <p className="text-sm opacity-70">
          {failed
            ? "No money has been taken. You can try paying again."
            : "Your payment was received."}
        </p>
        <p className="text-xs opacity-50">
          {failed
            ? "Δεν πραγματοποιήθηκε χρέωση. Μπορείτε να δοκιμάσετε ξανά."
            : "Η πληρωμή σας ελήφθη. Ευχαριστούμε!"}
        </p>
      </div>

      {(amount || label) && (
        <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
          {label && (
            <div className="text-xs uppercase tracking-widest opacity-50">
              Table {label}
            </div>
          )}
          {amount != null && !Number.isNaN(amount) && (
            <div className="mt-1 text-2xl font-semibold text-white">
              €{amount.toFixed(2)}
            </div>
          )}
        </div>
      )}

      {venue && tableId ? (
        <Link
          href={backHref}
          className="w-full rounded-2xl bg-[color:var(--color-gold)] px-6 py-4 text-base font-semibold text-black transition-opacity hover:opacity-90"
        >
          {failed ? "Try again" : "Go back to my menu"}
        </Link>
      ) : (
        <p className="text-sm opacity-70">
          Please show this screen to the staff.
        </p>
      )}

      {venue && tableId && (
        <p className="text-xs opacity-40">
          {failed ? "Πίσω στο μενού" : "Επιστροφή στο μενού"}
        </p>
      )}

      {!tableId && (
        <p className="max-w-xs text-xs opacity-40">
          Couldn&apos;t find your table. Scan the QR code on your table to keep
          ordering.
        </p>
      )}
    </main>
  );
}
