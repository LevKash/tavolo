require("dotenv").config({ path: ".env.local", quiet: true });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`select * from passports limit 3`);
  console.log("PASSPORTS", JSON.stringify(r.rows, null, 1).slice(0, 1200));
  await c.end();
})().catch(e => console.log("ERR", e.message));
