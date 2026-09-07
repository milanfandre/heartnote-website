# DECISIONS.md — Why Heart Note Is The Way It Is

Append-only decision log, newest last. Each entry: what was decided, why, and
what it supersedes. Dates from git history; a few are approximate (~).
When this file and an older spec disagree, **this file wins**.

- **~Jul 7-16, 2026 — Foundations.** "Heirloom Keepsake" brand (claret/gold/ivory,
  Fraunces + Nunito Sans + Pinyon Script). Static site + Vercel functions +
  Supabase, Stripe Checkout only. Hard rule from client: never mention AI on the
  site. Gift page is link-as-credential.

- **Jul 27 — Storage limit raised to 200MB** (Supabase project setting; needed
  Pro). Bucket `Songs` has no per-bucket cap, inherits project cap. WAV uploads
  were failing at the old 50MB default (bucket cap can never exceed project cap).

- **Jul 28 — Version previews: 30s → 60s → full length.** Client call: hearing
  everything sells the choice better. Downloads stay locked until a version is
  chosen; choose-version is one-time so the unlock-all upsell keeps its value.

- **Jul 28 — Wedding package killed, storefront only.** Read-only rendering kept
  in gift.js/webhook so existing wedding customers' pages never break. `wedding`
  removed from checkout TIERS so no new order can be forged.

- **Jul 28 — Strike-through pricing adopted.** Flagged once in writing: a
  perpetual countdown + never-charged "was" prices is FTC/CMA-risk territory;
  client chose to proceed. Copy has since been kept literally true where possible.

- **Jul 30 — Deliverability incident root-caused.** SPF/MX had been created at
  `send.send.heartnote.music` (Namecheap auto-append trap) and _dmarc existed
  twice (two DMARC records = none). Fixed; DMARC left at `p=none` deliberately
  until SPF has a clean history. rua now → paul@heartnote.music.

- **Jul 30 — Promo codes enabled on the upsell checkout** (parity with main
  checkout). MILAN code: 100%-off, first-transaction-only ⇒ $0 orders can be
  real customers.

- **Aug 2-3 — Pricing settled at $59/~~$89~~, $69/~~$99~~, $89→$99→$89 saga ends
  at Experience $89/~~$139~~** ("save $50" is the banner's "up to"). Lesson
  institutionalized: prices live on many surfaces; see SYSTEM price-change
  checklist (a first-occurrence string replace once shipped a wrong card price).

- **Aug 3-4 — Big simplification.** Removed: mood field, third story box,
  relationship field, CD product, lyric-review product, "for every occasion" +
  closing-CTA homepage sections. Voice ($10) is the only add-on, on every tier
  (never "included" — Experience price reflects it). One free revision per order
  on every package (was a $34 fee mention; fee language purged). Email field
  removed from the form — Stripe collects it; webhook already preferred
  `customer_details.email`. Lyric pipeline code retained for ops use.

- **Aug 4 — Measurement architecture.** First-party events table finally created
  (it had never existed; beacons were silently discarded — nothing predates this
  day). Event naming crossover accepted deliberately: first-party `add_to_cart`
  (pay-button) = Meta InitiateCheckout; `reached_form` = Meta AddToCart. Server
  fires InitiateCheckout only after the Stripe session exists. Browser/server
  pairs share event ids; IC and Purchase never share one.

- **Aug 4 — Dashboard funnel = all-Meta, baseline landing-page views.** Mixing
  first-party visitors with ad-attributed conversions understated every rate.
  Funnel drawn as fixed evenly-stepped trapezoids (data-driven widths collapsed
  the tail). Purchases = paid orders only; $0 rows surfaced as `test_orders`.
  Lucra palette (ink #07001F, orange/pink/purple/green), validated for CVD.
  Month-to-date = trailing window of today's date-of-month (reuses `days=`).

- **Aug 4 — Meta ads token strategy.** Reuse system user "Reporting" + app
  `Lucra_Reporting_All` (the proven combo; the fresh-system-user path dead-ended
  on app roles). Trade-off accepted: one credential spans Lucra clients;
  revocation is all-or-nothing.

- **Aug 5 — Privacy policy written from a code audit**, not a template: names
  the four storage keys, six processors, and the hashed-email-to-Meta transfer.
  Placeholders `[LEGAL ENTITY NAME]` / `[MAILING ADDRESS]` still await client.

- **~Aug 11 — Face on the brand.** Our Story page with Paul's photos, NYU Tisch
  + Columbia College Chicago. Email identity moved to paul@heartnote.music.
  Repo made private (was public; history verified secret-free first).

- **~Aug 12-13 — User-test response.** The "broken checkout" was a validation
  error rendering 2,200px below the mobile fold (showErr scrolled to page
  bottom); now scrolls to + rings the offending field. Occasions grid and
  closing CTA cut; hamburger nav added; social proof softened to "4.5 from
  1,200+ families"; one voice (Lily) shown "Unavailable" — wording chosen to
  avoid claiming a person is away. Countdown moved daily → weekly (ends Sunday
  midnight, visitor-local). Standing advice on record: make the offer real or
  drop the timer; weekly-forever is still a fiction.

- **Aug 14-19 — Email testimonials replace quote cards.** Four real customer
  emails (verified against Resend logs), redacted per RUNBOOK pipeline (mosaic
  surnames, addresses/To:/Cc: white-outs, CD-question removed since product is
  gone, live gift link cropped — an actual near-leak). Styled review cards then
  deleted as the weaker duplicate; footer "Reviews" → #inbox. Copy never claims
  the emails are unedited (they no longer are). Consent nudge given to client
  repeatedly; publishing was their call.

- **Sep 7 — Mobile legibility for the inbox section.** Images cropped to
  measured ink bounds (raw-pixel scan) and served at retina-natural size capped
  by the card; cards hug content (`w-fit`). Bob's 1600px-wide paragraph is
  physically illegible at 390px, so phones show his key line as real text under
  the caption; a narrow re-capture from Paul would fully fix it.

- **Sep 7 — Knowledge layer created.** CLAUDE.md rewritten as the operating
  manual (old one falsely claimed the project wasn't scaffolded); SYSTEM.md /
  RUNBOOK.md / DECISIONS.md added; scratch verification scripts promoted to
  committed `tools/`; July spec marked partially superseded.

## Standing client preferences (apply everywhere, always)
No AI mentions on-site · no em dashes in customer copy · US spelling ·
push-live pre-authorized but always verify · Paul fulfills via /deliver ·
keep landing-page divergence until told otherwise.
