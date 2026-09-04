import { getVenueBySlug } from "@/lib/core";
import type { Venue } from "@/db/schema";

/**
 * Validate slug+pin for the staff / bar screens.
 * Returns the venue when the pin matches, otherwise null.
 */
export async function checkBarAccess(
  slug: string,
  pin: string,
): Promise<Venue | null> {
  if (!slug || !pin) return null;
  const venue = await getVenueBySlug(slug);
  if (!venue) return null;
  if (String(venue.bar_pin) !== String(pin).trim()) return null;
  return venue;
}
