// Package shapes, add-on pricing, and the upsell rule. Single source of truth
// for the order form, the checkout session, the gift page, and the Deliver tool.
//
// Single     = 1 version, MP3.
// Deluxe     = 2 versions, WAV + MP3 of the one they keep.
// Experience = 3 versions, WAV + MP3, with the voice and lyric review included.
//
// The CD is an add-on on every tier and is included in none of them.

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
    compareCents: 11900,
    versions: 3,
    blurb: 'Everything included, start to finish.',
  },
};

export const TIER_KEYS = Object.keys(TIERS);

// Optional extras. Each is priced once per order, never per song.
export const ADDONS = {
  voice: { cents: 1000, label: 'Choose your voice' },
  lyrics: { cents: 2000, label: 'Lyric review before production' },
  cd: { cents: 3000, label: 'Keepsake CD with your photo' },
};

// Add-ons already baked into a tier's price, so they are never charged again.
export const INCLUDED_ADDONS = {
  single: [],
  deluxe: [],
  experience: ['voice', 'lyrics'],
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

// ── The Experience upsell ───────────────────────────────────────────────────
// Experience bundles the voice and the lyric review, so it only ever wins when
// a customer has chosen both. The CD costs the same on every tier, so it
// cancels out of the comparison and is deliberately ignored here.
//
//   Single + voice + lyrics = $89  -> same as Experience, but 1 version vs 3
//   Deluxe + voice + lyrics = $99  -> $10 more than Experience, 2 versions vs 3
export function experienceUpsell(tierKey, addons = {}) {
  if (tierKey !== 'single' && tierKey !== 'deluxe') return null;
  if (!addons.voice || !addons.lyrics) return null;

  const current = orderTotalCents(tierKey, addons);
  const upgraded = orderTotalCents('experience', addons);
  const saving = current - upgraded;
  const from = TIERS[tierKey];

  return {
    saving,
    fromVersions: from.versions,
    toVersions: TIERS.experience.versions,
    // Wording stays honest whether the customer saves money or merely gets more.
    headline: saving > 0
      ? `Save ${dollars(saving)} with the Experience Package`
      : 'The Experience Package costs the same',
    body: saving > 0
      ? `You've added the voice and the lyric review. Both are already included in the Experience Package, which also gives you ${TIERS.experience.versions} versions instead of ${from.versions} — for ${dollars(saving)} less than what you have now.`
      : `You've added the voice and the lyric review. Both are already included in the Experience Package for the same total, and it gives you ${TIERS.experience.versions} versions to choose from instead of ${from.versions}.`,
  };
}

export function upsellCopy(tier) {
  const n = VERSIONS_PER_TIER[tier];
  const price = dollars(UPSELL_CENTS[tier]);
  if (tier === 'deluxe') return { heading: 'Like both versions?', body: `Get both for just ${price}`, cta: `Unlock both versions – ${price}` };
  return { heading: 'Torn between them?', body: `Unlock all ${n} versions for just ${price}`, cta: `Unlock all ${n} versions – ${price}` };
}
