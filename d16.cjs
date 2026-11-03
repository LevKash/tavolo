require("dotenv").config({ path: ".env.local", quiet: true });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  await c.connect();
  const r = await c.query(`select o.id, o.total, o.status, o.payment_status,
      string_agg(l.qty || 'x ' || l.name_snapshot || ' @' || l.price_snapshot, ', ') as items
    from orders o join order_lines l on l.order_id=o.id
    where o.table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba'
    group by o.id, o.total, o.status, o.payment_status order by o.id`);
  for (const x of r.rows) console.log("O", x.id.slice(0,8), x.status, x.payment_status, "€"+x.total, "|", x.items);
  await c.end();
})().catch(e => console.log("ERR", e.message));
