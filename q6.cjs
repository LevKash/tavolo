require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`select o.id,o.total,o.status,t.label from orders o join tables t on t.id=o.table_id where o.session_id='759116c6-b3fc-4968-93ec-416cdf30b9de' order by o.created_at`);
  let sum=0; r.rows.forEach(x=>{sum+=Number(x.total); console.log("T5 ORD", x.total, x.status, "table", x.label);});
  console.log("SUM OPEN ORDERS TABLE5 =", sum.toFixed(2));
  const s = await c.query(`select total,payment_amount,payment_status from table_sessions where id='759116c6-b3fc-4968-93ec-416cdf30b9de'`);
  console.log("SESSION total col =", s.rows[0].total, "payment_amount =", s.rows[0].payment_amount, "status =", s.rows[0].payment_status);
  await c.end();
})();
