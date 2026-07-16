// Package shapes and upsell pricing, shared by the gift page, the upsell
// checkout, and the Deliver tool.
//
// Deluxe   = 2 versions, each with a WAV.
// Experience = 3 versions, each with a WAV + multitrack + remastered.
// The customer's package includes ONE version of their choosing; the upsell
// unlocks the rest (pure margin, since every version is produced anyway).
export const VERSIONS_PER_TIER = { deluxe: 2, experience: 3 };

// Extra file kinds included per version, by tier.
export const VERSION_EXTRAS = { deluxe: ['wav'], experience: ['wav', 'multitrack', 'remastered'] };

// Cost to unlock every version, in cents.
export const UPSELL_CENTS = { deluxe: 3400, experience: 4900 };

export const hasVersions = (tier) => Boolean(VERSIONS_PER_TIER[tier]);

export const dollars = (cents) => `$${Math.round((cents || 0) / 100)}`;

export function upsellCopy(tier) {
  const n = VERSIONS_PER_TIER[tier];
  const price = dollars(UPSELL_CENTS[tier]);
  if (tier === 'deluxe') return { heading: 'Like both versions?', body: `Get both for just ${price}`, cta: `Unlock both versions – ${price}` };
  return { heading: 'Torn between them?', body: `Unlock all ${n} versions for just ${price}`, cta: `Unlock all ${n} versions – ${price}` };
}
