require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const o = await c.query(`select o.id,o.total,o.status,
    (select sum(price_snapshot*qty) from order_lines where order_id=o.id) as sum_lines,
    (select string_agg(name_snapshot||' x'||qty||' @'||price_snapshot, ' | ') from order_lines where order_id=o.id) as lines
    from orders o where o.created_at > now() - interval '3 hours' order by o.created_at`);
  o.rows.forEach(r=>console.log(JSON.stringify(r)));
  const p = await c.query(`select payment_status,payment_amount,payment_order_code,total from table_sessions where id='759116c6-b3fc-4968-93ec-416cdf30b9de'`);
  console.log("PAY:", JSON.stringify(p.rows[0]));
  await c.end();
})();
