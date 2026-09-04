import Link from "next/link";
import LoginForm from "./login-form";

export const metadata = { title: "Log in — Ordavo" };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(201,164,92,0.14),transparent)]" />
      </div>
      <div className="relative w-full max-w-sm">
        <Link href="/" className="serif mb-8 block text-center text-3xl font-semibold text-cream">
          Ordavo<span className="text-gold">.</span>
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

        {/* Secondary entrance for platform staff — deliberately not gold. */}
        <div className="mt-8 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-fog-2">
            Platform staff
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <Link
          href="/admin/login"
          className="btn btn-ghost mx-auto mt-3 flex w-fit items-center gap-1.5 px-4 py-2 text-xs text-fog"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l7 3v5c0 5-3.2 8.6-7 10-3.8-1.4-7-5-7-10V6l7-3z" />
          </svg>
          Admin login →
        </Link>
      </div>
    </main>
  );
}
