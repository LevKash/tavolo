require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const v = await c.query("select viva_env,viva_client_id,viva_client_secret,viva_merchant_id from venues limit 1");
  const row = v.rows[0];
  const tok = await fetch("https://demo-accounts.vivapayments.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: row.viva_client_id, client_secret: row.viva_client_secret }),
  });
  const tj = await tok.json();
  console.log("TOKEN", tok.status, tj.access_token ? "OK" : JSON.stringify(tj).slice(0,200));
  if (tj.access_token) {
    const tr = await fetch("https://demo-api.vivapayments.com/checkout/v2/transactions/5b42a9a6-6e40-4390-8108-bce5cbcc7ff2", {
      headers: { Authorization: "Bearer " + tj.access_token },
    });
    const body = await tr.text();
    console.log("TXN", tr.status, body.slice(0, 700));
  }
  await c.end();
})();
