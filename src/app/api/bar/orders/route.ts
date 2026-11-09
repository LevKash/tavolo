import { NextRequest, NextResponse } from "next/server";
import { buildBarPayload } from "@/lib/core";
import { barDenied, checkBarAccess } from "@/lib/pin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  // The PIN travels in a header so it never lands in URLs or access logs; the
  // query parameter is still read for screens opened before this change.
  const pin = req.headers.get("x-bar-pin") ?? req.nextUrl.searchParams.get("pin") ?? "";
  const venue = await checkBarAccess(slug, pin, req);
  if (!venue) {
    return barDenied(slug, req);
  }
  const payload = await buildBarPayload(venue);
  return NextResponse.json(payload);
}
