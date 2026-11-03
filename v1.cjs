require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("select id,status,payment_status,total,payment_amount,payment_ref,paid_at from orders where table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba' order by created_at desc");
  console.log("ORDERS", JSON.stringify(r.rows));
  const ev = await c.query("select * from payment_events order by created_at desc limit 5").catch(()=>null);
  console.log("EVENTS", ev ? JSON.stringify(ev.rows).slice(0,600) : "no table");
  await c.end();
})();
