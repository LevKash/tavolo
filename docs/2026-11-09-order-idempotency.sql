-- Idempotency key for guest orders. Additive and safe to re-run.
-- Apply BEFORE deploying the code that uses it (placeOrder reads/writes the column).
alter table orders add column if not exists client_key text;
create unique index if not exists orders_client_key_uq on orders (venue_id, client_key) where client_key is not null;
