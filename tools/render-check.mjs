// render-check.mjs — enforces the two rules that cost us three failed fixes.
//
//   1. Revenue-critical elements must have real height and be visible using
//      CSS alone. No dependency on JS running, an observer firing, or a
//      dimension being inferred from aspect-ratio.
//   2. Nothing may be left invisible when a script is blocked or fails.
//
// It re-tests each page under the failure modes real phones actually produce:
//   - aspect-ratio silently not applied (what broke the carousel in Safari)
//   - an IntersectionObserver that never fires (restored tab, odd scheduling)
//   - no IntersectionObserver at all (blocked or stripped script)
//
// Usage:
//   node tools/render-check.mjs                      # localhost:3000
//   node tools/render-check.mjs https://www.heartnote.music
//
// Chromium runs via the project's puppeteer. WebKit (the engine iOS Safari
// uses, and the one that caught the real bug) runs too if Playwright is
// installed out-of-tree — see RUNBOOK "Cross-engine checks". Without it the
// script still runs, but prints a warning: Chromium alone has missed this
// class of bug before.

import puppeteer from 'puppeteer';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

// What must always render. Add a row whenever a page gains critical content.
const PAGES = [
  {
    path: '/',
    must: [
      { sel: '#vtrack .vcard', name: 'reactions carousel', minH: 400, all: true },
      { sel: '.lifestyle', name: 'hero media', minH: 200 },
    ],
  },
  {
    path: '/v2',
    must: [
      { sel: '#vtrack .vcard', name: 'reactions carousel', minH: 380, all: true },
      { sel: '#storyPlay', name: 'story video card', minH: 200 },
      { sel: '.phone-screen', name: 'order demo phone', minH: 300 },
    ],
  },
  {
    path: '/v3',
    must: [{ sel: '.lifestyle', name: 'hero media', minH: 200 }],
  },
  {
    path: '/v2-order',
    // The checkout phase only renders once the quiz is complete.
    setup: () => {
      localStorage.setItem('hn_v2_quiz', JSON.stringify({
        who: 'someone', name: 'Check', rel: '', gender: 'Female', occasion: 'Anniversary',
        occasionOther: '', themes: ['Love'], style: 'Acoustic', tempo: 'Medium', voice: 'Female',
        favorite: 'x', story: 'x'.repeat(300), email: 'check@example.com', tier: 'single',
        phase: 'checkout', step: 7,
      }));
    },
    must: [{ sel: '#coVideo', name: 'checkout reaction video', minH: 120 }],
  },
];

const MODES = [
  { key: 'normal', label: 'normal' },
  {
    key: 'noAspect',
    label: 'aspect-ratio ignored',
    css: '*, *::before, *::after { aspect-ratio: auto !important; }',
  },
  {
    key: 'deadIO',
    label: 'observer never fires',
    init: () => { window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }; },
  },
  {
    key: 'noIO',
    label: 'no observer at all',
    init: () => { delete window.IntersectionObserver; },
  },
];

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
];

// Measured in the page: real box height and the opacity actually inherited.
function measure(sel, all) {
  const els = [...document.querySelectorAll(sel)];
  if (!els.length) return { found: 0 };
  const targets = all ? els : [els[0]];
  let minH = Infinity, minOpacity = 1;
  for (const el of targets) {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    minH = Math.min(minH, el.getBoundingClientRect().height);
    let node = el;
    while (node && node !== document.body) {
      minOpacity = Math.min(minOpacity, parseFloat(getComputedStyle(node).opacity));
      node = node.parentElement;
    }
  }
  return { found: els.length, minH: Math.round(minH), minOpacity: +minOpacity.toFixed(2) };
}

const failures = [];

async function checkChromium() {
  const browser = await puppeteer.launch({ headless: 'new' });
  for (const vp of VIEWPORTS) {
    for (const page of PAGES) {
      for (const mode of MODES) {
        const p = await browser.newPage();
        await p.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile, hasTouch: vp.isMobile });
        if (mode.init) await p.evaluateOnNewDocument(mode.init);
        if (page.setup) {
          await p.goto(BASE + page.path, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await p.evaluate(page.setup);
        }
        await p.goto(BASE + page.path, { waitUntil: 'networkidle2', timeout: 45000 });
        if (mode.css) await p.addStyleTag({ content: mode.css });
        // past the 2s reveal failsafe
        await new Promise((r) => setTimeout(r, 2800));
        for (const req of page.must) {
          const got = await p.evaluate(measure, req.sel, !!req.all);
          const bad = !got.found || got.minH < req.minH || got.minOpacity < 0.9;
          if (bad) {
            failures.push(
              `chromium/${vp.name} ${page.path} [${mode.label}] ${req.name}: ` +
              (got.found ? `height ${got.minH}px (need ${req.minH}), opacity ${got.minOpacity}` : 'NOT FOUND')
            );
          }
        }
        await p.close();
      }
    }
  }
  await browser.close();
}

async function checkWebKit() {
  let webkit, devices;
  try {
    ({ webkit, devices } = await import('playwright'));
  } catch {
    try {
      const dir = process.env.HN_PLAYWRIGHT_DIR;
      if (!dir) throw new Error('no HN_PLAYWRIGHT_DIR');
      ({ webkit, devices } = await import(`${dir}/node_modules/playwright/index.mjs`));
    } catch {
      console.log(
        '\n  ! WebKit not checked (Playwright not installed).\n' +
        '    Chromium alone has missed a real Safari-only bug here before.\n' +
        '    Setup: RUNBOOK "Cross-engine checks", then re-run with\n' +
        '    HN_PLAYWRIGHT_DIR=/tmp/wk node tools/render-check.mjs\n'
      );
      return false;
    }
  }
  const browser = await webkit.launch();
  for (const vp of VIEWPORTS) {
    for (const page of PAGES) {
      for (const mode of MODES) {
        const ctx = await browser.newContext(
          vp.isMobile ? { ...devices['iPhone 13'] } : { viewport: { width: vp.width, height: vp.height } }
        );
        const p = await ctx.newPage();
        if (mode.init) await p.addInitScript(mode.init);
        if (page.setup) {
          await p.goto(BASE + page.path, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await p.evaluate(page.setup);
        }
        await p.goto(BASE + page.path, { waitUntil: 'load', timeout: 45000 });
        if (mode.css) await p.addStyleTag({ content: mode.css });
        await p.waitForTimeout(2800);
        for (const req of page.must) {
          const got = await p.evaluate(({ sel, all, src }) => new Function('return ' + src)()(sel, all),
            { sel: req.sel, all: !!req.all, src: measure.toString() });
          const bad = !got.found || got.minH < req.minH || got.minOpacity < 0.9;
          if (bad) {
            failures.push(
              `webkit/${vp.name} ${page.path} [${mode.label}] ${req.name}: ` +
              (got.found ? `height ${got.minH}px (need ${req.minH}), opacity ${got.minOpacity}` : 'NOT FOUND')
            );
          }
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
  return true;
}

console.log(`Render check against ${BASE}`);
await checkChromium();
const webkitRan = await checkWebKit();

const combos = VIEWPORTS.length * PAGES.length * MODES.length * (webkitRan ? 2 : 1);
if (failures.length) {
  console.log(`\nFAILED (${failures.length} of ${combos} combinations):\n`);
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log(`\nPASS — every critical element renders across ${combos} combinations` +
  (webkitRan ? ' (Chromium + WebKit).' : ' (Chromium only).'));
