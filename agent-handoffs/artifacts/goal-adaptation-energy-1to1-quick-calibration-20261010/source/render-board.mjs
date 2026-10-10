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
const html = fs.readFileSync(path.join(root, 'energy-quick-calibration-board.html'), 'utf8');
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
  for (const sec of ['changes', 'qc-rules', 'qc', 'energy', 'acceptance', 'coverage', 'index']) {
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
    await p.evaluate(() => { document.getElementById('p-QC3-choose-amount').scrollIntoView(); });
    await p.click('#p-QC3-choose-amount .phone-dark-wrap .cap');
    await p.waitForTimeout(200);
    lightbox = await p.evaluate(() => document.getElementById('lb').classList.contains('open'));
    await p.screenshot({ path: path.join(root, 'review-board', `${name}-lightbox.png`) });
    await p.keyboard.press('Escape');
  }
  report.views[name] = { overflowX, errors, validationFilterMatches: visible, lightboxOpens: lightbox };
  await p.close();
}
// interactive checks: 1:1 energy model + Quick Calibration
{
  const { p, errors } = await page(1600, 1000, 'dark');
  const q = (sel) => `#p-${sel}`;
  const read = (id, theme = 'dark') => p.evaluate(([i, t]) => { const r = document.querySelector(`#p-${i} .phone.${t}`); const g = (k) => r.querySelector(`[data-e="${k}"]`)?.textContent; return { intake: g('intake'), added: g('added'), net: g('net'), goal: g('activityGoal'), week: g('weekIntake'), weekNet: g('weekNet'), rate: g('rate'), weeks: g('weeks'), range: g('netrange'), formula: g('formula'), warnings: r.querySelector('[data-e="warnings"]')?.innerText ?? '' }; }, [id, theme]);
  const fire = (id, sel, value, ev = 'input') => p.evaluate(([i, s2, v, e]) => { const r = document.querySelector(`#p-${i} .phone.dark`); const el = r.querySelector(s2); el.value = v; el.dispatchEvent(new Event(e, { bubbles: true })); }, [id, sel, value, ev]);
  const click = (id, sel) => p.evaluate(([i, s2]) => document.querySelector(`#p-${i} .phone.dark ${s2}`).click(), [id, sel]);
  const results = {};
  results.e2Default = await read('E2-allocation');
  for (const k of ['balanced', 'intake', 'activity', 'suggested']) { await click('E2-allocation', `[data-preset="${k}"]`); results[`preset_${k}`] = await read('E2-allocation'); }
  await fire('E2-allocation', '[data-in="added"]', 300); results.added300 = await read('E2-allocation');
  await fire('E2-allocation', '[data-in="intakeNum"]', 1800); results.typedIntake1800 = await read('E2-allocation');
  await fire('E2-allocation', '[data-in="intake"]', 1700); results.dragIntake1700 = await read('E2-allocation');
  await fire('E2-allocation', '[data-in="addedNum"]', 133); results.typedAdded133 = await read('E2-allocation');
  results.e4Floor = await read('E4-floor');
  results.e5Heavy = await read('E5-activity-heavy');
  results.e1Default = await read('E1-balance');
  await fire('E1-balance', '[data-in="net"]', -250); results.e1At250 = await read('E1-balance');
  results.e7Surplus = await read('E7-surplus');
  const qcRead = (id) => p.evaluate((i) => { const r = document.querySelector(`#p-${i} .phone.dark [data-qc]`); const g = (k) => r.querySelector(`[data-qe="${k}"]`)?.textContent; return { delta: g('delta'), intake: r.querySelector('[data-q="deltaNum"]').value, week: g('week'), net: g('net'), apply: g('apply'), msgs: r.querySelector('[data-qe="msgs"]').innerText }; }, id);
  results.qcDefault = await qcRead('QC3-choose-amount');
  await p.evaluate(() => document.querySelector('#p-QC3-choose-amount .phone.dark [data-qset="-200"]').click()); results.qcChip200 = await qcRead('QC3-choose-amount');
  await p.evaluate(() => { const el = document.querySelector('#p-QC3-choose-amount .phone.dark [data-q="deltaNum"]'); el.value = 1700; el.dispatchEvent(new Event('input', { bubbles: true })); }); results.qcTyped1700 = await qcRead('QC3-choose-amount');
  await p.evaluate(() => document.querySelector('#p-QC3-choose-amount .phone.dark [data-qset="0"]').click()); results.qcNoChange = await qcRead('QC3-choose-amount');
  results.qcInvalid = await qcRead('QC4-choose-invalid');
  const text = await p.evaluate(() => document.body.innerText);
  const htmlSrc = html;
  results.remnants = { visible75pct: (text.match(/75\s?%/g) || []).length, source75pct: (htmlSrc.match(/75\s?%/g) || []).length, sourceCredit: (htmlSrc.match(/credit/gi) || []).length, source1750: (htmlSrc.match(/1,750/g) || []).length };
  report.energy = { ...results, errors };
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
      const r = document.querySelector('#solo [data-energy]'); if (r) energyRefresh(r); const qr = document.querySelector('#solo [data-qc]'); if (qr) qcRefresh(qr);
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
