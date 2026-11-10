import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { waiterCalls } from "@/db/schema";
import { barDenied, checkBarAccess } from "@/lib/pin";
import { isUuid } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: { slug?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const venue = await checkBarAccess(body.slug ?? "", body.pin ?? "", req);
  if (!venue) {
    return barDenied(body.slug ?? "", req);
  }
  // A malformed id can never match a row; answer 404 instead of a database error.
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const res = await db
    .update(waiterCalls)
    .set({ resolved_at: new Date() })
    .where(
      and(
        eq(waiterCalls.id, id),
        eq(waiterCalls.venue_id, venue.id),
        isNull(waiterCalls.resolved_at),
      ),
    )
    .returning({ id: waiterCalls.id });
  if (res.length === 0) {
    return NextResponse.json({ error: "Call not found or already resolved" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
