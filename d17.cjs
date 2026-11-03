require("dotenv").config({ path: ".env.local", quiet: true });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  await c.connect();
  await c.query(`delete from orders where id='6efe4a23-c000-0000-0000-000000000000'`).catch(()=>{});
  const del = await c.query(`delete from orders where table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba' and total=10.00 and payment_status='unpaid' returning id`);
  console.log("DELETED", del.rowCount);
  await c.end();
})().catch(e => console.log("ERR", e.message));
