export const dynamic = "force-dynamic";

export default function UnknownReturn() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-4xl">…</div>
      {/* Server component without the guest's language: Greek and English
          carry equal weight, Greek first. */}
      <h1 className="text-xl font-semibold">
        <span lang="el" className="block">
          Δεν μπορέσαμε ακόμα να επιβεβαιώσουμε την πληρωμή σας
        </span>
        <span lang="en" className="mt-1 block">
          We could not confirm your payment yet
        </span>
      </h1>
      <p lang="el" className="text-sm opacity-70">
        Δεν μπορέσαμε να αντιστοιχίσουμε αυτόματα την πληρωμή με κάποιο τραπέζι.
        Αν η κάρτα σας χρεώθηκε, δείξτε αυτή την οθόνη στο προσωπικό, μπορούν
        να το ελέγξουν.
      </p>
      <p lang="en" className="text-sm opacity-70">
        We could not match this payment to a table automatically. If your card
        was charged, please show this screen to the staff, they can check it.
      </p>
    </main>
  );
}
