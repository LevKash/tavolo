require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`select id,label from tables where venue_id=(select id from venues where slug='ambrosia') order by label`);
  console.log("TABLES:", r.rows.map(x=>x.label+"="+x.id.slice(0,8)).join(", "));
  await c.end();
})();
