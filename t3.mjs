import { Client } from "pg";
import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const v = await c.query("select viva_env,viva_client_id,viva_client_secret,viva_merchant_id from venues where slug='ambrosia'");
const r = v.rows[0];
const creds = { env: "demo", clientId: r.viva_client_id, clientSecret: r.viva_client_secret, merchantId: r.viva_merchant_id };
const tok = await fetch("https://demo-accounts.vivapayments.com/connect/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials&client_id=" + encodeURIComponent(creds.clientId) + "&client_secret=" + encodeURIComponent(creds.clientSecret),
});
const tj = await tok.json();
console.log("TOKEN", tok.status, tj.access_token ? "OK" : JSON.stringify(tj));
if (tj.access_token) {
  for (const tx of ["5b42a9a6-6e40-4390-8108-bce5cbcc7ff2"]) {
    const tr = await fetch("https://demo-api.vivapayments.com/checkout/v2/transactions/" + tx, { headers: { Authorization: "Bearer " + tj.access_token } });
    console.log("TXN", tr.status, (await tr.text()).slice(0, 800));
  }
}
await c.end();
