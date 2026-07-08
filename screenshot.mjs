import puppeteer from 'puppeteer';
import { readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(ROOT, 'temporary screenshots');

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || '';

async function nextName() {
  await mkdir(SHOT_DIR, { recursive: true });
  const files = await readdir(SHOT_DIR);
  let max = 0;
  for (const f of files) {
    const m = f.match(/^screenshot-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const n = max + 1;
  return `screenshot-${n}${label ? '-' + label : ''}.png`;
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

// Scroll through the whole page so IntersectionObserver reveal animations fire,
// then return to top before capturing the full page.
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8;
  const height = document.body.scrollHeight;
  for (let y = 0; y < height; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  // Guarantee every reveal element is in its final state for the review shot
  document.querySelectorAll('.reveal, .draw').forEach((el) => el.classList.add('in'));
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 400));
});

// let fonts/animations settle
await new Promise((r) => setTimeout(r, 800));

const name = await nextName();
const out = join(SHOT_DIR, name);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`Saved ${out}`);
