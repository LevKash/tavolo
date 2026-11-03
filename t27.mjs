import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: ".env.local", quiet: true });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(`alter table table_sessions add column if not exists payment_created_at timestamptz`);
const r = await c.query(`select column_name from information_schema.columns where table_name='table_sessions' and column_name='payment_created_at'`);
console.log("added:", JSON.stringify(r.rows));
await c.end();
