export const dynamic = "force-dynamic";

export default function UnknownReturn() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-4xl">✓</div>
      <h1 className="text-xl font-semibold">Your payment went through</h1>
      <p className="text-sm opacity-70">
        We could not match this payment to a table automatically. Your payment
        was received — please show this screen to the staff.
      </p>
      <p className="text-xs opacity-50">
        Η πληρωμή σας ελήφθη — δείξτε αυτή την οθόνη στο προσωπικό.
      </p>
    </main>
  );
}
