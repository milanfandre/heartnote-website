# RUNBOOK.md — Operating Heart Note

Procedures that have actually worked here, incidents already solved, and the
ground-truth query cookbook. Everything is copy-paste-ready bash from the repo
root (mind the trailing space in the folder name — quote paths).

## Reading secrets locally

`env/heartnote.env` is NOT shell-sourceable (unquoted values contain spaces).
Parse one key at a time; never `source` it, never echo full secrets:

```bash
K() { grep -m1 "^$1=" env/heartnote.env | cut -d= -f2- | tr -d '"'"'"' \r'; }
# e.g. SK=$(K STRIPE_SECRET_KEY); U=$(K SUPABASE_URL | sed -E 's#/+$##; s#/rest/v1$##')
```

**Vercel env is the runtime truth.** The local file drifts (has been blank for
keys that were live in Vercel). Env changes in Vercel need a redeploy to apply.

## Local dev truth

| Works locally | Does NOT work locally |
|---|---|
| All static pages via `npm run dev` (port 3000) | Anything under `/api/*` (serve.mjs is static-only) |
| Puppeteer probes, screenshots | Webhooks, emails, DB writes |
| Dashboard UI with a mocked payload (below) | Real /api/metrics |

Serverless verification loop: `node --check` each touched file → deploy → probe
production. To develop dashboard UI without data, intercept the API:

```js
p.on('request', r => r.url().includes('/api/metrics')
  ? r.respond({status:200, contentType:'application/json', body: JSON.stringify(FIXTURE)})
  : r.continue());
```

## Deploy & verify (the ritual)

1. Commit with a real message; `git push origin main`.
2. Vercel auto-builds (~15–20s build). **Wait ~80s**, then verify against the
   LIVE site — never assume:
   - HTML markers: `curl -s -L https://heartnote.music/ | grep -c '<expected>'`
   - Binary assets byte-match local: `wc -c` local vs `curl -s -L <url> | wc -c`
   - Behavior: puppeteer against `https://www.heartnote.music` (see Probes)
3. POST to APIs must target **www** — apex 308-redirects and curl drops the body
   (`curl -s -X POST https://www.heartnote.music/api/...`).
4. **Known failure**: a push occasionally triggers no build (webhook miss).
   Detect: `vercel ls heartnote-website --scope lucra-36e3a2b9` — newest deploy
   older than your push. Fix: `git commit --allow-empty -m "Trigger a deploy" && git push`.
5. Rollback = `git revert <sha> && git push` (~1 min to live).

## Verification probes

- Section screenshot at true size: `node tools/shot-section.mjs "#pricing" out.png 390 [url]`
- Console + failed-request sweep: `node tools/console-check.mjs http://localhost:3000/order.html`
  (on localhost, `/api/*` failures are expected — static server).
- Full page: `node screenshot.mjs <url> [label]` → `temporary screenshots/`.
  fullPage captures show sticky-header stitching ghosts / duplicated hero —
  capture artifacts, confirm in DOM before "fixing".
- Behavioral probe skeleton (order form, mobile):
  ```js
  // fresh visitor: localStorage.clear() then reload, click through, read DOM
  ```
  Always test as a fresh visitor — the form restores saved progress.
- Live end-to-end checkout test: fill form via puppeteer, submit, confirm
  redirect to checkout.stripe.com, then **expire the session**:
  `curl -s -X POST https://api.stripe.com/v1/checkout/sessions/<cs_...>/expire -u "$SK:"`

## Cross-engine checks (Chrome emulation is NOT iOS Safari)

Mobile-Chrome emulation has missed real iOS bugs here twice. To test the engine
iOS actually uses, install Playwright's WebKit **outside the repo** so the
project keeps its single puppeteer dev dependency:

```bash
D=/tmp/wk && mkdir -p $D && cd $D && npm init -y && npm i playwright && npx playwright install webkit
# then, in a script there:
#   import { webkit, devices } from 'playwright';
#   const ctx = await (await webkit.launch()).newContext({ ...devices['iPhone 13'] });
```

Simulate the failure modes real phones produce, not just the happy path:
`addInitScript(() => { delete window.IntersectionObserver })` (blocked script)
and a stubbed observer that never fires (`class { observe(){} ... }`) — the
latter reproduced the invisible-carousel report exactly.

## Ground-truth cookbook (query the source, don't guess)

**Supabase rows** (orders, events — service key bypasses RLS):
```bash
curl -s "$U/rest/v1/orders?select=created_at,tier,amount_total&order=created_at.desc&limit=20" \
  -H "apikey: $SB" -H "Authorization: Bearer $SB"
```

**Stripe**: recent sessions (`/v1/checkout/sessions?limit=8` — check
`allow_promotion_codes`, `metadata.type=unlock_all` marks upsells), promo codes
(`/v1/promotion_codes?code=MILAN` — MILAN is 100%-off, first-transaction-only,
19+ redemptions ⇒ $0 orders are often REAL customers, not only tests).

