require("dotenv").config({ path: ".env.local", quiet: true });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  await c.connect();
  const r = await c.query(`select l.qty, l.name_snapshot, l.price_snapshot, o.total
    from order_lines l join orders o on o.id=l.order_id where o.id='795040c0-2166-4d51-9fae-cd4ec29497ab'`);
  for (const x of r.rows) console.log("L", x.qty+"x", x.name_snapshot, "@", x.price_snapshot, "order_total=", x.total);
  await c.end();
})().catch(e => console.log("ERR", e.message));
