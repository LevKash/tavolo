import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: ".env.local", quiet: true });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await c.connect();
const r = await c.query("select viva_merchant_id, viva_client_id, viva_client_secret, viva_api_key, viva_env from venues where slug='ambrosia'");
await c.end();
const v = r.rows[0];
const base = "https://demo.vivapayments.com";
const tok = await fetch(base + "/connect/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "client_credentials", client_id: v.viva_client_id, client_secret: v.viva_client_secret }),
});
const { access_token } = await tok.json();
const h = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };
// list payment orders instead of transactions
for (const p of ["/checkout/v2/orders?take=5", "/api/transactions?take=5"]) {
  const r2 = await fetch(base + p, { headers: h });
  const ct = r2.headers.get("content-type") || "";
  console.log(p, r2.status, ct.slice(0,30));
  if (ct.includes("json")) console.log(JSON.stringify(await r2.json()).slice(0,800));
}
