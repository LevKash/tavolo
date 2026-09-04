import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { waiterCalls } from "@/db/schema";
import { checkBarAccess } from "@/lib/pin";

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
  const venue = await checkBarAccess(body.slug ?? "", body.pin ?? "");
  if (!venue) {
    return NextResponse.json({ error: "Invalid venue or PIN" }, { status: 401 });
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
