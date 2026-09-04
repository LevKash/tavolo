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
export function timeAgo(iso: string | Date, nowMs = Date.now()) {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, nowMs - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} d ago`;
}

/** Short human ref for an order, derived from its uuid. */
export function orderRef(id: string) {
  return id.replace(/-/g, "").slice(0, 4).toUpperCase();
}

export function startOfToday(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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

/** WebAudio chime used for new bar orders. Safe no-op when unavailable. */
export function playChime() {
  try {
    const Ctx =
      typeof window !== "undefined"
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq: number, t0: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + t0 + dur,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t0);
      osc.stop(ctx.currentTime + t0 + dur + 0.05);
    };
    play(880, 0, 0.28);
    play(1174.66, 0.16, 0.4);
    window.setTimeout(() => ctx.close().catch(() => undefined), 1200);
  } catch {
    /* audio unavailable */
  }
}
