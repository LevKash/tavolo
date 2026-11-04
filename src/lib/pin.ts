import { getVenueBySlug } from "@/lib/core";
import type { Venue } from "@/db/schema";

/**
 * Brute-force guard for the 4–6 digit staff PIN.
 *
 * The PIN is the ONLY thing standing between a stranger and a venue's till
 * screen: with no throttle, 10 000 curl requests walk through every 4-digit
 * code. We keep a small in-memory ledger per (slug) and lock the venue out for
 * a while after repeated failures.
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

/** Seconds remaining on a lockout, or 0 when not locked. */
export function pinLockRemaining(slug: string): number {
  const b = buckets.get(slug);
  if (!b) return 0;
  const left = b.lockedUntil - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function registerFail(slug: string) {
  const now = Date.now();
  const b = buckets.get(slug);
  if (!b || now - b.firstFailAt > WINDOW_MS) {
    buckets.set(slug, { fails: 1, firstFailAt: now, lockedUntil: 0 });
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

function clearFails(slug: string) {
  buckets.delete(slug);
}

/**
 * Validate slug+pin for the staff / bar screens.
 * Returns the venue when the pin matches, otherwise null.
 */
export async function checkBarAccess(
  slug: string,
  pin: string,
): Promise<Venue | null> {
  if (!slug || !pin) return null;
  if (pinLockRemaining(slug) > 0) return null;
  const venue = await getVenueBySlug(slug);
  if (!venue) return null;
  if (String(venue.bar_pin) !== String(pin).trim()) {
    registerFail(slug);
    return null;
  }
  clearFails(slug);
  return venue;
}
