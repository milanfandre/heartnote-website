# Environment variables

This folder holds the **keys and settings** the checkout needs. Open
**`heartnote.env`** in this folder and fill in the value after each `=`.

> `heartnote.env` stays on your computer only — it is listed in `.gitignore`,
> so your secret keys are never uploaded to GitHub.

## What each value is and where to get it

| Variable | What it is | Where to find it |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_…` / `sk_live_…`) | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_…`) | Stripe → Developers → Webhooks → your endpoint |
| `PRICE_SINGLE` | Price ID for the $59 Single product (`price_…`) | Stripe → Products → Single |
| `PRICE_DELUXE` | Price ID for the $69 Deluxe product (`price_…`) | Stripe → Products → Deluxe |
| `PRICE_EXPERIENCE` | Price ID for the $99 Heart Note Experience (`price_…`) | Stripe → Products |
| `PRICE_WEDDING` | Price ID for the $199 Wedding Package (`price_…`) | Stripe → Products |
| `AI_WORKFLOW_URL` | Where paid orders are sent to make the song | Your AI workflow (leave blank for now) |
| `AI_WORKFLOW_SECRET` | Optional token your workflow expects | Your AI workflow (optional) |

## Where these actually go

**The live site reads them from Vercel — not from this file.** Once you've
filled in `heartnote.env`, copy each value into:

> Vercel → your project → **Settings → Environment Variables**

This file is your private worksheet so you have everything in one place
before (and after) you paste it into Vercel.

## (Optional) testing on your own computer

If you ever want to run the checkout locally, the Vercel CLI (`vercel dev`)
reads a file named `.env` in the project root — tell me and I'll set that up
from your `heartnote.env` values.
