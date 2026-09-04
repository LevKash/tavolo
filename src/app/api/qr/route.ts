import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tables } from "@/db/schema";
import { getVenueBySlug } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const slug = sp.get("slug") ?? "";
  const tableId = sp.get("table") ?? "";
  const format = sp.get("format") === "png" ? "png" : "svg";
  const size = Math.min(Math.max(Number(sp.get("size") ?? 480) || 480, 96), 1200);

  const venue = await getVenueBySlug(slug);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  if (tableId) {
    const tbl = await db
      .select()
      .from(tables)
      .where(eq(tables.id, tableId))
      .limit(1);
    if (tbl.length === 0 || tbl[0].venue_id !== venue.id) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }
  }

  const base =
    process.env.NEXT_PUBLIC_BASE_URL ?? new URL(req.url).origin;
  const target = `${base}/m/${venue.slug}${tableId ? `?table=${tableId}` : ""}`;

  const opts = {
    margin: 2,
    width: size,
    errorCorrectionLevel: "M" as const,
    color: { dark: "#0e0d0b", light: "#ffffff" },
  };

  try {
    if (format === "png") {
      const buf = await QRCode.toBuffer(target, { ...opts, type: "png" });
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600",
          "Content-Disposition": `inline; filename="tavolo-${venue.slug}${tableId ? `-${tableId.slice(0, 8)}` : ""}.png"`,
        },
      });
    }
    const svg = await QRCode.toString(target, { ...opts, type: "svg" });
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
        "Content-Disposition": `inline; filename="tavolo-${venue.slug}${tableId ? `-${tableId.slice(0, 8)}` : ""}.svg"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `QR generation failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
