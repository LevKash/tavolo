require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const s = await c.query("select id,payment_order_code,payment_status,payment_amount,payment_transaction_id,status from table_sessions where table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba'");
  console.log("SESSION", JSON.stringify(s.rows));
  await c.end();
})();
