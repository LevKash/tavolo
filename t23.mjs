import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: ".env.local", quiet: true });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const cols = await c.query(`select column_name from information_schema.columns where table_name='menu_items'`);
console.log(cols.rows.map(r=>r.column_name).join(", "));
await c.end();
