"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ConnectingScreen,
  DemoPaymentsStrip,
  LangToggle,
  PaymentAlerts,
  PinGate,
  SoundButton,
  StaleBanner,
  apiPost,
  pollErrorText,
  useAlertSounds,
  useBarPayload,
  useWakeLock,
} from "@/components/bar-api";
import { type BarDict, type BarLang, tableLabelFor, useBarLang } from "@/lib/bar-i18n";
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
  const [now, setNow] = useState(() => Date.now());
  const { lang, t } = useBarLang();
  const { data, unauthorized, error, errorStatus, stale, lastOkAt, refresh, reset } = useBarPayload(slug, pin);
  useWakeLock(Boolean(pin));
  // Sound for orders to confirm and waiter calls (repeats until answered).
  useAlertSounds(data, false, t.alertTitle);

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
      flash((err as Error).message || t.requestFailed);
      // E.g. another screen already handled it: show the current state.
      refresh();
    }
  }

  function lock() {
    setPin(null);
    window.sessionStorage.removeItem(STORE_KEY);
    reset();
  }

  if (!pin) {
    return (
      <PinGate
        venueName={venueName}
        hint={wrongPin ? t.wrongPin : undefined}
        onUnlock={(p) => setPin(p)}
      />
    );
  }

  if (!data) {
    return (
      <ConnectingScreen
        t={t}
        message={pollErrorText(t, error, errorStatus) || t.connectingVenue}
        onDifferentPin={lock}
      />
    );
  }

  const payload = data;
  const openIds = new Set(payload.openSessions.map((s) => s.tableId));
  const freeTables = payload.tables.filter((t) => !openIds.has(t.id));

  return (
    <main className="min-h-screen pb-16">
      <div className="border-b border-line bg-ink-2/80 sticky top-0 z-30 backdrop-blur">
        {stale && <StaleBanner t={t} lang={lang} lastOkAt={lastOkAt} now={now} />}
        {payload.paymentsDemo && <DemoPaymentsStrip label={t.demoPayments} />}
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="serif truncate text-lg font-semibold text-cream">{payload.venue.name}</p>
            <p
              className={cn(
                "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest",
                stale ? "text-[#ff6b61]" : "text-fog-2",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", stale ? "bg-[#ff3b30]" : "animate-pulse bg-good")} />
              {t.staffScreen} · {stale ? t.offline : t.live}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actionMsg && (
              <span className="animate-pop rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold-2">
                {actionMsg}
              </span>
            )}
            <span className="rounded-full border border-line px-3 py-1 text-xs text-fog">
              {t.today} · {payload.today.orders} {t.ordersCount(payload.today.orders)}
            </span>
            <SoundButton t={t} />
            <LangToggle />
            <button onClick={lock} className="btn btn-ghost !px-2.5 !py-1 text-xs">
              {t.lock}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 pt-6">
        <PaymentAlerts
          t={t}
          lang={lang}
          alerts={payload.paymentAlerts}
          currency={payload.venue.currency}
          now={now}
        />
        {/* Awaiting confirmation */}
        <section>
          <SectionTitle
            n={payload.pending.length}
            title={t.awaitingConfirmation}
            tone={payload.pending.length > 0 ? "alert" : "muted"}
          />
          {payload.pending.length === 0 ? (
            <Empty>{t.noFirstOrders}</Empty>
          ) : (
            <div className="space-y-3">
              {payload.pending.map((o) => (
                <div key={o.id} className="animate-rise card !border-gold/35 p-4 shadow-glow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[26px] font-extrabold leading-tight text-cream">
                        {tableLabelFor(o.tableLabel, lang)}
                      </span>
                      <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-bold text-fog">
                        {t.firstOrder}
                      </span>
                    </div>
                    <span className="text-xs text-fog">{timeAgo(o.createdAt, now, lang)}</span>
                  </div>
                  <OrderLines lines={o.lines} />
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-fog">
                      {o.source === "wheel" ? t.wheelOfLuck : t.menu} · {t.total}
                    </span>
                    <span className="font-extrabold text-cream">{money(o.total)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => act(`/api/bar/orders/${o.id}/confirm`, {}, t.tableConfirmed)}
                      className="btn btn-good min-h-12 flex-1 text-sm"
                    >
                      {t.confirmGuestsHere}
                    </button>
                    <button
                      onClick={() => act(`/api/bar/orders/${o.id}/decline`, {}, t.declinedClosed)}
                      className="btn btn-danger min-h-12 flex-1 text-sm"
                    >
                      {t.declineEmptyTable}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Waiter calls */}
        <section>
          <SectionTitle n={payload.calls.length} title={t.waiterCalls} tone={payload.calls.length ? "alert" : "muted"} />
          {payload.calls.length === 0 ? (
            <Empty>{t.noCalls}</Empty>
          ) : (
            <div className="space-y-2">
              {payload.calls.map((c) => (
                <div key={c.id} className="animate-rise flex items-center gap-3 rounded-xl border border-danger/35 bg-danger/[0.07] p-3.5">
                  <span className="text-xl">🛎️</span>
                  <div className="flex-1">
                    <p className="text-2xl font-extrabold leading-tight text-cream">
                      {tableLabelFor(c.tableLabel, lang)}
                    </p>
                    <p className="text-xs text-fog">{timeAgo(c.createdAt, now, lang)}</p>
                  </div>
                  <button
                    onClick={() => act(`/api/waiter-calls/${c.id}/resolve`, {}, t.callResolved)}
                    className="btn btn-ghost min-h-11 text-sm"
                  >
                    {t.resolved}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Open tables */}
        <section>
          <SectionTitle n={payload.openSessions.length} title={t.openTables} tone="muted" />
          {payload.openSessions.length === 0 ? (
            <Empty>{t.noOpenTablesNow}</Empty>
          ) : (
            <div className="space-y-2">
              {payload.openSessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-3.5">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-cream">{tableLabelFor(s.tableLabel, lang)}</p>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                      {s.pendingCount > 0 && (
                        <span className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-bold text-gold-2">
                          {t.awaitingConfirmCount(s.pendingCount)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fog">
                      {t.opened(timeAgo(s.openedAt, now, lang))} · {t.runningTotal}{" "}
                      <span className="font-bold text-gold-2">{money(s.total)}</span>
                      {(s.paidTotal ?? 0) > 0 && (
                        <span className="ml-1.5 font-bold text-good">
                          · {money(s.paidTotal ?? 0)} {t.paidByCardRing}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => act(`/api/bar/tables/${s.tableId}/close`, {}, t.tableClosed)}
                    className="btn btn-ghost !py-2 text-xs"
                  >
                    {t.closeTable}
                  </button>
                </div>
              ))}
            </div>
          )}
          {freeTables.length > 0 && (
            <ManualOpen
              tables={freeTables}
              t={t}
              lang={lang}
              onOpen={(id) => act(`/api/bar/tables/${id}/open`, {}, t.tableOpened)}
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

function ManualOpen(props: {
  tables: { id: string; label: string }[];
  t: BarDict;
  lang: BarLang;
  onOpen: (id: string) => void;
}) {
  const { tables, t, lang, onOpen } = props;
  const [picked, setPicked] = useState("");
  // Fall back to the first free table when the picked one is no longer free.
  const selected = tables.some((tb) => tb.id === picked) ? picked : (tables[0]?.id ?? "");
  if (tables.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-3">
      <span className="text-xs text-fog-2">{t.openForNoPhones}</span>
      <select
        className="input !w-auto !py-1.5 text-xs"
        aria-label={t.openTable}
        value={selected}
        onChange={(e) => setPicked(e.target.value)}
      >
        {tables.map((tb) => (
          <option key={tb.id} value={tb.id}>
            {tableLabelFor(formatTableLabel(tb.label), lang)}
          </option>
        ))}
      </select>
      <button
        onClick={() => selected && onOpen(selected)}
        className="btn btn-ghost !py-1.5 text-xs"
      >
        {t.openTable}
      </button>
    </div>
  );
}
