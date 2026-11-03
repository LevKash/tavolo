require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const cols = await c.query("select column_name from information_schema.columns where table_name='orders' and column_name like 'pay%'");
  console.log("COLS", cols.rows.map(r=>r.column_name).join(","));
  const r = await c.query("select id,status,payment_status,total,payment_amount from orders where table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba' order by created_at desc");
  console.log("ORDERS", JSON.stringify(r.rows));
  await c.end();
})();
