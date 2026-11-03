require("dotenv").config({ path: ".env.local", quiet: true });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  await c.connect();
  const d = await c.query(`delete from orders where id::text like '168db09e%' returning id`);
  console.log("DEL", d.rowCount);
  const r = await c.query(`select o.total, o.payment_status, o.status from orders o where o.table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba'`);
  for (const x of r.rows) console.log("LEFT", x.status, x.payment_status, "€"+x.total);
  await c.end();
})().catch(e => console.log("ERR", e.message));
