-- ─────────────────────────────────────────────────────────────
--  Heart Note — abandoned checkout recovery
-- ─────────────────────────────────────────────────────────────
--  HOW TO RUN THIS (one time):
--   1. Supabase → your project → SQL Editor → New query
--   2. Paste this whole file → Run
--
--  Safe to re-run: everything is "if not exists".
--
--  What it stores: someone who finished the V3 quiz and gave us their
--  email, but did not pay. Their brief is kept so Paul can record a real
--  preview for them, and so the follow-up emails can name the person the
--  song is for. A row is closed the moment they buy or unsubscribe.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.abandoned_checkouts (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- who to write to
  email                 text not null,

  -- link credential for the preview / unsubscribe pages (never guessable)
  token                 text not null unique,

  -- the brief, so Paul can actually make something and the emails can be personal
  recipient_name        text,
  relationship          text,
  recipient_gender      text,
  occasion              text,
  themes                text,
  music_style           text,
  tempo                 text,
  voice                 text,
  favorite_thing        text,
  story                 text,
  tier                  text,
  brief                 jsonb,            -- the whole quiz payload, verbatim

  -- lifecycle
  --   open              → nudge emails scheduled
  --   preview_requested → they asked to hear one; Paul has a job to do
  --   preview_ready     → Paul uploaded a preview; delivery emails sent
  --   recovered         → they bought (all pending email canceled)
  --   unsubscribed      → they opted out (all pending email canceled)
  status                text not null default 'open',

  preview_requested_at  timestamptz,
  preview_url           text,             -- Paul's real recording
  preview_note          text,             -- optional line from Paul
  preview_sent_at       timestamptz,
  recovered_at          timestamptz,
  unsubscribed_at       timestamptz,

  -- Resend ids of the scheduled follow-ups, so they can be canceled
  scheduled_email_ids   text[] default '{}',
  emails_sent           integer not null default 0,

  -- which ad/campaign this person came from
  attr                  jsonb
);

create index if not exists abandoned_email_idx   on public.abandoned_checkouts (email);
create index if not exists abandoned_status_idx  on public.abandoned_checkouts (status);
create index if not exists abandoned_created_idx on public.abandoned_checkouts (created_at desc);

-- Keep updated_at honest without needing the app to remember.
create or replace function public.touch_abandoned_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists abandoned_touch on public.abandoned_checkouts;
create trigger abandoned_touch
  before update on public.abandoned_checkouts
  for each row execute function public.touch_abandoned_updated_at();

-- Paul's work queue: who asked to hear a preview and is still waiting.
create or replace view public.abandoned_queue as
select
  id, created_at, email, token, recipient_name, relationship, occasion,
  themes, music_style, tempo, voice, favorite_thing, story, tier, status,
  preview_requested_at
from public.abandoned_checkouts
where status in ('open', 'preview_requested')
order by
  (status = 'preview_requested') desc,   -- people who asked come first
  created_at desc;

-- The table is only ever read and written with the service key, which
-- bypasses RLS. Enabling RLS with no policy keeps it shut to anon callers.
alter table public.abandoned_checkouts enable row level security;
