import { NextResponse } from "next/server";
import { getOrderViewById } from "@/lib/core";
import { isUuid } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const order = isUuid(id) ? await getOrderViewById(id) : null;
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ order });
}