**Resend**: `GET https://api.resend.com/emails?limit=50` (Bearer key) →
`last_event` per email (delivered/bounced/opened); `GET /emails/<id>` → bounce
diagnostics; `GET /domains/<id>` → required DNS records with per-record status.

**Meta**: insights
`GET graph.facebook.com/v21.0/act_2316852712389494/insights?fields=spend,reach,clicks,actions&date_preset=maximum&access_token=$T`;
token identity `GET /debug_token?input_token=$T&access_token=$T` (shows app,
scopes, expiry — how the working reporting app was identified).

**DNS** (cache-free): `NS=$(dig +short NS heartnote.music | head -1)` then
`dig +short @$NS TXT send.heartnote.music` etc.

## Incident recipes (each solved here at least once)

**Customer says the song email never arrived** → Resend list → find address →
`last_event`. `bounced` + diagnostic mentioning DNS ⇒ auth records broken.
Current good state: SPF TXT + MX on `send.heartnote.music` (not `send.send.…` —
Namecheap auto-appends the domain, which is how they were misplaced), DKIM at
`resend._domainkey.send…`, exactly ONE `_dmarc` record (two = both void),
`p=none` (tightening to quarantine deliberately deferred). "delivered" can
still mean spam-foldered; only bounces are provable.

**Dashboard/Meta numbers look wrong** → count paid vs $0 orders in Supabase
first (18 of the first 23 rows were $0). Meta counts $0 promo conversions as
purchases and attributes on 7-day click; the orders table is the honest ledger.

**Site shows one price, Stripe charges another** → a partial run of the
price-change checklist (SYSTEM § Money). Grep the SERVED html of index, order,
and all lp pages for stale figures; check `PRICE_*` in Vercel matches the
intended Stripe Price object (amount, one-time, live mode).

**events table empty / send-lyrics 500s** → migrations not run. Re-run
`db/schema.sql` and `db/analytics.sql` in Supabase SQL editor (idempotent).
webhook survives missing columns (drops field, saves order); send-lyrics fails
hard without the lyrics columns.

**"No permissions available" generating a Meta token** → the system user lacks
the asset (assign ad account with View Performance FIRST) or the app lacks
Marketing API. Working combo: system user "Reporting" + app Lucra_Reporting_All.
That token also serves TriFocus — never revoke it for one client.

## Testimonial redaction pipeline (inbox-*.png)

Raw email screenshots contain surnames, addresses, and sometimes **live
/gift/<id> links** (real leak, caught once) — raws are gitignored
(`Screenshot *.png` patterns); only redacted outputs ship.

1. Raw capture lands in `brand_assets/Screenshot ...` (macOS name contains a
   narrow no-break space before AM/PM — glob, don't type it).
2. Redact with ffmpeg, order matters: crop off quoted replies (gift links) →
   **hard mosaic** surnames (`crop→scale /16 area→scale back neighbor` — never
   gaussian, blurred text can be reversed) → white-out (`drawbox=color=white:t=fill`)
   addresses / To:/Cc: lines / any withdrawn-product mentions.
3. Auto-crop to ink: dump gray raster (`ffmpeg -f rawvideo -pix_fmt gray`),
   scan rows/cols for pixels <200, pad 30px. (ffmpeg cropdetect needs
   `skip=0` + looped input for stills; the raw-scan is more reliable.)
4. Export at retina; in HTML set `width/height` = pixels/2 with
   `class="max-w-full h-auto"` so small emails render at natural size and only
   oversized ones shrink. Card wrapper uses `w-fit max-w-full`.
5. Update alt text to match what's visible AFTER redaction; never let page copy
   claim the emails are unedited.
6. Verify with Read on every output — coordinates are estimates until seen.

## UGC video pipeline (homepage reactions carousel)

Sources are 2-5 min 1080x1920 masters (some HEVC) in the client's Creative
Process folder — never committed. Web builds:

```bash
# full video -> Supabase Media bucket (H.264 + AAC; HEVC sources must transcode)
ffmpeg -i SRC.mov -vf scale=720:1280 -c:v libx264 -preset fast -crf 27 \
  -pix_fmt yuv420p -c:a aac -b:a 112k -movflags +faststart out.mp4
# poster (repo, videos/poster-*.jpg) and hero-style muted loop as needed
curl -X POST "$U/storage/v1/object/Media/<n>.mp4" -H "apikey: $SB" \
  -H "Authorization: Bearer $SB" -H "content-type: video/mp4" \
  -H "x-upsert: true" --data-binary @out.mp4     # HTTP 000 = local drop, retry
```

Verify each public URL: 200, `content-type: video/mp4`, `accept-ranges: bytes`,
content-length matches local. Lightbox assigns `src` on first open, so nothing
streams until a visitor asks. Card posters live in `videos/`; captions quote
the burned-in UGC text, never invented stories.

## Data-collection change? Update the privacy policy

privacy.html § tables were written from a code audit (client storage keys,
processor list, hashed-email-to-Meta disclosure). New tracking, storage, or
processor ⇒ update the tables in the same change.
