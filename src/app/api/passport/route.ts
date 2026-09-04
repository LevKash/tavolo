import { NextRequest, NextResponse } from "next/server";
import { getPassport, getVenueBySlug } from "@/lib/core";

export const dynamic = "force-dynamic";

/**
 * GET /api/passport?slug=<venue>&guest=<guestId>
 * Snapshot of the guest's cocktail passport at a venue. 404 when the venue
 * is unknown; `null` (enabled:false) when the venue has no passport or the
 * guest id is missing/malformed — the client just hides the card.
 */
export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim();
  const guest = (req.nextUrl.searchParams.get("guest") ?? "").trim() || null;
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  const venue = await getVenueBySlug(slug);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  const view = await getPassport(venue.id, guest, venue.passport_enabled);
  return NextResponse.json(view ?? { enabled: false });
}
