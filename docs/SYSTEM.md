# SYSTEM.md — What Heart Note Is

One file to load the whole system into your head. Structure, data, money,
measurement, and the invariants that must survive any change.
Companions: `RUNBOOK.md` (operate it), `DECISIONS.md` (why it's this way).

## The system in one view

```
                     VISITOR PLANE
  Meta ad ──► /lp, /lp/<angle> (funnel.html, lp-*.html)     index.html
                    │  pixel.js: PageView + first-party beacons │
                    ▼                                           ▼
              order.html ──[submit]──► api/create-checkout-session ──► Stripe Checkout
                    │                        (line items, metadata,        │ pays
                    │                         CAPI InitiateCheckout)       ▼
                    │                                        api/webhook (Stripe event)
                    │                                          │ upsert orders row
                    │                                          │ email customer (confirm)
                    │                                          │ email Paul (new order)
                    │                                          │ CAPI Purchase (dedup eid)
                     MEASUREMENT PLANE                          ▼
  pixel.js ──► api/track ──► events table            FULFILLMENT PLANE (Paul)
      │             └──► Meta CAPI AddToCart          deliver.html (admin pw)
      └ Meta Pixel: AddToCart/InitiateCheckout/         │ upload via api/upload-url
        Purchase (browser side of dedup pairs)          │ (signed PUT → Songs bucket)
                                                        ▼ api/deliver
  dashboard.html ◄── api/metrics ◄── events,         customer email → /gift/<orderId>
  (admin pw)          orders, Meta insights            api/gift renders keepsake page
                                                        │ full-length previews
                                                        ▼
                                          api/choose-version (one-time pick)
                                          api/create-upsell-session (unlock all, promo ok)
                                          lyric loop: api/send-lyrics → /lyrics/<id>
                                                      (api/lyrics GET page + POST respond)
```

## Pages

| File | Route | Purpose |
|---|---|---|
| index.html | / | Homepage. Section order: hero (autoplaying muted Claire reaction loop, videos/hero-claire.mp4) → play-prompt banner → reactions (UGC video carousel + lightbox, streams from Supabase Media bucket) → trust bar → how (4 steps) → receive → pricing → inbox (email testimonials) → listen (samples) → faq → footer |
| order.html | /order.html | Order form → Stripe. Duplicated TIERS object (see Money) |
| funnel.html, lp-*.html | /lp, /lp/anniversary, /lp/birthday(-milestone), /lp/faith | Paid-traffic landing pages. **Intentionally lag the homepage** in places (still "Three simple steps", older hero); see DECISIONS before "fixing" |
| story.html | /story.html | Our Story (Paul; NYU Tisch + Columbia College Chicago) |
| privacy.html, terms.html, contact.html | — | Legal/trust. privacy.html still has `[LEGAL ENTITY NAME]` / `[MAILING ADDRESS]` placeholders |
| success.html | post-checkout | Fires browser Purchase pixel with `eid` for CAPI dedup |
| dashboard.html | /dashboard | Reporting (Lucra palette). Ranges 7/30/90/MTD; funnel is all-Meta from landing-page views |
| deliver.html | /deliver | Paul's fulfillment tool (admin password; no audio players in it) |
| gift.html | — | Legacy static shell; live keepsake page is rendered by api/gift.js |

## API (Vercel serverless — **12-function Hobby cap, currently full**)

| Endpoint | Auth | Does |
|---|---|---|
| create-checkout-session | public | Validates order, builds Stripe session (tier price ID + $10 voice line item), CAPI InitiateCheckout (shared `checkoutEventId`), returns URL. No email field: Stripe collects it |
| webhook | Stripe sig | Upserts order (idempotent on session id; unknown-column fallback drops field but saves order), confirm email, Paul notification, CAPI Purchase, Google Sheet |
| track | public beacon | Whitelisted event types → events table; `reached_form` also → CAPI AddToCart |
| metrics | admin pw | Dashboard payload (events + paid orders + Meta insights). `?diag=meta` = CAPI diagnostics (function-cap workaround) |
| gift | link = credential | Keepsake page. Full-length previews; downloads locked until version chosen |
| choose-version | public | One-time version pick (irreversible by design — protects upsell) |
| create-upsell-session | public | Unlock-all-versions checkout (UPSELL_CENTS; `allow_promotion_codes`) |
| deliver | admin pw | Marks delivered, stores versions/files, schedules/sends customer email |
| upload-url | admin pw | Signed PUT to storage. Songs bucket; also handles Covers via `{cover:true}` |
| send-lyrics / lyrics | admin pw / link | Lyric approval loop. **Dormant product, live plumbing** (add-on removed from sale Aug 4; keep for ops) |
| admin-orders, session-info, contact… | — | Small utilities; read the file header comment |

## Data (Supabase)

- **orders** — one row per Stripe checkout. Key groups: payment (stripe_session_id,
  amount_total), fulfillment (status, song_files, versions[], selected_version,
  versions_unlocked, scheduled_send_at), lyric loop (lyrics, lyrics_status:
  null|sent|approved|changes, lyrics_feedback, timestamps), quick-look columns,
  and `brief` jsonb = the entire checkout metadata verbatim (nothing is ever lost).
- **events** + views event_daily / visits_daily / button_daily / device_daily —
  first-party analytics. **Created Aug 4, 2026; no data exists before that.**
- **Storage**: `Songs` (public, no per-bucket cap; project cap 200MB), `Covers`
  (public, 15MB cap, image-only; orphaned since CD removal), `Media` (public,
  marketing video hosting — the five UGC reaction videos the homepage carousel
  streams; repo holds only their posters and the 6s hero loop in `videos/`).
- Migrations = `db/schema.sql` + `db/analytics.sql`, both idempotent, run by hand
  in Supabase SQL editor. webhook tolerates missing columns; **send-lyrics does not**.

## Money

**Source of truth: `lib/pricing.js`** (tiers, compare-at, ADDONS, INCLUDED_ADDONS,
UPSELL_CENTS, orderTotalCents). Current state: Single $59/~~$89~~ (MP3, 1 version),
Deluxe $69/~~$99~~ (2 versions), Experience $89/~~$139~~ (3 versions, remastered).
One add-on: voice $10 on every tier. One free revision per order. Upsell:
unlock-all-versions $34/$49 after delivery.

**Price-change checklist** — ALL of these move together (they have desynced in
production before):
1. `lib/pricing.js` (cents + compareCents)
2. `order.html` — duplicated `TIERS` JS object **and** the static tier-card
   markup (headline + strike + any savings copy; `sumCompare`/`sumSave` derive)
3. `index.html` pricing cards (price, strike, SAVE badge)
4. `funnel.html` + 3 `lp-*.html` pricing blocks
5. Stripe: create the new Price, update `PRICE_<TIER>` in **Vercel** env, redeploy
6. Promo banner claim ("Up to $50 off") if the max saving changed
7. Verify live per RUNBOOK (grep served HTML for stale figures)

Stripe price IDs live in env (`PRICE_SINGLE/DELUXE/EXPERIENCE`); a Vercel env
change requires a redeploy to take effect. Site shows a price ≠ Stripe charges
is the failure mode — customers see the form total, Stripe charges the price ID.

## Measurement (the naming crossover — read twice)

| First-party event (events.type) | Fires when | Meta event it maps to |
|---|---|---|
| pageview | any page load | — (Pixel PageView separately) |
| cta_click | data-cta click | — |
| **reached_form** | order.html loads (1/session) | **AddToCart** (browser+server, shared eid) |
| **add_to_cart** | pay button pressed | **InitiateCheckout** (fires only after Stripe session exists; shared checkoutEventId) |
| purchase | webhook | Purchase (eid from success_url) |

Yes: first-party `add_to_cart` = Meta InitiateCheckout. Historical naming kept
for dashboard continuity. Every browser/server pair shares an event id or Meta
double-counts; InitiateCheckout and Purchase must NEVER share one id or Meta
dedupes a funnel rung away.

Dashboard funnel = **all Meta, baseline landing-page views** (mixing first-party
visitors with ad-attributed conversions understated every rate — deliberate).
Purchases/revenue tiles = **paid orders only**; $0 rows (tests + 100%-off MILAN
promo, 19 redemptions) are counted separately as `test_orders`.

## External services

| Service | Env vars | Wrapper | Notes |
|---|---|---|---|
| Stripe (live) | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PRICE_* | api handlers | Checkout-only; promo codes allowed on both checkouts |
| Supabase | SUPABASE_URL, SUPABASE_SERVICE_KEY | lib/db.js | Service key bypasses RLS; URL tolerates /rest/v1 suffix |
| Resend | RESEND_API_KEY, ORDER_FROM_EMAIL, ORDER_NOTIFY_EMAIL | lib/mail.js | From `orders@send.heartnote.music`; SPF/DKIM/MX fixed Jul 30 (RUNBOOK incident); DMARC p=none |
| Meta | META_PIXEL_ID, META_CAPI_TOKEN, META_ADS_TOKEN, META_AD_ACCOUNT_ID (`act_2316852712389494`) | lib/meta.js, lib/meta-insights.js | Ads token: system-user "Reporting", app Lucra_Reporting_All, never expires, shared with other Lucra clients — revoking kills all |
| Vercel | — | — | Project heartnote-website, scope lucra-36e3a2b9; auto-deploy from GitHub main; **env is runtime truth**; local heartnote.env is a drifting worksheet |
| DNS | Namecheap | — | apex→www 308; _dmarc must stay a SINGLE record |

## Deliberately dead / kept code — do not "clean up" without reading DECISIONS

- Wedding tier: removed from sale; **read-only branches kept** in gift.js/webhook so past keepsake pages keep working.
- Lyric pipeline: product removed Aug 4; plumbing kept (Paul may use ops-side).
- api/photo-upload-url.js + Covers bucket: orphaned since CD removal.
- UPSELL_CENTS: still live — powers unlock-all-versions on the gift page.
- `_*.mjs` in root: gitignored scratch; durable tooling lives in `tools/`.

## Invariants (the physics — violating any is a bug)

1. Link-is-credential pages (/gift, /lyrics) must never leak: no indexing, no
   published URLs (a testimonial screenshot once nearly shipped a live gift link).
2. All revenue flows through Stripe Checkout; the site never touches card data.
3. Webhook is idempotent and never loses a paid order (brief jsonb catches all).
4. choose-version is one-time; previews full-length but downloads gated —
   together these are what make the upsell worth money.
5. A $0 order is never a "purchase" in reporting.
6. Customer-facing copy: no AI mentions, no em dashes, US spelling, and never
   claim redacted artifacts are "unedited".
7. Every price surface agrees with lib/pricing.js (checklist above).
