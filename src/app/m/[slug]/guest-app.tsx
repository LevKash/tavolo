"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  ItemPublic,
  Lang,
  MenuPublic,
  OrderView,
  PassportView,
} from "@/lib/types";
import {
  allergenEmoji,
  cn,
  formatTableLabel,
  money,
  playChime,
  timeAgo,
} from "@/lib/util";

interface GuestAppProps {
  menu: MenuPublic;
  table: { id: string; label: string } | null;
}

const CAT_ANCHOR = "cat";

/**
 * Upsell pair deals: drinks keyed by English name → mezze/sides they pair
 * with at −10% (the discount is applied server-side via pairOf when the
 * drink is in the same order). Matched by English item.name.
 */
const PAIR_MAP: Record<string, string[]> = {
  "Ambrosia Sour": ["Truffle Fries", "Olives & Rusks"],
  "Nectar Negroni": ["Truffle Fries", "Pastitsio Croquettes"],
  "Golden Daiquiri": ["Pastitsio Croquettes", "Olives & Rusks"],
  "Espresso Martini": ["Truffle Fries"],
  "Olympic Fizz": ["Olives & Rusks"],
  "Old Fashioned": ["Pastitsio Croquettes"],
  "Xinomavro Naoussa": ["Meze Platter", "Olives & Rusks"],
  "Assyrtiko Santorini": ["Meze Platter"],
  "Virgin Spritz": ["Olives & Rusks"],
};

/** Server truth for "what have I ordered on this phone" — see /api/guest/orders. */
type GuestOrderHistoryView = {
  orders: {
    id: string;
    status: string;
    total: number;
    createdAt: string;
    paymentStatus?: string;
    lines: { name: string; qty: number; total: number }[];
  }[];
  total: number;
};
const PAIR_DISCOUNT = 0.9;
/** First-order welcome deal window: −10% if the guest orders within 5 min
 *  of first opening the menu. Server enforces; client mirrors for the UI. */
const FIRST_ORDER_MS = 5 * 60_000;
const FIRST_ORDER_DISCOUNT = 0.9;
/** Cocktail passport: every 10th cocktail unit is free. Banked
 *  server-side per guest (a per-venue UUID in localStorage); the client
 *  only mirrors — cheapest cocktail unit(s) shown as €0 on the receipt. */
const PASSPORT_EVERY = 10;
const GUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASSPORT_KEY = (slug: string) => `ordavo:pp:${slug}`;

