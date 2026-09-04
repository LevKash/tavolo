import Link from "next/link";
import SignupForm from "./signup-form";

export const metadata = { title: "Create your venue — Ordavo" };

export default function SignupPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(201,164,92,0.14),transparent)]" />
      </div>
      <div className="relative w-full max-w-md">
        <Link href="/" className="serif mb-8 block text-center text-3xl font-semibold text-cream">
          Ordavo<span className="text-gold">.</span>
        </Link>
        <div className="glass rounded-2xl p-7">
          <h1 className="serif text-2xl font-semibold text-cream">Open your venue</h1>
          <p className="mt-1 text-sm text-fog">
            One account, one venue. You'll get a guest menu, bar & staff screens
            and the owner dashboard instantly.
          </p>
          <SignupForm />
        </div>
        <p className="mt-5 text-center text-sm text-fog">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-gold-2 hover:text-gold-3">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
