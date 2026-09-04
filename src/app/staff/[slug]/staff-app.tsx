"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PinGate, apiPost, useBarPayload } from "@/components/bar-api";
import type { BarPayload } from "@/lib/types";
import { cn, formatTableLabel, money, timeAgo } from "@/lib/util";

const STORE_KEY = "ordavo_staff_pin";

export default function StaffApp(props: {
  slug: string;
  venueName: string;
  accent: string;
}) {
  const { slug, venueName, accent } = props;
  const [pin, setPin] = useState<string | null>(null);
  const [wrongPin, setWrongPin] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [now, setNow] = useState(Date.now());
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

  const flash = useCallback((msg: string) => {
    setActionMsg(msg);
    window.setTimeout(() => setActionMsg(""), 2600);
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
        <p className="animate-pulse text-sm text-fog">
          {error || "Connecting to the venue…"}
        </p>
      </main>
    );
  }

  const payload = data;
  const openIds = new Set(payload.openSessions.map((s) => s.tableId));
  const freeTables = payload.tables.filter((t) => !openIds.has(t.id));

  return (
    <main className="min-h-screen pb-16">
      <div className="border-b border-line bg-ink-2/80 sticky top-0 z-30 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <p className="serif truncate text-lg font-semibold text-cream">{payload.venue.name}</p>
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-fog-2">
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
              Staff screen · live
            </p>
          </div>
          <div className="flex items-center gap-2">
            {actionMsg && (
              <span className="animate-pop rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold-2">
                {actionMsg}
              </span>
            )}
            <span className="rounded-full border border-line px-3 py-1 text-xs text-fog">
              Today · {payload.today.orders} orders
            </span>
            <button
              onClick={() => {
                setPin(null);
                window.sessionStorage.removeItem(STORE_KEY);
              }}
              className="btn btn-ghost !px-2.5 !py-1 text-xs"
            >
              Lock
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 pt-6">
        {/* Awaiting confirmation */}
        <section>
          <SectionTitle
            n={payload.pending.length}
            title="Awaiting confirmation"
            tone={payload.pending.length > 0 ? "alert" : "muted"}
          />
          {payload.pending.length === 0 ? (
            <Empty>No first orders waiting. New tables show up here for a quick check.</Empty>
          ) : (
            <div className="space-y-3">
              {payload.pending.map((o) => (
                <div key={o.id} className="animate-rise card !border-gold/35 p-4 shadow-glow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="serif text-lg font-semibold text-gold-2">{o.tableLabel}</span>
                      <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-bold text-fog">
                        first order
                      </span>
                    </div>
                    <span className="text-xs text-fog">{timeAgo(o.createdAt, now)}</span>
                  </div>
                  <OrderLines lines={o.lines} />
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-fog">
                      {o.source === "wheel" ? "🎡 Wheel of luck" : "📱 Menu"} · Total
                    </span>
                    <span className="font-extrabold text-cream">{money(o.total)}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => act(`/api/bar/orders/${o.id}/confirm`, {}, "Table confirmed — order in queue")}
                      className="btn btn-good flex-1 !py-2.5"
                    >
                      ✓ Confirm — guests are here
                    </button>
                    <button
                      onClick={() => act(`/api/bar/orders/${o.id}/decline`, {}, "Declined — session closed")}
                      className="btn btn-danger flex-1 !py-2.5"
                    >
                      ✕ Decline — empty table
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Waiter calls */}
        <section>
          <SectionTitle n={payload.calls.length} title="Waiter calls" tone={payload.calls.length ? "alert" : "muted"} />
          {payload.calls.length === 0 ? (
            <Empty>No active calls. Guests ring via the bell on their menu.</Empty>
          ) : (
            <div className="space-y-2">
              {payload.calls.map((c) => (
                <div key={c.id} className="animate-rise flex items-center gap-3 rounded-xl border border-danger/35 bg-danger/[0.07] p-3.5">
                  <span className="text-xl">🛎️</span>
                  <div className="flex-1">
                    <p className="font-bold text-cream">{c.tableLabel}</p>
                    <p className="text-xs text-fog">{timeAgo(c.createdAt, now)}</p>
                  </div>
                  <button
                    onClick={() => act(`/api/waiter-calls/${c.id}/resolve`, {}, "Call resolved")}
                    className="btn btn-ghost !py-2 text-xs"
                  >
                    Resolved ✓
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Open tables */}
        <section>
          <SectionTitle n={payload.openSessions.length} title="Open tables" tone="muted" />
          {payload.openSessions.length === 0 ? (
            <Empty>No open tables right now.</Empty>
          ) : (
            <div className="space-y-2">
              {payload.openSessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-3.5">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-cream">{s.tableLabel}</p>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                      {s.pendingCount > 0 && (
                        <span className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-bold text-gold-2">
                          {s.pendingCount} awaiting confirm
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fog">
                      Opened {timeAgo(s.openedAt, now)} · Running total{" "}
                      <span className="font-bold text-gold-2">{money(s.total)}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => act(`/api/bar/tables/${s.tableId}/close`, {}, "Table closed")}
                    className="btn btn-ghost !py-2 text-xs"
                  >
                    Close table
                  </button>
                </div>
              ))}
            </div>
          )}
          {freeTables.length > 0 && (
            <ManualOpen
              tables={freeTables}
              onOpen={(id) => act(`/api/bar/tables/${id}/open`, {}, "Table opened")}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function SectionTitle(props: { n: number; title: string; tone: "alert" | "muted" }) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5">
      <span
        className={cn(
          "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-extrabold",
          props.tone === "alert" ? "text-ink" : "border border-line text-fog",
        )}
        style={props.tone === "alert" ? { background: "#c9a45c" } : undefined}
      >
        {props.n}
      </span>
      <span className="text-sm font-bold uppercase tracking-widest text-fog">{props.title}</span>
    </h2>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-fog-2">
      {children}
    </p>
  );
}

function OrderLines({ lines }: { lines: { name: string; qty: number; price: number }[] }) {
  return (
    <p className="mt-2 text-sm text-fog">
      {lines.map((l, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <span className="font-bold text-cream">{l.qty}×</span> {l.name}
        </span>
      ))}
    </p>
  );
}

function ManualOpen(props: { tables: { id: string; label: string }[]; onOpen: (id: string) => void }) {
  const [selected, setSelected] = useState(props.tables[0]?.id ?? "");
  const { tables, onOpen } = props;
  const list = useMemo(() => tables, [tables]);
  useEffect(() => {
    if (!list.some((t) => t.id === selected)) setSelected(list[0]?.id ?? "");
  }, [list, selected]);
  if (tables.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-3">
      <span className="text-xs text-fog-2">Open a table for guests without phones:</span>
      <select
        className="input !w-auto !py-1.5 text-xs"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {tables.map((t) => (
          <option key={t.id} value={t.id}>
            {formatTableLabel(t.label)}
          </option>
        ))}
      </select>
      <button
        onClick={() => selected && onOpen(selected)}
        className="btn btn-ghost !py-1.5 text-xs"
      >
        Open table
      </button>
    </div>
  );
}
