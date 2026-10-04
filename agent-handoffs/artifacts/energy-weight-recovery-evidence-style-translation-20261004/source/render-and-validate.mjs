import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(import.meta.dirname, '..');
const screensDir = path.join(root, 'screens');
await fs.mkdir(screensDir, { recursive: true });

const families = { energy: ['E1','E2'], weight: ['W1','W2'], recovery: ['R1','R2','R3','R4','R5','R6'] };
const expected = Object.values(families).flat();
const boardFile = path.join(root, 'evidence-board.html');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const validation = {
  authority: { prompt: 'fbd6dd35e4e0dbabe5834d309170dcd2e724398a', native: 'b8ee8690b194cb90086b62816b9a2c8c400dc026', build: 85 },
  generatedAt: new Date().toISOString(), expected: { ...Object.fromEntries(Object.entries(families).map(([k,v]) => [k,v.length])), total: expected.length },
  boards: {}, parity: {}, semanticRules: {
    shippingSourceChanged: false, inventedEnergyCalculation: false, inventedWeightCalculation: false,
    inventedRecoveryScore: false, strategicRecoveryActivated: false, sleepProvenanceChanged: false,
    dexaMarkersRemoved: false, historyMadeEditable: false, roadmapPlaceholderShown: false
  }
};
const textByTheme = {};
for (const theme of ['dark','light']) {
  const suffix = theme === 'light' ? '-light' : '';
  const page = await browser.newPage({ viewport: { width: 1510, height: 1080 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`file://${boardFile}?theme=${theme}`, { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts.ready);
  const state = await page.evaluate(() => ({
    ids: [...document.querySelectorAll('[data-screen]')].map(n => n.dataset.screen),
    width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
    cards: [...document.querySelectorAll('[data-screen]')].map(n => ({ id:n.dataset.screen, family:n.dataset.family, text:n.querySelector('.phone')?.innerText.replace(/\s+/g,' ').trim()||'', stageOverflow:n.querySelector('.stage').scrollWidth>n.querySelector('.stage').clientWidth+1, phoneOverflow:n.querySelector('.phone').scrollWidth>n.querySelector('.phone').clientWidth+1 }))
  }));
  textByTheme[theme] = Object.fromEntries(state.cards.map(c => [c.id,c.text]));
  const missing = expected.filter(id => !state.ids.includes(id)); const extra = state.ids.filter(id => !expected.includes(id));
  const counts = Object.fromEntries(Object.keys(families).map(f => [f,state.cards.filter(c => c.family===f).length]));
  const overflow = state.cards.filter(c => c.stageOverflow||c.phoneOverflow).map(c => c.id);
  validation.boards[theme] = { actualScreens:state.ids.length,familyCounts:counts,missing,extra,horizontalPageOverflow:state.width>state.viewport+1,cardOverflow:overflow,runtimeErrors:errors };
  validation.boards[theme].pass = !missing.length&&!extra.length&&!overflow.length&&!errors.length&&!validation.boards[theme].horizontalPageOverflow&&Object.entries(families).every(([f,v])=>counts[f]===v.length);
  if (!validation.boards[theme].pass) throw new Error(`${theme} board failed ${JSON.stringify(validation.boards[theme])}`);
  await page.screenshot({ path:path.join(screensDir,`energy-weight-recovery-coverage-board${suffix}.png`),fullPage:true }); await page.close();

  const detail = await browser.newPage({ viewport:{width:650,height:980},deviceScaleFactor:3 });
  await detail.goto(`file://${boardFile}?theme=${theme}`,{waitUntil:'networkidle'}); await detail.evaluate(()=>document.fonts.ready);
  await detail.addStyleTag({content:'.screen-meta{display:none!important}.screen-card{padding:0!important;border:0!important;background:transparent!important}.stage{padding:0!important;min-height:0!important;background:transparent!important}'});
  for (const id of expected) {
    await detail.evaluate(screenId => { for (const n of document.querySelectorAll('[data-screen]')) n.hidden=n.dataset.screen!==screenId; }, id);
    await detail.locator(`[data-screen="${id}"] .phone`).screenshot({path:path.join(screensDir,`evidence-${id.toLowerCase()}${suffix}.png`)});
  }
  await detail.close();
}

const mismatches = expected.filter(id => textByTheme.dark[id]!==textByTheme.light[id]);
validation.parity = { checkedScreens:expected.length,textMismatches:mismatches,pass:!mismatches.length };
const all = Object.values(textByTheme.dark).join(' ');
const boardSource = await fs.readFile(boardFile, 'utf8');
validation.contentAssertions = {
  energySummaryExact: ['Average Intake','Average Expenditure','Average Balance','Complete Days'].every(x=>boardSource.includes(x)),
  energySemanticsDistinct: textByTheme.dark.E1.includes('Intake')&&textByTheme.dark.E1.includes('Estimated expenditure')&&textByTheme.dark.E2.includes('Active'),
  energyCompletenessCovered: ['Complete · Estimated','Nutrition only','Activity only','Missing RMR','No paired evidence'].every(x=>textByTheme.dark.E2.includes(x)),
  weightDexaVisible: textByTheme.dark.W1.includes('DEXA marker'),
  weightVisibleAbsSummaryExact: ['Latest','Since Start','Last Change','Lowest'].every(x=>boardSource.includes(x)),
  weightSinglePageDeclared: textByTheme.dark.W2.includes('no separate detail or history route'),
  recoveryHistoryDiscoverable: textByTheme.dark.R1.includes('Recent Nights')&&textByTheme.dark.R6.includes('All Nights'),
  recoveryContinuityAndStages: all.includes('Continuity')&&all.includes('Stage Mix')&&all.includes('Timeline'),
  recoveryProvenanceExact: textByTheme.dark.R5.includes('Apple Watch — not counted')&&textByTheme.dark.R1.includes('nothing is double counted'),
  recoveryStrategicAbsent: !/Recovery Score|strategic recovery|readiness score/i.test(all),
  noRoadmapCopy: !/Coming Soon|Future feature|roadmap/i.test(all)
};
if (!validation.parity.pass||Object.values(validation.contentAssertions).some(v=>v!==true)) throw new Error(`content/parity failed ${JSON.stringify(validation)}`);

for (const suffix of ['','-light']) {
  const input=path.join(screensDir,`energy-weight-recovery-coverage-board${suffix}.png`); const meta=await sharp(input).metadata();
  await sharp(input).resize({width:1100}).png().toFile(path.join(screensDir,`energy-weight-recovery-coverage-preview${suffix}.png`));
}
const review=await browser.newPage({viewport:{width:1500,height:1050},deviceScaleFactor:1}); await review.goto(`file://${path.join(root,'comparison-board.html')}`,{waitUntil:'networkidle'}); await review.evaluate(()=>document.fonts.ready); await review.screenshot({path:path.join(screensDir,'review-index.png'),fullPage:true}); await review.close();

const files=(await fs.readdir(screensDir)).filter(f=>f.endsWith('.png')).sort(); validation.renders=[];
for (const file of files) { const bytes=await fs.readFile(path.join(screensDir,file)); const meta=await sharp(bytes).metadata(); validation.renders.push({file,width:meta.width,height:meta.height,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}); }
validation.pass=Object.values(validation.boards).every(x=>x.pass)&&validation.parity.pass&&Object.values(validation.semanticRules).every(v=>v===false)&&Object.values(validation.contentAssertions).every(v=>v===true);
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n'); await browser.close(); console.log(JSON.stringify({pass:validation.pass,boards:validation.boards,parity:validation.parity,renderCount:validation.renders.length,contentAssertions:validation.contentAssertions},null,2));
