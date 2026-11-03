require("dotenv").config({ path: ".env.local", quiet: true });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  await c.connect();
  const m = await c.query(`select id, name, price from menu_items where venue_id=(select id from venues where slug='ambrosia') and name ilike '%nectar%' limit 1`);
  console.log("ITEM", JSON.stringify(m.rows[0]));
  await c.end();
})().catch(e => console.log("ERR", e.message));
