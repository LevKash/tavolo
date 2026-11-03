import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: ".env.local", quiet: true });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select mi.id, mi.name, mi.price from menu_items mi join venues v on v.id=mi.venue_id where v.slug='ambrosia' and mi.is_available=true limit 5`);
console.log(JSON.stringify(r.rows));
await c.end();
