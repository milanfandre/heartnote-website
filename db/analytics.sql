-- ─────────────────────────────────────────────────────────────
--  Heart Note — analytics events (Supabase / Postgres)
-- ─────────────────────────────────────────────────────────────
--  HOW TO RUN THIS (one time):
--   1. Open your Supabase project → SQL Editor → New query
--   2. Paste this whole file → Run
--   3. Nothing else to configure — it reuses the same SUPABASE_URL /
--      SUPABASE_SERVICE_KEY the orders pipeline already uses.
--
--  After this, every pageview, button click, and checkout intent the
--  site records lands in public.events, and the /dashboard reads the
--  three views at the bottom. Safe to re-run.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),

  -- what happened: 'pageview' | 'cta_click' | 'add_to_cart' | 'purchase'
  type          text not null,

  -- where / which campaign, so we can slice the funnel by angle and source
  page          text,          -- pathname, e.g. /lp/wedding
  angle         text,          -- wedding | birthday-milestone | anniversary | faith | general | (page name)
  source        text,          -- utm_source, or 'facebook' (fbclid), or referrer host, or 'direct'
  label         text,          -- for cta_click: the button text / destination

  -- who (anonymous, first-party): a random id kept in the browser's localStorage
  session_id    text,

  -- attribution passthrough, captured on the first hit of the session
  referrer      text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,

  -- money, on add_to_cart / purchase (in cents), so revenue reads off events too
  value_cents   integer,
  tier          text,

  -- anything else the client wants to attach, without a schema change
  meta          jsonb not null default '{}'::jsonb
);

create index if not exists events_created_at_idx on public.events (created_at desc);
create index if not exists events_type_idx        on public.events (type);
create index if not exists events_session_idx      on public.events (session_id);

-- Server-only, exactly like orders: the service key bypasses RLS, the public
-- anon key gets nothing. The browser never touches this table directly — it
-- POSTs to /api/track, which writes with the service key.
alter table public.events enable row level security;

-- ── Aggregation views the dashboard reads (small, pre-grouped) ──────────────

-- One row per day / event type / angle / source. Powers the funnel, the
-- timeseries, and the by-angle / by-source breakdowns.
create or replace view public.event_daily as
  select date_trunc('day', created_at)::date as day,
         type,
         coalesce(nullif(angle, ''),  '(none)') as angle,
         coalesce(nullif(source, ''), 'direct') as source,
         count(*)                                as count,
         coalesce(sum(value_cents), 0)           as value_cents
  from public.events
  group by 1, 2, 3, 4;

-- Distinct visitors per day (kept separate because count(distinct) can't be
-- re-summed out of event_daily). "Visits" = daily unique sessions.
create or replace view public.visits_daily as
  select date_trunc('day', created_at)::date as day,
         count(distinct session_id)          as sessions
  from public.events
  where type = 'pageview'
  group by 1;

-- Which buttons get clicked, per day, so the dashboard can rank them over any
-- window it asks for.
create or replace view public.button_daily as
  select date_trunc('day', created_at)::date as day,
         coalesce(nullif(label, ''), '(unlabeled)') as label,
         count(*)                                    as count
  from public.events
  where type = 'cta_click'
  group by 1, 2;
