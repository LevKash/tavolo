require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const s = await c.query(`select id,table_id,status,total,payment_status,payment_amount,payment_order_code,opened_at,closed_at from table_sessions where venue_id='a69b0b69-a0a1-4779-a894-cccf4d5d6571' order by opened_at desc limit 5`);
  console.log("SESSIONS:"); s.rows.forEach(r=>console.log(JSON.stringify(r)));
  const o = await c.query(`select id,session_id,status,total,created_at from orders where created_at > now() - interval '12 hours' order by created_at desc limit 12`);
  console.log("ORDERS_12H:"); o.rows.forEach(r=>console.log(JSON.stringify(r)));
  await c.end();
})();
