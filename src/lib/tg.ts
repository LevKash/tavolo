const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

/**
 * Fire-and-forget Telegram ping to the operator (used for new-venue
 * applications). Best-effort: never throws, silently no-ops when env
 * vars are missing or the network call fails.
 */
export async function notifyOperator(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[tg] sendMessage failed: ${res.status} ${body}`);
    }
  } catch (err) {
    // notifications are best-effort, but surface the failure in logs
    console.error("[tg] notify error:", err instanceof Error ? err.message : err);
  }
}
