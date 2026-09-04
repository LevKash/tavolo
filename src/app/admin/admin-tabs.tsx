"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/util";

const TABS = [
  { href: "/admin", label: "Applications" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/admins", label: "Accounts" },
] as const;

/** Section switcher for the platform admin panel. */
export default function AdminTabs(props: { pending: number; venues: number }) {
  const pathname = usePathname();
  const badge: Record<string, number> = {
    "/admin": props.pending,
    "/admin/venues": props.venues,
  };

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => {
        const active =
          t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        const n = badge[t.href];
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors",
              active
                ? "border-gold text-gold-2"
                : "border-transparent text-fog hover:text-cream",
            )}
          >
            {t.label}
            {typeof n === "number" && n > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[9px] tabular-nums",
                  active ? "bg-gold/15 text-gold-2" : "bg-white/[0.06] text-fog",
                )}
              >
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
