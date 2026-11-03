import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: ".env.local", quiet: true });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select mi.id, mi.name, mi.price, mi.sold_out from menu_items mi join venues v on v.id=mi.venue_id where v.slug='ambrosia' and coalesce(mi.sold_out,false)=false limit 5`);
console.log(JSON.stringify(r.rows, null, 1));
await c.end();
