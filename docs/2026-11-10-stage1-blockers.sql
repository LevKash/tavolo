-- Stage 1 hardening. Additive and safe to re-run.
-- Apply BEFORE deploying the code that uses it: the app selects whole venue rows,
-- so a missing column breaks every page.

-- 1. Promotions (pair deals, first-order -10%) are opt-in per venue.
alter table venues add column if not exists promos_enabled boolean not null default false;
-- The demo venue keeps showing them.
update venues set promos_enabled = true where slug = 'ambrosia';

-- 2. Shared counters for rate limits (logins, PIN guesses, orders). Serverless
--    instances each have their own memory, so the counters live in the database.
create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);
create index if not exists rate_limits_window_idx on rate_limits (window_start);
