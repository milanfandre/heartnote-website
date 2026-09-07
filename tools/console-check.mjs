// Loads a page and reports JS errors, console.error output, and failed
// network requests. Exit code 1 if anything real surfaced.
// Usage: node tools/console-check.mjs <url>
// Note: on localhost, /api/* failures are EXPECTED (serve.mjs is static-only)
// and are listed but do not fail the check.
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://localhost:3000';
const isLocal = url.includes('localhost');

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
const errors = [], failed = [], expected = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('requestfailed', (r) => {
  (isLocal && r.url().includes('/api/') ? expected : failed).push(r.url().slice(0, 100));
});
page.on('response', (r) => {
  if (r.status() >= 400) (isLocal && r.url().includes('/api/') ? expected : failed).push(`${r.status()} ${r.url().slice(0, 100)}`);
});

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await browser.close();

if (errors.length) { console.log('JS ERRORS:'); errors.forEach((e) => console.log('  ' + e)); }
if (failed.length) { console.log('FAILED REQUESTS:'); failed.forEach((f) => console.log('  ' + f)); }
if (expected.length) console.log(`(${expected.length} /api/* failures ignored on localhost)`);
if (!errors.length && !failed.length) console.log('NO ERRORS / NO 404s');
process.exit(errors.length || failed.length ? 1 : 0);
