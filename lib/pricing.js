// Package shapes, add-on pricing, and the upsell rule. Single source of truth
// for the order form, the checkout session, the gift page, and the Deliver tool.
//
// Single     = 1 version, MP3.
// Deluxe     = 2 versions, WAV + MP3 of the one they keep.
// Experience = 3 versions, WAV + MP3, remastered, with the voice included.
//
// The voice is the only add-on. It is charged on Single and Deluxe, and is
// already part of the Experience price.

export const TIERS = {
  single: {
    name: 'Single',
    cents: 5900,
    compareCents: 8900,
    versions: 1,
    blurb: 'A single personalized song.',
  },
  deluxe: {
    name: 'Deluxe',
    cents: 6900,
    compareCents: 9900,
    versions: 2,
    blurb: 'Two versions, premium sound.',
  },
  experience: {
    name: 'Experience Package',
    cents: 8900,
    compareCents: 13900,
    versions: 3,
    blurb: 'Everything included, start to finish.',
  },
};

export const TIER_KEYS = Object.keys(TIERS);

// Optional extras. Each is priced once per order, never per song.
export const ADDONS = {
  voice: { cents: 1000, label: 'Choose your voice' },
};

// Add-ons already baked into a tier's price, so they are never charged again.
export const INCLUDED_ADDONS = {
  single: [],
  deluxe: [],
  experience: ['voice'],
};

export const includesAddon = (tier, addon) => (INCLUDED_ADDONS[tier] || []).includes(addon);

// ── Versions ────────────────────────────────────────────────────────────────
// Tiers where the customer picks one version out of several.
export const VERSIONS_PER_TIER = { deluxe: TIERS.deluxe.versions, experience: TIERS.experience.versions };

// Extra file kinds delivered per version, by tier.
export const VERSION_EXTRAS = { deluxe: ['wav'], experience: ['wav'] };

export const hasVersions = (tier) => Boolean(VERSIONS_PER_TIER[tier]);

// Cost to unlock every version on the keepsake page, in cents.
export const UPSELL_CENTS = { deluxe: 3400, experience: 4900 };

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
