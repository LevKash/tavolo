-- Stage 2 payment hardening. Additive and safe to re-run.
-- Apply BEFORE deploying the code that uses it.

-- Which Viva environment a payment was made in (a demo payment is not money).
alter table payments add column if not exists env text not null default '';
-- Money returned to the guest in Viva after the payment (refund / reversal).
alter table payments add column if not exists refunded_cents integer not null default 0;
alter table payments add column if not exists refunded_at timestamptz;
-- Lets the bar and the dashboard list payments that need a human quickly.
create index if not exists payments_attention_idx on payments (venue_id) where needs_attention;
-- /r and refund notifications look a payment up by its Viva order code.
create index if not exists payments_order_code_idx on payments (order_code) where order_code <> '';
