# CLAUDE.md — Heart Note Operating Manual

Heart Note (heartnote.music) sells personalized songs. This repo is the whole
business system: a static Tailwind-CDN site, Vercel serverless APIs, Supabase
(orders + analytics + song storage), Stripe checkout, Resend email, Meta
Pixel/CAPI/ads, and a password-gated reporting dashboard at `/dashboard`.

**The doc tower** — read the layer you need, nothing more:

| Doc | Question it answers |
|---|---|
| `docs/SYSTEM.md` | What is this system? (routes, data, money, events, invariants) |
| `docs/RUNBOOK.md` | How do I operate/verify/debug it? (deploy ritual, ground-truth queries, incidents) |
| `docs/DECISIONS.md` | Why is it this way? (dated decision log; supersedes older specs) |
| git history of `checkout-restructure` branch | The July product spec (never merged; superseded by DECISIONS.md) |

## Always Do First
- **Invoke the `frontend-design` skill** before writing any frontend code, every session, no exceptions.

## The Rendering Standard (non-negotiable, applies to every page)

Cost three failed fixes and a live conversion problem. Do not relax it.

1. **Revenue-critical content renders with CSS alone.** The carousel, hero
   media, pricing and CTAs must be visible and correctly sized with **no**
   dependency on JS running, an observer firing, or a script loading. Animation
   may only ever *add* to an already-visible baseline, never reveal it.
2. **Never let a box infer its height.** `aspect-[x/y]` / `aspect-video` alone
   is not a height. Engines may decline to apply `aspect-ratio` (notably to
   `<button>`), and since these boxes hold absolutely-positioned children under
   `overflow-hidden`, a failure collapses them to zero and clips everything
   away. Set `height` outright for fixed widths, `padding-top: %` for fluid
   ones. **`@supports not (aspect-ratio)` does NOT protect you** — a browser
   that supports the property but skips it on an element passes that guard.
3. **Scroll reveals need a failsafe.** `.reveal` starts visible; it may only be
   hidden once JS adds `html.reveal-armed`, and a 2s timer must reveal anything
   the observer missed.
4. **Verify in WebKit, not just Chrome.** Chromium with an iOS user-agent is
   not iOS Safari and has missed a Safari-only bug here twice.

Before shipping any visual change: `npm run check:render` (add
`HN_PLAYWRIGHT_DIR=...` for WebKit coverage; see RUNBOOK). It re-tests every
critical element with aspect-ratio disabled and the observer broken.

## Standing Rules (user-set, non-negotiable)
- **Never mention AI** anywhere on the site, in any form.
- **No em dashes** in any customer-facing copy or email. Use period, comma, or colon.
- **US spelling** (personalized, favorite).
- **Push-live is pre-authorized**: commit, push to `main`, then ALWAYS verify the
  deploy per `docs/RUNBOOK.md` (§ Deploy & verify). Report what shipped.
- Prices, tiers, add-ons: change only via the **price-change checklist** in
  `docs/SYSTEM.md` — prices are duplicated across surfaces and have desynced before.

## Environment Truth (macOS, this machine)
- Fully scaffolded and **live in production**. Node at `/opt/homebrew/bin/node`;
  `puppeteer` IS installed in the project; ffmpeg at `/opt/homebrew/bin/ffmpeg`.
- The project folder name ends with a **trailing space**
  (`.../HeartNote Website /`) — always quote paths.
- `env/heartnote.env` is a **local worksheet, not shell-sourceable** (unquoted
  values with spaces) and **drifts from Vercel, which is the runtime truth**.
  Parse single keys: `grep -m1 '^KEY=' env/heartnote.env | cut -d= -f2-`.
- `serve.mjs` serves **static files only** — `/api/*` NEVER runs locally.
  Serverless code is verified by `node --check`, code review, and live probes
  after deploy (see RUNBOOK). There is no local vercel dev setup.

## Local Server & Screenshots
- **Always serve on localhost** — never screenshot a `file:///` URL.
- `npm run dev` (= `node serve.mjs`) → http://localhost:3000. If already
  running, don't start a second instance.
