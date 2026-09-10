-- ─────────────────────────────────────────────────────────────
--  Heart Note — stop duplicate order emails
-- ─────────────────────────────────────────────────────────────
--  HOW TO RUN THIS (one time):
--   1. Supabase → your project → SQL Editor → New query
--   2. Paste this whole file → Run
--
--  Safe to re-run.
--
--  Why: Stripe re-delivers a webhook if our response is slow, and on
--  2026-09-10 two deliveries overlapped. The order row is protected by a
--  unique constraint so nothing was charged or saved twice, but the emails
--  had no such guard and both the customer and the team got two copies.
--
--  This column is the guard. The webhook claims it with a single atomic
--  UPDATE ... WHERE notified_at IS NULL before sending anything, so only one
--  delivery can ever win, however many arrive at once.
-- ─────────────────────────────────────────────────────────────

alter table public.orders
  add column if not exists notified_at timestamptz;

comment on column public.orders.notified_at is
  'Set once the order emails have been sent. Claimed atomically by api/webhook.js so a re-delivered Stripe event cannot send them twice.';

-- Existing paid orders were already emailed; mark them so a replayed old
-- event can never email those customers again.
update public.orders
   set notified_at = coalesce(notified_at, created_at)
 where notified_at is null;
