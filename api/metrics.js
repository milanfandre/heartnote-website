// Powers the /dashboard. Password-gated with the same team password as the
// Deliver tool. Reads the pre-aggregated analytics views (traffic, clicks,
// checkout intent) plus the orders table (the reliable, server-side source of
// truth for purchases and revenue), and folds in Meta ad spend if configured.
import { sbSelect, supabaseReady } from '../lib/db.js';
import { adminAuthed } from '../lib/auth.js';
import { getAdInsights } from '../lib/meta-insights.js';

const dayStr = (d) => d.toISOString().slice(0, 10);

export default async function handler(req, res) {
  if (!adminAuthed(req)) return res.status(401).json({ error: 'Wrong password' });
  if (!supabaseReady()) return res.status(500).json({ error: 'Database not configured' });

  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  const start = new Date(Date.now() - (days - 1) * 864e5);
  start.setHours(0, 0, 0, 0);
  const startDay = dayStr(start);
  const startISO = start.toISOString();

  try {
    // Pull the small pre-grouped views + raw orders for the window, in parallel.
    const [eventDaily, visitsDaily, buttonDaily, orders] = await Promise.all([
      sbSelect('event_daily', `select=*&day=gte.${startDay}&order=day.asc`),
      sbSelect('visits_daily', `select=*&day=gte.${startDay}&order=day.asc`),
      sbSelect('button_daily', `select=*&day=gte.${startDay}`),
      sbSelect('orders', `select=created_at,amount_total,tier,occasion&created_at=gte.${startISO}&order=created_at.asc`),
    ]);

    // ── Funnel totals ──────────────────────────────────────────────────────
    const sum = (rows, type) => rows.filter((r) => r.type === type).reduce((n, r) => n + Number(r.count), 0);
    const pageviews = sum(eventDaily, 'pageview');
    const ctaClicks = sum(eventDaily, 'cta_click');
    const addToCart = sum(eventDaily, 'add_to_cart');
    const visits = visitsDaily.reduce((n, r) => n + Number(r.sessions), 0);

    // Purchases + revenue come from orders (can't be blocked by an ad-blocker).
    const purchases = orders.length;
    const revenueCents = orders.reduce((n, o) => n + (o.amount_total || 0), 0);

    // ── By-angle funnel (which landing page turns traffic into intent) ──────
    const byAngle = {};
    for (const r of eventDaily) {
      const a = (byAngle[r.angle] ||= { angle: r.angle, pageview: 0, cta_click: 0, add_to_cart: 0 });
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
    for (const o of orders) {
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
      byDay[d] = { day: d, visits: 0, pageviews: 0, cta_click: 0, add_to_cart: 0, purchases: 0, revenue_cents: 0 };
    }
    for (const r of visitsDaily) if (byDay[r.day]) byDay[r.day].visits = Number(r.sessions);
    for (const r of eventDaily) {
      if (!byDay[r.day]) continue;
      if (r.type === 'pageview') byDay[r.day].pageviews += Number(r.count);
      if (r.type === 'cta_click') byDay[r.day].cta_click += Number(r.count);
      if (r.type === 'add_to_cart') byDay[r.day].add_to_cart += Number(r.count);
    }
    for (const o of orders) {
      const d = o.created_at.slice(0, 10);
      if (byDay[d]) { byDay[d].purchases += 1; byDay[d].revenue_cents += o.amount_total || 0; }
    }
    const timeseries = Object.values(byDay);

    // ── Meta ad spend (null until a token is configured) ───────────────────
    const meta = await getAdInsights(days, revenueCents);

    return res.status(200).json({
      range: { days, start: startDay },
      totals: {
        visits, pageviews, cta_clicks: ctaClicks, add_to_cart: addToCart,
        purchases, revenue_cents: revenueCents,
        // Conversion rates across the funnel, guarded against divide-by-zero.
        cta_rate: visits ? ctaClicks / visits : 0,
        intent_rate: ctaClicks ? addToCart / ctaClicks : 0,
        purchase_rate: addToCart ? purchases / addToCart : 0,
        visit_to_purchase: visits ? purchases / visits : 0,
      },
      timeseries, angles, sources, tiers, buttons,
      meta, // { configured, spend, roas, ... } or null
    });
  } catch (err) {
    console.error('metrics failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
