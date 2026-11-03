import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: ".env.local", quiet: true });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await c.connect();
const r = await c.query("select viva_merchant_id, viva_api_key from venues where slug='ambrosia'");
await c.end();
const v = r.rows[0];
const basic = Buffer.from(`${v.viva_merchant_id}:${v.viva_api_key}`).toString("base64");
// Viva Messaging API: list subscriptions / webhooks
for (const p of [
  "/api/messages/config/token",
  "/api/messages/settings?",
  "/api/messages",
]) {
  const res = await fetch("https://demo.vivapayments.com" + p, { headers: { Authorization: `Basic ${basic}` } });
  const ct = res.headers.get("content-type") || "";
  console.log(p, res.status, ct.slice(0,20));
  const t = await res.text();
  if (!ct.includes("html")) console.log("  ", t.slice(0, 400));
}
