"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PinGate, apiPost, useBarPayload } from "@/components/bar-api";
import { cn, money, playChime, timeAgo } from "@/lib/util";

const STORE_KEY = "tavolo_bar_pin";

export default function BarApp(props: {
  slug: string;
  venueName: string;
  accent: string;
}) {
  const { slug, venueName } = props;
  const [pin, setPin] = useState<string | null>(null);
  const [wrongPin, setWrongPin] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [now, setNow] = useState(Date.now());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());
  const { data, unauthorized, error, refresh } = useBarPayload(slug, pin);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(STORE_KEY);
    if (stored) setPin(stored);
  }, []);

  useEffect(() => {
    if (unauthorized) {
      setWrongPin(true);
      setPin(null);
      window.sessionStorage.removeItem(STORE_KEY);
    }
  }, [unauthorized]);

  useEffect(() => {
    if (data && pin) {
      window.sessionStorage.setItem(STORE_KEY, pin);
      setWrongPin(false);
    }
  }, [data, pin]);

  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(iv);
  }, []);

  // Chime + highlight for brand-new confirmed orders entering the queue.
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.queue.map((o) => o.id));
    const arrivals = data.queue.filter((o) => !knownIds.current.has(o.id) && o.status === "new");
    knownIds.current = ids;
    if (arrivals.length > 0) {
      playChime();
      setFreshIds(new Set(arrivals.map((o) => o.id)));
      const t = window.setTimeout(() => setFreshIds(new Set()), 6000);
      return () => window.clearTimeout(t);
    }
  }, [data]);

  const flash = useCallback((msg: string) => {
    setActionMsg(msg);
    window.setTimeout(() => setActionMsg(""), 2400);
  }, []);

  async function act(path: string, body: Record<string, unknown>, okMsg: string) {
    try {
      await apiPost(path, { ...body, slug, pin });
      flash(okMsg);
      refresh();
    } catch (err) {
      flash((err as Error).message);
    }
  }

  if (!pin) {
    return (
      <PinGate
        venueName={venueName}
        hint={wrongPin ? "That PIN doesn't work for this venue." : undefined}
        onUnlock={(p) => setPin(p)}
      />
    );
  }
  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-sm text-fog">{error || "Connecting to the bar…"}</p>
      </main>
    );
  }

  const idle = data.pending.length === 0 && data.queue.length === 0 && data.openSessions.length === 0 && data.calls.length === 0;

  return (
    <main className="min-h-screen pb-20">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-line bg-ink-2/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-good" />
            </span>
            <p className="serif text-xl font-semibold text-cream">{data.venue.name}</p>
            <span className="hidden rounded border border-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-fog-2 sm:inline">
              Bar screen
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {actionMsg && (
              <span className="animate-pop rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold-2">
                {actionMsg}
              </span>
            )}
            <span className="rounded-lg border border-line bg-white/[0.02] px-3 py-1.5 text-xs text-fog sm:text-sm">
              Today: <span className="font-extrabold text-cream">{data.today.orders}</span> orders ·{" "}
              <span className="font-extrabold text-gold-2">{money(data.today.revenue)}</span>
            </span>
            <button
              onClick={() => {
                setPin(null);
                window.sessionStorage.removeItem(STORE_KEY);
              }}
              className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
            >
              Lock
            </button>
          </div>
        </div>

        {/* waiter call alert */}
        {data.calls.length > 0 && (
          <div className="border-t border-danger/40 bg-danger/15">
            <div className="mx-auto max-w-7xl px-5 py-2.5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#ffb0ab]">
                <span className="animate-pulse text-base">🔔</span>
                {data.calls.length === 1 ? "A table is calling the waiter" : `${data.calls.length} tables are calling the waiter`}
                {data.calls.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-danger/50 bg-ink/40 px-2.5 py-0.5 text-xs">
                    {c.tableLabel}
                    <button
                      onClick={() => act(`/api/waiter-calls/${c.id}/resolve`, {}, "Call resolved")}
                      className="font-extrabold underline-offset-2 hover:underline"
                      title="Resolve"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </p>
            </div>
          </div>
        )}
      </header>

      {/* body */}
      <div className="mx-auto mt-6 grid max-w-7xl gap-6 px-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          {/* awaiting confirmation — grey, bartender may double as waiter */}
          <section aria-label="Awaiting confirmation">
            <div className={cn("rounded-2xl border p-4", data.pending.length > 0 ? "border-gold/25 bg-white/[0.02]" : "border-line bg-transparent")}>
              <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-fog">
                <span
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-extrabold",
                    data.pending.length > 0 ? "text-ink" : "border border-line text-fog-2",
                  )}
                  style={data.pending.length > 0 ? { background: "#8a9099" } : undefined}
                >
                  {data.pending.length}
                </span>
                Awaiting confirmation
                <span className="text-[10px] font-medium normal-case tracking-normal text-fog-2">
                  — first orders of new tables (small venues: confirm here)
                </span>
              </p>
              {data.pending.length === 0 ? (
                <p className="text-xs text-fog-2">Nothing pending.</p>
              ) : (
                <div className="grid gap-2.5 md:grid-cols-2">
                  {data.pending.map((o) => (
                    <div key={o.id} className="rounded-xl border border-line bg-panel/70 p-3.5 opacity-90">
                      <div className="flex items-center justify-between">
                        <span className="serif text-lg font-semibold text-cream">{o.tableLabel}</span>
                        <span className="text-xs text-fog">{timeAgo(o.createdAt, now)}</span>
                      </div>
                      <p className="mt-1 text-sm text-fog">
                        {o.lines.map((l, i) => (
                          <span key={i}>
                            {i > 0 && " · "}
                            <b className="text-cream">{l.qty}×</b> {l.name}
                          </span>
                        ))}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-extrabold text-gold-2">{money(o.total)}</span>
                        <button
                          onClick={() => act(`/api/bar/orders/${o.id}/confirm`, {}, "Confirmed → queue")}
                          className="btn btn-good !px-3 !py-1.5 text-xs"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* main queue */}
          <section aria-label="Order queue">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-fog">
              Bar queue{" "}
              <span className="ml-1 rounded-full border border-line px-2 py-0.5 text-[10px] text-fog-2">
                {data.queue.length} active
              </span>
            </h2>
            {data.queue.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-fog-2">
                Quiet at the bar. 🍸 New confirmed orders will appear here with a chime.
              </p>
            ) : (
              <div className="space-y-3">
                {data.queue.map((o) => (
                  <QueueCard
                    key={o.id}
                    orderId={o.id}
                    tableLabel={o.tableLabel}
                    status={o.status}
                    source={o.source}
                    note={o.note}
                    total={o.total}
                    createdAt={o.createdAt}
                    now={now}
                    lines={o.lines}
                    fresh={freshIds.has(o.id)}
                    onAction={(next) =>
                      act(
                        `/api/bar/orders/${o.id}/status`,
                        { status: next },
                        `Order ${o.tableLabel} → ${next}`,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* right: open tables */}
        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-line bg-white/[0.02] p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-fog">
              Open tables{" "}
              <span className="ml-1 text-fog-2">({data.openSessions.length})</span>
            </h2>
            {data.openSessions.length === 0 ? (
              <p className="text-xs text-fog-2">No open tables.</p>
            ) : (
              <ul className="space-y-2">
                {data.openSessions.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between rounded-xl border border-line px-3 py-2.5",
                      s.pendingCount > 0 && "border-gold/30 bg-gold/[0.04]",
                    )}
                  >
                    <div>
                      <p className="font-bold text-cream">{s.tableLabel}</p>
                      <p className="text-xs text-fog-2">
                        {timeAgo(s.openedAt, now)}
                        {s.pendingCount > 0 && (
                          <span className="ml-1.5 text-gold-2">· {s.pendingCount} to confirm</span>
                        )}
                      </p>
                    </div>
                    <span className="font-extrabold text-gold-2">{money(s.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {idle && (
            <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
              <p className="text-2xl">🌙</p>
              <p className="mt-1 text-sm text-fog-2">
                All quiet. Orders land here the moment guests send them.
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

const STATUS_LABEL: Record<string, string> = {
  new: "In queue",
  making: "Making…",
  served: "Served ✓",
};

function QueueCard(props: {
  orderId: string;
  tableLabel: string;
  status: "new" | "making" | "served";
  source: "menu" | "wheel";
  note: string;
  total: number;
  createdAt: string;
  now: number;
  lines: { name: string; qty: number; price: number }[];
  fresh: boolean;
  onAction: (next: "making" | "served" | "closed") => void;
}) {
  const { tableLabel, status, source, note, total, createdAt, now, lines, fresh, onAction } = props;
  return (
    <div
      className={cn(
        "card p-4 transition-shadow",
        fresh && "animate-ring border-gold/50 shadow-glow",
        status === "making" && "border-gold/35",
        status === "served" && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide",
              status === "new" && "bg-gold/15 text-gold-2",
              status === "making" && "bg-[#7c9bd4]/20 text-[#a9c3ec]",
              status === "served" && "bg-good/15 text-good",
            )}
          >
            {STATUS_LABEL[status]}
          </span>
          <span className="serif text-xl font-semibold text-cream">{tableLabel}</span>
          {source === "wheel" && (
            <span className="rounded border border-gold/35 bg-gold/10 px-1.5 py-0.5 text-[10px] font-bold text-gold-2">
              🎡 wheel
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-fog">
          <span>{timeAgo(createdAt, now)}</span>
          <span className="font-extrabold text-gold-2">{money(total)}</span>
        </div>
      </div>
      <ul className="mt-2.5 space-y-0.5 text-sm">
        {lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 text-fog">
            <span>
              <span className="font-extrabold text-cream">{l.qty}×</span> {l.name}
            </span>
            <span>{money(l.price * l.qty)}</span>
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-2 rounded-lg border border-gold/20 bg-gold/5 px-2.5 py-1.5 text-xs italic text-gold-2">
          “{note}”
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {status === "new" && (
          <button onClick={() => onAction("making")} className="btn btn-gold flex-1 !py-2 text-xs">
            🔥 Start making
          </button>
        )}
        {status === "making" && (
          <button onClick={() => onAction("served")} className="btn btn-good flex-1 !py-2 text-xs">
            ✓ Mark served
          </button>
        )}
        {status === "served" && (
          <button onClick={() => onAction("closed")} className="btn btn-ghost flex-1 !py-2 text-xs">
            Close order
          </button>
        )}
      </div>
    </div>
  );
}
