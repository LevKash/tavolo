require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const s = await c.query(`select s.id,s.table_id,t.label,s.status,s.trusted,s.total,s.payment_status,s.payment_amount,s.opened_at
    from table_sessions s left join tables t on t.id=s.table_id order by s.opened_at desc limit 6`);
  s.rows.forEach(r=>console.log("SESS", JSON.stringify(r)));
  const o = await c.query(`select id,table_id,session_id,total,status,created_at from orders order by created_at desc limit 8`);
  o.rows.forEach(r=>console.log("ORD", JSON.stringify(r)));
  await c.end();
})();
