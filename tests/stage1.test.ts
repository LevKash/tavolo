import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db, pool } from "@/db";
import {
  categories,
  menuItems,
  orderLines,
  orders,
  rateLimits,
  tableSessions,
  tables,
  users,
  venues,
} from "@/db/schema";
import { POST as orderPOST } from "@/app/api/order/route";
import { GET as orderGET } from "@/app/api/orders/[id]/route";
import { POST as confirmPOST } from "@/app/api/bar/orders/[id]/confirm/route";
import { POST as declinePOST } from "@/app/api/bar/orders/[id]/decline/route";
import { expireIdleSessions, guestOrderHistory, placeOrder } from "@/lib/core";
import { hitLimit, peekLimit } from "@/lib/rate-limit";
import { randomPin } from "@/lib/site";

const createdVenues: string[] = [];
const createdUsers: string[] = [];
const PIN = "739104";

async function fixture(opts: { promos?: boolean } = {}) {
  const tag = randomUUID().slice(0, 8);
  const [user] = await db
    .insert(users)
    .values({ email: `s1-${tag}@test.local`, name: "T", password_hash: "x" })
    .returning();
  const [venue] = await db
    .insert(venues)
    .values({
      owner_id: user.id,
      slug: `s1-${tag}`,
      name: "Test Bar",
      is_published: true,
      status: "active",
      bar_pin: PIN,
      promos_enabled: Boolean(opts.promos),
    })
    .returning();
  const [table] = await db.insert(tables).values({ venue_id: venue.id, label: "5" }).returning();
  const [cat] = await db.insert(categories).values({ venue_id: venue.id, name: "Menu" }).returning();
  const mk = async (name: string, price: number) =>
    (
      await db
        .insert(menuItems)
        .values({ venue_id: venue.id, category_id: cat.id, name, price })
        .returning()
    )[0];
  // Names from PAIR_MAP: Truffle Fries pairs with Ambrosia Sour, not with Beer.
  const sour = await mk("Ambrosia Sour", 10);
  const fries = await mk("Truffle Fries", 6);
  const beer = await mk("Beer", 4);
  createdVenues.push(venue.id);
  createdUsers.push(user.id);
  return { venue, table, sour, fries, beer };
}

afterAll(async () => {
  if (createdVenues.length) {
    const ids = (
      await db.select({ id: orders.id }).from(orders).where(inArray(orders.venue_id, createdVenues))
    ).map((o) => o.id);
    if (ids.length) await db.delete(orderLines).where(inArray(orderLines.order_id, ids));
    await db.delete(venues).where(inArray(venues.id, createdVenues));
  }
  if (createdUsers.length) await db.delete(users).where(inArray(users.id, createdUsers));
  await db.delete(rateLimits).where(like(rateLimits.key, "test:%"));
  await pool.end();
});

