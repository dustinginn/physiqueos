// Validate + capture the Home parity review. Usage: PLAYWRIGHT_NODE_MODULES=... node render-home.mjs
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)); const root = path.join(dir, '..');
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES, 'package.json'))('playwright');
const html = fs.readFileSync(path.join(root, 'home-parity-review.html'), 'utf8');
const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const out = path.join(root, 'home', 'screens'); fs.mkdirSync(out, { recursive: true });
const res = {};
for (const [name, w, h, scheme] of [['desktop-1600', 1600, 1000, 'dark'], ['mobile-390', 390, 844, 'light']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1.5 });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.setContent(doc, { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
  const overflowX = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // per-phone checks: equal card structure across states, no clipped text in metrics
  const checks = await p.evaluate(() => [...document.querySelectorAll('.ph .hp')].map((hp) => ({ h: Math.round(hp.getBoundingClientRect().height / (parseFloat(getComputedStyle(hp).zoom) || 1)), rows: hp.querySelectorAll('[style*="gap:11px"]').length, ring: hp.innerText.includes('CONFIDENCE'), guardrail: hp.innerText.includes('GUARDRAIL') })));
  res[name] = { overflowX, errors, checks };
  if (name === 'desktop-1600') await p.screenshot({ path: path.join(out, 'review-desktop.png') });
  await p.close();
}
// isolated phone captures
const p = await b.newPage({ viewport: { width: 500, height: 1000 }, deviceScaleFactor: 1.5 });
await p.setContent(doc, { waitUntil: 'networkidle' });
for (const k of ['baseline', 'h1', 'h2', 'h3', 'h4']) for (const th of ['dark', 'light']) {
  await p.evaluate(([kk, tt]) => { let s = document.getElementById('solo'); if (!s) { s = document.createElement('div'); s.id = 'solo'; s.style.cssText = 'position:absolute;left:0;top:0;z-index:99;display:inline-block'; document.body.appendChild(s); } s.innerHTML = homeParity(HOME_STATES[kk], tt); }, [k, th]);
  await (await p.$('#solo .hp')).screenshot({ path: path.join(out, `${k}-${th === 'light' ? 'mineral' : 'dark'}.png`) });
}
fs.writeFileSync(path.join(root, 'home', 'validation.json'), JSON.stringify(res, null, 2));
console.log(JSON.stringify({ d: res['desktop-1600'].overflowX, m: res['mobile-390'].overflowX, e: [res['desktop-1600'].errors, res['mobile-390'].errors], heights: res['desktop-1600'].checks.map((c) => c.h), ring: res['desktop-1600'].checks.every((c) => c.ring && c.guardrail) }));
await b.close();
