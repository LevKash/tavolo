import { NextResponse } from "next/server";
import { getVenueBySlug } from "@/lib/core";
import { clearLimit, clientIp, hitLimit, peekLimit } from "@/lib/rate-limit";
import { notifyOperator } from "@/lib/tg";
import type { Venue } from "@/db/schema";

/**
 * Brute-force guard for the staff PIN.
 *
 * The PIN is the only thing between a stranger and a venue's till screen, so
 * wrong guesses are counted per (venue, client address) in the database: the
 * count holds across serverless instances. After MAX_FAILS wrong PINs inside
 * the window THAT client is refused until the window ends, even with the right
 * PIN. Keying on the venue alone would let a stranger switch the bar off by
 * guessing wrong five times.
 *
 * Wrong guesses are also counted per venue. That count never locks anyone out
 * (it would be the same off-switch); it tells the operator that somebody is
 * working through a venue's PINs from many addresses.
 */
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const VENUE_ALERT_FAILS = 40;

const clientKey = (slug: string, req?: Request) => `pin:${slug}:${req ? clientIp(req) : "-"}`;

/** Seconds remaining on a lockout for this client, or 0 when not locked. */
export async function pinLockRemaining(slug: string, req?: Request): Promise<number> {
  const s = await peekLimit(clientKey(slug, req), MAX_FAILS, WINDOW_MS);
  return s.limited ? s.retryAfter : 0;
}

/** Constant-time comparison, so response timing says nothing about the PIN. */
function samePin(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
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
  if (typeof slug !== "string" || typeof pin !== "string" || !slug || !pin) return null;
  if (slug.length > 80 || pin.length > 12) return null;
  const key = clientKey(slug, req);
  const fails = await peekLimit(key, MAX_FAILS, WINDOW_MS);
  if (fails.limited) return null;
  const venue = await getVenueBySlug(slug);
  if (!venue) return null;
  if (!samePin(String(venue.bar_pin), pin.trim())) {
    await hitLimit(key, MAX_FAILS, WINDOW_MS);
    const all = await hitLimit(`pin-venue:${venue.id}`, VENUE_ALERT_FAILS, WINDOW_MS);
    if (all.count === VENUE_ALERT_FAILS + 1) {
      await notifyOperator(
        `🔐 Ordavo: more than ${VENUE_ALERT_FAILS} wrong staff PINs for ${venue.name} in 15 minutes. Someone may be guessing it; consider changing the PIN.`,
      );
    }
    return null;
  }
  // A correct PIN forgives earlier typos from this client.
  if (fails.count > 0) await clearLimit(key);
  return venue;
}

/** Forget a client's wrong guesses (used by tests and after a PIN change). */
export async function clearPinFails(slug: string, req?: Request): Promise<void> {
  await clearLimit(clientKey(slug, req));
}

/**
 * The response for a refused bar/staff request: 429 while THIS client is locked
 * out (the screen keeps its PIN and retries), 401 for a wrong PIN.
 */
export async function barDenied(slug: string, req?: Request): Promise<NextResponse> {
  const wait = await pinLockRemaining(typeof slug === "string" ? slug : "", req);
  if (wait > 0) {
    return NextResponse.json(
      { error: "Too many wrong PINs. Try again later.", retryAfter: wait },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }
  return NextResponse.json({ error: "Invalid venue or PIN" }, { status: 401 });
}
