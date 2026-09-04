import { NextRequest, NextResponse } from "next/server";
import { buildMenu, getVenueBySlug } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const venue = await getVenueBySlug(slug);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  if (!venue.is_published) {
    return NextResponse.json(
      { error: "This menu is currently offline", venue: null, categories: [] },
      { status: 200 },
    );
  }
  const menu = await buildMenu(venue);
  return NextResponse.json(menu);
}
