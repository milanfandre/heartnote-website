// Scratch: clips a screenshot to one element so a section can be reviewed at real size.
// Usage: node _shot-section.mjs <selector> <outPath> <width>
import puppeteer from 'puppeteer';

const [, , selector = '#bundle', out = 'out.png', width = '1440', url = 'http://localhost:3000'] = process.argv;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: Number(width), height: 1000, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

await page.evaluate(async () => {
  const step = window.innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 100));
  }
  document.querySelectorAll('.reveal, .draw').forEach((el) => el.classList.add('in'));
});
await new Promise((r) => setTimeout(r, 900));

const el = await page.$(selector);
if (!el) { console.error(`No element matches ${selector}`); process.exit(1); }
await el.screenshot({ path: out });
await browser.close();
console.log(`Saved ${out}`);
