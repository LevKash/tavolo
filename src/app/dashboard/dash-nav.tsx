"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutAction } from "@/lib/actions";
import { cn } from "@/lib/util";

const LINKS = [
  { href: "/dashboard", label: "Today", icon: "📊" },
  { href: "/dashboard/menu", label: "Menu editor", icon: "🍸" },
  { href: "/dashboard/tables", label: "Tables & QR", icon: "🪑" },
  { href: "/dashboard/qr", label: "QR codes", icon: "▦" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

export default function DashNav(props: { slug: string; userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { slug, userName } = props;

  return (
    <div className="flex flex-1 flex-col">
      <nav className="mt-6 space-y-1">
        {LINKS.map((l) => {
          const active =
            l.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border border-gold/30 bg-gold/10 text-gold-2"
                  : "text-fog hover:bg-white/[0.04] hover:text-cream",
              )}
            >
              <span className="text-base">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>

      {slug && (
        <div className="mt-6 rounded-xl border border-line p-3 text-xs">
          <p className="mb-2 font-bold uppercase tracking-widest text-fog-2">Live links</p>
          <div className="space-y-1.5">
            <a href={`/m/${slug}`} target="_blank" rel="noreferrer" className="block text-gold-2 hover:text-gold-3">
              Guest menu ↗
            </a>
            <a href={`/bar/${slug}`} target="_blank" rel="noreferrer" className="block text-gold-2 hover:text-gold-3">
              Bar screen ↗
            </a>
            <a href={`/staff/${slug}`} target="_blank" rel="noreferrer" className="block text-gold-2 hover:text-gold-3">
              Staff screen ↗
            </a>
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-line pt-4">
        <p className="mb-2 truncate px-1 text-xs text-fog">{userName}</p>
        <button
          onClick={async () => {
            await logoutAction();
            router.push("/");
            router.refresh();
          }}
          className="btn btn-ghost w-full !py-2 text-xs"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
