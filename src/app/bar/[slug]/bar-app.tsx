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
import { cn, money, timeAgo } from "@/lib/util";

const STORE_KEY = "ordavo_bar_pin";

export default function BarApp(props: {
  slug: string;
  venueName: string;
  accent: string;
}) {
  const { slug, venueName } = props;
  const [pin, setPin] = useState<string | null>(null);
  const [wrongPin, setWrongPin] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const { lang, t } = useBarLang();
  const { data, unauthorized, error, errorStatus, stale, lastOkAt, refresh, reset } = useBarPayload(slug, pin);
  useWakeLock(Boolean(pin));

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

  // Chime + highlight for orders to confirm, waiter calls and new queue items.
  const freshIds = useAlertSounds(data, true, t.alertTitle);

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
        message={pollErrorText(t, error, errorStatus) || t.connectingBar}
        onDifferentPin={lock}
      />
    );
  }

  const idle = data.pending.length === 0 && data.queue.length === 0 && data.openSessions.length === 0 && data.calls.length === 0;

  return (
    <main className="min-h-screen pb-20">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-line bg-ink-2/90 backdrop-blur">
        {stale && <StaleBanner t={t} lang={lang} lastOkAt={lastOkAt} now={now} />}
        {data.paymentsDemo && <DemoPaymentsStrip label={t.demoPayments} />}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5" title={stale ? t.offline : t.live}>
              {!stale && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
              )}
              <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", stale ? "bg-[#ff3b30]" : "bg-good")} />
            </span>
            <p className="serif text-xl font-semibold text-cream">{data.venue.name}</p>
            <span className="hidden rounded border border-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-fog-2 sm:inline">
              {t.barScreen}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            {actionMsg && (
              <span className="animate-pop rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold-2">
                {actionMsg}
              </span>
            )}
            <span className="rounded-lg border border-line bg-white/[0.02] px-3 py-1.5 text-xs text-fog sm:text-sm">
              {t.today}: <span className="font-extrabold text-cream">{data.today.orders}</span>{" "}
              {t.ordersCount(data.today.orders)} ·{" "}
              <span className="font-extrabold text-gold-2">{money(data.today.revenue)}</span>
            </span>
            <SoundButton t={t} />
            <LangToggle />
            <button onClick={lock} className="btn btn-ghost !px-2.5 !py-1.5 text-xs">
              {t.lock}
            </button>
          </div>
        </div>

        {/* waiter call alert */}
        {data.calls.length > 0 && (
          <div className="border-t border-danger/40 bg-danger/15">
            <div className="mx-auto max-w-7xl px-5 py-2.5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#ffb0ab]">
                <span className="animate-pulse text-base">🔔</span>
                {t.tablesCalling(data.calls.length)}
                {data.calls.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-danger/50 bg-ink/40 px-2.5 py-0.5 text-xs">
                    {tableLabelFor(c.tableLabel, lang)}
                    <button
                      onClick={() => act(`/api/waiter-calls/${c.id}/resolve`, {}, t.callResolved)}
                      className="font-extrabold underline-offset-2 hover:underline"
                      title={t.resolve}
                      aria-label={`${t.resolve}: ${tableLabelFor(c.tableLabel, lang)}`}
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
          <PaymentAlerts
            t={t}
            lang={lang}
            alerts={data.paymentAlerts}
            currency={data.venue.currency}
            now={now}
          />
          {/* awaiting confirmation — grey, bartender may double as waiter */}
          <section aria-label={t.awaitingConfirmation}>
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
                {t.awaitingConfirmation}
                <span className="text-[10px] font-medium normal-case tracking-normal text-fog-2">
                  {t.awaitingHint}
                </span>
              </p>
              {data.pending.length === 0 ? (
                <p className="text-xs text-fog-2">{t.nothingPending}</p>
              ) : (
                <div className="grid gap-2.5 md:grid-cols-2">
                  {data.pending.map((o) => (
                    <div key={o.id} className="rounded-xl border border-line bg-panel/70 p-3.5 opacity-90">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-extrabold leading-tight text-cream">
                          {tableLabelFor(o.tableLabel, lang)}
                        </span>
                        <span className="text-xs text-fog">{timeAgo(o.createdAt, now, lang)}</span>
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
                          onClick={() => act(`/api/bar/orders/${o.id}/confirm`, {}, t.confirmedToQueue)}
                          className="btn btn-good min-h-11 !px-4 text-sm"
                        >
                          {t.confirm}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* main queue */}
          <section aria-label={t.orderQueue}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-fog">
              {t.barQueue}{" "}
              <span className="ml-1 rounded-full border border-line px-2 py-0.5 text-[10px] text-fog-2">
                {t.activeCount(data.queue.length)}
              </span>
            </h2>
            {data.queue.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-fog-2">
                {t.queueEmpty}
              </p>
            ) : (
              <div className="space-y-3">
                {data.queue.map((o) => (
                  <QueueCard
                    key={o.id}
                    orderId={o.id}
                    tableLabel={tableLabelFor(o.tableLabel, lang)}
                    t={t}
                    lang={lang}
                    status={o.status}
                    source={o.source}
                    note={o.note}
                    total={o.total}
                    paid={Boolean(o.paid)}
                    createdAt={o.createdAt}
                    now={now}
                    lines={o.lines}
                    fresh={freshIds.has(o.id)}
                    onAction={(next) =>
                      act(
                        `/api/bar/orders/${o.id}/status`,
                        { status: next },
                        t.orderMoved(
                          tableLabelFor(o.tableLabel, lang),
                          next === "making" ? t.movedMaking : next === "served" ? t.movedServed : t.movedClosed,
                        ),
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
              {t.openTables}{" "}
              <span className="ml-1 text-fog-2">({data.openSessions.length})</span>
            </h2>
            {data.openSessions.length === 0 ? (
              <p className="text-xs text-fog-2">{t.noOpenTables}</p>
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
                      <p className="font-bold text-cream">{tableLabelFor(s.tableLabel, lang)}</p>
                      <p className="text-xs text-fog-2">
                        {timeAgo(s.openedAt, now, lang)}
                        {s.pendingCount > 0 && (
                          <span className="ml-1.5 text-gold-2">· {t.toConfirm(s.pendingCount)}</span>
                        )}
                      </p>
                    </div>
                    <span className="text-right">
                      <span className="font-extrabold text-gold-2">{money(s.total)}</span>
                      {(s.paidTotal ?? 0) > 0 && (
                        <span className="block text-[11px] font-bold text-good">
                          {money(s.paidTotal ?? 0)} {t.paidByCard}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {idle && (
            <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
              <p className="text-2xl">🌙</p>
              <p className="mt-1 text-sm text-fog-2">
                {t.allQuiet}
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function QueueCard(props: {
  orderId: string;
  tableLabel: string;
  t: BarDict;
  lang: BarLang;
  status: "new" | "making" | "served";
  source: "menu" | "wheel";
  note: string;
  total: number;
  paid: boolean;
  createdAt: string;
  now: number;
  lines: { name: string; qty: number; price: number }[];
  fresh: boolean;
  onAction: (next: "making" | "served" | "closed") => void;
}) {
  const { tableLabel, t, lang, status, source, note, total, paid, createdAt, now, lines, fresh, onAction } = props;
  const statusLabel = status === "new" ? t.statusNew : status === "making" ? t.statusMaking : t.statusServed;
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
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[26px] font-extrabold leading-tight text-cream">{tableLabel}</span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide",
              status === "new" && "bg-gold/15 text-gold-2",
              status === "making" && "bg-[#7c9bd4]/20 text-[#a9c3ec]",
              status === "served" && "bg-good/15 text-good",
            )}
          >
            {statusLabel}
          </span>
          {source === "wheel" && (
            <span className="rounded border border-gold/35 bg-gold/10 px-1.5 py-0.5 text-[10px] font-bold text-gold-2">
              {t.wheel}
            </span>
          )}
          {paid && (
            <span className="rounded-full bg-good/20 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-good">
              {t.paidRingReceipt}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-fog">
          <span>{timeAgo(createdAt, now, lang)}</span>
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
          <button onClick={() => onAction("making")} className="btn btn-gold min-h-12 flex-1 text-base">
            {t.startMaking}
          </button>
        )}
        {status === "making" && (
          <button onClick={() => onAction("served")} className="btn btn-good min-h-12 flex-1 text-base">
            {t.markServed}
          </button>
        )}
        {status === "served" && (
          <button onClick={() => onAction("closed")} className="btn btn-ghost min-h-11 flex-1 text-sm">
            {t.closeOrder}
          </button>
        )}
      </div>
    </div>
  );
}
