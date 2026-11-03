require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const o = await c.query(`select id,status,total,created_at from orders order by created_at desc limit 4`);
  console.log("LAST ORDERS:", JSON.stringify(o.rows));
  const n = await c.query(`select count(*)::int c from orders where created_at > now() - interval '3 hours'`);
  console.log("orders_last_3h:", n.rows[0].c);
  const p = await c.query(`select payment_status, payment_amount, payment_order_code, paid_at, closed_at from table_sessions where payment_status='paid' order by paid_at desc limit 3`);
  console.log("PAID:", JSON.stringify(p.rows));
  await c.end();
})();
