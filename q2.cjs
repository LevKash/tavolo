require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const s = await c.query(`select id,table_id,status,total,payment_status,payment_amount,payment_order_code,opened_at from table_sessions where id='759116c6-b3fc-4968-93ec-416cdf30b9de'`);
  console.log("SESSION:", JSON.stringify(s.rows[0]));
  const o = await c.query(`select o.id,o.status,o.total,ol.name_snapshot,ol.price_snapshot,ol.qty from orders o left join order_lines ol on ol.order_id=o.id where o.session_id='759116c6-b3fc-4968-93ec-416cdf30b9de' order by o.created_at`);
  o.rows.forEach(r=>console.log("LINE:",JSON.stringify(r)));
  const t = await c.query(`select id,label from tables where id=(select table_id from table_sessions where id='759116c6-b3fc-4968-93ec-416cdf30b9de')`);
  console.log("TABLE:", JSON.stringify(t.rows[0]));
  await c.end();
})();
