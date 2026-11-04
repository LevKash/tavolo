-- Ordavo database hardening for the pilot. NOT applied automatically.
-- Review, run the PREFLIGHT block first on the target database, fix anything it
-- returns, then run the MIGRATION block. Each statement is safe to re-run.
-- The app works without these indexes (it also serialises session creation with
-- an advisory lock), but they make the guarantees permanent.

-- ===================== PREFLIGHT (read-only) =====================
-- 1) duplicate venue slugs
select slug, count(*) from venues group by slug having count(*) > 1;
-- 2) duplicate user e-mails (case-insensitive)
select lower(email), count(*) from users group by lower(email) having count(*) > 1;
-- 3) tables with more than one OPEN session
select table_id, count(*), array_agg(id order by opened_at) as sessions
  from table_sessions where status = 'open' group by table_id having count(*) > 1;
-- 4) duplicate session tokens
select token, count(*) from sessions group by token having count(*) > 1;

-- ===================== MIGRATION =====================
-- Fix duplicates found above first. For (3), keep the newest open session per
-- table and close the others, e.g.:
--   update table_sessions s set status = 'closed', closed_at = now()
--    where s.status = 'open' and s.id <> (
--      select id from table_sessions t where t.table_id = s.table_id and t.status = 'open'
--       order by opened_at desc limit 1);
-- (orders stay attached to their old session; review them before closing.)

create unique index concurrently if not exists venues_slug_uq on venues (slug);
create unique index concurrently if not exists users_email_uq on users (email);
create unique index concurrently if not exists sessions_token_uq on sessions (token);
create unique index concurrently if not exists table_sessions_one_open_uq
  on table_sessions (table_id) where status = 'open';
create index concurrently if not exists orders_venue_status_idx on orders (venue_id, status);
