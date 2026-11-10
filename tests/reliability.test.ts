import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "@/db";
import {
  categories,
  menuItems,
  orderLines,
  orders,
  tableSessions,
  tables,
  users,
  venues,
} from "@/db/schema";
import { closeTableSession, placeOrder } from "@/lib/core";
import { barDenied, checkBarAccess } from "@/lib/pin";

const createdVenues: string[] = [];
const createdUsers: string[] = [];

async function fixture(pin = "7391") {
  const tag = randomUUID().slice(0, 8);
  const [user] = await db
    .insert(users)
    .values({ email: `r-${tag}@test.local`, name: "T", password_hash: "x" })
    .returning();
  const [venue] = await db
    .insert(venues)
    .values({
      owner_id: user.id,
      slug: `r-${tag}`,
      name: "Test Bar",
      is_published: true,
      status: "active",
      bar_pin: pin,
    })
    .returning();
  const [table] = await db.insert(tables).values({ venue_id: venue.id, label: "5" }).returning();
  const [cat] = await db.insert(categories).values({ venue_id: venue.id, name: "Drinks" }).returning();
  const [item] = await db
    .insert(menuItems)
    .values({ venue_id: venue.id, category_id: cat.id, name: "Beer", price: 4 })
    .returning();
  createdVenues.push(venue.id);
  createdUsers.push(user.id);
  const order = (clientKey?: string) =>
    placeOrder({
      venueId: venue.id,
      tableId: table.id,
      lines: [{ itemId: item.id, qty: 2 }],
      clientKey,
    });
  return { venue, table, item, order };
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
  await pool.end();
});

describe("double-order protection (idempotency key)", () => {
  it("a retry with the same key returns the same order and creates no second one", async () => {
    const f = await fixture();
    const key = randomUUID();
    const first = await f.order(key);
    const retry = await f.order(key);
    expect(retry.orderId).toBe(first.orderId);
    const rows = await db.select().from(orders).where(eq(orders.venue_id, f.venue.id));
    expect(rows).toHaveLength(1);
  });

  it("two retries arriving at the same moment still create one order", async () => {
    const f = await fixture();
    const key = randomUUID();
    const [a, b] = await Promise.all([f.order(key), f.order(key)]);
    expect(a.orderId).toBe(b.orderId);
    const rows = await db.select().from(orders).where(eq(orders.venue_id, f.venue.id));
    expect(rows).toHaveLength(1);
  });

  it("a different key is a different order", async () => {
    const f = await fixture();
    const a = await f.order(randomUUID());
    const b = await f.order(randomUUID());
    expect(a.orderId).not.toBe(b.orderId);
  });

  it("orders without a key keep working exactly as before", async () => {
    const f = await fixture();
    const a = await f.order();
    const b = await f.order();
    expect(a.orderId).not.toBe(b.orderId);
  });

  it("the same key at another venue is not confused with this one", async () => {
    const x = await fixture();
    const y = await fixture();
    const key = randomUUID();
    const a = await x.order(key);
    const b = await y.order(key);
    expect(a.orderId).not.toBe(b.orderId);
  });
});

describe("PIN lockout is per client, not per venue", () => {
  const req = (ip: string) =>
    new NextRequest("https://x.test/api/bar/orders", { headers: { "x-forwarded-for": ip } });

  it("a stranger guessing wrong locks only themselves out", async () => {
    const f = await fixture("7391");
    const stranger = req("203.0.113.9");
    for (let i = 0; i < 5; i++) {
      expect(await checkBarAccess(f.venue.slug, "0000", stranger)).toBeNull();
    }
    // Even the right PIN is refused to the locked client, with a 429.
    expect(await checkBarAccess(f.venue.slug, "7391", stranger)).toBeNull();
    expect((await barDenied(f.venue.slug, stranger)).status).toBe(429);

    // The bartender on another connection is unaffected.
    const bartender = req("198.51.100.20");
    expect(await checkBarAccess(f.venue.slug, "7391", bartender)).not.toBeNull();
  });

  it("a wrong PIN is a plain 401 until the limit is reached", async () => {
    const f = await fixture("7391");
    const r = req("203.0.113.50");
    expect(await checkBarAccess(f.venue.slug, "1111", r)).toBeNull();
    expect((await barDenied(f.venue.slug, r)).status).toBe(401);
  });
});

describe("closing and declining", () => {
  async function bar(path: string, body: Record<string, unknown>, ip = "198.51.100.77") {
    const mod = await import(path);
    return mod.POST(
      new NextRequest("https://x.test/x", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: body.id }) },
    );
  }

  it("declining one order keeps the table open and the accepted order live", async () => {
    const f = await fixture("7391");
    const accepted = await f.order(); // first order of a session: pending_confirm
    await db.update(orders).set({ status: "new" }).where(eq(orders.id, accepted.orderId));
    const second = await f.order(); // trusted session: goes straight to "new"
    await db.update(orders).set({ status: "pending_confirm" }).where(eq(orders.id, second.orderId));

    const res = await bar("@/app/api/bar/orders/[id]/decline/route", {
      id: second.orderId,
      slug: f.venue.slug,
      pin: "7391",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessionClosed).toBe(false);

    const rows = await db.select().from(orders).where(eq(orders.venue_id, f.venue.id));
    expect(rows.find((o) => o.id === accepted.orderId)?.status).toBe("new");
    expect(rows.find((o) => o.id === second.orderId)?.status).toBe("declined");
    const sess = await db.select().from(tableSessions).where(eq(tableSessions.table_id, f.table.id));
    expect(sess.every((s) => s.status === "open")).toBe(true);
  });

  it("declining the only order of a table closes its session", async () => {
    const f = await fixture("7391");
    const only = await f.order();
    const res = await bar("@/app/api/bar/orders/[id]/decline/route", {
      id: only.orderId,
      slug: f.venue.slug,
      pin: "7391",
    });
    expect((await res.json()).sessionClosed).toBe(true);
    const sess = await db.select().from(tableSessions).where(eq(tableSessions.table_id, f.table.id));
    expect(sess[0].status).toBe("closed");
  });

  it("closeTableSession closes the orders and every open session of the table", async () => {
    const f = await fixture("7391");
    const o = await f.order();
    await db.update(orders).set({ status: "served" }).where(eq(orders.id, o.orderId));
    const closed = await closeTableSession(f.venue.id, f.table.id);
    expect(closed).not.toBeNull();
    const rows = await db.select().from(orders).where(eq(orders.venue_id, f.venue.id));
    expect(rows[0].status).toBe("closed");
    const again = await closeTableSession(f.venue.id, f.table.id);
    expect(again).toBeNull();
  });

  it("an order placed after the table closed starts a fresh session", async () => {
    const f = await fixture("7391");
    await f.order();
    await closeTableSession(f.venue.id, f.table.id);
    await f.order();
    const sess = await db.select().from(tableSessions).where(eq(tableSessions.table_id, f.table.id));
    expect(sess.filter((s) => s.status === "open")).toHaveLength(1);
    expect(sess).toHaveLength(2);
  });

  it("the bar can close a served order (served to closed)", async () => {
    const f = await fixture("7391");
    const o = await f.order();
    await db.update(orders).set({ status: "served" }).where(eq(orders.id, o.orderId));
    const res = await bar("@/app/api/bar/orders/[id]/status/route", {
      id: o.orderId,
      slug: f.venue.slug,
      pin: "7391",
      status: "closed",
    });
    expect(res.status).toBe(200);
  });
});
