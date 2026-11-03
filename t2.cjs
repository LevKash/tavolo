require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const v = await c.query("select id,name,slug,viva_env,viva_client_id,viva_client_secret,viva_merchant_id,viva_api_key from venues");
  for (const r of v.rows) {
    console.log("VENUE", r.name, "| env:", r.viva_env, "| client:", String(r.viva_client_id).slice(0,12)+"...", "| secret:", r.viva_client_secret ? "SET("+String(r.viva_client_secret).slice(0,4)+")" : "NULL", "| merchant:", String(r.viva_merchant_id).slice(0,12), "| apiKey:", r.viva_api_key ? "SET" : "NULL");
  }
  await c.end();
})();
