require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`select o.id as oid, o.total, o.status, o.payment_status, o.created_at, l.name_snapshot, l.qty, l.price_snapshot
    from orders o join order_lines l on l.order_id=o.id
    where o.table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba' order by o.created_at desc limit 10`);
  for (const x of r.rows) console.log(`${x.created_at.toISOString().slice(11,19)} ${x.oid.slice(0,8)} ${x.status}/${x.payment_status} total=${x.total} | ${x.qty}x ${x.name_snapshot} @ ${x.price_snapshot}`);
  console.log("--- menu ---");
  const m = await c.query(`select name, price from menu_items where name ilike '%negroni%'`);
  for (const x of m.rows) console.log(`${x.name} = ${x.price}`);
  await c.end();
})();
