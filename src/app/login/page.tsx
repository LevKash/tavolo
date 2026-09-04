import Link from "next/link";
import LoginForm from "./login-form";

export const metadata = { title: "Log in — Tavolo" };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(201,164,92,0.14),transparent)]" />
      </div>
      <div className="relative w-full max-w-sm">
        <Link href="/" className="serif mb-8 block text-center text-3xl font-semibold text-cream">
          Tavolo<span className="text-gold">.</span>
        </Link>
        <div className="glass rounded-2xl p-7">
          <h1 className="serif text-2xl font-semibold text-cream">Welcome back</h1>
          <p className="mt-1 text-sm text-fog">Log in to your venue dashboard.</p>
          <LoginForm />
          <div className="mt-5 rounded-lg border border-gold/20 bg-gold/5 p-3 text-xs text-fog">
            <span className="font-semibold text-gold-2">Demo venue:</span>{" "}
            demo@ambrosia.gr · demo1234
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-fog">
          No account yet?{" "}
          <Link href="/signup" className="font-semibold text-gold-2 hover:text-gold-3">
            Create your venue
          </Link>
        </p>
      </div>
    </main>
  );
}
