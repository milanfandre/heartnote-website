// Package shapes, add-on pricing, and the upsell rule. Single source of truth
// for the order form, the checkout session, the gift page, and the Deliver tool.
//
// Single     = 1 version, MP3.
// Deluxe     = 2 versions, WAV + MP3 of the one they keep.
// Experience = 3 versions, WAV + MP3, remastered.
//
// Two add-ons: the voice (legacy, only the classic form still sends it) and
// expedited 6-hour delivery, which is the one the quiz sells.

export const TIERS = {
  single: {
    name: 'Single',
    cents: 3900,
    compareCents: 7800,
    versions: 1,
    blurb: 'A single personalized song.',
  },
  deluxe: {
    name: 'Deluxe',
    cents: 4900,
    compareCents: 9800,
    versions: 2,
    blurb: 'Two versions, premium sound.',
  },
  experience: {
    name: 'Experience Package',
    cents: 5900,
    compareCents: 11800,
    versions: 3,
    blurb: 'Everything included, start to finish.',
  },
};

export const TIER_KEYS = Object.keys(TIERS);

// Optional extras. Each is priced once per order, never per song.
export const ADDONS = {
  voice: { cents: 1000, label: 'Choose your voice' },
  expedited: { cents: 2000, label: 'Expedited 6-hour delivery' },
};

// Add-ons already baked into a tier's price, so they are never charged again.
export const INCLUDED_ADDONS = {
  single: [],
  deluxe: [],
  experience: [],
};

export const includesAddon = (tier, addon) => (INCLUDED_ADDONS[tier] || []).includes(addon);

// ── Versions ────────────────────────────────────────────────────────────────
// Tiers where the customer picks one version out of several.
export const VERSIONS_PER_TIER = { deluxe: TIERS.deluxe.versions, experience: TIERS.experience.versions };

// Extra file kinds delivered per version, by tier.
export const VERSION_EXTRAS = { deluxe: ['wav'], experience: ['wav'] };

export const hasVersions = (tier) => Boolean(VERSIONS_PER_TIER[tier]);

// Cost to unlock every version on the keepsake page, in cents.
export const UPSELL_CENTS = { deluxe: 1900, experience: 2900 };

// ── Expedited delivery ──────────────────────────────────────────────────────
// The song lands within 6 hours instead of 24. Paul works on Central time, so
// the rule lives there: an order placed before 12 pm Central is due by 6 pm
// Central the same day, and after noon the option closes until the next
// morning. The order form calls this to show or hide the button; the checkout
// API calls it again so a tab opened before noon cannot buy the promise after
// it. Both read the same clock, so they cannot disagree for long.
const CENTRAL = 'America/Chicago';
const CUTOFF_HOUR = 12;
const DUE_HOUR = 18;

export function expeditedWindow(at = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL, hourCycle: 'h23', weekday: 'short', year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const { type, value } of f.formatToParts(at)) p[type] = value;
  const open = Number(p.hour) < CUTOFF_HOUR;
  // 6 pm on the same Central date as a real instant: read the Central wall
  // clock as if it were UTC, and shift by the offset in force right now. Noon
  // and 6 pm are on the same side of any DST change (those happen at 2 am).
  const wallAsUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offsetMs = Math.round((wallAsUTC - at.getTime()) / 60000) * 60000;
  const due = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, DUE_HOUR, 0, 0) - offsetMs);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, month: 'short', day: 'numeric' }).format(at);
  return { open, due, dueISO: due.toISOString(), dueLabel: `6:00 pm Central, ${p.weekday} ${date}`, cutoffLabel: '12 pm Central' };
}

// ── Money ───────────────────────────────────────────────────────────────────
export const dollars = (cents) => `$${Math.round((cents || 0) / 100)}`;

// What an order costs, given a tier and which add-ons are switched on.
export function orderTotalCents(tierKey, addons = {}) {
  const tier = TIERS[tierKey];
  if (!tier) return 0;
  let total = tier.cents;
  for (const key of Object.keys(ADDONS)) {
    if (addons[key] && !includesAddon(tierKey, key)) total += ADDONS[key].cents;
  }
  return total;
}

export function upsellCopy(tier) {
  const n = VERSIONS_PER_TIER[tier];
  const price = dollars(UPSELL_CENTS[tier]);
  if (tier === 'deluxe') return { heading: 'Like both versions?', body: `Get both for just ${price}`, cta: `Unlock both versions – ${price}` };
  return { heading: 'Torn between them?', body: `Unlock all ${n} versions for just ${price}`, cta: `Unlock all ${n} versions – ${price}` };
}
