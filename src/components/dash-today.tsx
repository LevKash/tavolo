"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { closeTableAction, openTableAction, resolvePaymentAlertAction } from "@/lib/actions";
import { BAR_STRINGS, paymentAlertText } from "@/lib/bar-i18n";
import type { DashboardDto } from "@/lib/types";
import { cn, clock, money, timeAgo } from "@/lib/util";

export default function DashToday(props: { initial: DashboardDto }) {
  const router = useRouter();
  const [data, setData] = useState<DashboardDto>(props.initial);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/summary", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.ok) setData(await res.json());
    } catch {
      /* transient */
    }
  }, [router]);

  useEffect(() => {
    const iv = window.setInterval(refresh, 3000);
    return () => window.clearInterval(iv);
  }, [refresh]);

  const t = data.today;
  const stats = [
    { label: "Revenue today", value: money(t.revenue), sub: `${t.orders} confirmed orders`, icon: "💰" },
    { label: "Average ticket", value: money(t.avgTicket), sub: "per confirmed order", icon: "🧾" },
    { label: "Order count", value: String(t.orders), sub: "confirmed only", icon: "🍹" },
    { label: "Wheel spins", value: String(t.spins), sub: "wheel of luck", icon: "🎡" },
  ];

  async function tableAction(id: string, kind: "open" | "close") {
    setBusy(id);
    const res =
      kind === "close" ? await closeTableAction(id) : await openTableAction(id);
    setBusy(null);
    if (res?.error) alert(res.error);
    refresh();
  }

  async function resolveAlert(id: string) {
    setBusy(id);
    try {
      const res = await resolvePaymentAlertAction(id);
      if (res?.error) alert(res.error);
    } catch {
      alert("Could not mark the payment as handled. Try again.");
    } finally {
      setBusy(null);
    }
    refresh();
  }

  const alerts = data.paymentAlerts ?? [];
  const currency = data.venue.currency;

  return (
    <div className="space-y-6">
      {data.paymentsDemo && (
        <div
          role="status"
          className="rounded-xl border border-dashed border-[#f5b942]/70 bg-[#f5b942]/15 px-4 py-2 text-center text-xs font-extrabold uppercase tracking-widest text-[#ffd98a]"
        >
          ⚠ DEMO payments — no real money
        </div>
      )}

      {alerts.length > 0 && (
        <section
          aria-label="Payments that need attention"
          className="rounded-2xl border-2 border-danger/60 bg-danger/[0.08] p-5"
        >
          <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-[#ffb0ab]">
            <span aria-hidden>⚠</span>
            Payments that need attention · {alerts.length}
          </h2>
          <ul className="mt-3 space-y-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/35 bg-ink/40 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold text-cream">{a.tableLabel}</span>
                    <span className="text-xs text-fog">
                      {clock(a.at)} · {timeAgo(a.at)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm leading-snug text-cream">
                    {paymentAlertText(BAR_STRINGS.en, a, (n) => money(n, currency))}
                  </p>
                </div>
                <button
                  disabled={busy === a.id}
                  onClick={() => resolveAlert(a.id)}
                  className="btn btn-ghost !py-1.5 text-xs"
                >
                  {busy === a.id ? "Saving…" : "Mark as handled"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-end justify-between">
        <div>
          <h1 className="serif text-3xl font-semibold text-cream">Today</h1>
          <p className="mt-1 text-sm text-fog">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {" · "}
            <span className="text-gold-2">{data.venue.name}</span>
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-good/30 bg-good/10 px-3 py-1 text-xs text-good">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
          Live · 3s
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.label} className="card animate-rise p-4" style={{ animationDelay: `${i * 40}ms` }}>
            <p className="text-xl">{s.icon}</p>
            <p className="serif mt-2 text-3xl font-semibold text-gold-2">{s.value}</p>
            <p className="mt-0.5 text-xs font-bold text-cream">{s.label}</p>
            <p className="text-[11px] text-fog">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-fog">
            Orders by table
          </h2>
          {t.byTable.length === 0 ? (
            <p className="text-sm text-fog-2">No confirmed orders yet today.</p>
          ) : (
            <ul className="space-y-2">
              {t.byTable.map((b) => (
                <li key={b.label} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2">
                  <span className="font-bold text-cream">{b.label}</span>
                  <span className="flex items-center gap-4 text-sm">
                    <span className="text-fog">{b.orders} orders</span>
                    <span className="w-16 text-right font-extrabold text-gold-2">{money(b.revenue)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-fog">
            Top items today
          </h2>
          {t.topItems.length === 0 ? (
            <p className="text-sm text-fog-2">Nothing sold yet today.</p>
          ) : (
            <ul className="space-y-2">
              {t.topItems.map((i, idx) => (
                <li key={i.name} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2">
                  <span className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold/15 text-xs font-extrabold text-gold-2">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-cream">{i.name}</span>
                  </span>
                  <span className="flex items-center gap-4 text-sm">
                    <span className="text-fog">{i.qty}×</span>
                    <span className="w-16 text-right font-extrabold text-gold-2">{money(i.total)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-fog">
            Open tables · {data.openSessionsCount}
          </h2>
          {data.pendingCount > 0 && (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold text-gold-2">
              {data.pendingCount} awaiting confirmation
            </span>
          )}
        </div>
        {data.tables.filter((x) => x.status === "open").length === 0 ? (
          <p className="text-sm text-fog-2">No tables open right now.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.tables
              .filter((x) => x.status === "open")
              .map((tb) => (
                <div key={tb.id} className="rounded-xl border border-line bg-white/[0.02] p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-cream">{tb.label}</p>
                    <span className="text-xs text-fog">{tb.openedAt ? clock(tb.openedAt) : ""}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-fog">
                    Open {tb.openedAt ? timeAgo(tb.openedAt) : ""} · Total{" "}
                    <span className="font-bold text-gold-2">{money(tb.sessionTotal)}</span>
                  </p>
                  <button
                    disabled={busy === tb.id}
                    onClick={() => tableAction(tb.id, "close")}
                    className="btn btn-ghost mt-2.5 w-full !py-1.5 text-xs"
                  >
                    {busy === tb.id ? "Closing…" : "Close table (paid)"}
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* free tables quick open */}
      {data.tables.filter((x) => x.status === "free").length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-fog">
            Free tables · quick open
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.tables
              .filter((x) => x.status === "free")
              .map((tb) => (
                <button
                  key={tb.id}
                  disabled={busy === tb.id}
                  onClick={() => tableAction(tb.id, "open")}
                  className={cn("chip", "hover:border-gold/50 hover:text-gold-2")}
                >
                  {tb.label}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
