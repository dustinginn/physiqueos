// Renders every [data-capture] phone in screens.html at 3x and runs basic layout and accessibility checks.
// Usage: PLAYWRIGHT_NODE_MODULES=<dir containing playwright> node render-screens.mjs <artifact-root>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const modules = process.env.PLAYWRIGHT_NODE_MODULES;
if (!modules) throw new Error('PLAYWRIGHT_NODE_MODULES is required.');
const { chromium } = createRequire(path.join(modules, 'package.json'))('playwright');

const root = path.resolve(process.argv[2] || '.');
const source = path.join(root, 'source', process.env.SOURCE_FILE || 'screens.html');
const out = path.join(root, process.env.OUT_DIR || 'screens');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1900, height: 1200 }, deviceScaleFactor: 3 });
await page.goto(pathToFileURL(source).href);
await page.evaluate(() => document.fonts.ready);
const jakartaLoaded = await page.evaluate(() => document.fonts.check('800 20px Jakarta'));

const names = await page.$$eval('[data-capture]', (els) => els.map((e) => e.dataset.capture));
const results = {};
for (const name of names) {
  const phone = page.locator(`[data-capture="${name}"]`);
  await phone.screenshot({ path: path.join(out, `${name}.png`) });
  results[name] = await phone.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const escapes = [];
    const clipped = [];
    let smallText = 0;
    const smallTargets = [];
    for (const node of el.querySelectorAll('*')) {
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right > box.right + 0.5 || r.left < box.left - 0.5) escapes.push(`${node.className || node.tagName}`.slice(0, 40));
      if (node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX !== 'visible' && node.clientWidth > 0) clipped.push(`${node.className || node.tagName}`.slice(0, 40));
      const hasText = [...node.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (hasText && parseFloat(getComputedStyle(node).fontSize) < 11) smallText += 1;
      if (node.matches('.btn, .choice, .seg > div, .stepper span') && r.height < 44) smallTargets.push(`${node.className}:${Math.round(r.height)}`);
    }
    return {
      width: Math.round(box.width), height: Math.round(box.height),
      overflowX: el.scrollWidth - el.clientWidth, escapes: escapes.length, clipped: [...new Set(clipped)],
      textUnder11pt: smallText, targetsUnder44pt: smallTargets,
    };
  });
}

// WCAG contrast of the token pairs used for text, per theme.
const contrast = await page.evaluate(() => {
  const hex = (v) => { const m = v.trim().match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) : null; };
  const lum = (c) => { const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
  const pairs = [['ink', 'paper'], ['ink2', 'paper'], ['muted', 'paper'], ['teal', 'paper'], ['amberInk', 'paper'], ['red', 'paper'], ['green', 'paper'], ['purple', 'paper'], ['ink2', 'soft'], ['muted', 'canvas'], ['onTeal', 'teal'], ['onAmber', 'amber']];
  const res = {};
  for (const theme of ['dark', 'light']) {
    const el = document.querySelector(`.phone.${theme}`) ?? document.querySelector('.phone');
    const probe = theme === 'light' ? document.querySelector('.phone.light') : document.querySelector('.phone.dark');
    const cs = getComputedStyle(probe);
    res[theme] = Object.fromEntries(pairs.map(([f, b]) => [`${f}/${b}`, ratio(hex(cs.getPropertyValue(`--${f}`)), hex(cs.getPropertyValue(`--${b}`)))]));
  }
  return res;
});

fs.writeFileSync(path.join(out, 'validation.json'), `${JSON.stringify({ jakartaLoaded, screens: results, contrast }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ jakartaLoaded, count: names.length, contrast }, null, 1)}\n`);
for (const [n, r] of Object.entries(results)) process.stdout.write(`${n} ${r.width}x${r.height} ovX=${r.overflowX} esc=${r.escapes} clip=${r.clipped.join('|')} small=${r.textUnder11pt} targets=${r.targetsUnder44pt.join(',')}\n`);
await browser.close();
