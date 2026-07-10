-- ─────────────────────────────────────────────────────────────
--  Heart Note — orders database (Supabase / Postgres)
-- ─────────────────────────────────────────────────────────────
--  HOW TO RUN THIS (one time):
--   1. Create a free project at supabase.com
--   2. Open the project → SQL Editor → New query
--   3. Paste this whole file → Run
--   4. Copy your keys into Vercel (see env/heartnote.env for the two
--      variables: SUPABASE_URL and SUPABASE_SERVICE_KEY)
--
--  After this, every paid order's full customer input is saved here
--  automatically. You can browse them in Supabase → Table Editor → orders.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),

  -- payment
  stripe_session_id  text unique,
  amount_total       integer,          -- amount paid, in cents
  currency           text default 'usd',

  -- fulfillment tracking (used by the admin dashboard later)
  status             text not null default 'new',  -- new | in_progress | delivered
  song_file_url      text,             -- the finished song, once uploaded
  delivered_at       timestamptz,
  notes              text,             -- internal notes for whoever fulfills it

  -- quick-look columns so the dashboard can sort/filter without opening each order
  tier               text,             -- single | deluxe | experience | wedding
  customer_email     text,
  customer_name      text,
  occasion           text,
  recipient_name     text,
  song_count         integer,

  -- the complete brief, exactly as the customer submitted it, so nothing is
  -- ever lost even if we don't have a dedicated column for a field
  brief              jsonb not null default '{}'::jsonb
);

-- Newest orders first when browsing.
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx     on public.orders (status);

-- Lock the table down: only the server (using the service key, which bypasses
-- these rules) can read or write. The public/anon key gets nothing. The admin
-- dashboard will authenticate separately.
alter table public.orders enable row level security;
