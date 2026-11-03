require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = `select o.id, o.total, o.status, o.payment_status, o.created_at,
      (select count(*) from order_lines l where l.order_id=o.id) as lines
     from orders o where o.table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba' order by o.created_at desc limit 8`;
  const r = await c.query(q);
  console.log("ORD", JSON.stringify(r.rows, null, 1));
  const l = await c.query(`select l.order_id, l.qty, l.unit_price, l.line_total, m.name, m.price from order_lines l join menu_items m on m.id=l.menu_item_id join orders o on o.id=l.order_id where o.table_id='5e729114-7091-4e0f-b565-b300f8d1e2ba' order by o.created_at desc limit 12`);
  console.log("LINES", JSON.stringify(l.rows, null, 1));
  await c.end();
})();