export default function GuestApp({ menu, table }: GuestAppProps) {
  const venue = menu.venue;
  const [lang, setLang] = useState<Lang>("en");
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(
    menu.categories[0]?.id ?? null,
  );
  const [sheetItem, setSheetItem] = useState<ItemPublic | null>(null);
  const [sheetQty, setSheetQty] = useState(1);
  const [cart, setCart] = useState<Record<string, number>>({});
  // pair item id → main drink id it was added with (deal only while the
  // drink stays in the cart; the server applies −10% via pairOf).
  const [cartPairs, setCartPairs] = useState<Record<string, string>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [tracked, setTracked] = useState<OrderView | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [callState, setCallState] = useState<"idle" | "sent">("idle");
  const [paying, setPaying] = useState(false);
  // Payment-result banner, shown when Viva redirects back to the menu.
  const [payResult, setPayResult] = useState<"paid" | "failed" | "">("");
  const [toast, setToast] = useState("");
  // Live bill for the whole table — what the "Pay" button actually charges.
  // Mirrors GET /api/pay/status (server computes it from open orders).
  const [tableDue, setTableDue] = useState<number | null>(null);
  // Itemised bill from the server. The sheet used to show a bare total with no
  // breakdown, which is why a guest could not tell what the €14 was for.
  const [billLines, setBillLines] = useState<
    { name: string; price: number; qty: number }[]
  >([]);
  // The table bar opens a sheet: that is where a guest pays the bill for the
  // whole sitting and re-enters a payment they abandoned on Viva.
  const [sessionOpen, setSessionOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState("");
  // ── Cocktail passport identity: per-venue guest UUID (localStorage). ──
  const [guestId, setGuestId] = useState("");
  // Everything this phone ordered at this venue, newest first. Reloaded after
  // each order so the list is always the server's truth, never local guesswork.
  const [history, setHistory] = useState<GuestOrderHistoryView | null>(null);
  const [passport, setPassport] = useState<PassportView | null>(null);
  const [placedOnce, setPlacedOnce] = useState(false);
  // ── First-order deal: −10% within 5 min of opening the menu ──
  const [firstSeenMs] = useState<number>(() => {
    const key = `ordavo:fs:${venue.slug}:${table?.id ?? ""}`;
    try {
      const prev = Number(sessionStorage.getItem(key));
      if (Number.isFinite(prev) && prev > 0) return prev;
    } catch {
      /* storage unavailable — fall through */
    }
    const now = Date.now();
    try {
      sessionStorage.setItem(key, String(now));
    } catch {
      /* ignore */
    }
    return now;
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fsLeft = Math.max(0, firstSeenMs + FIRST_ORDER_MS - nowMs);
  const firstDeal = !!table && !placedOnce && fsLeft > 0;
  // Tick only while the countdown can actually change something visible.
  useEffect(() => {
    if (!firstDeal) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [firstDeal]);

  // Passport guest identity: a per-venue UUID in localStorage (server
  // ignores non-UUID values), then fetch the current stamp snapshot.
  /**
   * Device identity — the whole point of "scan the QR, come back to your
   * session". This runs for EVERY venue, not just ones with the cocktail
   * passport: the UUID is what links orders to this phone, so gating it behind
   * a loyalty feature silently broke order history everywhere else.
   */
  useEffect(() => {
    let alive = true;
    const key = PASSPORT_KEY(venue.slug);
    let id = "";
    try {
      id = localStorage.getItem(key) ?? "";
    } catch {
      /* storage unavailable */
    }
    if (!id || !GUEST_ID_RE.test(id)) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      try {
        localStorage.setItem(key, id);
      } catch {
        /* ignore */
      }
    }
    setGuestId(id);
    (async () => {
      try {
        const res = await fetch(
          `/api/passport?slug=${encodeURIComponent(venue.slug)}&guest=${encodeURIComponent(id)}`,
        );
        const data = await res.json();
        if (alive && data && data.enabled) setPassport(data as PassportView);
      } catch {
        /* offline — the card simply stays hidden */
      }
    })();
    return () => {
      alive = false;
    };
  }, [venue.passportEnabled, venue.slug]);

  /**
   * Load this device's order history once the guest UUID is known, and again
   * whenever a new order lands. This is the "scan the QR, get your session
   * back" promise: the UUID survives in localStorage, so the same phone always
   * finds its own orders without logging in.
   */
  const reloadHistory = useCallback(async () => {
    if (!guestId) return;
    try {
      const res = await fetch(
        `/api/guest/orders?slug=${encodeURIComponent(venue.slug)}&guest=${encodeURIComponent(guestId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as GuestOrderHistoryView;
      setHistory({ orders: data.orders ?? [], total: Number(data.total) || 0 });
    } catch {
      /* offline — the history panel simply stays as it was */
    }
  }, [guestId, venue.slug]);

  useEffect(() => {
    void reloadHistory();
  }, [reloadHistory]);
  const fsBadge = `${String(Math.floor(fsLeft / 60_000)).padStart(2, "0")}:${String(
    Math.floor((fsLeft % 60_000) / 1000),
  ).padStart(2, "0")}`;
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const acc = venue.accentColor;

  const items = useMemo(
    () => menu.categories.flatMap((c) => c.items),
    [menu.categories],
  );
  const itemById = useMemo(() => {
    const m = new Map<string, ItemPublic>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);
  // itemId → category kind ("cocktail" earns passport stamps).
  const kindByItem = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of menu.categories)
      for (const it of c.items) m.set(it.id, c.kind);
    return m;
  }, [menu.categories]);
  const itemByName = useMemo(() => {
    const m = new Map<string, ItemPublic>();
    for (const it of items) if (!m.has(it.name)) m.set(it.name, it);
    return m;
  }, [items]);

  // Pair-ups for a drink — resolved to real menu items by English name.
  const pairsOf = useCallback(
    (it: ItemPublic): ItemPublic[] =>
      (PAIR_MAP[it.name] ?? [])
        .map((n) => itemByName.get(n))
        .filter((x): x is ItemPublic => !!x),
    [itemByName],
  );

  const q = query.trim().toLowerCase();
  const filteredCats = useMemo(() => {
    if (!q) return menu.categories;
    return menu.categories
      .map((c) => ({
        ...c,
        items: c.items.filter((it) =>
          [it.name, it.nameAlt, it.description, it.descriptionAlt]
            .join(" ")
            .toLowerCase()
            .includes(q),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [menu.categories, q]);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  // A pair line is discounted only while its main drink is in the cart too —
  // matches the server rule (pairOf is only sent / honoured in that case).
  const pairActive = useCallback(
    (id: string) => {
      const mainId = cartPairs[id];
      return !!mainId && mainId !== id && !!itemById.get(mainId) && (cart[mainId] ?? 0) > 0;
    },
    [cartPairs, cart, itemById],
  );
  const pairUnitPrice = useCallback(
    (it: ItemPublic) =>
      pairActive(it.id)
        ? Math.round(it.price * PAIR_DISCOUNT * 100) / 100
        : it.price,
    [pairActive],
  );
  const cartTotal = Object.entries(cart).reduce(
    (sum, [id, qt]) => sum + pairUnitPrice(itemById.get(id) as ItemPublic) * qt,
    0,
  );
  // Mirrors the server's first-order −10% for the cart UI only.
  const firstDealCut = firstDeal
    ? Math.round(cartTotal * (1 - FIRST_ORDER_DISCOUNT) * 100) / 100
    : 0;
  const grandTotal = firstDeal
    ? Math.round(cartTotal * FIRST_ORDER_DISCOUNT * 100) / 100
    : cartTotal;

  const tName = useCallback(
    (it: { name: string; nameAlt: string }) =>
      lang === "el" && it.nameAlt ? it.nameAlt : it.name,
    [lang],
  );
  const tDesc = useCallback(
    (it: { description: string; descriptionAlt: string }) =>
      lang === "el" && it.descriptionAlt ? it.descriptionAlt : it.description,
    [lang],
  );
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  // Track the latest order with a 3s poll.
  const trackedRef = useRef<string | null>(null);
  trackedRef.current = tracked?.id ?? null;
  useEffect(() => {
    if (!trackedRef.current) return;
    let alive = true;
    const tick = async () => {
      if (!trackedRef.current) return;
      try {
        const res = await fetch(`/api/orders/${trackedRef.current}`);
        if (!res.ok) return;
        const data = await res.json();
        if (alive && data.order) {
          setTracked((prev) =>
            prev && prev.status === data.order.status && prev.id === data.order.id
              ? prev
              : data.order,
          );
          if (
            data.order.status === "new" ||
            data.order.status === "making"
          ) {
            // no-op; keeps polling until served/closed
          }
        }
      } catch {
        /* transient */
      }
    };
    tick();
    const iv = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [tracked?.id]);

  function scrollToCategory(id: string) {
    setActiveCat(id);
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  useEffect(() => {
    if (q) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveCat(e.target.id.slice(CAT_ANCHOR.length));
        }
      },
      { rootMargin: "-140px 0px -60% 0px" },
    );
    for (const c of menu.categories) {
      const el = sectionRefs.current[c.id];
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [menu.categories, q]);

  function addToCart(item: ItemPublic, qty: number) {
    setCart((c) => ({ ...c, [item.id]: Math.min(20, (c[item.id] ?? 0) + qty) }));
    setSheetItem(null);
    showToast(`${tName(item)} added`);
  }

  function addPair(main: ItemPublic, side: ItemPublic, mainQty = 1) {
    setCart((c) => {
      const next = {
        ...c,
        [main.id]: (c[main.id] ?? 0) + mainQty,
        [side.id]: (c[side.id] ?? 0) + 1,
      };
      const capped = Object.fromEntries(
        Object.entries(next).map(([id, v]) => [id, Math.min(20, v)]),
      );
      return capped;
    });
    setCartPairs((p) => ({ ...p, [side.id]: main.id }));
    setSheetItem(null);
    showToast(`${tName(side)} −10% with ${tName(main)}`);
  }

  // Drop the pair link when either side leaves the cart — mirrors the
  // server rule, so the UI price never disagrees with the receipt.
  function removeFromCart(id: string) {
    setCart((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
    setCartPairs((p) => {
      const q = { ...p };
      for (const [side, main] of Object.entries(p))
        if (side === id || main === id) delete q[side];
      return q;
    });
  }

  async function sendOrder(
    rawLines: { itemId: string; qty: number }[],
    source: "menu" | "wheel",
  ) {
    if (!table) return;
    // Attach pairOf so the server grants −10% on pair lines whose main
    // drink is in the same order.
    const lines = rawLines.map((l) => ({
      ...l,
      pairOf: pairActive(l.itemId) ? cartPairs[l.itemId] : undefined,
    }));
    setSending(true);
    setErrorBanner("");
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: venue.slug,
          tableId: table.id,
          lines,
          note,
          source,
          firstSeenAt: firstSeenMs,
          guestId: guestId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Order failed");
      // The order is now on the server with this device's guest_id — pull the
      // fresh history so "your orders" shows it immediately.
      void reloadHistory();
      const minimal = data.order as {
        id: string;
        ref: string;
        status: OrderView["status"];
        total: number;
        isFirstOfSession: boolean;
        createdAt: string;
      };
      const view: OrderView = {
        id: minimal.id,
        ref: minimal.ref,
        status: minimal.status,
        source,
        note,
        total: minimal.total,
        createdAt: minimal.createdAt,
        closedAt: null,
        tableLabel: table.label,
        lines: [],
      };
      // Pre-fill lines for the confirmation screen. The server is
      // authoritative on pricing; here we only mirror its receipt — if this
      // order banked a free cocktail, the cheapest cocktail unit(s) of the
      // order are shown as €0 lines (split into paid + free rows).
      const paid = Object.entries(
        lines.reduce<Record<string, number>>((m, l) => {
          m[l.itemId] = (m[l.itemId] ?? 0) + l.qty;
          return m;
        }, {}),
      ).map(([id, qty]) => {
        const it = itemById.get(id)!;
        return {
          itemId: id,
          name: it.name,
          unit: pairActive(id)
            ? Math.round(it.price * PAIR_DISCOUNT * 100) / 100
            : it.price,
          qty,
        };
      });
      const freeGranted = (data as { freeGranted?: number }).freeGranted ?? 0;
      if (freeGranted > 0) {
        const units: { li: number; unit: number }[] = [];
        paid.forEach((l, li) => {
          if (kindByItem.get(l.itemId) !== "cocktail") return;
          for (let i = 0; i < l.qty; i++) units.push({ li, unit: l.unit });
        });
        units.sort((a, b) => a.unit - b.unit);
        const freeN = new Map<number, number>();
        units
          .slice(0, freeGranted)
          .forEach((u) => freeN.set(u.li, (freeN.get(u.li) ?? 0) + 1));
        view.lines = [];
        paid.forEach((l, li) => {
          const n = freeN.get(li) ?? 0;
          if (n <= 0)
            view.lines.push({ name: l.name, price: l.unit, qty: l.qty });
          else if (n >= l.qty)
            view.lines.push({ name: l.name, price: 0, qty: l.qty });
          else {
            view.lines.push({ name: l.name, price: l.unit, qty: l.qty - n });
            view.lines.push({ name: l.name, price: 0, qty: n });
          }
        });
        showToast(
          lang === "el"
            ? "🎉 Το 10ο κοκτέιλ κεράστηκε!"
            : "🎉 Your 10th cocktail is on us!",
        );
      } else {
        view.lines = paid.map((l) => ({
          name: l.name,
          price: l.unit,
          qty: l.qty,
        }));
      }
      const snap = (data as { passport?: PassportView | null }).passport ?? null;
      if (snap) setPassport(snap);
      setCart({});
      setCartPairs({});
      setNote("");
      setCartOpen(false);
      setTracked(view);
      setPlacedOnce(true);
      playChime();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setErrorBanner((err as Error).message);
      showToast((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function callWaiter() {
    if (!table || callState === "sent") return;
    try {
      const res = await fetch("/api/waiter-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: venue.slug, tableId: table.id }),
      });
      if (!res.ok) throw new Error("Call failed");
      setCallState("sent");
      showToast("The waiter has been called ✨");
      window.setTimeout(() => setCallState("idle"), 45000);
    } catch {
      showToast("Could not reach the staff — please wave!");
    }
  }

  /**
   * Pay-at-table. The guest never sends an amount: the server recomputes the
   * table's unpaid total from live orders and creates the Viva order for exactly
   * that figure, then hands back the hosted checkout URL.
   */
  async function startPayment() {
    if (!table || paying) return;
    setPaying(true);
    try {
      const res = await fetch("/api/pay/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: venue.slug, tableId: table.id }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; error?: string; message?: string };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.message ?? data.error ?? "Payment could not be started");
      }
      // Full navigation (not window.open) — Viva's checkout is the top-level flow
      // and returns the guest to /m/<slug>?table=<id>&paid=1.
      window.location.href = data.checkoutUrl;
    } catch (err) {
      showToast((err as Error).message);
      setPaying(false);
    }
  }

  /**
   * Read Viva's return parameters and reconcile the payment with Viva itself.
   *
   * The redirect is a UI hint, not proof of payment. Historically we just read
   * /api/pay/status here, which only reflects what the webhook already wrote —
   * so when the webhook did not arrive the guest was told "failed" after a
   * perfectly good payment. Now we actively ask Viva to confirm the transaction
   * before falling back to the stored status.
   *
   * Viva appends `t` (transaction id) to the success URL, which is exact and
   * preferred. Without it we fall back to the table, and the server looks up the
   * payment order it stored for that table.
   */
  useEffect(() => {
    if (!table) return;
    const qs = new URLSearchParams(window.location.search);
    const hint = qs.get("paid") ?? qs.get("s");
    if (!hint) return;
    const transactionId = qs.get("t") ?? "";
    let cancelled = false;

    const statusUrl = `/api/pay/status?slug=${encodeURIComponent(venue.slug)}&tableId=${encodeURIComponent(table.id)}`;

    fetch(`/api/pay/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: venue.slug,
        tableId: table.id,
        ...(transactionId ? { transactionId } : {}),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data: { paid?: boolean } | null) => {
        if (cancelled) return;
        if (data?.paid) {
          setPayResult("paid");
          return;
        }
        // Confirmation could not settle it (e.g. the guest cancelled on Viva's
        // page) — trust the stored state rather than assuming failure.
        const r = await fetch(statusUrl);
        const status = r.ok ? ((await r.json()) as { paid?: boolean }) : null;
        if (cancelled || !status) return;
        setPayResult(status.paid ? "paid" : "failed");
      })
      .catch(async () => {
        // Network trouble must not turn a paid bill into "failed"; fall back to
        // whatever the backend already knows.
        if (cancelled) return;
        const r = await fetch(statusUrl).catch(() => null);
        const status = r && r.ok ? ((await r.json()) as { paid?: boolean }) : null;
        if (cancelled || !status) return;
        setPayResult(status.paid ? "paid" : "failed");
      })
      .finally(() => {
        // Keep the params in the address bar. Stripping them used to make the
        // "paid" banner vanish on refresh *and* hide the fact that a payment
        // happened while the session was still stuck in `pending` — the guest
        // saw a normal menu and assumed the app was broken. Keeping `paid`/`t`
        // lets a reload re-run the confirmation instead.
      });
    return () => {
      cancelled = true;
    };
  }, [table, venue.slug]);

  /**
   * Keep the table bill fresh while the order screen is open. The Pay button
   * charges the whole table (server-side), so it must never show the total of
   * just the most recent order — that mismatch was the "18 vs 20 €" bug.
   */
  useEffect(() => {
    if (!table || !venue.paymentsEnabled) return;
    let cancelled = false;
    const load = () => {
      fetch(
        `/api/pay/status?slug=${encodeURIComponent(venue.slug)}&tableId=${encodeURIComponent(table.id)}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { open?: boolean; amount?: number; lines?: { name: string; price: number; qty: number }[] } | null) => {
          if (cancelled || !data) return;
          if (data.open && typeof data.amount === "number") setTableDue(data.amount);
          if (Array.isArray(data.lines)) setBillLines(data.lines);
        })
        .catch(() => {});
    };
    load();
    const iv = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [table, venue.slug, venue.paymentsEnabled]);

  if (tracked) {
    return (
      <OrderScreen
        order={tracked}
        lang={lang}
        tableLabel={formatTableLabel(table?.label ?? "")}
        onBack={() => setTracked(null)}
        onCall={callWaiter}
        callState={callState}
        venueName={venue.name}
        accent={acc}
        onPay={table && venue.paymentsEnabled ? startPayment : undefined}
        paying={paying}
        payAmount={tableDue ?? undefined}
      />
    );
  }

  const style = { "--acc": acc } as CSSProperties;

  return (
    <div style={style} className="mx-auto min-h-screen w-full max-w-md pb-48 text-cream">
      {/* ambient */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-72 max-w-md bg-[radial-gradient(closest-side,rgba(201,164,92,0.14),transparent)]" />

      {/* header */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-ink/85 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          {/* Language first (left) — the table bar moved right and became the
              session entry point, because "which table am I" is the question a
              guest asks after scanning, not a label they skim past. */}
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex overflow-hidden rounded-full border border-line">
              {(["en", "el"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-extrabold uppercase transition-colors",
                    lang === l ? "text-ink" : "text-fog hover:text-cream",
                  )}
                  style={lang === l ? { background: acc } : undefined}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setSessionOpen(true)}
            className="flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-1 text-left transition-colors hover:bg-white/5"
            style={{
              borderColor: `color-mix(in srgb, ${acc} 55%, transparent)`,
              background: `color-mix(in srgb, ${acc} 12%, transparent)`,
            }}
            aria-label={
              lang === "el"
                ? "Το τραπέζι μου και το λογαριασμό της παρέας"
                : "My table and this sitting's bill"
            }
          >
            {table && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: acc }}
              />
            )}
            <span className="min-w-0 truncate text-[11px] font-bold leading-tight text-cream">
              {table
                ? lang === "el" && /^\d+$/.test(table.label)
                  ? `Τραπέζι ${table.label}`
                  : formatTableLabel(table.label)
                : lang === "el"
                  ? "Προεπισκόπηση μενού"
                  : "Menu preview"}
            </span>
            {table && (
              <span
                className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide"
                style={{ color: acc }}
              >
                {tableDue && tableDue > 0
                  ? `€${tableDue.toFixed(2)}`
                  : lang === "el"
                    ? "Λογαριασμός"
                    : "Bill"}
              </span>
            )}
            <span className="shrink-0 text-[10px] text-fog">▾</span>
          </button>
        </div>
        {/* search + chips */}
        <div className="px-4 pb-3">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fog-2">
              ⌕
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drinks & dishes…"
              className="input !rounded-full !pl-8 text-sm"
            />
          </div>
          <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4">
            {menu.categories.map((c) => {
              const on = !q && activeCat === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => scrollToCategory(c.id)}
                  className={cn("chip", on && "chip-active")}
                  style={on && q ? { background: acc } : undefined}
                >
                  {tName(c)}
                  <span className="ml-1 opacity-60">
                    {q ? c.items.filter((i) => i.isAvailable).length : c.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* venue hero */}
      <section className="relative px-5 pt-6 text-center">
        <h1 className="serif text-[2.6rem] font-semibold leading-[1.02] tracking-tight text-cream text-balance">
          {venue.name}
        </h1>
        {venue.tagline && (
          <p className="mt-2 text-sm text-fog">{venue.tagline}</p>
        )}
        {!table && (
          <p className="mt-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold-2">
            Scan the QR code on your table to order from your seat.
          </p>
        )}
        {payResult === "paid" && (
          <div className="mt-3 rounded-xl border border-good/40 bg-good/10 px-4 py-3 text-sm">
            <p className="font-bold text-good">
              {lang === "el" ? "Η πληρωμή ολοκληρώθηκε ✓" : "Payment complete ✓"}
            </p>
            <p className="mt-1 text-fog">
              {lang === "el"
                ? "Ευχαριστούμε! Το τραπέζι σας είναι κλειστό."
                : "Thank you! Your table is settled and closed."}
            </p>
          </div>
        )}
        {payResult === "failed" && (
          <p className="mt-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm text-gold-2">
            {lang === "el"
              ? "Η πληρωμή δεν ολοκληρώθηκε. Δοκιμάστε ξανά ή ζητήστε βοήθεια."
              : "The payment didn't go through. Try again or ask the staff."}
          </p>
        )}
        {errorBanner && (
          <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {errorBanner}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-fog">
          {venue.hours && (
            <span className="rounded-full border border-line bg-white/[0.02] px-2.5 py-1">
              🕘 {venue.hours}
            </span>
          )}
          {venue.wifiName && (
            <span
              className="rounded-full border border-line bg-white/[0.02] px-2.5 py-1"
              title={`WiFi: ${venue.wifiName} · ${venue.wifiPassword}`}
            >
              📶 {venue.wifiName}
              {venue.wifiPassword ? ` · ${venue.wifiPassword}` : ""}
            </span>
          )}
          {venue.address && (
            <span className="rounded-full border border-line bg-white/[0.02] px-2.5 py-1">
              📍 {venue.address}
            </span>
          )}
          {venue.instagram && (
            <span className="rounded-full border border-line bg-white/[0.02] px-2.5 py-1">
              {venue.instagram}
            </span>
          )}
        </div>
      </section>

      {/* menu */}
      <main className="relative px-4 pt-2">
        {firstDeal && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-gold/40 bg-gradient-to-r from-gold/15 via-gold/[0.06] to-transparent px-4 py-3">
            <span className="serif text-[1.75rem] font-bold leading-none text-gold-2">
              −10%
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight text-cream">
                {lang === "el" ? "Πρώτη παραγγελία" : "First order"}
              </p>
              <p className="mt-0.5 text-[11px] leading-tight text-fog">
                {lang === "el"
                  ? "Κέρδισε −10% — στείλε την παραγγελία σου τώρα!"
                  : "Get −10% off — send your order before time runs out!"}
              </p>
            </div>
            <span className="rounded-full border border-gold/40 bg-ink px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-gold-2">
              {fsBadge}
            </span>
          </div>
        )}
        {history && history.orders.length > 0 && (
          <GuestHistoryPanel
            history={history}
            lang={lang}
            venueName={venue.name}
            tableLabel={table ? formatTableLabel(table.label) : ""}
          />
        )}
        {passport && passport.enabled && guestId && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-gold/25 bg-ink-2/70 px-4 py-3">
            <svg
              width="20"
              height="26"
              viewBox="0 0 24 28"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-gold-2"
            >
              <path
                d="M3 3h18l-7 9.5V19h-4v-6.5L3 3Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M12 19v4m-3.6 0h7.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-2">
                {lang === "el"
                  ? "Διαβατήριο κοκτέιλ"
                  : "Cocktail passport"}
              </p>
              <div className="mt-1.5 flex items-center gap-[5px]">
                {Array.from({ length: PASSPORT_EVERY }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-[7px] flex-1 rounded-full",
                      i < passport.progress
                        ? "bg-gold-2 shadow-[0_0_6px_rgba(212,175,55,0.8)]"
                        : "bg-line/80",
                    )}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-tight text-fog">
                {lang === "el"
                  ? passport.stamps === 0
                    ? "Κάθε 10ο κοκτέιλ κεράζεται από εμάς"
                    : passport.nextFreeIn === 1
                      ? "1 ακόμα κοκτέιλ → δωρεάν!"
                      : `${passport.nextFreeIn} ακόμα για ένα δωρεάν κοκτέιλ`
                  : passport.stamps === 0
                    ? "Every 10th cocktail is on us"
                    : passport.nextFreeIn === 1
                      ? "1 more cocktail → free!"
                      : `${passport.nextFreeIn} more cocktails to a free one`}
              </p>
            </div>
            <span className="font-mono text-lg font-bold tabular-nums text-gold-2">
              {passport.progress}/{PASSPORT_EVERY}
            </span>
          </div>
        )}
        {filteredCats.length === 0 && (
          <p className="py-16 text-center text-sm text-fog">
            Nothing matches “{query}”.
          </p>
        )}
        {filteredCats.map((c) => (
          <section
            key={c.id}
            id={`${CAT_ANCHOR}${c.id}`}
            ref={(el) => {
              sectionRefs.current[c.id] = el;
            }}
            className="scroll-mt-40 pt-6"
          >
            <div className="mb-3 flex items-end justify-between px-1">
              <div>
                <h2 className="serif text-2xl font-semibold text-cream">
                  {tName(c)}
                </h2>
                {tDesc(c) && (
                  <p className="mt-0.5 text-xs text-fog">{tDesc(c)}</p>
                )}
              </div>
              <div className="hairline mb-1.5 flex-1" />
            </div>
            <div className="grid grid-cols-1 gap-3">
              {c.items.map((it) => (
                <ItemCard
                  key={it.id}
                  item={it}
                  lang={lang}
                  currency={venue.currency}
                  tName={tName}
                  tDesc={tDesc}
                  pairs={pairsOf(it)}
                  onTap={() => {
                    if (!it.isAvailable) return;
                    setSheetItem(it);
                    setSheetQty(1);
                  }}
                  onQuickAdd={() => {
                    if (!it.isAvailable || !table) return;
                    addToCart(it, 1);
                  }}
                />
              ))}
            </div>
          </section>
        ))}

      </main>

      {/* bottom dock: wheel + waiter + cart (V2-style) */}
      {table && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
          <div
            className="mx-auto w-full max-w-md px-4 pb-4 pt-10"
            style={{
              background:
                "linear-gradient(180deg, transparent, rgba(10, 9, 8, 0.88) 30%)",
            }}
          >
            {cartCount > 0 && (
              <button
                onClick={() => setCartOpen(true)}
                className="btn btn-gold pointer-events-auto mb-2 flex w-full items-center gap-3 rounded-2xl py-3.5 text-sm shadow-glow"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink/85 text-[11px] font-extrabold text-gold-2">
                  {cartCount}
                </span>
                <span className="flex-1 text-left">View order</span>
                <span className="font-extrabold">
                  {money(grandTotal, venue.currency)}
                </span>
              </button>
            )}
            <div className="pointer-events-auto flex gap-2">
              <button
                onClick={() => setWheelOpen(true)}
                className="flex flex-1 items-center gap-2.5 rounded-2xl border border-gold/30 bg-ink-2/95 px-3 py-2.5 text-left"
              >
                <span className="text-xl text-gold-2">◎</span>
                <span className="leading-tight">
                  <b className="block text-xs font-bold text-cream">
                    {lang === "el" ? "Δεν ξέρω τι να πιω" : "Can't decide?"}
                  </b>
                  <small className="text-[10px] text-fog-2">
                    {lang === "el" ? "Ο τροχός αποφασίζει" : "Spin the wheel"}
                  </small>
                </span>
              </button>
              <button
                onClick={callWaiter}
                disabled={callState === "sent"}
                className={cn(
                  "flex items-center gap-1.5 rounded-2xl border px-3 text-xs font-bold backdrop-blur",
                  callState === "sent"
                    ? "border-green-500/40 bg-green-500/10 text-green-400"
                    : "border-line bg-ink-2/95 text-cream",
                )}
              >
                {callState === "sent" ? "✓" : "🔔"}
                {callState === "sent"
                  ? lang === "el"
                    ? "Κλήθηκε"
                    : "Called"
                  : lang === "el"
                    ? "Σερβιτόρο"
                    : "Waiter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* item full-screen modal */}
      {sheetItem && (
        <ItemModal
          key={sheetItem.id}
          item={sheetItem}
          lang={lang}
          currency={venue.currency}
          tName={tName}
          tDesc={tDesc}
          pairs={pairsOf(sheetItem)}
          qty={sheetQty}
          onQty={(v) => setSheetQty(Math.max(1, Math.min(20, v)))}
          onAdd={(mainQty, sideId) => {
            if (sideId) {
              const side = pairsOf(sheetItem).find((p) => p.id === sideId);
              if (side) addPair(sheetItem, side, mainQty);
            } else {
              addToCart(sheetItem, mainQty);
            }
          }}
          onClose={() => setSheetItem(null)}
        />
      )}

      {/* cart sheet */}
      {cartOpen && (
        <Sheet onClose={() => setCartOpen(false)}>
          <div className="p-5 pb-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="serif text-2xl font-semibold text-cream">Your order</h3>
              <button onClick={() => setCartOpen(false)} className="btn btn-ghost !px-3 !py-1.5 text-xs">
                ✕
              </button>
            </div>
            {Object.entries(cart).length === 0 ? (
              <p className="py-6 text-center text-sm text-fog">Nothing yet — tap a drink to add it.</p>
            ) : (
              <ul className="space-y-1">
                {Object.entries(cart).map(([id, qty]) => {
                  const it = itemById.get(id);
                  if (!it) return null;
                  const unit = pairUnitPrice(it);
                  const saved = unit < it.price;
                  return (
                    <li key={id} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-cream">{tName(it)}</p>
                        <p className="text-xs text-fog">
                          {money(unit, venue.currency)} each
                          {saved && (
                            <span className="ml-1.5 rounded border border-gold/40 bg-gold/15 px-1 py-px text-[9px] font-extrabold tracking-wider text-gold-2">
                              −10%
                            </span>
                          )}
                        </p>
                      </div>
                      <Stepper
                        compact
                        qty={qty}
                        onChange={(v) => {
                          if (v <= 0) removeFromCart(id);
                          else setCart((c) => ({ ...c, [id]: v }));
                        }}
                      />
                      <span className="w-16 text-right text-sm font-bold text-gold-2">
                        {money(unit * qty, venue.currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="Note for the bar (optional)…"
              className="input mt-4 min-h-16 resize-none text-sm"
            />
            {firstDeal && cartCount > 0 && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-gold/30 bg-gold/[0.08] px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-gold-2">
                  <span className="serif">−10%</span>
                  {lang === "el" ? "πρώτη παραγγελία" : "first order"}
                </span>
                <span className="font-mono text-xs font-bold tabular-nums text-gold-2">
                  −{money(firstDealCut, venue.currency)}
                </span>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-fog">Total</span>
              <span className="serif text-2xl font-semibold" style={{ color: acc }}>
                {money(grandTotal, venue.currency)}
              </span>
            </div>
            <button
              disabled={cartCount === 0 || sending || !table}
              onClick={() =>
                sendOrder(
                  Object.entries(cart).map(([itemId, qty]) => ({ itemId, qty })),
                  "menu",
                )
              }
              className="btn btn-gold mt-4 w-full !py-4 text-sm"
            >
              {sending
                ? "Sending…"
                : `Send order · ${money(grandTotal, venue.currency)}`}
            </button>
            <p className="mt-2 text-center text-[11px] text-fog-2">
              First order of your visit is confirmed by our staff first.
            </p>
          </div>
        </Sheet>
      )}

      {/* wheel overlay */}
      {wheelOpen && (
        <WheelOverlay
          items={menu.categories
            .flatMap((c) => c.items)
            .filter((i) => i.isAvailable)}
          slug={venue.slug}
          tableId={table?.id ?? null}
          currency={venue.currency}
          lang={lang}
          onClose={() => setWheelOpen(false)}
          onOrder={(it) =>
            sendOrder([{ itemId: it.id, qty: 1 }], "wheel").then(() =>
              setWheelOpen(false),
            )
          }
        />
      )}

      {/* table session — the bill for the whole sitting, always reachable.
          This is the fix for "I cancelled on Viva and had no way back to
          paying": the entry point no longer depends on placing a new order. */}
      {sessionOpen && table && (
        <Sheet onClose={() => setSessionOpen(false)}>
          <div className="space-y-4 p-5 pb-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-fog">
                  {lang === "el" ? "Η παρέα σας" : "Your sitting"}
                </p>
                <h2 className="mt-1 font-display text-2xl text-cream">
                  {formatTableLabel(table.label)}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-fog">
                  {lang === "el"
                    ? "Σαρώσατε το QR και είστε σε αυτό το τραπέζι. Πληρώστε εδώ όλο τον λογαριασμό της παρέας — ό,τι έχετε ήδη πληρώσει αφαιρείται."
                    : "You scanned the QR, so this is your table. Pay the whole table's bill here — anything already paid is deducted."}
                </p>
              </div>
              <button
                onClick={() => setSessionOpen(false)}
                className="shrink-0 rounded-full border border-line px-2.5 py-1 text-sm text-fog"
                aria-label={lang === "el" ? "Κλείσιμο" : "Close"}
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl border border-line bg-ink-2/60 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-fog">
                  {lang === "el" ? "Προς πληρωμή" : "Still to pay"}
                </span>
                <span className="font-display text-3xl font-extrabold text-cream">
                  {tableDue === null
                    ? "—"
                    : `€${tableDue.toFixed(2)}`}
                </span>
              </div>
              {tableDue !== null && tableDue <= 0 && (
                <p className="mt-2 text-xs font-bold text-gold-2">
                  {lang === "el"
                    ? "Όλα πληρωμένα ✓ Ευχαριστούμε!"
                    : "All settled ✓ Thank you!"}
                </p>
              )}
              {/* Itemised breakdown from the server. Comes from the TABLE, not
                  from this phone's guest history, so every phone sees the same
                  lines — a guest who scanned on a fresh phone still knows what
                  the total is made of. */}
              {billLines.length > 0 && tableDue !== null && tableDue > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
                  {billLines.map((l) => (
                    <li
                      key={`${l.name}-${l.price}`}
                      className="flex items-baseline justify-between gap-3 text-xs"
                    >
                      <span className="text-fog">
                        <span className="font-extrabold text-cream">
                          {l.qty}×
                        </span>{" "}
                        {l.name}
                      </span>
                      <span className="shrink-0 font-bold text-cream">
                        €{(l.price * l.qty).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {history && history.orders.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-fog">
                  {lang === "el" ? "Οι παραγγελίες σας" : "Your orders"}
                </p>
                <ul className="divide-y divide-line/60 rounded-2xl border border-line bg-ink-2/40">
                  {history.orders.map((o) => (
                    <li key={o.id} className="px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-cream">
                          {o.lines.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                        </span>
                        <span className="shrink-0 text-xs font-extrabold text-gold-2">
                          €{o.total.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-fog">
                        {o.createdAt.slice(11, 16)} ·{" "}
                        {o.status === "paid"
                          ? lang === "el"
                            ? "πληρωμένο"
                            : "paid"
                          : lang === "el"
                            ? o.status === "served"
                              ? "σερβιρισμένο"
                              : "σε εξέλιξη"
                            : o.status === "served"
                              ? "served"
                              : "in progress"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {venue.paymentsEnabled && tableDue !== null && tableDue > 0 && (
              <button
                onClick={() => {
                  setSessionOpen(false);
                  void startPayment();
                }}
                disabled={paying}
                className="w-full rounded-2xl px-5 py-4 text-sm font-extrabold uppercase tracking-wide text-ink disabled:opacity-60"
                style={{ background: acc }}
              >
                {paying
                  ? lang === "el"
                    ? "Μετάβαση…"
                    : "Redirecting…"
                  : lang === "el"
                    ? `Πληρωμή €${tableDue.toFixed(2)} με κάρτα`
                    : `Pay €${tableDue.toFixed(2)} by card`}
              </button>
            )}
            <p className="text-center text-[10px] leading-relaxed text-fog">
              {lang === "el"
                ? "Η πληρωμή γίνεται με ασφάλεια. Τα χρήματα πάνε απευθείας στο κατάστημα."
                : "Secure card payment. The money goes straight to the venue."}
            </p>
          </div>
        </Sheet>
      )}

      {/* toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-6">
          <p className="animate-pop rounded-full border border-gold/40 bg-ink-2 px-4 py-2 text-sm text-gold-2 shadow-glow">
            {toast}
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- rows */

function ItemCard(props: {
  item: ItemPublic;
  lang: Lang;
  currency: string;
  tName: (it: { name: string; nameAlt: string }) => string;
  tDesc: (it: { description: string; descriptionAlt: string }) => string;
  pairs: ItemPublic[];
  onTap: () => void;
  onQuickAdd: () => void;
}) {
  const { item, lang, currency, tName, tDesc, pairs, onTap, onQuickAdd } = props;
  const soldOut = !item.isAvailable;
  const alt =
    lang === "en" && item.nameAlt && item.nameAlt !== item.name ? item.nameAlt : null;
  return (
    <button
      onClick={onTap}
      disabled={soldOut}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-2xl border border-line bg-white/[0.02] p-3 text-left transition-colors",
        !soldOut && "hover:border-gold/40 active:bg-gold/[0.06]",
        soldOut && "opacity-45 grayscale",
      )}
    >
      <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl border border-line/60 bg-ink-2">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={tName(item)}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-gold/20 to-transparent">
            <span className="serif text-2xl text-gold-2/70">{item.name.charAt(0)}</span>
          </div>
        )}
        {item.tags[0] && (
          <span className="absolute left-1.5 top-1.5 rounded border border-gold/40 bg-ink-2/90 px-1 py-px text-[9px] font-extrabold tracking-wider text-gold-2 backdrop-blur-sm">
            {item.tags[0]}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-cream">{tName(item)}</p>
        {alt && <p className="truncate text-[11px] italic text-fog-2">{alt}</p>}
        {tDesc(item) && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-fog">
            {tDesc(item)}
          </p>
        )}
        <p className={cn("mt-1 text-sm font-extrabold", soldOut ? "text-fog-2" : "text-gold-2")}>
          {soldOut ? "Sold out" : money(item.price, currency)}
        </p>
      </div>
      {!soldOut && pairs.length > 0 && (
        <span className="shrink-0 rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-gold-2">
          pair −10%
        </span>
      )}
      {!soldOut && (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Add ${tName(item)}`}
          onClick={(e) => {
            e.stopPropagation();
            onQuickAdd();
          }}
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-gold/50 text-lg font-bold text-gold-2 transition-colors group-active:bg-gold/20"
        >
          +
        </span>
      )}
    </button>
  );
}

function Stepper(props: { qty: number; onChange: (v: number) => void; compact?: boolean }) {
  const { qty, onChange, compact } = props;
  const cls = compact
    ? "h-7 w-7 rounded-md text-sm"
    : "h-9 w-9 rounded-lg text-base";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        className={cn("btn btn-ghost !p-0", cls)}
        aria-label="Decrease"
      >
        −
      </button>
      <span className={cn("text-center font-extrabold text-cream", compact ? "w-6 text-sm" : "w-8")}>
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        className={cn("btn btn-ghost !p-0", cls)}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
      />
      <div className="animate-sheet-up relative w-full max-w-md rounded-t-3xl border-t border-gold/25 bg-panel shadow-[0_-10px_60px_rgba(0,0,0,0.6)]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" />
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- item modal */

function ItemModal(props: {
  item: ItemPublic;
  lang: Lang;
  currency: string;
  tName: (it: { name: string; nameAlt: string }) => string;
  tDesc: (it: { description: string; descriptionAlt: string }) => string;
  pairs: ItemPublic[];
  qty: number;
  onQty: (v: number) => void;
  onAdd: (mainQty: number, sideId: string | null) => void;
  onClose: () => void;
}) {
  const {
    item,
    lang,
    currency,
    tName,
    tDesc,
    pairs,
    qty,
    onQty,
    onAdd,
    onClose,
  } = props;
  const [sideId, setSideId] = useState<string | null>(null);
  const soldOut = !item.isAvailable;
  const alt =
    lang === "en" && item.nameAlt && item.nameAlt !== item.name ? item.nameAlt : null;
  const side = sideId ? (pairs.find((p) => p.id === sideId) ?? null) : null;
  const sideDisc = side ? Math.round(side.price * PAIR_DISCOUNT * 100) / 100 : 0;
  const total = Math.round((item.price * qty + sideDisc) * 100) / 100;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-black/75 backdrop-blur-sm"
      />
      <div className="animate-sheet-up relative flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-gold/25 bg-panel shadow-[0_-10px_60px_rgba(0,0,0,0.6)] sm:rounded-3xl">
        {/* hero photo */}
        <div className="relative h-56 w-full shrink-0 bg-ink-2 sm:h-64">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={tName(item)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-gold/25 via-ink-2 to-ink-2">
              <span className="serif text-7xl text-gold-2/50">
                {item.name.charAt(0)}
              </span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-panel to-transparent" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-line bg-ink-2/85 text-lg text-cream backdrop-blur-sm"
          >
            ✕
          </button>
          {item.tags.length > 0 && (
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 pr-3">
              {item.tags.map((t) => (
                <span
                  key={t}
                  className="rounded border border-gold/40 bg-ink-2/85 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-gold-2 backdrop-blur-sm"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="serif text-2xl font-semibold leading-tight text-cream">
                {tName(item)}
              </h3>
              {alt && <p className="mt-0.5 text-xs italic text-fog-2">{alt}</p>}
            </div>
            <span className="serif shrink-0 text-2xl font-semibold text-gold-2">
              {money(item.price, currency)}
            </span>
          </div>
          {tDesc(item) && (
            <p className="mt-3 text-sm leading-relaxed text-fog">{tDesc(item)}</p>
          )}
          {item.allergens.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              {item.allergens.map((a) => (
                <span key={a} title={`Allergen: ${a}`} className="text-sm">
                  {allergenEmoji(a)}
                </span>
              ))}
            </div>
          )}
          {pairs.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-fog-2">
                {lang === "el" ? "Ταιριάζει · −10%" : "Pairs with · −10%"}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {pairs.map((p) => {
                  const on = sideId === p.id;
                  const disc = Math.round(p.price * PAIR_DISCOUNT * 100) / 100;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSideId(on ? null : p.id)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        on
                          ? "border-gold/70 bg-gold/10"
                          : "border-line bg-white/[0.02] active:bg-gold/[0.06]",
                      )}
                    >
                      <span className="serif min-w-0 flex-1 truncate text-sm font-bold text-cream">
                        {tName(p)}
                      </span>
                      <span className="shrink-0 text-xs text-fog">
                        {on ? (
                          <>
                            <span className="line-through opacity-60">
                              {money(p.price, currency)}
                            </span>
                            <span className="ml-1.5 font-extrabold text-gold-2">
                              {money(disc, currency)}
                            </span>
                          </>
                        ) : (
                          money(p.price, currency)
                        )}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1 py-px text-[9px] font-extrabold tracking-wider",
                          on
                            ? "border-gold/60 bg-gold/20 text-gold-2"
                            : "border-gold/30 bg-gold/10 text-gold-2",
                        )}
                      >
                        −10%
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-fog-2">
                {lang === "el"
                  ? "Προσθέστε το συνοδευτικό — η έκπτωση −10% εφαρμόζεται αυτόματα."
                  : "Add a side and the −10% pair deal applies automatically."}
              </p>
            </div>
          )}
          {/* footer */}
          <div className="mt-5 border-t border-line/70 pt-3">
            <div className="flex items-center justify-between gap-3">
              <Stepper qty={qty} onChange={onQty} />
              <div className="min-w-0 text-right">
                {side && (
                  <p className="text-[10px] text-fog-2">
                    {lang === "el"
                      ? `ζεύγος −10% · κερδίζετε ${money(Math.round((side.price - sideDisc) * 100) / 100, currency)}`
                      : `pair −10% · save ${money(Math.round((side.price - sideDisc) * 100) / 100, currency)}`}
                  </p>
                )}
                <p className="serif text-lg font-semibold text-gold-2">
                  {money(total, currency)}
                </p>
              </div>
            </div>
            <button
              onClick={() => onAdd(qty, sideId)}
              disabled={soldOut}
              className="btn btn-gold mt-3 w-full !py-3.5 text-sm disabled:opacity-40"
            >
              {side
                ? `Add with ${tName(side)} · ${money(total, currency)}`
                : `Add to order · ${money(total, currency)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- order screen */

const STEPS: { key: string; label: (l: Lang) => string }[] = [
  { key: "confirmed", label: (l) => (l === "el" ? "Επιβεβαιώθηκε" : "Confirmed") },
  { key: "making", label: (l) => (l === "el" ? "Ετοιμάζεται" : "Being made") },
  { key: "served", label: (l) => (l === "el" ? "Σερβιρίστηκε" : "Served") },
];

function OrderScreen(props: {
  order: OrderView;
  lang: Lang;
  tableLabel: string;
  venueName: string;
  accent: string;
  onBack: () => void;
  onCall: () => void;
  callState: "idle" | "sent";
  /** Set only when the venue has pay-at-table switched on. */
  onPay?: () => void;
  paying?: boolean;
  /** Live sum of the whole table session. The "Pay" button charges the table,
   *  not this one order, so it must show that number — not order.total. */
  payAmount?: number;
}) {
  const { order, lang, tableLabel, venueName, accent, onBack, onCall, callState, onPay, paying, payAmount } = props;
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setTick(Date.now()), 30000);
    return () => window.clearInterval(iv);
  }, []);
  void tick;

  const declined = order.status === "declined";
  const terminal = ["served", "closed", "declined"].includes(order.status);
  const progress: Record<string, number> = {
    pending_confirm: 0,
    new: 0,
    making: 1,
    served: 2,
    closed: 2,
    declined: -1,
  };
  const step = progress[order.status] ?? 0;
  const isPending = order.status === "pending_confirm";

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-16 pt-10 text-center text-cream">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-72 max-w-md bg-[radial-gradient(closest-side,rgba(201,164,92,0.16),transparent)]" />
      <div className="relative">
        <p className="serif text-sm tracking-wide text-fog">{venueName}</p>
        <p className="mt-1 text-xs text-fog">Order for {tableLabel}</p>

        <div className="animate-pop mt-8">
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2"
            style={{
              borderColor: declined ? "#e0615a" : accent,
              boxShadow: declined ? "none" : `0 0 36px color-mix(in srgb, ${accent} 45%, transparent)`,
              animation: declined ? undefined : "pulseGold 2.4s ease-in-out infinite",
            }}
          >
            <span className="text-3xl">
              {declined ? "⚠️" : isPending ? "🕐" : order.status === "served" || order.status === "closed" ? "🍸" : "👨‍🍳"}
            </span>
          </div>
        </div>

        <h1 className="serif mt-5 text-3xl font-semibold">
          {declined
            ? "Order not confirmed"
            : isPending
              ? "Waiting for staff…"
              : order.status === "making"
                ? "The bar is on it!"
                : order.status === "served" || order.status === "closed"
                  ? "Enjoy! 🥂"
                  : "Order received!"}
        </h1>

        <div className="mt-2 inline-flex items-baseline gap-2">
          <span className="serif text-lg text-gold-2">Order #{order.ref}</span>
          <span className="text-xs text-fog-2">
            · {money(order.total)} · {timeAgo(order.createdAt)}
          </span>
        </div>

        {isPending && (
          <p className="mx-auto mt-4 max-w-xs rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold-2">
            You&apos;re the first order of this visit — our staff will confirm
            you&apos;re seated, then it goes straight to the bar.
          </p>
        )}
        {declined && (
          <p className="mx-auto mt-4 max-w-xs rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            This order could not be confirmed. Please speak to the staff.
          </p>
        )}

        {!declined && (
          <div className="mx-auto mt-8 max-w-sm">
            <div className="flex items-center">
              {STEPS.map((s, i) => (
                <div key={s.key} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold",
                      step >= i
                        ? "border-transparent text-ink"
                        : "border-line text-fog-2",
                    )}
                    style={step >= i ? { background: accent } : undefined}
                  >
                    {step > i ? "✓" : i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={cn("mx-1 h-0.5 flex-1 rounded", step > i ? "" : "bg-line")}
                      style={step > i ? { background: accent } : undefined}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wide text-fog">
              {STEPS.map((s) => (
                <span key={s.key} className="w-16 first:text-left last:text-right">
                  {s.label(lang)}
                </span>
              ))}
            </div>
          </div>
        )}

        {order.lines.length > 0 && (
          <div className="mt-8 rounded-2xl border border-line bg-white/[0.02] p-4 text-left">
            {order.lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between py-1 text-sm">
                <span className="text-fog">
                  <span className="font-extrabold text-gold-2">{l.qty}×</span>{" "}
                  {l.name}
                </span>
                <span className="text-cream">{money(l.price * l.qty)}</span>
              </div>
            ))}
            <div className="hairline my-2" />
            <div className="flex items-center justify-between text-sm font-bold">
              <span>Total</span>
              <span style={{ color: accent }}>{money(order.total)}</span>
            </div>
          </div>
        )}

        {!terminal && (
          <p className="mt-5 animate-pulse text-xs text-fog">
            {lang === "el" ? "Η κατάσταση ανανεώνεται αυτόματα…" : "Status updates automatically…"}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-2.5">
          {onPay && !declined && (
            <button
              onClick={onPay}
              disabled={paying}
              className="btn btn-gold"
            >
              {paying
                ? lang === "el"
                  ? "Μετάβαση στην πληρωμή…"
                  : "Opening payment…"
                : lang === "el"
                  ? `Πληρωμή ${money(payAmount ?? order.total)}`
                  : `Pay ${money(payAmount ?? order.total)}`}
            </button>
          )}
          {onPay && (
            <p className="text-[11px] leading-relaxed text-fog-2">
              {payAmount !== undefined && payAmount > order.total + 0.005
                ? lang === "el"
                  ? `Περιλαμβάνει και τους προηγούμενους λογαριασμούς του τραπεζιού σας (αυτή η παραγγελία: ${money(order.total)}).`
                  : `Includes your table's earlier orders (this order alone: ${money(order.total)}).`
                : lang === "el"
                  ? "Πληρωμή με κάρτα ή Apple Pay απευθείας στο κατάστημα."
                  : "Card or Apple Pay, paid directly to the venue."}
            </p>
          )}
          {!terminal && (
            <button onClick={onCall} disabled={callState === "sent"} className={cn("btn", callState === "sent" ? "btn-good" : "btn-ghost")}>
              {callState === "sent" ? "✓ Waiter called" : "🛎️ Call waiter"}
            </button>
          )}
          <button onClick={onBack} className="btn btn-gold">
            {terminal ? "Back to the menu" : "Keep browsing"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- wheel */

const WHEEL_COLORS = ["#c9a45c", "#7c6638", "#e6cf9a", "#54462a", "#a9863f", "#6f5d34"];

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
}

function WheelOverlay(props: {
  items: ItemPublic[];
  slug: string;
  tableId: string | null;
  currency: string;
  lang: Lang;
  onClose: () => void;
  onOrder: (it: ItemPublic) => void;
}) {
  const { items, slug, tableId, currency, lang, onClose, onOrder } = props;
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<ItemPublic | null>(null);
  const rotRef = useRef(0);

  const seg = items.length > 0 ? 360 / items.length : 0;

  function spin() {
    if (spinning || items.length === 0) return;
    const idx = Math.floor(Math.random() * items.length);
    const center = idx * seg + seg / 2;
    const need = (360 - (center % 360)) % 360;
    const cur = rotRef.current % 360;
    const delta = (need - cur + 360) % 360;
    const next = rotRef.current + 360 * 5 + delta;
    setResult(null);
    setSpinning(true);
    rotRef.current = next;
    setRot(next);
    fetch("/api/wheel-spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, tableId, itemId: items[idx].id }),
    }).catch(() => undefined);
    window.setTimeout(() => {
      setSpinning(false);
      setResult(items[idx]);
    }, 4300);
  }

  const available = items.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in" />
      <div className="animate-pop relative w-full max-w-sm rounded-3xl border border-gold/25 bg-panel p-6 text-center shadow-glow">
        <button onClick={onClose} className="btn btn-ghost absolute right-3 top-3 !px-2.5 !py-1 text-xs">✕</button>
        <p className="text-2xl">🎡</p>
        <h3 className="serif text-2xl font-semibold text-cream">Wheel of Luck</h3>
        <p className="mt-1 text-xs text-fog">
          {lang === "el" ? "Ο οίκος διαλέγει το ποτό σου!" : "The house picks your drink!"}
        </p>

        {!available && (
          <p className="py-8 text-sm text-fog">No drinks available right now.</p>
        )}

        {available && (
          <div className="relative mx-auto mt-6 h-60 w-60">
            {/* pointer */}
            <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1">
              <svg width="26" height="26" viewBox="0 0 26 26">
                <path d="M13 26 L2 6 L24 6 Z" fill="#e0615a" />
                <circle cx="13" cy="9" r="3.4" fill="#0e0d0b" />
              </svg>
            </div>
            <div
              className="h-full w-full rounded-full shadow-glow transition-transform duration-[4200ms]"
              style={{
                transform: `rotate(${rot}deg)`,
                transitionTimingFunction: "cubic-bezier(0.12, 0.82, 0.18, 1)",
                transitionProperty: spinning ? "transform" : "none",
              }}
            >
              <svg viewBox="-110 -110 220 220" className="h-full w-full">
                {items.map((it, i) => (
                  <g key={it.id} transform={`rotate(${i * seg - 90})`}>
                    <path
                      d={`M0 0 L100 0 A100 100 0 ${seg > 180 ? 1 : 0} 1 ${polar(100, seg).x} ${polar(100, seg).y} Z`}
                      fill={WHEEL_COLORS[i % WHEEL_COLORS.length]}
                      stroke="#0e0d0b"
                      strokeWidth="1.5"
                    />
                  </g>
                ))}
                <circle cx="0" cy="0" r="34" fill="#17130a" stroke="#c9a45c" strokeWidth="2" />
                <text x="0" y="7" textAnchor="middle" fontSize="26">🍸</text>
              </svg>
            </div>
          </div>
        )}

        {!result && (
          <button onClick={spin} disabled={spinning || !available} className="btn btn-gold mt-6 w-full !py-3.5">
            {spinning ? "Picking your drink…" : "Spin"}
          </button>
        )}

        {result && (
          <div className="animate-pop mt-5 rounded-2xl border border-gold/30 bg-gold/10 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gold-2">
              The wheel chose…
            </p>
            <p className="serif mt-1 text-2xl font-semibold text-cream">
              {lang === "el" && result.nameAlt ? result.nameAlt : result.name}
            </p>
            <p className="mt-1 text-sm" style={{ color: "#c9a45c" }}>
              {money(result.price, currency)}
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => { setResult(null); spin(); }} disabled={spinning} className="btn btn-ghost flex-1">
                Spin again
              </button>
              <button onClick={() => onOrder(result)} className="btn btn-gold flex-1">
                Add to order
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Your orders at this table" — the thing a guest actually wants to see.
 *
 * Shown above the passport whenever this device has ordered before. Collapsed
 * to a one-line summary so it never pushes the menu off-screen, expanded to
 * full line-item receipts. Driven purely by /api/guest/orders (server truth
 * keyed on the guest UUID in localStorage), so a rescan or a reload brings the
 * same list back on the same phone.
 */
function GuestHistoryPanel({
  history,
  lang,
  venueName,
  tableLabel,
}: {
  history: GuestOrderHistoryView;
  lang: "en" | "el";
  venueName: string;
  tableLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const el = lang === "el";
  const count = history.orders.length;
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-gold/25 bg-ink-2/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-gold-2"
        >
          <path
            d="M4 6h16M4 12h16M4 18h10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold-2">
            {el ? "Οι παραγγελίες σου" : "Your orders"}
          </p>
          <p className="truncate text-sm text-paper/80">
            {el
              ? `${count} ${count === 1 ? "παραγγελία" : "παραγγελίες"} · ${money(history.total)}`
              : `${count} ${count === 1 ? "order" : "orders"} · ${money(history.total)}`}
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-paper/50 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="border-t border-gold/15">
          <p className="px-4 pt-3 text-[10px] uppercase tracking-[0.12em] text-paper/40">
            {venueName} · {tableLabel}
          </p>
          <ul className="px-4 pb-1 pt-2">
            {history.orders.map((o) => (
              <li key={o.id} className="border-b border-paper/10 py-3 last:border-b-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-paper/50">
                    #{o.id.slice(-4)} · {timeAgo(o.createdAt)}
                  </span>
                  <span className="text-sm font-semibold text-gold-2">
                    {money(o.total)}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {o.lines.map((l, i) => (
                    <li
                      key={`${o.id}-${i}`}
                      className="flex items-baseline justify-between gap-2 text-sm text-paper/80"
                    >
                      <span className="truncate">
                        {l.qty > 1 ? `${l.qty}× ` : ""}
                        {l.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-paper/60">
                        {money(l.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between border-t border-gold/20 px-4 py-3">
            <span className="text-sm font-semibold text-paper/80">
              {el ? "Σύνολο" : "Total"}
            </span>
            <span className="text-base font-bold text-gold-2">
              {money(history.total)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
