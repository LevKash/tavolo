import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  let seeded = false;
  let dbOk = true;
  try {
    await db.execute(sql`select 1`);
    await ensureSeeded();
    seeded = true;
  } catch (err) {
    dbOk = false;
    console.error("health check failed", err);
  }
  return NextResponse.json({
    ok: dbOk,
    seeded,
    time: new Date().toISOString(),
  });
}
