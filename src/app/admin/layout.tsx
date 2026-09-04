import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { countVenuesByStatus } from "@/lib/core";
import AdminTabs from "./admin-tabs";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.is_admin) redirect("/dashboard");

  const counts = await countVenuesByStatus();
  const totalVenues =
    counts.pending + counts.active + counts.rejected + counts.archived;

  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-ink-2/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <p className="serif text-xl font-semibold text-cream">
            Ordavo<span className="text-gold">.</span>
            <span className="ml-2 rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-widest text-gold-2">
              Admin
            </span>
          </p>
          <div className="flex items-center gap-4">
            <span className="hidden truncate text-xs text-fog-2 sm:inline">
              {user.email}
            </span>
            <Link
              href="/dashboard"
              className="text-xs font-semibold text-fog hover:text-cream"
            >
              ← My dashboard
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-4">
          <AdminTabs pending={counts.pending} venues={totalVenues} />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
