import { NextRequest, NextResponse } from "next/server";
import { buildBarPayload } from "@/lib/core";
import { checkBarAccess } from "@/lib/pin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const pin = req.nextUrl.searchParams.get("pin") ?? "";
  const venue = await checkBarAccess(slug, pin);
  if (!venue) {
    return NextResponse.json({ error: "Invalid venue or PIN" }, { status: 401 });
  }
  const payload = await buildBarPayload(venue);
  return NextResponse.json(payload);
}
