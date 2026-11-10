// Pure, client-safe helpers (no node-only imports).

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** €-style money formatting with 0-2 decimals depending on value. */
export function money(n: number, currency = "EUR") {
  const abs = Math.abs(n);
  const digits = abs !== 0 && Math.round(abs * 100) % 100 === 0 ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return `€${n.toFixed(2)}`;
  }
}

export function moneyNumeric(n: number) {
  const digits = Math.round(n * 100) % 100 === 0 ? 0 : 2;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  });
}

/** Compact "9:32 PM" style clock. */
export function clock(d: Date | string | number) {
  return new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "2 min ago" / "3 h ago" relative time. */
export function timeAgo(iso: string | Date, nowMs = Date.now(), lang: "en" | "el" = "en") {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, nowMs - then);
  const sec = Math.floor(diff / 1000);
  const el = lang === "el";
  if (sec < 10) return el ? "μόλις τώρα" : "just now";
  if (sec < 60) return el ? `πριν από ${sec} δευτ.` : `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return el ? `πριν από ${min} λεπτά` : `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return el ? `πριν από ${h} ώρ.` : `${h} h ago`;
  const d = Math.floor(h / 24);
  return el ? `πριν από ${d} ημ.` : `${d} d ago`;
}

/** Short human ref for an order, derived from its uuid. */
export function orderRef(id: string) {
  return id.replace(/-/g, "").slice(0, 4).toUpperCase();
}

const VENUE_TZ = "Europe/Athens";
/** A bar's trading day runs past midnight, so the "day" starts at 05:00 local. */
const BUSINESS_DAY_START_HOUR = 5;

/** Offset of VENUE_TZ from UTC at the given instant, in ms (handles DST). */
function tzOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Start of the current trading day in Athens time (05:00 local), as a UTC
 * instant. The server runs in UTC, so plain Date arithmetic would roll the day
 * over at 02:00-03:00 Athens time, in the middle of a busy night.
 */
export function startOfToday(d = new Date()): Date {
  const off = tzOffsetMs(d);
  const local = new Date(d.getTime() + off); // UTC fields now read as Athens wall clock
  let day = local.getUTCDate();
  if (local.getUTCHours() < BUSINESS_DAY_START_HOUR) day -= 1;
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const wall = Date.UTC(y, m, day, BUSINESS_DAY_START_HOUR, 0, 0);
  // Re-read the offset at the candidate instant in case DST changed since.
  return new Date(wall - tzOffsetMs(new Date(wall - off)));
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** "12" -> "Table 12", "Bar" -> "Bar". */
export function formatTableLabel(label: string) {
  if (label.toLowerCase() === "bar") return "Bar";
  if (/^\d+$/.test(label)) return `Table ${label}`;
  return label;
}

export function allergenEmoji(code: string) {
  const map: Record<string, string> = {
    gluten: "🌾",
    wheat: "🌾",
    dairy: "🥛",
    milk: "🥛",
    lactose: "🥛",
    nuts: "🥜",
    peanuts: "🥜",
    egg: "🥚",
    soy: "🫘",
    fish: "🐟",
    shellfish: "🦐",
    crustaceans: "🦐",
    sesame: "🫓",
    celery: "🥬",
    mustard: "🟡",
    sulphites: "🍷",
    lupin: "🌼",
    molluscs: "🦪",
  };
  return map[code.toLowerCase()] ?? "•";
}

type AudioCtor = typeof AudioContext;
/** One shared context for the whole page: browsers only let a context that was
 * started from a user gesture make sound, so it must be reused, not recreated. */
let sharedAudio: AudioContext | null = null;
let chimeWaiting = false;

function audioCtor(): AudioCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  );
}

/**
 * Create/resume the shared AudioContext. Call from a user gesture (tap, click,
 * form submit): after that, chimes can play without further interaction.
 */
export function unlockAudio() {
  try {
    if (!sharedAudio || sharedAudio.state === "closed") {
      const Ctx = audioCtor();
      if (!Ctx) return;
      sharedAudio = new Ctx();
    }
    if (sharedAudio.state !== "running") void sharedAudio.resume().catch(() => undefined);
  } catch {
    /* audio unavailable */
  }
}

/** True when the shared context exists and is allowed to make sound. */
export function audioReady() {
  return sharedAudio !== null && sharedAudio.state === "running";
}

/**
 * WebAudio chime. "soft" is the short two-note guest chime; "alert" is the loud
 * four-note (~1 s) staff alert meant to cut through a noisy bar.
 * Safe no-op when audio is unavailable or not unlocked yet.
 */
export function playChime(variant: "soft" | "alert" = "soft") {
  try {
    if (!sharedAudio || sharedAudio.state === "closed") {
      const Ctx = audioCtor();
      if (!Ctx) return;
      sharedAudio = new Ctx();
    }
    const ctx = sharedAudio;
    if (ctx.state !== "running") {
      // Blocked until a user gesture. Keep at most ONE chime waiting, so a
      // backlog of alerts does not blast all at once when sound is unlocked.
      if (chimeWaiting) return;
      chimeWaiting = true;
      void ctx
        .resume()
        .then(() => {
          chimeWaiting = false;
          if (ctx.state === "running") playChime(variant);
        })
        .catch(() => {
          chimeWaiting = false;
        });
      return;
    }
    const loud = variant === "alert";
    const peak = loud ? 0.5 : 0.18;
    const play = (freq: number, t0: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = loud ? "triangle" : "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
      gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + t0 + dur,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t0);
      osc.stop(ctx.currentTime + t0 + dur + 0.05);
    };
    if (loud) {
      // Notes do not overlap, so the 0.5 peak never sums into clipping.
      play(880, 0, 0.24);
      play(1174.66, 0.25, 0.24);
      play(880, 0.5, 0.24);
      play(1174.66, 0.75, 0.3);
    } else {
      play(880, 0, 0.28);
      play(1174.66, 0.16, 0.4);
    }
  } catch {
    /* audio unavailable */
  }
}
