import { NextRequest, NextResponse } from "next/server";
import { buildBarPayload } from "@/lib/core";
import { barDenied, checkBarAccess } from "@/lib/pin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  // The PIN travels in a header only, so it never lands in URLs or access logs.
  const pin = req.headers.get("x-bar-pin") ?? "";
  const venue = await checkBarAccess(slug, pin, req);
  if (!venue) {
    return barDenied(slug, req);
  }
  const payload = await buildBarPayload(venue);
  return NextResponse.json(payload);
}
