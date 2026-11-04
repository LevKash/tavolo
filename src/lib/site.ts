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

/** Cryptographically random 4-digit PIN (leading zeros kept). */
export function randomPin(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
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
