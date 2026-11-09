import { NextResponse } from "next/server";
import { getVenueBySlug } from "@/lib/core";
import { clientIp } from "@/lib/rate-limit";
import type { Venue } from "@/db/schema";

/**
 * Brute-force guard for the 4–6 digit staff PIN.
 *
 * The PIN is the ONLY thing standing between a stranger and a venue's till
 * screen: with no throttle, 10 000 curl requests walk through every 4-digit
 * code. We keep a small in-memory ledger per (venue, client address) and lock
 * THAT client out for a while after repeated failures. Keying on the venue alone
 * would let a stranger switch the bar off by guessing wrong five times.
 *
 * Scope note: serverless instances each keep their own map, so this brakes an
 * attacker per instance rather than globally. It raises the cost from "a few
 * seconds" to "hours of distributed guessing", which is the right trade for a
 * demo-scale app. A shared store (Upstash/Vercel KV) is the next step if a real
 * bar goes live.
 */

type Bucket = { fails: number; firstFailAt: number; lockedUntil: number };

const MAX_FAILS = 5;
const WINDOW_MS = 10 * 60 * 1000; // failures older than this are forgotten
const LOCK_MS = 15 * 60 * 1000; // lockout after MAX_FAILS
const MAX_BUCKETS = 5000;

const buckets = new Map<string, Bucket>();

function prune() {
  if (buckets.size <= MAX_BUCKETS) return;
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.lockedUntil < now && now - b.firstFailAt > WINDOW_MS) buckets.delete(k);
  }
}

const bucketKey = (slug: string, req?: Request) => `${slug}|${req ? clientIp(req) : "-"}`;

/** Seconds remaining on a lockout for this client, or 0 when not locked. */
export function pinLockRemaining(slug: string, req?: Request): number {
  const b = buckets.get(bucketKey(slug, req));
  if (!b) return 0;
  const left = b.lockedUntil - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function registerFail(key: string) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.firstFailAt > WINDOW_MS) {
    buckets.set(key, { fails: 1, firstFailAt: now, lockedUntil: 0 });
    prune();
    return;
  }
  b.fails += 1;
  if (b.fails >= MAX_FAILS) {
    b.lockedUntil = now + LOCK_MS;
    b.fails = 0;
    b.firstFailAt = now;
  }
}

function clearFails(key: string) {
  buckets.delete(key);
}

/**
 * Validate slug+pin for the staff / bar screens.
 * Returns the venue when the pin matches, otherwise null.
 */
export async function checkBarAccess(
  slug: string,
  pin: string,
  req?: Request,
): Promise<Venue | null> {
  if (!slug || !pin) return null;
  const key = bucketKey(slug, req);
  if (pinLockRemaining(slug, req) > 0) return null;
  const venue = await getVenueBySlug(slug);
  if (!venue) return null;
  if (String(venue.bar_pin) !== String(pin).trim()) {
    registerFail(key);
    return null;
  }
  clearFails(key);
  return venue;
}

/**
 * The response for a refused bar/staff request: 429 while THIS client is locked
 * out (the screen keeps its PIN and retries), 401 for a wrong PIN.
 */
export function barDenied(slug: string, req?: Request): NextResponse {
  const wait = pinLockRemaining(slug, req);
  if (wait > 0) {
    return NextResponse.json(
      { error: "Too many wrong PINs. Try again later.", retryAfter: wait },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }
  return NextResponse.json({ error: "Invalid venue or PIN" }, { status: 401 });
}
