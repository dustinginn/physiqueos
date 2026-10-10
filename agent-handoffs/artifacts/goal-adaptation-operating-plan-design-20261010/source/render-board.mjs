// Render + validate the board: page errors, horizontal overflow, per-screen
// captures (Dark + Mineral Light), board views, interactive energy checks.
// Usage: PLAYWRIGHT_NODE_MODULES=<server>/node_modules node render-board.mjs [--screens]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES, 'package.json'))('playwright');
const html = fs.readFileSync(path.join(root, 'operating-plan-board.html'), 'utf8');
const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${html}</body></html>`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const report = { views: {}, energy: {}, screens: 0 };
const page = async (w, h, scheme) => {
  const p = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2 });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.setContent(doc, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  return { p, errors };
};
fs.mkdirSync(path.join(root, 'review-board'), { recursive: true });
for (const [name, w, h, scheme] of [['desktop-1600-dark', 1600, 1000, 'dark'], ['desktop-1600-light', 1600, 1000, 'light'], ['laptop-1280-dark', 1280, 800, 'dark'], ['mobile-390-light', 390, 844, 'light']]) {
  const { p, errors } = await page(w, h, scheme);
  const overflowX = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await p.screenshot({ path: path.join(root, 'review-board', `${name}-top.png`) });
  for (const sec of ['approaches', 'hub', 'energy', 'coverage', 'index']) {
    await p.evaluate((id) => { document.getElementById(id).scrollIntoView(); window.scrollBy(0, -60); }, sec);
    await p.waitForTimeout(150);
    if (name.startsWith('desktop') || sec === 'energy') await p.screenshot({ path: path.join(root, 'review-board', `${name}-${sec}.png`) });
  }
  // filter + lightbox checks
  await p.fill('#q', 'validation');
  const visible = await p.evaluate(() => [...document.querySelectorAll('.item[data-id]')].filter((e) => !e.classList.contains('hide')).length);
  await p.fill('#q', '');
  let lightbox = null;
  if (name.startsWith('desktop')) {
    await p.evaluate(() => { document.getElementById('p-E2-allocation').scrollIntoView(); });
    await p.click('#p-E2-allocation .phone-dark-wrap .cap');
    await p.waitForTimeout(200);
    lightbox = await p.evaluate(() => document.getElementById('lb').classList.contains('open'));
    await p.screenshot({ path: path.join(root, 'review-board', `${name}-lightbox.png`) });
    await p.keyboard.press('Escape');
  }
  report.views[name] = { overflowX, errors, validationFilterMatches: visible, lightboxOpens: lightbox };
  await p.close();
}
// interactive energy check: drag added slider on E2 dark, read intake
{
  const { p, errors } = await page(1600, 1000, 'dark');
  const read = () => p.evaluate(() => { const r = document.querySelector('#p-E2-allocation .phone.dark'); return { intake: r.querySelector('[data-e="intake"]').textContent, added: r.querySelector('[data-e="added"]').textContent, net: r.querySelector('[data-e="net"]').textContent, warnings: r.querySelector('[data-e="warnings"]').innerText }; });
  const initial = await read();
  await p.evaluate(() => { const r = document.querySelector('#p-E2-allocation .phone.dark'); const el = r.querySelector('[data-in="added"]'); el.value = 300; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const afterAdded = await read();
  await p.evaluate(() => { const r = document.querySelector('#p-E2-allocation .phone.dark'); r.querySelector('[data-preset="intake"]').click(); });
  const afterPreset = await read();
  const floor = await p.evaluate(() => { const r = document.querySelector('#p-E4-floor .phone.light'); return { intake: r.querySelector('[data-e="intake"]').textContent, warnings: r.querySelector('[data-e="warnings"]').innerText }; });
  const e1 = await p.evaluate(() => { const r = document.querySelector('#p-E1-balance .phone.dark'); const el = r.querySelector('[data-in="net"]'); el.value = -250; el.dispatchEvent(new Event('input', { bubbles: true })); return { rate: r.querySelector('[data-e="rate"]').textContent, weeks: r.querySelector('[data-e="weeks"]').textContent, zone: r.querySelector('[data-e="zone"]').textContent }; });
  const surplus = await p.evaluate(() => { const r = document.querySelector('#p-E7-surplus .phone.dark'); return { rate: r.querySelector('[data-e="rate"]').textContent, weeks: r.querySelector('[data-e="weeks"]').textContent }; });
  report.energy = { initial, afterAdded, afterPreset, floor, e1At250: e1, surplus, errors };
  await p.close();
}
if (process.argv.includes('--screens')) {
  const { p, errors } = await page(600, 1000, 'dark');
  fs.rmSync(path.join(root, 'screens'), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'screens'), { recursive: true });
  const ids = await p.evaluate(() => Object.keys(SCREENS));
  for (const id of ids) for (const theme of ['dark', 'light']) {
    await p.evaluate(([i, t]) => {
      document.querySelectorAll('.topbar, .layout, .lb').forEach((n) => { n.style.display = 'none'; });
      let solo = document.getElementById('solo');
      if (!solo) { solo = document.createElement('div'); solo.id = 'solo'; solo.style.cssText = 'padding:24px;display:inline-block'; document.body.appendChild(solo); }
      solo.style.background = t === 'light' ? '#d9dfd8' : '#03080d';
      solo.innerHTML = phoneHtml(i, t);
      const r = document.querySelector('#solo [data-energy]'); if (r) energyRefresh(r);
    }, [id, theme]);
    await p.waitForTimeout(60);
    await (await p.$('#solo .phone')).screenshot({ path: path.join(root, 'screens', `${id}-${theme === 'light' ? 'mineral' : 'dark'}.png`) });
    report.screens++;
  }
  report.screenErrors = errors;
  await p.close();
}
fs.writeFileSync(path.join(root, 'validation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ views: report.views, energy: report.energy, screens: report.screens }, null, 1));
await browser.close();
