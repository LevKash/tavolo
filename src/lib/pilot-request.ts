"use server";

import { headers } from "next/headers";

export type PilotState = {
  status: "idle" | "ok" | "invalid" | "rate" | "error";
  /** field names that failed validation (status "invalid") */
  fields?: string[];
  /** echo of what was typed, so the form keeps it after a failed attempt */
  values?: Record<string, string>;
};

const LIMITS = { name: 80, venue: 120, town: 80, contact: 120, message: 1000 } as const;
const MAX_PER_HOUR = 5;
const WINDOW_MS = 60 * 60 * 1000;

// Simple in-memory per-IP limiter. Per server instance only (best effort).
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_HOUR) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

function clean(v: FormDataEntryValue | null, max: number): string {
  if (typeof v !== "string") return "";
  // strip control characters, collapse spaces/tabs (keep newlines for the message)
  return v
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

function looksLikeContact(v: string): boolean {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return true;
  return v.replace(/\D/g, "").length >= 7;
}

/**
 * Sends the message to the operator's Telegram chat (same env vars as
 * src/lib/tg.ts notifyOperator). Unlike notifyOperator this reports success,
 * so the form can show a friendly fallback when it did not go through.
 */
async function sendToOperator(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[pilot-request] telegram failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[pilot-request] telegram error:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function submitPilotRequest(_prev: PilotState, formData: FormData): Promise<PilotState> {
  // honeypot: bots fill the hidden field; pretend success and drop it
  if (clean(formData.get("website"), 200)) return { status: "ok" };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) {
    return {
      status: "rate",
      values: {
        name: clean(formData.get("name"), LIMITS.name),
        venue: clean(formData.get("venue"), LIMITS.venue),
        town: clean(formData.get("town"), LIMITS.town),
        contact: clean(formData.get("contact"), LIMITS.contact),
        message: clean(formData.get("message"), LIMITS.message),
      },
    };
  }

  const name = clean(formData.get("name"), LIMITS.name);
  const venue = clean(formData.get("venue"), LIMITS.venue);
  const town = clean(formData.get("town"), LIMITS.town);
  const contact = clean(formData.get("contact"), LIMITS.contact);
  const message = clean(formData.get("message"), LIMITS.message);
  const lang = formData.get("lang") === "el" ? "el" : "en";

  const values = { name, venue, town, contact, message };
  const bad: string[] = [];
  if (name.length < 2) bad.push("name");
  if (venue.length < 2) bad.push("venue");
  if (town.length < 2) bad.push("town");
  if (!looksLikeContact(contact)) bad.push("contact");
  if (bad.length) return { status: "invalid", fields: bad, values };

  const text = [
    "New pilot request (Ordavo website)",
    `Name: ${name}`,
    `Venue: ${venue}`,
    `Town/area: ${town}`,
    `Contact: ${contact}`,
    message ? `Message: ${message}` : null,
    `Page language: ${lang}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3500);

  const sent = await sendToOperator(text);
  return sent ? { status: "ok" } : { status: "error", values };
}
