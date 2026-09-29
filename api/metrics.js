// Powers the /dashboard. Password-gated with the same team password as the
// Deliver tool. Reads the pre-aggregated analytics views (traffic, clicks,
// checkout intent) plus the orders table (the reliable, server-side source of
// truth for purchases and revenue), and folds in Meta ad spend if configured.
import { sbSelect, supabaseReady } from '../lib/db.js';
import { adminAuthed } from '../lib/auth.js';
import { getAdInsights } from '../lib/meta-insights.js';
import metaDiagnose from '../lib/meta-diagnose.js';

const dayStr = (d) => d.toISOString().slice(0, 10);

// PostgREST returns at most 1,000 rows per request, so read in pages.
async function selectAll(relation, query, pageSize = 1000) {
  const out = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const rows = await sbSelect(relation, `${query}&limit=${pageSize}&offset=${offset}`);
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

// Pages that are part of buying or running the business, not places people
// land. Everything else counts as a landing page view.
const NOT_LANDING = /^\/(order|order-classic|success|dashboard|deliver|gift|lyrics|unsubscribe)(\/|\.html|$)/;
// Our own tools and the gift pages recipients open: not shoppers, not sessions.
const INTERNAL = /^\/(dashboard|deliver|gift|lyrics|unsubscribe)(\/|\.html|$)/;
// Until this date the homepage's quiz buttons were untagged, so click-throughs
// from it were not recorded.
const CLICKS_COMPLETE_FROM = '2026-09-28T00:00:00Z';

// The whole journey, counted in people (unique browser sessions), not events,
// so a reload or a second tab never counts twice. Every rung is counted on its
// own: someone who opens the order form from an email skipped the landing
// page, and is still counted at the form.
const JOURNEY_TYPES = ['cta_click', 'reached_form', 'quiz_step', 'story_start', 'story_ready', 'story_help',
  'add_to_cart', 'checkout_click', 'stripe_open'];
// Events added on 2026-09-28. Before that date these rungs have no data, and
// the dashboard says so instead of showing a false drop to zero.
const NEW_TYPES = ['quiz_step', 'checkout_click', 'stripe_open'];

async function buildJourney(startISO, purchases, endISO = null) {
  const end = endISO ? `&created_at=lt.${endISO}` : '';
  const [views, acts, firsts] = await Promise.all([
    selectAll('events', `select=session_id,page&type=eq.pageview&created_at=gte.${startISO}${end}&order=id.asc`),
    selectAll('events', `select=session_id,type,meta&type=in.(${JOURNEY_TYPES.join(',')})&created_at=gte.${startISO}${end}&order=id.asc`),
    Promise.all(NEW_TYPES.map((t) => sbSelect('events', `select=created_at&type=eq.${t}&order=id.asc&limit=1`)
      .then((r) => [t, r[0] ? r[0].created_at : null]).catch(() => [t, null]))),
  ]);
  const first = Object.fromEntries(firsts);

  const sets = {};
  const add = (k, sid) => { if (sid) (sets[k] ||= new Set()).add(sid); };
  const sessions = new Set();
  for (const v of views) {
    if (!v.session_id || INTERNAL.test(v.page || '')) continue;
    sessions.add(v.session_id);
    if (!NOT_LANDING.test(v.page || '')) add('landed', v.session_id);
  }
  for (const e of acts) {
    const sid = e.session_id;
    if (e.type === 'cta_click') {
      const href = (e.meta && e.meta.href) || '';
      if (/order/.test(href)) add('clicked', sid);
    } else if (e.type === 'quiz_step') {
      const n = e.meta && +e.meta.step;
      if (n >= 1 && n <= 5) add('step' + n, sid);
    } else {
      add(e.type, sid);
    }
  }
  const n = (k) => (sets[k] ? sets[k].size : 0);
  // A rung is "partial" when tracking for it began after the start of the
  // window; its count is only for the days since then.
  const since = (t) => {
    if (!first[t]) return 'never';
    if (endISO && first[t] >= endISO) return 'never';      // not tracked at all in this window
    return first[t] > startISO ? first[t] : null;
  };

  const steps = [
    { key: 'landed',   name: 'Landing page sessions',        hint: 'the homepage or an ad landing page loaded', v: n('landed') },
    { key: 'clicked',  name: 'Clicked through to the quiz', hint: 'pressed a button that opens the order form', v: n('clicked'),
      since: startISO < CLICKS_COMPLETE_FROM ? (endISO && endISO <= CLICKS_COMPLETE_FROM ? 'partial' : CLICKS_COMPLETE_FROM) : null, sinceNote: 'homepage clicks counted from' },
    { key: 'form',     name: 'Started the quiz',             hint: 'the order form loaded', v: n('reached_form') },
    { key: 'step1',    name: 'Answered: who it is for',      hint: 'question 1 of 5, names', v: n('step1'), since: since('quiz_step') },
    { key: 'step2',    name: 'Answered: the occasion',       hint: 'question 2 of 5', v: n('step2'), since: since('quiz_step') },
    { key: 'step3',    name: 'Answered: the style',          hint: 'question 3 of 5', v: n('step3'), since: since('quiz_step') },
    { key: 'step4',    name: 'Answered: the voice',          hint: 'question 4 of 5, which opens the story', v: n('step4'), since: since('quiz_step') },
    { key: 'started',  name: 'Started writing the story',    hint: 'typed at least one character', v: n('story_start') },
    { key: 'step5',    name: 'Finished the story',           hint: 'wrote the 80-character minimum and pressed Create my song', v: n('step5'), since: since('quiz_step') },
    { key: 'checkout', name: 'Reached the checkout page',    hint: 'entered an email and saw the packages and price', v: n('add_to_cart') },
    { key: 'pay',      name: 'Pressed Complete my purchase', hint: 'the button on the checkout page', v: n('checkout_click'), since: since('checkout_click') },
    { key: 'stripe',   name: 'Reached Stripe',               hint: 'Stripe opened its payment page', v: n('stripe_open'), since: since('stripe_open') },
    { key: 'paid',     name: 'Paid',                         hint: 'paid orders, from our own order records', v: purchases },
  ];
  return {
    sessions: sessions.size,
    steps,
    story: {
      started: n('story_start'),
      finished: n('step5'),
      finished_since: since('quiz_step'),
      filled_meter: n('story_ready'),        // 280+ characters: the meter full, not a gate
      used_help: n('story_help'),            // people, not clicks
      reached: n('step4'),
    },
  };
}

export default async function handler(req, res) {
  if (!adminAuthed(req)) return res.status(401).json({ error: 'Wrong password' });

  // Conversion-tracking diagnostic shares this endpoint because Vercel's Hobby
  // plan caps the project at 12 serverless functions and api/ is full.
  if (req.query.diag === 'meta') return metaDiagnose(req, res);

  if (!supabaseReady()) return res.status(500).json({ error: 'Database not configured' });

  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  const start = new Date(Date.now() - (days - 1) * 864e5);
  start.setHours(0, 0, 0, 0);
  const startDay = dayStr(start);
  const startISO = start.toISOString();

  try {
    // Pull the small pre-grouped views + raw orders for the window, in parallel.
    const [eventDaily, visitsDaily, buttonDaily, deviceDaily, orders] = await Promise.all([
      sbSelect('event_daily', `select=*&day=gte.${startDay}&order=day.asc`),
      sbSelect('visits_daily', `select=*&day=gte.${startDay}&order=day.asc`),
      sbSelect('button_daily', `select=*&day=gte.${startDay}`),
      sbSelect('device_daily', `select=*&day=gte.${startDay}`).catch(() => []),
      sbSelect('orders', `select=created_at,amount_total,tier,occasion&created_at=gte.${startISO}&order=created_at.asc`),
    ]);

    // ── Funnel totals ──────────────────────────────────────────────────────
    const sum = (rows, type) => rows.filter((r) => r.type === type).reduce((n, r) => n + Number(r.count), 0);
    const pageviews = sum(eventDaily, 'pageview');
    const ctaClicks = sum(eventDaily, 'cta_click');
    const reachedForm = sum(eventDaily, 'reached_form');
    const addToCart = sum(eventDaily, 'add_to_cart');
    const visits = visitsDaily.reduce((n, r) => n + Number(r.sessions), 0);

    // ── The story step ─────────────────────────────────────────────────────
    // First-party only: Meta has no visibility inside the quiz, and this is
    // the step people were dropping out of. The three rungs separate the two
    // failures that look identical in a single number: reaching the question
    // and never typing, versus typing and giving up before it was long enough
    // to continue. `help` is how many opened the writing prompts, which is the
    // only way to tell whether that panel is earning its place.
    const storyView = sum(eventDaily, 'story_view');
    const storyStart = sum(eventDaily, 'story_start');
    const storyReady = sum(eventDaily, 'story_ready');
    const storyHelp = sum(eventDaily, 'story_help');

    // Purchases + revenue come from orders (can't be blocked by an ad-blocker).
    // A row worth $0 is a test order or a 100%-off promo redemption, not a sale,
    // so it is excluded from the purchase count and from every rate built on it.
    // `test_orders` is reported separately rather than silently dropped.
    const paidOrders = orders.filter((o) => (o.amount_total || 0) > 0);
    const purchases = paidOrders.length;
    const testOrders = orders.length - purchases;
    const revenueCents = paidOrders.reduce((n, o) => n + (o.amount_total || 0), 0);

    // ── By-angle funnel (which landing page turns traffic into intent) ──────
    const byAngle = {};
    for (const r of eventDaily) {
      const a = (byAngle[r.angle] ||= { angle: r.angle, pageview: 0, cta_click: 0, reached_form: 0, add_to_cart: 0 });
      a[r.type] = (a[r.type] || 0) + Number(r.count);
    }
    const angles = Object.values(byAngle).sort((x, y) => y.pageview - x.pageview);

    // ── By-source (where the traffic came from) ────────────────────────────
    const bySource = {};
    for (const r of eventDaily.filter((r) => r.type === 'pageview')) {
      bySource[r.source] = (bySource[r.source] || 0) + Number(r.count);
    }
    const sources = Object.entries(bySource).map(([source, pageviews]) => ({ source, pageviews }))
      .sort((a, b) => b.pageviews - a.pageviews);

    // ── Purchases + revenue by tier ────────────────────────────────────────
    const byTier = {};
    for (const o of paidOrders) {
      const t = (byTier[o.tier || 'unknown'] ||= { tier: o.tier || 'unknown', orders: 0, revenue_cents: 0 });
      t.orders += 1; t.revenue_cents += o.amount_total || 0;
    }
    const tiers = Object.values(byTier).sort((a, b) => b.revenue_cents - a.revenue_cents);

    // ── Top buttons ────────────────────────────────────────────────────────
    const btn = {};
    for (const r of buttonDaily) btn[r.label] = (btn[r.label] || 0) + Number(r.count);
    const buttons = Object.entries(btn).map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count).slice(0, 12);

    // ── Daily timeseries (traffic + funnel + revenue) ──────────────────────
    const byDay = {};
    for (let i = 0; i < days; i++) {
      const d = dayStr(new Date(start.getTime() + i * 864e5));
      byDay[d] = { day: d, visits: 0, pageviews: 0, cta_click: 0, reached_form: 0, add_to_cart: 0, purchases: 0, revenue_cents: 0 };
    }
    for (const r of visitsDaily) if (byDay[r.day]) byDay[r.day].visits = Number(r.sessions);
    for (const r of eventDaily) {
      if (!byDay[r.day]) continue;
      if (r.type === 'pageview') byDay[r.day].pageviews += Number(r.count);
      if (r.type === 'cta_click') byDay[r.day].cta_click += Number(r.count);
      if (r.type === 'reached_form') byDay[r.day].reached_form += Number(r.count);
      if (r.type === 'add_to_cart') byDay[r.day].add_to_cart += Number(r.count);
    }
    for (const o of paidOrders) {
      const d = o.created_at.slice(0, 10);
      if (byDay[d]) { byDay[d].purchases += 1; byDay[d].revenue_cents += o.amount_total || 0; }
    }
    const timeseries = Object.values(byDay);

    // ── Meta ad spend (null until a token is configured) ───────────────────
    // The same window immediately before this one, for Shopify-style
    // "vs previous period" changes on the conversion card.
    const prevStart = new Date(start.getTime() - days * 864e5).toISOString();
    const [meta, journey, prevJourney] = await Promise.all([
      getAdInsights(days, revenueCents),
      buildJourney(startISO, purchases).catch((err) => ({ error: err.message })),
      sbSelect('orders', `select=amount_total&created_at=gte.${prevStart}&created_at=lt.${startISO}`)
        .then((o) => buildJourney(prevStart, o.filter((x) => (x.amount_total || 0) > 0).length, startISO))
        .catch((err) => ({ error: err.message })),
    ]);
    if (journey && !journey.error && prevJourney && !prevJourney.error) {
      journey.prev = { sessions: prevJourney.sessions, steps: prevJourney.steps.map((x) => ({ key: x.key, v: x.v, since: x.since || null })) };
    }

    return res.status(200).json({
      range: { days, start: startDay },
      totals: {
        visits, pageviews, cta_clicks: ctaClicks, reached_form: reachedForm, add_to_cart: addToCart,
        purchases, revenue_cents: revenueCents, test_orders: testOrders,
        // Conversion rates across the funnel, guarded against divide-by-zero.
        cta_rate: visits ? ctaClicks / visits : 0,
        reach_rate: ctaClicks ? reachedForm / ctaClicks : 0,
        intent_rate: reachedForm ? addToCart / reachedForm : 0,
        purchase_rate: addToCart ? purchases / addToCart : 0,
        visit_to_purchase: visits ? purchases / visits : 0,
      },
      story: {
        reached: storyView,
        started: storyStart,
        finished: storyReady,
        used_help: storyHelp,
        // Of everyone who saw the question, who never typed a character.
        never_started_rate: storyView ? (storyView - storyStart) / storyView : 0,
        // Of everyone who started typing, who gave up before it was usable.
        gave_up_rate: storyStart ? (storyStart - storyReady) / storyStart : 0,
        // End to end: saw the question, left with a story we can write from.
        completion_rate: storyView ? storyReady / storyView : 0,
        help_rate: storyView ? storyHelp / storyView : 0,
      },
      journey,
      timeseries, angles, sources, tiers, buttons,
      devices: Object.values((deviceDaily || []).reduce((acc, r) => {
        const k = r.device || 'unknown';
        (acc[k] ||= { device: k, sessions: 0, events: 0 });
        acc[k].sessions += Number(r.sessions) || 0;
        acc[k].events += Number(r.events) || 0;
        return acc;
      }, {})).sort((a, b) => b.sessions - a.sessions),
      meta, // { configured, spend, roas, ... } or null
    });
  } catch (err) {
    console.error('metrics failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