const post = (url: string, body: unknown, ip = "198.51.100.77") =>
  new NextRequest(`https://x.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

describe("discounts are decided by the server", () => {
  it("a venue without promotions gives no discount, whatever the request claims", async () => {
    const f = await fixture({ promos: false });
    const r = await placeOrder({
      venueId: f.venue.id,
      tableId: f.table.id,
      lines: [
        { itemId: f.sour.id, qty: 1 },
        { itemId: f.fries.id, qty: 1, pairOf: f.sour.id },
      ],
      firstSeenAt: Date.now(),
    });
    expect(r.total).toBe(16);
    expect(r.firstOrderDiscount).toBe(false);
  });

  it("with promotions on, only a real pair gets -10%", async () => {
    const f = await fixture({ promos: true });
    const real = await placeOrder({
      venueId: f.venue.id,
      tableId: f.table.id,
      lines: [
        { itemId: f.sour.id, qty: 1 },
        { itemId: f.fries.id, qty: 1, pairOf: f.sour.id },
      ],
    });
    expect(real.total).toBe(15.4); // 10 + 6 * 0.9

    const g = await fixture({ promos: true });
    const fake = await placeOrder({
      venueId: g.venue.id,
      tableId: g.table.id,
      // Every line claims to be a pair of something else in the order.
      lines: [
        { itemId: g.beer.id, qty: 1, pairOf: g.sour.id },
        { itemId: g.sour.id, qty: 1, pairOf: g.beer.id },
        { itemId: g.fries.id, qty: 1, pairOf: g.beer.id },
      ],
    });
    expect(fake.total).toBe(20);
  });

  it("the first-order deal needs a fresh sitting, not just a fresh client clock", async () => {
    const fresh = await fixture({ promos: true });
    const a = await placeOrder({
      venueId: fresh.venue.id,
      tableId: fresh.table.id,
      lines: [{ itemId: fresh.beer.id, qty: 5 }],
      firstSeenAt: Date.now(),
    });
    expect(a.firstOrderDiscount).toBe(true);
    expect(a.total).toBe(18);

    const stale = await fixture({ promos: true });
    await db.insert(tableSessions).values({
      venue_id: stale.venue.id,
      table_id: stale.table.id,
      opened_at: new Date(Date.now() - 30 * 60_000),
    });
    const b = await placeOrder({
      venueId: stale.venue.id,
      tableId: stale.table.id,
      lines: [{ itemId: stale.beer.id, qty: 5 }],
      firstSeenAt: Date.now(), // forged "I just arrived"
    });
    expect(b.firstOrderDiscount).toBe(false);
    expect(b.total).toBe(20);
  });
});

describe("malformed requests are 4xx, never a database error", () => {
  it("POST /api/order rejects bad ids, fractional quantities and junk lines", async () => {
    const f = await fixture();
    const base = { slug: f.venue.slug, tableId: f.table.id };
    const cases: unknown[] = [
      { ...base, tableId: "not-a-uuid", lines: [{ itemId: f.beer.id, qty: 1 }] },
      { ...base, lines: [{ itemId: "abc", qty: 1 }] },
      { ...base, lines: [{ itemId: f.beer.id, qty: 1.5 }] },
      { ...base, lines: [{ itemId: f.beer.id, qty: "2" }] },
      { ...base, lines: [null] },
      { ...base, lines: "x" },
      { ...base, lines: Array.from({ length: 41 }, () => ({ itemId: f.beer.id, qty: 1 })) },
      [],
    ];
    for (const body of cases) {
      const res = await orderPOST(post("/api/order", body));
      expect(res.status).toBe(400);
    }
    const none = await db.select().from(orders).where(eq(orders.venue_id, f.venue.id));
    expect(none).toHaveLength(0);

    const ok = await orderPOST(
      post("/api/order", { ...base, lines: [{ itemId: f.beer.id, qty: 2 }], note: 123 }),
    );
    expect(ok.status).toBe(200);
  });

  it("GET /api/orders/<junk> is a 404", async () => {
    const res = await orderGET(new Request("https://x.test/api/orders/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(404);
  });

  it("a table cannot be flooded with orders", async () => {
    const f = await fixture();
    const body = { slug: f.venue.slug, tableId: f.table.id, lines: [{ itemId: f.beer.id, qty: 1 }] };
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) statuses.push((await orderPOST(post("/api/order", body))).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(12);
    expect(statuses.slice(12)).toEqual([429, 429]);
  });
});

describe("two bar screens tapping at once", () => {
  const act = (
    handler: typeof confirmPOST,
    f: Awaited<ReturnType<typeof fixture>>,
    orderId: string,
    ip: string,
  ) =>
    handler(post(`/api/bar/orders/${orderId}/x`, { slug: f.venue.slug, pin: PIN }, ip), {
      params: Promise.resolve({ id: orderId }),
    });

  it("confirm + decline on the same order: exactly one wins", async () => {
    const f = await fixture();
    const o = await placeOrder({
      venueId: f.venue.id,
      tableId: f.table.id,
      lines: [{ itemId: f.beer.id, qty: 1 }],
    });
    const [a, b] = await Promise.all([
      act(confirmPOST, f, o.orderId, "198.51.100.1"),
      act(declinePOST, f, o.orderId, "198.51.100.2"),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const [row] = await db.select().from(orders).where(eq(orders.id, o.orderId));
    const [session] = await db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, row.session_id));
    // Never an accepted order stranded in a closed sitting.
    if (row.status === "new") expect(session.status).toBe("open");
    else expect(row.status).toBe("declined");
  });

  it("a junk order id is a 404", async () => {
    const f = await fixture();
    const res = await act(confirmPOST, f, "abc", "198.51.100.3");
    expect(res.status).toBe(404);
  });
});

describe("idle tables", () => {
  async function sitting(paid: boolean) {
    const f = await fixture();
    const o = await placeOrder({
      venueId: f.venue.id,
      tableId: f.table.id,
      lines: [{ itemId: f.beer.id, qty: 2 }],
    });
    const fourHoursAgo = new Date(Date.now() - 4 * 3600_000);
    await db
      .update(orders)
      .set({
        status: "served",
        created_at: fourHoursAgo,
        payment_status: paid ? "paid" : "unpaid",
      })
      .where(eq(orders.id, o.orderId));
    await db
      .update(tableSessions)
      .set({ opened_at: fourHoursAgo })
      .where(eq(tableSessions.table_id, f.table.id));
    await expireIdleSessions(f.venue.id);
    const [s] = await db.select().from(tableSessions).where(eq(tableSessions.table_id, f.table.id));
    const [row] = await db.select().from(orders).where(eq(orders.id, o.orderId));
    return { session: s.status, order: row.status };
  }

  it("an unpaid tab stays open after 4 quiet hours (a beach-bar afternoon)", async () => {
    expect(await sitting(false)).toEqual({ session: "open", order: "served" });
  });

  it("a fully paid, forgotten table still closes by itself", async () => {
    expect(await sitting(true)).toEqual({ session: "closed", order: "closed" });
  });
});

describe("shared rate limiter", () => {
  it("counts in the database and limits per key", async () => {
    const key = `test:${randomUUID()}`;
    expect((await hitLimit(key, 2, 60_000)).limited).toBe(false);
    expect((await peekLimit(key, 2, 60_000)).limited).toBe(false);
    expect((await hitLimit(key, 2, 60_000)).limited).toBe(false);
    expect((await peekLimit(key, 2, 60_000)).limited).toBe(true);
    const third = await hitLimit(key, 2, 60_000);
    expect(third.limited).toBe(true);
    expect(third.retryAfter).toBeGreaterThan(0);
    expect((await hitLimit(`test:${randomUUID()}`, 2, 60_000)).limited).toBe(false);
  });

  it("starts a new window when the old one has ended", async () => {
    const key = `test:${randomUUID()}`;
    await hitLimit(key, 1, 60_000);
    await hitLimit(key, 1, 60_000);
    await db
      .update(rateLimits)
      .set({ window_start: new Date(Date.now() - 120_000) })
      .where(eq(rateLimits.key, key));
    expect((await peekLimit(key, 1, 60_000)).limited).toBe(false);
    const again = await hitLimit(key, 1, 60_000);
    expect(again).toMatchObject({ count: 1, limited: false });
  });
});

describe("new venue PINs", () => {
  it("are six digits and never a repeated digit", () => {
    for (let i = 0; i < 200; i++) {
      const pin = randomPin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(pin).not.toMatch(/^(\d)\1+$/);
    }
  });
});

describe("guest order history window", () => {
  it("a phone sees orders from the last 12 hours and not yesterday's", async () => {
    const f = await fixture();
    const guestId = randomUUID();
    const place = () =>
      placeOrder({
        venueId: f.venue.id,
        tableId: f.table.id,
        lines: [{ itemId: f.beer.id, qty: 1 }],
        guestId,
      });
    const old = await place();
    const recent = await place();
    // Push one order 13 hours into the past, as if it were last night's.
    await db
      .update(orders)
      .set({ created_at: new Date(Date.now() - 13 * 60 * 60 * 1000) })
      .where(eq(orders.id, old.orderId));

    const h = await guestOrderHistory(f.venue.id, guestId);
    expect(h.orders.map((o) => o.id)).toEqual([recent.orderId]);
    expect(h.total).toBeGreaterThan(0);

    // And once the recent one ages out too, the list is empty.
    await db
      .update(orders)
      .set({ created_at: new Date(Date.now() - 12.5 * 60 * 60 * 1000) })
      .where(eq(orders.id, recent.orderId));
    const empty = await guestOrderHistory(f.venue.id, guestId);
    expect(empty.orders).toHaveLength(0);
    expect(empty.total).toBe(0);
  });
});
