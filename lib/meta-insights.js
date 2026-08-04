// Meta (Facebook/Instagram) ad-spend metrics via the Marketing API.
//
// This is the ONE piece that needs something from the ad account: a token with
// the `ads_read` scope and the ad account id. The Conversions API token the site
// already uses is for sending conversions, not reading spend, so it won't work
// here. Set these in Vercel when you're ready — until then this returns null and
// the dashboard's ad panel shows an "add a token" note instead of numbers.
//
//   META_ADS_TOKEN        a system-user (or user) token with ads_read
//   META_AD_ACCOUNT_ID    the ad account id, e.g. act_1234567890
//
const GRAPH = 'https://graph.facebook.com/v21.0';

export function metaAdsReady() {
  return Boolean(process.env.META_ADS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

// Returns { spend, impressions, reach, clicks, cpc, ctr, cpm, results, roas }
// for the window, plus a daily series, or null if not configured.
// `days` is the trailing window; `revenueCents` is our own purchase revenue in
// the same window, used to compute a blended ROAS the dashboard can show.
export async function getAdInsights(days = 30, revenueCents = 0) {
  if (!metaAdsReady()) return null;

  const acct = process.env.META_AD_ACCOUNT_ID.startsWith('act_')
    ? process.env.META_AD_ACCOUNT_ID
    : `act_${process.env.META_AD_ACCOUNT_ID}`;
  const token = process.env.META_ADS_TOKEN;
  const fields = 'spend,impressions,reach,clicks,cpc,ctr,cpm,actions,action_values';
  const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  async function graph(query) {
    const r = await fetch(`${GRAPH}/${acct}/insights?${query}&access_token=${token}`);
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error ? j.error.message : `Meta ${r.status}`);
    return j.data || [];
  }

  try {
    // Window total (one row) + a daily breakdown for the spend chart.
    const [totalRows, dailyRows] = await Promise.all([
      graph(`fields=${fields}&time_range=${timeRange}`),
      graph(`fields=spend,impressions,clicks&time_range=${timeRange}&time_increment=1`),
    ]);
    const t = totalRows[0] || {};
    const spend = +t.spend || 0;

    // Meta reports dozens of overlapping action types for the same event. Pick
    // the canonical one for each rung, falling back to the pixel-specific name.
    const act = (...names) => {
      for (const n of names) {
        const hit = (t.actions || []).find((a) => a.action_type === n);
        if (hit) return +hit.value || 0;
      }
      return 0;
    };
    const funnel = {
      reach: +t.reach || 0,
      landing_page_views: act('landing_page_view', 'omni_landing_page_view'),
      add_to_cart: act('add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'),
      initiate_checkout: act('initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'),
      purchases: act('purchase', 'offsite_conversion.fb_pixel_purchase'),
    };

    // Meta's own attributed revenue, so ROAS can be reported the way Meta does
    // as well as blended against our real orders.
    const purchaseValue = (t.action_values || [])
      .filter((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')
      .reduce((n, a) => Math.max(n, +a.value || 0), 0);

    const revenue = (revenueCents || 0) / 100;
    return {
      configured: true,
      spend,
      impressions: +t.impressions || 0,
      reach: +t.reach || 0,
      clicks: +t.clicks || 0,
      cpc: +t.cpc || 0,
      ctr: +t.ctr || 0,
      cpm: +t.cpm || 0,
      roas: spend > 0 ? revenue / spend : null,
      meta_roas: spend > 0 && purchaseValue ? purchaseValue / spend : null,
      purchase_value: purchaseValue,
      cost_per_purchase: funnel.purchases ? spend / funnel.purchases : null,
      funnel,
      daily: dailyRows.map((d) => ({
        day: d.date_start,
        spend: +d.spend || 0,
        impressions: +d.impressions || 0,
        clicks: +d.clicks || 0,
      })),
    };
  } catch (err) {
    // A bad/expired token shouldn't take the whole dashboard down.
    return { configured: true, error: err.message };
  }
}
