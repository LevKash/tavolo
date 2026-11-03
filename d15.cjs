require("dotenv").config({ path: ".env.local", quiet: true });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  await c.connect();
  await c.query(`update venues set passport_enabled=false where slug='ambrosia'`);
  const r = await c.query(`select slug, passport_enabled from venues`);
  for (const x of r.rows) console.log("V", x.slug, x.passport_enabled);
  await c.end();
})().catch(e => console.log("ERR", e.message));
