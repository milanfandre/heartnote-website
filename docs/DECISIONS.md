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

- **Sep 7 — Hero goes video; UGC reaction carousel added.** The static
  anniversary photo and the "Now playing, For Sarah" card are replaced by a 6s
  muted loop of the Claire reaction hook (caption burned in; card's play-JS and
  CSS removed with it). A reactions band under the hero copies timelesssong.com's
  format — dark full-bleed, 9:16 rounded cards, on-card captions, edge arrows —
  skinned claret. Deliberate divergence: cards are posters, not muted autoplay;
  the full videos (transcoded from ~1.4GB of masters) stream from the new
  Supabase `Media` bucket only when a card opens the lightbox, sound on. Motion
  budget spent on the hero alone.

- **Sep 7 — Hero loop carries its real audio; layout tightened.** Browsers
  refuse autoplay with sound, so the loop still starts muted; an ivory speaker
  toggle (bottom-right, pulses until first tap) unmutes and restarts the clip
  from 0 so the hook is heard from its first beat. Opening the reactions
  lightbox mutes the hero so two soundtracks never overlap. The play-prompt
  banner under the hero was cut as redundant and the trust bar moved up from
  below the carousel to sit between hero and reactions (ivory → claret →
  claret-dark ramp).

- **Sep 8 — /v2 competitor-format concept page.** Client asked for a duplicate
  of the site replicating timelesssong.com's entire mobile UX, skinned in Heart
  Note's brand. Built as unlinked, noindexed `v2.html` (live for review, not in
  any nav): montage hero cut from the six UGC hook edits (15.6s, own audio
  behind a tap-to-unmute chip), reaction carousel, swipeable 4-step deck, dark
  "a question" section with a phone-frame walkthrough of the real order form,
  Claire story feature, gift-receipt vs song-ticket comparison, pain-point
  cards, 3-column compare chart, occasions grid, sample list, deliverables +
  package card, FAQ, sticky bottom CTA. All copy written fresh (structure
  copied, words not); every claim kept to approved ones (24 hours, one free
  revision, 4.5 from 1,200+, $59/$69/$89). Replaces nothing; index.html stays
  the real homepage until told otherwise.

- **Sep 8 — v2 gets the competitor's quiz checkout and true desktop layouts.**
  v2-order.html replicates the rival's flow: 7-step quiz, then email capture,
  then an "Almost there" page (letter, reviews, samples, Claire video, package
  picker in a sticky rail). It submits to the existing create-checkout-session
  API (extra quiz fields ride mood/details/other so Paul's brief view needs no
  change; buyer email prefills Stripe). The v2 homepage compare chart became
  three continuous columns with "up to $50 off comparable services" instead of
  named prices, and the static phone mockup became a 33s cursor-driven screen
  recording of the real quiz (videos/demo-checkout.mp4). Both v2 pages now
  carry full desktop layouts. Deliberately NOT copied: the rival's fake
  scarcity bar and their 30-day money-back guarantee; our happiness-promise
  wording stands until the client approves a refund commitment in writing.

- **Sep 8 — v2 hides its prices until checkout.** Client call, copying the
  rival's reveal pattern: the v2 homepage now shows only savings framing ("up
  to $50 off"), never $59/$69/$89; the tier picker on the quiz's final
  "Almost there" page is the single place prices appear. The order demo video
  was re-cut to end on the email step so no price leaks through the recording,
  and the occasions CTA became a solid 2px claret-outline button. The classic
  homepage and order.html keep visible prices; only v2 runs the experiment.

- **Sep 8 — Progressive-enhancement hardening after a real-device blank-page
  report.** A client phone in incognito showed the homepage without its videos.
  Two root causes, both invisible to headless-Chrome probes: (1) `.reveal`
  sections started at opacity 0 and an unguarded IntersectionObserver sat at
  the top of the single script block, so any blocked or failed script left
  most of the page permanently invisible; (2) carousel cards took their height
  only from CSS aspect-ratio, which iOS 14 Safari and earlier lack, collapsing
  the track to nothing. Fix: content is now visible by default and hides for
  the entrance animation only after the observer arms (`html.reveal-armed`);
  click-to-play wiring lives in its own script block; `@supports not
  (aspect-ratio)` fallbacks give the ratio boxes real heights. Applied to
  index, v2, and v2-order. Standing rule: never gate baseline visibility on
  JS succeeding.

## Standing client preferences (apply everywhere, always)
No AI mentions on-site · no em dashes in customer copy · US spelling ·
push-live pre-authorized but always verify · Paul fulfills via /deliver ·
keep landing-page divergence until told otherwise.
