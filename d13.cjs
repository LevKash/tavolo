require("dotenv").config({ path: ".env.local", quiet: true });
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  await c.connect();
  const r = await c.query(`select guest_id, venue_id, stamps, free_served from guest_passports order by stamps desc limit 5`);
  for (const x of r.rows) console.log("P", x.guest_id?.slice(0,8), "stamps=", x.stamps, "free=", x.free_served);
  await c.end();
})().catch(e => console.log("ERR", e.message));