- Full page: `node screenshot.mjs http://localhost:3000 [label]` → auto-saved to
  `./temporary screenshots/` (fullPage; sticky-header stitching artifacts and
  duplicated-hero ghosts in the capture are artifacts, not page bugs).
- One section at real size: `node tools/shot-section.mjs "#sel" out.png 390 [url]`.
- Console/network sanity: `node tools/console-check.mjs <url>`.
- **Rendering invariants: `npm run check:render [url]`** — critical elements
  across / (v2), /v1, /v3, /v3-order, both viewports, both engines, under simulated
  failure (aspect-ratio ignored, observer dead, observer absent). Must pass
  before any visual change ships.
- After screenshotting, Read the PNG and compare specifically ("gap is 16px,
  should be 24px"). **At least 2 comparison rounds**; verify mobile (390px) and
  desktop for anything visual.

## Editing Discipline (lessons already paid for)
- String replacements MUST assert uniqueness first (`s.count(old) == 1`). A
  first-occurrence replace once retargeted Single's price instead of
  Experience's and shipped a wrong price to production.
- After JS-bearing edits: extract and `node --check` the inline script.
- Prefer measuring over eyeballing: pixel-scan image bounds, probe rendered
  DOM with puppeteer, query the live APIs (RUNBOOK cookbook) for ground truth.
- Landing pages (`funnel.html`, `lp-*.html`) share copy patterns with
  `index.html` but are separate files — a homepage change usually implies a
  landing-page sweep; check before declaring done.

## Never Commit
- `env/heartnote.env`, `.env*` (secrets; gitignored)
- Raw screenshots (`Screenshot *.png`, `brand_assets/Screenshot *.png`) — they
  carry unredacted customer PII and live gift links. Only redacted
  `brand_assets/inbox-*.png` ship. Pipeline: RUNBOOK § Testimonial redaction.
- Heavy source media (`audio/source/`, `brand_assets/hf_*.png` etc. — see .gitignore)

## Reference Images
- If a reference image is provided: match layout, spacing, typography, and color exactly. Swap in placeholder content. Do not improve or add to the design.
- If no reference image: design from scratch with high craft (guardrails below).
- Screenshot output, compare against reference, fix mismatches, re-screenshot. Minimum 2 rounds.

## Output Defaults
- Pages are single HTML files, styles inline, Tailwind via CDN
  (`https://cdn.tailwindcss.com`) with the shared claret/gold/ivory config —
  copy the `tailwind.config` block from an existing page, don't invent tokens.
- Serverless: plain ESM files in `api/`, shared logic in `lib/`.
  **Vercel Hobby caps the project at 12 serverless functions** — `api/` is at
  the cap; extend an existing handler (see `api/metrics.js` diag pattern)
  rather than adding files.
- Placeholder images only when no real asset exists: check `brand_assets/` first.
- Mobile-first responsive; hero/section imagery gets the `.lifestyle` treatment.

## Anti-Generic Guardrails
- **Colors:** never default Tailwind palette; use the brand tokens (claret `#6E1423`, gold `#C6973F`, ivory `#F7F1E6`, blush, ink — full set in any page's config).
- **Shadows:** layered, color-tinted (`shadow-keepsake`, `shadow-lift`), never flat `shadow-md`.
- **Typography:** Fraunces display + Nunito Sans body (+ Pinyon Script accents); tight tracking on large headings, 1.7 line-height on body.
- **Gradients/texture:** layered radial gradients + the SVG grain overlay.
- **Animations:** only `transform` and `opacity`; never `transition-all`; spring easing; respect `prefers-reduced-motion`.
- **Interactive states:** every clickable needs hover, focus-visible, and active states. No exceptions.
- **Images:** gradient overlay + claret `mix-blend-multiply` treatment layer.
- **Depth:** base → elevated → floating layering, not one z-plane.

## Hard Rules
- Do not add sections, features, or content not asked for.
- Do not "improve" a reference design — match it.
- Do not stop after one screenshot pass.
- Do not use `transition-all`.
- Do not use default Tailwind blue/indigo as primary color.
