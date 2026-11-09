import { notifyOperator } from "@/lib/tg";

/**
 * Tells the operator (Telegram) when the server hits an unexpected error, so a
 * failure is not discovered from a venue's complaint. Deliberately small:
 * - the same error from the same place is reported at most once per 15 minutes;
 * - at most 8 reports per hour overall (an outage must not flood the chat);
 * - only the route, method and message are sent, never request bodies or headers.
 */
const seen = new Map<string, number>();
const recent: number[] = [];
const SAME_ERROR_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 8;

export async function reportError(
  where: string,
  err: unknown,
  extra?: { method?: string; digest?: string },
): Promise<boolean> {
  // Database errors append the query parameters (emails, ids): drop them.
  const message = (err instanceof Error ? err.message : String(err)).split(/\r?\nparams:/)[0].slice(0, 300);
  console.error(`[monitor] ${where}:`, message);

  const now = Date.now();
  const key = `${where}|${message}`;
  if (now - (seen.get(key) ?? 0) < SAME_ERROR_MS) return false;
  while (recent.length && now - recent[0] > HOUR_MS) recent.shift();
  if (recent.length >= MAX_PER_HOUR) return false;

  seen.set(key, now);
  recent.push(now);
  if (seen.size > 500) {
    for (const [k, t] of seen) if (now - t > SAME_ERROR_MS) seen.delete(k);
  }
  await notifyOperator(
    [
      "🔥 Ordavo server error",
      `${extra?.method ? extra.method + " " : ""}${where}`,
      message,
      extra?.digest ? `digest ${extra.digest}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return true;
}
