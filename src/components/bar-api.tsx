"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BarPayload } from "@/lib/types";
import { playChime } from "@/lib/util";

/** Polls /api/bar/orders every 3s once a pin is available. */
export function useBarPayload(slug: string, pin: string | null) {
  const [data, setData] = useState<BarPayload | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState(0);

  const refresh = useCallback(() => setToken((t) => t + 1), []);
  const invalidate = useCallback(() => {
    setData(null);
    setUnauthorized(true);
  }, []);

  useEffect(() => {
    if (!pin) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/bar/orders?slug=${encodeURIComponent(slug)}&pin=${encodeURIComponent(pin)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (res.status === 401 && alive) {
            setUnauthorized(true);
            setData(null);
          } else if (alive) {
            setError(`Server error (${res.status}) — retrying…`);
          }
          return;
        }
        const j = (await res.json()) as BarPayload;
        if (alive) {
          setData(j);
          setUnauthorized(false);
          setError("");
        }
      } catch {
        if (alive) setError("Connection problem — retrying…");
      }
    };
    tick();
    const iv = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [slug, pin, token]);

  return { data, unauthorized, error, refresh, invalidate };
}

/**
 * Sound and highlight for anything that needs a person right now: orders waiting
 * for confirmation, waiter calls and (on the bar screen) confirmed orders
 * entering the queue. The first payload after opening the screen only seeds the
 * known set, so reloading does not beep for old items. While anything is still
 * waiting for confirmation or a call is unanswered, the chime repeats every 30 s
 * so a missed order does not sit unnoticed.
 */
export function useAlertSounds(data: BarPayload | null, includeQueue: boolean) {
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
    playChime();
    setFresh(new Set(arrivals.map((k) => k.slice(2))));
    const t = window.setTimeout(() => setFresh(new Set()), 6000);
    return () => window.clearTimeout(t);
  }, [data, includeQueue]);

  useEffect(() => {
    const iv = window.setInterval(() => {
      const d = latest.current;
      if (d && (d.pending.length > 0 || d.calls.length > 0)) playChime();
    }, 30000);
    return () => window.clearInterval(iv);
  }, []);

  return fresh;
}

export async function apiPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = "Request failed";
    try {
      const j = await res.json();
      msg = j.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

/** Shared PIN entry used by the staff and bar screens. */
export function PinGate(props: {
  venueName: string;
  hint?: string;
  onUnlock: (pin: string) => void;
}) {
  const { venueName, hint, onUnlock } = props;
  const [pin, setPin] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length >= 4) onUnlock(pin);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-xs text-center">
        <p className="serif text-3xl font-semibold text-cream">{venueName}</p>
        <p className="mt-1 text-xs tracking-wide text-fog">STAFF ACCESS</p>
        <form onSubmit={submit} className="glass mt-8 rounded-2xl p-6">
          <label className="label text-center">Venue PIN</label>
          <input
            inputMode="numeric"
            autoFocus
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
            Unlock
          </button>
          <p className="mt-3 text-[11px] text-fog-2">
            Ask the venue owner for the PIN.
          </p>
        </form>
      </div>
    </main>
  );
}
