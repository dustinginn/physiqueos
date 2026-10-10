import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire((process.env.PLAYWRIGHT_NODE_MODULES ?? 'node_modules') + '/package.json')('playwright');
const html = fs.readFileSync(process.argv[2], 'utf8');
const out = process.argv[3];
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const res = {};
for (const [name, w, h, scheme, dsf] of [['desktop-1440', 1440, 900, 'dark', 2], ['laptop-1280', 1280, 800, 'light', 2], ['wide-1600', 1600, 1000, 'dark', 1], ['mobile-390', 390, 844, 'dark', 2]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: dsf });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const m = await p.evaluate(() => {
    const zs = [...document.querySelectorAll('#board .phone')].filter((e) => e.offsetParent).map((e) => Number(e.style.zoom));
    let minText = 99, overflowPhones = [];
    for (const ph of document.querySelectorAll('#board .phone')) {
      if (!ph.offsetParent) continue; const z = Number(ph.style.zoom);
      if (ph.scrollWidth > ph.clientWidth + 1) overflowPhones.push(ph.closest('.phone-btn').dataset.key + ':' + (ph.scrollWidth - ph.clientWidth));
      for (const el of ph.querySelectorAll('*')) { if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue; minText = Math.min(minText, parseFloat(getComputedStyle(el).fontSize) * z); }
    }
    const nav = document.querySelector('.topbar').getBoundingClientRect();
    return { pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, visiblePhones: zs.length, zoomMin: Math.min(...zs).toFixed(2), zoomMax: Math.max(...zs).toFixed(2), minEffectiveTextPx: minText.toFixed(1), overflowPhones, navHeight: Math.round(nav.height), pageHeight: document.body.scrollHeight };
  });
  await p.screenshot({ path: `${out}/${name}-overview.png` });
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById('validation').scrollIntoView(); });
  await p.waitForTimeout(250);
  m.stickyBarTopAfterScroll = await p.evaluate(() => Math.round(document.querySelector('.topbar').getBoundingClientRect().top));
  if (name !== 'wide-1600') await p.screenshot({ path: `${out}/${name}-keep-building.png` });
  await p.evaluate(() => document.getElementById('options').scrollIntoView()); await p.waitForTimeout(250);
  if (name === 'desktop-1440') await p.screenshot({ path: `${out}/${name}-decision-ab.png` });
  // filter
  await p.click('#theme-filter button[data-mode="dark"]'); await p.waitForTimeout(150);
  m.filterDark = await p.evaluate(() => ({ light: [...document.querySelectorAll('#board .phone.light')].filter((e) => e.offsetParent).length, dark: [...document.querySelectorAll('#board .phone.dark')].filter((e) => e.offsetParent).length, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  if (name === 'desktop-1440') { await p.evaluate(() => document.getElementById('placement').scrollIntoView()); await p.waitForTimeout(250); await p.screenshot({ path: `${out}/${name}-dark-only.png` }); }
  await p.click('#theme-filter button[data-mode="both"]');
  // size toggle
  await p.click('#size-toggle button[data-size="xl"]'); m.xlVisible = await p.evaluate(() => [...document.querySelectorAll('.ab .phone.xl')].filter((e) => e.offsetParent).length);
  await p.click('#size-toggle button[data-size="normal"]');
  // lightbox
  await p.evaluate(() => document.getElementById('options').scrollIntoView());
  await p.click('.ab .cell.dark .v-normal .phone-btn >> nth=0');
  await p.waitForTimeout(200);
  const lb1 = await p.evaluate(() => ({ open: !document.getElementById('lightbox').hidden, title: document.getElementById('lb-title').textContent, zoom: document.querySelector('#lb-stage .phone').style.zoom, focus: document.activeElement.id }));
  if (name === 'desktop-1440' || name === 'mobile-390') await p.screenshot({ path: `${out}/${name}-lightbox.png` });
  await p.keyboard.press('ArrowRight'); const t2 = await p.evaluate(() => document.getElementById('lb-title').textContent);
  await p.keyboard.press('t'); const th = await p.evaluate(() => document.querySelector('#lb-stage .phone').className);
  await p.keyboard.press('Escape'); const closed = await p.evaluate(() => document.getElementById('lightbox').hidden);
  m.lightbox = { ...lb1, afterNext: t2, afterThemeKey: th, closedOnEsc: closed };
  m.errors = errs; res[name] = m;
}
await b.close();
fs.writeFileSync(`${out}/validation.json`, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, null, 1));
