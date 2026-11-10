import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Encryption at rest for the secrets a venue hands us (its Viva client secret
 * and API key). They sit in the database, so a leaked dump or a copied branch
 * must not be enough to use a venue's payment account.
 *
 * - AES-256-GCM, a fresh random IV per value.
 * - The venue id is bound in as associated data: a ciphertext copied onto
 *   another venue's row does not decrypt.
 * - The master key lives ONLY in the deployment environment
 *   (VENUE_SECRETS_KEY, 32 random bytes in base64), never in the database or git.
 * - Stored form: `enc:v1:<iv>:<ciphertext>:<tag>` (base64url). A value without
 *   the prefix is legacy plaintext and is read as-is, so rows can be migrated
 *   gradually (scripts/encrypt-venue-secrets.mjs).
 */
const PREFIX = "enc:v1:";

function masterKey(): Buffer | null {
  const raw = process.env.VENUE_SECRETS_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("VENUE_SECRETS_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function isSealed(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

/** Encrypt for storage. Without a configured key the value is stored as it is. */
export function sealSecret(plain: string, venueId: string): string {
  if (!plain || isSealed(plain)) return plain;
  const key = masterKey();
  if (!key) {
    console.warn("[secrets] VENUE_SECRETS_KEY is not set: storing a venue secret unencrypted");
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(venueId));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const b64 = (b: Buffer) => b.toString("base64url");
  return `${PREFIX}${b64(iv)}:${b64(body)}:${b64(cipher.getAuthTag())}`;
}

/** Read a stored secret. Throws when it is encrypted and cannot be opened. */
export function openSecret(stored: string | null | undefined, venueId: string): string {
  if (!stored) return "";
  if (!isSealed(stored)) return stored;
  const key = masterKey();
  if (!key) throw new Error("A venue secret is encrypted but VENUE_SECRETS_KEY is not set");
  const [iv, body, tag] = stored.slice(PREFIX.length).split(":");
  if (!iv || !body || !tag) throw new Error("Malformed encrypted venue secret");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(venueId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
