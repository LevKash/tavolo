import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, tables, venues } from "@/db/schema";
import { UUID_RE } from "@/lib/rate-limit";

/**
 * Post-payment page. It shows what OUR records say about the payment (verified
 * with Viva by /r or the webhook), never just that the guest was redirected.
 * No JavaScript: while the payment is still being confirmed the page refreshes
 * itself a few times, so it works on a flaky connection too.
 */
export const dynamic = "force-dynamic";

type Search = { p?: string; status?: string; n?: string };

const MAX_REFRESHES = 8;

export default async function Thanks({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const pid = sp.p && UUID_RE.test(sp.p) ? sp.p : "";
  const rows = pid
    ? await db
        .select({
          status: payments.status,
          cents: payments.amount_cents,
          tableId: payments.table_id,
          label: tables.label,
          slug: venues.slug,
        })
        .from(payments)
        .innerJoin(venues, eq(venues.id, payments.venue_id))
        .leftJoin(tables, eq(tables.id, payments.table_id))
        .where(eq(payments.id, pid))
        .limit(1)
    : [];
  const pay = rows[0];

  const cancelled = sp.status === "failed";
  const paid = pay?.status === "paid";
  const confirming = Boolean(pay) && !paid && !cancelled && pay?.status === "pending";
  const n = Math.max(0, Math.min(MAX_REFRESHES, Number(sp.n ?? 0) || 0));
  const refresh = confirming && n < MAX_REFRESHES;

  const back = pay ? `/m/${pay.slug}?table=${pay.tableId}` : "";
  const tone = paid ? "good" : confirming ? "wait" : "warn";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      {refresh && <meta httpEquiv="refresh" content={`4;url=/thanks?p=${pid}&n=${n + 1}`} />}
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-full border text-4xl ${
          tone === "good"
            ? "border-good/40 bg-good/10 text-good"
            : "border-amber-400/40 bg-amber-400/10 text-amber-300"
        }`}
        aria-hidden="true"
      >
        {tone === "good" ? "✓" : tone === "wait" ? "…" : "!"}
      </div>

      <div className="space-y-2">
        {/* Server component without the guest's language: Greek and English
            carry equal weight, Greek first. */}
        <h1 className="font-[family-name:var(--font-serif)] text-3xl font-semibold tracking-tight">
          <span lang="el" className="block">
            {paid
              ? "Ευχαριστούμε για την πληρωμή σας"
              : confirming
                ? "Επιβεβαιώνουμε την πληρωμή σας…"
                : "Η πληρωμή δεν επιβεβαιώθηκε"}
          </span>
          <span lang="en" className="mt-1 block">
            {paid
              ? "Thank you for your payment"
              : confirming
                ? "Confirming your payment…"
                : "Payment not confirmed"}
          </span>
        </h1>
        <p lang="el" className="text-sm opacity-70">
          {paid
            ? "Η πληρωμή σας ελήφθη. Ζητήστε την απόδειξή σας από το προσωπικό."
            : confirming
              ? "Συνήθως χρειάζονται λίγα δευτερόλεπτα. Παρακαλούμε κρατήστε αυτή τη σελίδα ανοιχτή."
              : "Δεν μπορέσαμε να επιβεβαιώσουμε πληρωμή. Αν η κάρτα σας χρεώθηκε, δείξτε αυτή την οθόνη στο προσωπικό. Διαφορετικά, μπορείτε να δοκιμάσετε ξανά."}
        </p>
        <p lang="en" className="text-sm opacity-70">
          {paid
            ? "Your payment was received. Ask the staff for your receipt."
            : confirming
              ? "This usually takes a few seconds. Please keep this page open."
              : "We could not confirm a payment. If your card was charged, show this screen to the staff. Otherwise you can try again."}
        </p>
        {confirming && !refresh && (
          <>
            <p lang="el" className="text-sm opacity-80">
              Περιμένετε ακόμα; Δείξτε αυτή την οθόνη στο προσωπικό, μπορούν να το ελέγξουν.
            </p>
            <p lang="en" className="text-sm opacity-80">
              Still waiting? Show this screen to the staff, they can check it.
            </p>
          </>
        )}
      </div>

      {pay && (
        <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
          {pay.label && (
            <div className="text-xs uppercase tracking-widest opacity-50">
              {/^\d+$/.test(pay.label)
                ? `Τραπέζι ${pay.label} · Table ${pay.label}`
                : pay.label}
            </div>
          )}
          <div className="mt-1 text-2xl font-semibold text-white">
            €{(pay.cents / 100).toFixed(2)}
          </div>
        </div>
      )}

      {back ? (
        <Link
          href={back}
          className="w-full rounded-2xl bg-[color:var(--color-gold)] px-6 py-4 text-base font-semibold text-black transition-opacity hover:opacity-90"
        >
          {paid ? "Πίσω στο μενού · Back to the menu" : "Δοκιμάστε ξανά · Try again"}
        </Link>
      ) : (
        <div className="max-w-xs space-y-1 text-xs opacity-60">
          <p lang="el">Σαρώστε τον κωδικό QR στο τραπέζι σας για να επιστρέψετε στο μενού.</p>
          <p lang="en">Scan the QR code on your table to go back to the menu.</p>
        </div>
      )}
    </main>
  );
}
