import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: ".env.local", quiet: true });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await c.connect();
const r = await c.query("select viva_client_id, viva_client_secret, viva_merchant_id, viva_api_key from venues where slug='ambrosia'");
await c.end();
const v = r.rows[0];
const tok = await fetch("https://demo-accounts.vivapayments.com/connect/token", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "client_credentials", client_id: v.viva_client_id, client_secret: v.viva_client_secret }),
});
const { access_token } = await tok.json();
const h = { Authorization: `Bearer ${access_token}` };
const r2 = await fetch("https://demo-api.vivapayments.com/checkout/v2/transactions", { headers: h });
const ct = r2.headers.get("content-type") || "";
console.log("list", r2.status, ct.slice(0,25));
const txt = await r2.text();
console.log(txt.slice(0, 900));
