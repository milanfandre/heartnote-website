# Heart Note — Website

Marketing storefront for Heart Note: custom-composed keepsake songs sold as personal digital gifts.

This is a **static site** — a single `index.html` with inline styles and Tailwind (via CDN). No build step required to view it.

## Getting started

Requires [Node.js](https://nodejs.org/) (v18+).

```bash
npm install          # installs Puppeteer (+ its own Chrome) for screenshots
node serve.mjs       # serves the site at http://localhost:3000
```

Open http://localhost:3000 in your browser.

## Editing workflow

- The whole home page lives in **`index.html`**. Styles are inline (`<style>` block + Tailwind utility classes configured in the `<head>`).
- Brand tokens (colors, fonts) are defined once in the Tailwind config and the `<style>` block near the top of `index.html`.
- Design rules for this project are in **`CLAUDE.md`** — Claude Code loads these automatically. Read it before making design changes.
- **`logo-concepts.html`** is a working gallery of logo directions (not part of the live site).

### Taking screenshots (for design review)

```bash
node screenshot.mjs http://localhost:3000            # full-page screenshot
node screenshot.mjs http://localhost:3000 my-label   # with a label suffix
```

Screenshots are saved (auto-incrementing) to `temporary screenshots/`. The script scrolls the page so scroll-reveal animations render before capture.

## Working with Claude Code

The `CLAUDE.md` rules require the **frontend-design** skill before writing frontend code. Install it once in Claude Code:

1. Run `/plugin` and add the `claude-plugins-official` marketplace.
2. Install the **frontend-design** plugin.

The skill is per-machine — it does **not** come with this repo.

## Brand at a glance

- **Palette:** claret `#6E1423` · antique gold `#C6973F` · warm ivory `#F7F1E6` · soft blush `#E9CBC0` · ink `#2B2019`
- **Type:** Fraunces (display), Nunito Sans (body), Pinyon Script (accents)
- **Voice:** warm, human, plain-spoken. Never mention AI — the product is framed as a personalized song, professionally produced.
- **Audience:** older gift-givers who value sentiment and trust; large, legible type and clear trust signals throughout.

## Deploying

The site is static, so any static host works. Recommended: **Cloudflare Pages** or **Netlify** connected to this GitHub repo for automatic deploys on push, with free SSL and easy custom-domain (heartnote.music) setup.

> **Before production:** replace the Tailwind CDN (`cdn.tailwindcss.com`) with a compiled Tailwind CSS file — the CDN is intended for development only.

## Status

Marketing home page only. The order form, payment, and song delivery are not yet built.
