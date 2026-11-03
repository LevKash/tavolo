import { NextRequest, NextResponse } from "next/server";
import { getVenueBySlug, guestOrderHistory } from "@/lib/core";

export const dynamic = "force-dynamic";

/**
 * GET /api/guest/orders?slug=ambrosia&guest=<uuid>
 *
 * Everything this device ordered at this venue. The guest UUID lives in
 * localStorage (same key the cocktail passport uses), so scanning the same QR
 * on the same phone brings the guest back to their own history — no login,
 * no account, no cookies.
 *
 * Returns an empty history rather than an error for unknown/malformed IDs:
 * a first-time visitor is not an error case.
 */
export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim();
  const guestId = (req.nextUrl.searchParams.get("guest") ?? "").trim();
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  const venue = await getVenueBySlug(slug);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  if (!venue.is_published) {
    return NextResponse.json({ error: "Menu is offline" }, { status: 403 });
  }
  const history = await guestOrderHistory(venue.id, guestId);
  return NextResponse.json(
    { ok: true, ...history },
    { headers: { "cache-control": "no-store" } },
  );
}
