import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AdminLoginForm from "./admin-login-form";

export const metadata = { title: "Admin login — Ordavo" };
export const dynamic = "force-dynamic";

/**
 * Platform-admin entrance. Lives in the `(admin-auth)` route group so it is
 * NOT wrapped by `src/app/admin/layout.tsx` (which requires an admin session)
 * while still resolving to the `/admin/login` URL.
 */
export default async function AdminLoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.is_admin ? "/admin" : "/dashboard");

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
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-gold-2">
            <ShieldIcon />
            Platform admin
          </div>
          <h1 className="serif text-2xl font-semibold text-cream">Admin sign-in</h1>
          <p className="mt-1 text-sm text-fog">
            Platform admin access — venue owners use the{" "}
            <Link href="/login" className="font-semibold text-gold-2 hover:text-gold-3">
              regular login
            </Link>
            .
          </p>
          <AdminLoginForm />
          <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-fog-2">
            <LockIcon />
            <span>
              Only accounts with platform-admin rights can sign in here. Owner
              credentials are rejected and no session is created.
            </span>
          </p>
        </div>
        <p className="mt-5 text-center text-sm">
          <Link href="/login" className="font-semibold text-fog hover:text-cream">
            ← Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l7 3v5c0 5-3.2 8.6-7 10-3.8-1.4-7-5-7-10V6l7-3z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fog-2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
