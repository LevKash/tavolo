import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: ".env.local", quiet: true });
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const o = await c.query("select id, session_id, status, payment_status, total, paid_amount, created_at from orders where created_at > now() - interval '6 hours' order by created_at desc limit 12");
console.log("== ORDERS");
for (const x of o.rows) console.log(x.id.slice(0,8), "|sess:", String(x.session_id).slice(0,8), "|", x.status, "|pay:", x.payment_status, "|EUR", x.total, "|paid:", x.paid_amount, "|", x.created_at.toISOString());
await c.end();
