-- ─────────────────────────────────────────────────────────────
--  Heart Note — restore first-party analytics
-- ─────────────────────────────────────────────────────────────
--  HOW TO RUN THIS (one time):
--   1. Supabase → your project → SQL Editor → New query
--   2. Paste this whole file → Run
--
--  Safe to re-run.
--
--  Why: the tracker started sending a `device` field (mobile / tablet /
--  desktop) with every event, but the column was never added here. PostgREST
--  rejects the whole insert when a field has no column, so EVERY event since
--  2026-08-11 was thrown away: pageviews, CTA clicks, reached_form and
--  add_to_cart alike. The dashboard has been reading an empty table.
--
--  It failed silently because api/track.js swallows tracking errors on
--  purpose, so a broken beacon can never break a page for a visitor. The
--  abandoned-checkout capture kept working throughout, which is why the
--  breakage was invisible: recovery emails went out while analytics recorded
--  nothing.
--
--  This does not recover the lost events. It stops the loss.
-- ─────────────────────────────────────────────────────────────

alter table public.events
  add column if not exists device text;

comment on column public.events.device is
  'mobile | tablet | desktop, from viewport width and touch capability. Added 2026-09-14; events before then have none.';
