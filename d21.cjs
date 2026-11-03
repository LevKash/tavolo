require("dotenv").config({ path: ".env.local", quiet: true });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  await c.connect();
  const r = await c.query(`select id, status, payment_status, payment_amount, opened_at from table_sessions where table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba' order by opened_at`);
  for (const x of r.rows) console.log("S", x.id.slice(0,8), "status="+x.status, "pay="+x.payment_status, "amt="+x.payment_amount, x.opened_at.toISOString().slice(11,19));
  await c.end();
})().catch(e => console.log("ERR", e.message));
