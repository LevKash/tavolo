import Link from "next/link";

/**
 * Post-payment confirmation page.
 *
 * The guest comes here from `/r` after Viva sends them back. Purpose: one clear
 * confirmation, one obvious action — return to the menu and keep ordering.
 *
 * Deliberately no JS: the guest is on an unfamiliar device right after typing
 * card details, so this page must render even on a flaky connection, and the
 * link must work even if hydration never happens.
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

export default async function Thanks({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const failed = sp.status === "failed";
  const amount = sp.amount ? Number(sp.amount) : null;
  const label = sp.label ? String(sp.label) : "";

  const back = new URLSearchParams();
  if (sp.table) back.set("table", sp.table);
  const backHref = `/m/${sp.venue ?? ""}${back.toString() ? `?${back}` : ""}`;

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
              {label}
            </div>
          )}
          {amount != null && !Number.isNaN(amount) && (
            <div className="mt-1 text-2xl font-semibold text-white">
              €{amount.toFixed(2)}
            </div>
          )}
        </div>
      )}

      {sp.venue ? (
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

      {sp.venue && (
        <p className="text-xs opacity-40">
          {failed
            ? "Πίσω στο μενού"
            : "Επιστροφή στο μενού"}
        </p>
      )}
    </main>
  );
}
