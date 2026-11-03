require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("select id,total,status,payment_status from orders where session_id='d9cca78a-9163-4c10-b97f-e05ebac3bcb4'");
  console.log("ORDERS", JSON.stringify(r.rows));
  await c.end();
})();
