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
const html = fs.readFileSync(path.join(root, 'goal-adaptation-v3-board.html'), 'utf8');
const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${html}</body></html>`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const report = { views: {}, energy: {}, screens: 0 };
const page = async (w, h, scheme) => {
  const p = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1.5 });
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
  for (const sec of ['principle', 'home', 'goals', 'briefings', 'qc', 'decisions']) {
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
    await p.evaluate(() => { document.getElementById('p-Q2-blend').scrollIntoView(); });
    await p.click('#p-Q2-blend .phone-dark-wrap .cap');
    await p.waitForTimeout(200);
    lightbox = await p.evaluate(() => document.getElementById('lb').classList.contains('open'));
    await p.screenshot({ path: path.join(root, 'review-board', `${name}-lightbox.png`) });
    await p.keyboard.press('Escape');
  }
  report.views[name] = { overflowX, errors, validationFilterMatches: visible, lightboxOpens: lightbox };
  await p.close();
}
// interactive checks: v3 energy editor + Quick Calibration v3
{
  const { p, errors } = await page(1600, 1000, 'dark');
  const R = {};
  const er = (sel) => `#p-F4-energy .phone.dark ${sel}`;
  const readE = () => p.evaluate(() => { const r = document.querySelector('#p-F4-energy .phone.dark'); const g = (k) => r.querySelector(`[data-e="${k}"]`)?.textContent; return { balance: g('balance'), eat: g('eat'), goal: g('goal'), added: g('added'), formula: g('formula'), rate: g('rate'), range: g('range'), notes: r.querySelector('[data-e="notes"]').innerText }; });
  R.energyDefault = await readE();
  for (const k of ['eat', 'move', 'blend', 'suggested']) { await p.click(er(`[data-split="${k}"]`)); R[`split_${k}`] = await readE(); }
  await p.click(er('[data-split="custom"]'));
  await p.evaluate(() => { const el = document.querySelector('#p-F4-energy .phone.dark [data-in="eatNum"]'); el.value = 1800; el.dispatchEvent(new Event('input', { bubbles: true })); });
  R.customEat1800 = await readE();
  await p.evaluate(() => { const el = document.querySelector('#p-F4-energy .phone.dark [data-in="balance"]'); el.value = -750; el.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#p-F4-energy .phone.dark [data-split="eat"]').click(); });
  R.floorAt750 = await readE();
  const readQ = (id) => p.evaluate((i) => { const r = document.querySelector(`#p-${i} .phone.dark [data-qcv3]`); const g = (k) => r.querySelector(`[data-qe="${k}"]`)?.textContent; return { opt: r.dataset.qopt, eat: g('eat'), goal: g('goal'), balance: g('balance'), accept: g('accept'), msgs: r.querySelector('[data-qe="msgs"]').innerText }; }, id);
  R.qcNone = await readQ('Q1-proposal');
  for (const k of ['eat', 'move', 'blend']) { await p.evaluate((kk) => document.querySelector(`#p-Q1-proposal .phone.dark [data-qopt="${kk}"]`).click(), k); R[`qc_${k}`] = await readQ('Q1-proposal'); }
  R.qcBlendScreen = await readQ('Q2-blend');
  R.qcCustomDefault = await readQ('Q3-custom');
  await p.evaluate(() => { const r = document.querySelector('#p-Q3-custom .phone.dark [data-qcv3]'); const e = r.querySelector('[data-q="eatLess"]'); e.value = 400; e.dispatchEvent(new Event('input', { bubbles: true })); });
  R.qcCustomTooBig = await readQ('Q3-custom');
  const text = await p.evaluate(() => document.body.innerText);
  R.remnants = { visible75pct: (text.match(/75\s?%/g) || []).length, source75pct: (html.match(/75\s?%/g) || []).length, credit: (html.match(/credit/gi) || []).length, weeklySplitEditor: (text.match(/Same intake every day|More on training days/g) || []).length, prescribedWalks: (text.match(/brisk 45-min/g) || []).length, fitbitClaims: (text.match(/Fitbit/g) || []).length, editedElsewhere: (text.match(/edited on the web|edited elsewhere/gi) || []).length };
  R.phase = await p.evaluate(() => { const t = (id) => document.querySelector(`#p-${id} .phone.dark`).innerText; return { homeLeaningShowsGoal: /BUILD LEAN MASS/.test(t('H2-home-leaning')) && /\+7 of 10 lb kept/.test(t('H2-home-leaning')), homeLeaningPhaseRows: (t('H2-home-leaning').match(/PHASE 2|NOW · TEMPORARY/g) || []).length, weeklyLeaningNoWrongDirection: !/wrong/i.test(t('B1-weekly-leaning')), midweekNoProposal: !/Accept|Choose what/.test(t('B4-midweek-leaning')), dexaDecisionLast: /Phase decision[\s\S]*Not now\s*$/i.test(t('B3-dexa-phase-complete').trim()), goalProgressNotReset: /\+6\.6 of 10/.test(t('G2-goal-phase-complete')) }; });
  report.energy = { ...R, errors };
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
      const r = document.querySelector('#solo [data-energy]'); if (r) energyRefresh(r); const qr = document.querySelector('#solo [data-qcv3]'); if (qr) qcRefresh(qr);
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
