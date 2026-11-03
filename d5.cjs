require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("select id,status,payment_status,total,session_id,guest_id,created_at from orders where table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba' order by created_at desc");
  console.log("ORDERS", JSON.stringify(r.rows, null, 1));
  const s = await c.query("select id,status,payment_status,payment_amount,table_id from table_sessions where table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba'");
  console.log("SESSIONS", JSON.stringify(s.rows, null, 1));
  await c.end();
})();
