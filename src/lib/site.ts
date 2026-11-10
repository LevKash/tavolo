import { randomInt } from "crypto";

/**
 * Public base URL of the app. Set NEXT_PUBLIC_BASE_URL in every environment:
 * printed QR codes embed this address, so it must be the final domain.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://ordavo.vercel.app";
  return raw.replace(/\/+$/, "");
}

/** Host part only, for labels like "ordavo.vercel.app/m/<slug>". */
export function siteHost(): string {
  return siteUrl().replace(/^https?:\/\//, "");
}

/**
 * Cryptographically random 6-digit PIN (leading zeros kept). Six digits: a
 * 4-digit PIN is only 10 000 guesses. Never a repeated digit (the settings form
 * rejects those as too easy).
 */
export function randomPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!/^(\d)\1+$/.test(pin) && pin !== "123456" && pin !== "654321") return pin;
  }
}

/**
 * Global kill switch for in-app payments. Payments are OFF unless the deployment
 * explicitly sets PAYMENTS_LIVE=1, whatever each venue's own toggle says. Leave it
 * unset until the payment review is finished and the fiscal-receipt process is
 * agreed with the venue.
 */
export function paymentsAllowed(): boolean {
  return process.env.PAYMENTS_LIVE === "1";
}
