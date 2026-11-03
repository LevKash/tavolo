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
console.log("token", tok.status);
const { access_token } = await tok.json();
const h = { Authorization: `Bearer ${access_token}` };
for (const p of ["/checkout/v2/transactions?take=10", "/api/transactions?take=10"]) {
  const r2 = await fetch(base + p, { headers: h });
  const txt = await r2.text();
  console.log(p, r2.status, txt.slice(0, 700));
}
