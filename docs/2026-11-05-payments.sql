-- Payments by order. Additive and safe to re-run. Apply BEFORE deploying the code
-- that uses it (the app selects the new columns).

alter table venues add column if not exists webhook_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists venues_webhook_token_uq on venues (webhook_token);

alter table orders add column if not exists payment_id uuid;
alter table orders add column if not exists paid_at timestamptz;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id),
  table_id uuid not null,
  merchant_trns text not null,
  order_code text not null default '',
  amount_cents integer not null,
  status text not null default 'pending',
  transaction_id text not null default '',
  needs_attention boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  last_checked_at timestamptz
);
create unique index if not exists payments_merchant_trns_uq on payments (merchant_trns);
create unique index if not exists payments_transaction_uq on payments (transaction_id) where transaction_id <> '';
create index if not exists payments_venue_status_idx on payments (venue_id, status);
create index if not exists payments_table_idx on payments (table_id, status);

create table if not exists payment_orders (
  payment_id uuid not null references payments(id) on delete cascade,
  order_id uuid not null,
  amount_cents integer not null
);
create unique index if not exists payment_orders_uq on payment_orders (payment_id, order_id);
create index if not exists payment_orders_order_idx on payment_orders (order_id);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text not null,
  venue_id uuid,
  payment_id uuid,
  transaction_id text not null default '',
  outcome text not null,
  detail text not null default ''
);
create index if not exists payment_events_received_idx on payment_events (received_at);
