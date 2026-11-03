require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const cols = await c.query(`select column_name from information_schema.columns where table_name='table_sessions' order by ordinal_position`);
  console.log("SESSION COLS:", cols.rows.map(r=>r.column_name).join(","));
  const s = await c.query(`select * from table_sessions order by opened_at desc nulls last limit 4`);
  console.log("SESSIONS:", JSON.stringify(s.rows, null, 1).slice(0,1800));
  const oc = await c.query(`select column_name from information_schema.columns where table_name='orders' order by ordinal_position`);
  console.log("ORDER COLS:", oc.rows.map(r=>r.column_name).join(","));
  const o = await c.query(`select * from orders order by created_at desc limit 5`);
  console.log("ORDERS:", JSON.stringify(o.rows, null, 1).slice(0,1500));
  await c.end();
})();
