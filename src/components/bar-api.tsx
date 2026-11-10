"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BarPayload } from "@/lib/types";
import { type BarDict, type BarLang, useBarLang } from "@/lib/bar-i18n";
import { audioReady, cn, playChime, timeAgo, unlockAudio } from "@/lib/util";

/** Why the last poll failed ("" when it succeeded). Screens translate it. */
export type PollError = "" | "locked" | "server" | "network";

const POLL_MS = 3000;
/** No successful poll for this long => what is on screen cannot be trusted. */
const STALE_AFTER_MS = 12000;
const FETCH_TIMEOUT_MS = 8000;

/**
 * Polls /api/bar/orders every 3s once a pin is available.
 * `stale` turns true when data is on screen but the last successful poll is
 * more than ~12 s old or two polls in a row failed; it clears on the next
 * success. Screens must show it loudly: stale orders look like "no orders".
 */
export function useBarPayload(slug: string, pin: string | null) {
  const [data, setData] = useState<BarPayload | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<PollError>("");
  const [errorStatus, setErrorStatus] = useState(0);
  const [staleFlag, setStaleFlag] = useState(false);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [token, setToken] = useState(0);
  const lastOk = useRef(0);
  const fails = useRef(0);
  const startedFor = useRef<string | null>(null);

  const refresh = useCallback(() => setToken((t) => t + 1), []);
  const invalidate = useCallback(() => {
    setData(null);
    setUnauthorized(true);
  }, []);
  /** Forget everything shown (used when locking or switching PIN). */
  const reset = useCallback(() => {
    setData(null);
    setLocked(false);
    setError("");
    setStaleFlag(false);
    setLastOkAt(null);
  }, []);

  useEffect(() => {
    if (!pin) {
      startedFor.current = null;
      return;
    }
    if (startedFor.current !== pin) {
      // Fresh start: give the first poll the full grace period.
      startedFor.current = pin;
      lastOk.current = Date.now();
      fails.current = 0;
    }
    let alive = true;
    let sent = 0;
    let applied = 0;
    const failed = (kind: PollError, status = 0) => {
      if (!alive) return;
      fails.current += 1;
      setError(kind);
      setErrorStatus(status);
      if (fails.current >= 2) setStaleFlag(true);
    };
    const tick = async () => {
      const n = ++sent;
      const ctl = new AbortController();
      const timer = window.setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`/api/bar/orders?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
          headers: { "x-bar-pin": pin },
          signal: ctl.signal,
        });
        if (!res.ok) {
          if (res.status === 429) {
            // This device guessed wrong too often. Keep the PIN and the screen,
            // and keep retrying: it clears by itself when the lock expires.
            if (alive) setLocked(true);
            failed("locked", 429);
          } else if (res.status === 401) {
            if (alive) {
              setUnauthorized(true);
              setData(null);
            }
          } else {
            failed("server", res.status);
          }
          return;
        }
        const j = (await res.json()) as BarPayload;
        // A slow older response must not overwrite a newer one.
        if (!alive || n < applied) return;
        applied = n;
        fails.current = 0;
        lastOk.current = Date.now();
        setData(j);
        setUnauthorized(false);
        setLocked(false);
        setError("");
        setErrorStatus(0);
        setStaleFlag(false);
        setLastOkAt(lastOk.current);
      } catch {
        failed("network");
      } finally {
        window.clearTimeout(timer);
      }
    };
    void tick();
    const iv = window.setInterval(tick, POLL_MS);
    // Catches the cases with no failed response at all (hung request, frozen tab).
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastOk.current > STALE_AFTER_MS) setStaleFlag(true);
    }, 2000);
    // Timers are throttled in a hidden tab: poll at once when it comes back.
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(iv);
      window.clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, pin, token]);

  const stale = Boolean(pin && data) && staleFlag;
  return { data, unauthorized, locked, error, errorStatus, stale, lastOkAt, refresh, invalidate, reset };
}

/** Translate the poll error for display. */
export function pollErrorText(t: BarDict, error: PollError, status: number) {
  if (error === "locked") return t.errLocked;
  if (error === "server") return t.errServer(status);
  if (error === "network") return t.errNetwork;
  return "";
}

/**
 * Sound and highlight for anything that needs a person right now: orders waiting
 * for confirmation, waiter calls and (on the bar screen) confirmed orders
 * entering the queue. The first payload after opening the screen only seeds the
 * known set, so reloading does not beep for old items. While anything is still
 * waiting for confirmation or a call is unanswered, the chime repeats every 30 s
 * so a missed order does not sit unnoticed, and the tab title flashes
 * (`alertTitle(count)`), which shows even when the tab is in the background.
 */
export function useAlertSounds(
  data: BarPayload | null,
  includeQueue: boolean,
  alertTitle?: (count: number) => string,
) {
  const known = useRef<Set<string> | null>(null);
  const latest = useRef<BarPayload | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    latest.current = data;
    if (!data) return;
    const keys = [
      ...data.pending.map((o) => `p:${o.id}`),
      ...data.calls.map((c) => `c:${c.id}`),
      ...(includeQueue
        ? data.queue.filter((o) => o.status === "new").map((o) => `q:${o.id}`)
        : []),
    ];
    if (known.current === null) {
      known.current = new Set(keys);
      return;
    }
    const seen = known.current;
    const arrivals = keys.filter((k) => !seen.has(k));
    known.current = new Set(keys);
    if (arrivals.length === 0) return;
    playChime("alert");
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* not supported */
    }
    setFresh(new Set(arrivals.map((k) => k.slice(2))));
    const t = window.setTimeout(() => setFresh(new Set()), 6000);
    return () => window.clearTimeout(t);
  }, [data, includeQueue]);

  useEffect(() => {
    const iv = window.setInterval(() => {
      const d = latest.current;
      if (d && (d.pending.length > 0 || d.calls.length > 0)) playChime("alert");
    }, 30000);
    return () => window.clearInterval(iv);
  }, []);

  const waiting = data ? data.pending.length + data.calls.length : 0;
  useEffect(() => {
    if (waiting === 0 || !alertTitle) return;
    const original = document.title;
    const alert = alertTitle(waiting);
    let on = true;
    document.title = alert;
    const iv = window.setInterval(() => {
      on = !on;
      document.title = on ? alert : original;
    }, 1000);
    return () => {
      window.clearInterval(iv);
      document.title = original;
    };
  }, [waiting, alertTitle]);

  return fresh;
}

/**
 * Keep the screen on while the bar/staff screen is open, so the phone does not
 * lock and silence the alerts. Best effort: not every browser supports it.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const l = await (
          navigator as unknown as { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }
        ).wakeLock.request("screen");
        if (cancelled) await l.release();
        else lock = l;
      } catch {
        /* denied or unsupported */
      }
    };
    void request();
    // The lock is dropped when the tab is hidden; ask again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

export async function apiPost(path: string, body: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // No connection. Empty message: the screen shows its own translated text.
    throw new Error("");
  }
  if (!res.ok) {
    let msg = "";
    try {
      const j = await res.json();
      msg = typeof j.error === "string" ? j.error : "";
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

/** EN / ΕΛ switch. The choice is shared by every bar/staff screen on the device. */
export function LangToggle(props: { className?: string }) {
  const { lang, t, setLang } = useBarLang();
  const opts: { code: BarLang; label: string }[] = [
    { code: "el", label: "ΕΛ" },
    { code: "en", label: "EN" },
  ];
  return (
    <div
      role="group"
      aria-label={t.langAria}
      className={cn("inline-flex overflow-hidden rounded-lg border border-line text-xs font-extrabold", props.className)}
    >
      {opts.map((o) => (
        <button
          key={o.code}
          type="button"
          aria-pressed={lang === o.code}
          onClick={() => setLang(o.code)}
          className={cn(
            "min-h-8 px-2.5 py-1.5",
            lang === o.code ? "bg-gold/20 text-gold-2" : "text-fog-2 hover:text-cream",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Header button that shows whether alerts can make sound. Browsers only allow
 * audio after a tap, so after a page reload it reads "tap to enable sound";
 * tapping unlocks audio and plays a test chime.
 */
export function SoundButton(props: { t: BarDict }) {
  const { t } = props;
  const [on, setOn] = useState(false);

  useEffect(() => {
    const check = () => setOn(audioReady());
    const first = window.setTimeout(check, 0);
    const iv = window.setInterval(check, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(iv);
    };
  }, []);

  return (
    <button
      type="button"
      aria-label={t.soundAria}
      title={t.soundAria}
      onClick={() => {
        unlockAudio();
        playChime("alert");
        window.setTimeout(() => setOn(audioReady()), 300);
      }}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold",
        on
          ? "border-line text-fog hover:text-cream"
          : "animate-pulse border-danger bg-danger/20 text-[#ffd0cc]",
      )}
    >
      {on ? (
        <>
          <span aria-hidden>🔔</span>
          <span className="hidden sm:inline">{t.soundOn}</span>
        </>
      ) : (
        <>
          <span aria-hidden>🔕</span>
          <span>{t.soundOff}</span>
        </>
      )}
    </button>
  );
}

/** Full-width red warning shown while the screen is not receiving updates. */
export function StaleBanner(props: { t: BarDict; lang: BarLang; lastOkAt: number | null; now: number }) {
  const { t, lang, lastOkAt, now } = props;
  return (
    <div role="alert" className="bg-[#c81e1e] px-4 py-3 text-center text-white">
      <p className="text-base font-extrabold uppercase tracking-wide sm:text-lg">⚠ {t.staleBanner}</p>
      {lastOkAt !== null && (
        <p className="text-xs font-semibold text-white/85">
          {t.lastUpdate}: {timeAgo(new Date(lastOkAt), Math.max(now, lastOkAt), lang)}
        </p>
      )}
    </div>
  );
}

/** Shown after the PIN is entered and before the first data arrives. */
export function ConnectingScreen(props: {
  t: BarDict;
  message: string;
  onDifferentPin: () => void;
}) {
  const { t, message, onDifferentPin } = props;
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-5 px-5 text-center">
      <LangToggle className="absolute right-4 top-4" />
      <p className="animate-pulse text-sm text-fog">{message}</p>
      <button type="button" onClick={onDifferentPin} className="btn btn-ghost min-h-11 text-sm">
        {t.differentPin}
      </button>
    </main>
  );
}

/** Shared PIN entry used by the staff and bar screens. */
export function PinGate(props: {
  venueName: string;
  hint?: string;
  onUnlock: (pin: string) => void;
}) {
  const { venueName, hint, onUnlock } = props;
  const { t } = useBarLang();
  const [pin, setPin] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4) return;
    // This tap is the user gesture browsers require before alerts may sound.
    unlockAudio();
    onUnlock(pin);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-5">
      <LangToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-xs text-center">
        <p className="serif text-3xl font-semibold text-cream">{venueName}</p>
        <p className="mt-1 text-xs tracking-wide text-fog">{t.staffAccess}</p>
        <form onSubmit={submit} className="glass mt-8 rounded-2xl p-6">
          <label className="label text-center">{t.venuePin}</label>
          <input
            inputMode="numeric"
            autoFocus
            aria-label={t.venuePin}
            className="input text-center text-2xl font-extrabold tracking-[0.5em]"
            value={pin}
            maxLength={6}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
          />
          {hint && (
            <p className="animate-pop mt-2 text-xs text-danger">{hint}</p>
          )}
          <button type="submit" disabled={pin.length < 4} className="btn btn-gold mt-4 w-full">
            {t.unlock}
          </button>
          <p className="mt-3 text-[11px] text-fog-2">{t.askOwner}</p>
        </form>
      </div>
    </main>
  );
}
