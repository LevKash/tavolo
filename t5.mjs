import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: ".env.local", quiet: true });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
await c.connect();
const r = await c.query("select slug, viva_merchant_id, viva_api_key, viva_env, viva_source_code from venues where slug='ambrosia'");
const v = r.rows[0];
await c.end();
const base = "https://demo.vivapayments.com";
const basic = Buffer.from(`${v.viva_merchant_id}:${v.viva_api_key}`).toString("base64");
const res = await fetch(`${base}/api/messages/config/token`, { headers: { Authorization: `Basic ${basic}` } });
console.log("token status", res.status);
const t = await res.json();
console.log("key", t.Key ? t.Key.slice(0,8)+"..." : t);
// Try to read registered webhook config
for (const path of ["/api/messages/config", "/api/messages/settings"]) {
  const r2 = await fetch(base + path, { headers: { Authorization: `Basic ${basic}` } });
  console.log(path, r2.status, (await r2.text()).slice(0,400));
}
console.log("source_code =", JSON.stringify(v.viva_source_code), "env =", v.viva_env);
