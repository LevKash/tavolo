
import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: ".env.local", quiet: true });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query("select id, payment_order_code, payment_status, table_id, opened_at from table_sessions where payment_order_code <> '' order by opened_at desc limit 5");
for (const x of r.rows) console.log(x.payment_order_code, "|", x.payment_status, "|", x.table_id, "|", x.opened_at);
await c.end();
