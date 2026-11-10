// One-off: encrypt the Viva secrets that are still stored as plain text.
//
//   DATABASE_URL=... VENUE_SECRETS_KEY=... node scripts/encrypt-venue-secrets.mjs          (dry run)
//   DATABASE_URL=... VENUE_SECRETS_KEY=... node scripts/encrypt-venue-secrets.mjs --apply
//
// Safe to run twice: values that are already encrypted are skipped. Use the SAME
// key the deployment has, or the app will not be able to read what this writes.
// The format must stay identical to src/lib/secrets.ts.
import { createCipheriv, randomBytes } from "node:crypto";
import pg from "pg";

const PREFIX = "enc:v1:";
const key = Buffer.from(process.env.VENUE_SECRETS_KEY ?? "", "base64");
if (key.length !== 32) throw new Error("VENUE_SECRETS_KEY must be 32 bytes, base64-encoded");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const apply = process.argv.includes("--apply");

function seal(plain, venueId) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(venueId));
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const b64 = (b) => b.toString("base64url");
  return `${PREFIX}${b64(iv)}:${b64(body)}:${b64(c.getAuthTag())}`;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(
  "select id, slug, viva_client_secret, viva_api_key from venues where viva_client_secret <> '' or viva_api_key <> ''",
);
let changed = 0;
for (const v of rows) {
  const next = {};
  for (const col of ["viva_client_secret", "viva_api_key"]) {
    if (v[col] && !v[col].startsWith(PREFIX)) next[col] = seal(v[col], v.id);
  }
  const cols = Object.keys(next);
  if (cols.length === 0) continue;
  changed++;
  console.log(`${apply ? "encrypting" : "would encrypt"} ${v.slug}: ${cols.join(", ")}`);
  if (apply) {
    await pool.query(
      `update venues set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`,
      [v.id, ...cols.map((c) => next[c])],
    );
  }
}
console.log(`${changed} venue(s) ${apply ? "updated" : "need encrypting (dry run, nothing written)"}.`);
await pool.end();
