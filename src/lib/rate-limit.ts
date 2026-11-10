import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Two limiters.
 *
 * `rateLimited` is in memory: free, but each serverless instance has its own
 * map, so it only slows a single client down. Fine for cheap, noisy endpoints.
 *
 * `hitLimit` / `peekLimit` count in the database (table `rate_limits`), so the
 * limit holds across instances. Use it where a bypass costs something: logins,
 * PIN guesses, sign-ups, orders per table.
 */
const hits = new Map<string, number[]>();

export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return false;
}

export type LimitState = {
  /** Events counted in the current window, including this one for `hitLimit`. */
  count: number;
  limited: boolean;
  /** Seconds until the current window ends. */
  retryAfter: number;
};

const OPEN: LimitState = { count: 0, limited: false, retryAfter: 0 };

/**
 * Count one event for `key` and say whether the key is now over `max` events
 * per window. One atomic statement, so concurrent requests cannot both slip
 * under the limit. If the database cannot be reached the request is allowed:
 * a limiter must not be the thing that takes the service down.
 */
export async function hitLimit(key: string, max: number, windowMs: number): Promise<LimitState> {
  try {
    const res = await db.execute(sql`
      insert into rate_limits as r (key, count, window_start)
      values (${key}, 1, now())
      on conflict (key) do update set
        count = case when r.window_start < now() - ${windowMs} * interval '1 millisecond'
                     then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - ${windowMs} * interval '1 millisecond'
                            then now() else r.window_start end
      returning count,
        ceil(extract(epoch from (window_start + ${windowMs} * interval '1 millisecond' - now())))::int as retry_after`);
    const row = res.rows[0] as { count: number; retry_after: number } | undefined;
    if (!row) return OPEN;
    // Housekeeping, now and then: forget windows that ended a day ago.
    if (Math.random() < 0.01) {
      void db
        .execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`)
        .catch(() => undefined);
    }
    const count = Number(row.count);
    return { count, limited: count > max, retryAfter: Math.max(1, Number(row.retry_after)) };
  } catch (err) {
    console.error("[rate-limit] counter unavailable:", (err as Error).message);
    return OPEN;
  }
}

/** Read the counter without counting: is `key` already at `max` in its window? */
export async function peekLimit(key: string, max: number, windowMs: number): Promise<LimitState> {
  try {
    const res = await db.execute(sql`
      select count,
        ceil(extract(epoch from (window_start + ${windowMs} * interval '1 millisecond' - now())))::int as retry_after
      from rate_limits
      where key = ${key} and window_start >= now() - ${windowMs} * interval '1 millisecond'`);
    const row = res.rows[0] as { count: number; retry_after: number } | undefined;
    if (!row) return OPEN;
    const count = Number(row.count);
    return { count, limited: count >= max, retryAfter: Math.max(1, Number(row.retry_after)) };
  } catch (err) {
    console.error("[rate-limit] counter unavailable:", (err as Error).message);
    return OPEN;
  }
}

export async function clearLimit(key: string): Promise<void> {
  await db.execute(sql`delete from rate_limits where key = ${key}`).catch(() => undefined);
}

/**
 * The caller's address. On Vercel the platform sets x-forwarded-for itself and a
 * client cannot forge it; the first entry is the real client.
 */
export function clientIp(req: Request): string {
  return ipFromForwarded(req.headers.get("x-forwarded-for"));
}

export function ipFromForwarded(value: string | null | undefined): string {
  return (value ?? "").split(",")[0]?.trim() || "unknown";
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
