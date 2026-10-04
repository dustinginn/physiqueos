import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const screens = path.join(root, 'screens');
const fixturePath = path.join(root, 'NATIVE-BRIEFINGS-FIXTURE.json');
const fixtureId = 'weekly_briefing_2026-08-23_2026-08-29';
const authority = 'b8ee8690b194cb90086b62816b9a2c8c400dc026';
await fs.mkdir(screens, { recursive: true });

const fixtures = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
const fixture = fixtures.find(item => item.id === fixtureId);
if (!fixture) throw new Error(`Missing ${fixtureId}`);

const expectedSemantics = new Map();
const add = (key, value) => expectedSemantics.set(key, String(value));
const w = fixture.weekly;
const c = fixture.confidence;
add('confidence.score', c.score);
add('confidence.band', c.band);
add('confidence.movementDirection', c.movementDirection);
add('confidence.primaryReason', c.primaryReason);
for (const key of ['periodLabel','reportingRangeLabel','heroHeadline','heroBody','strategyPhaseLabel','strategyWeekLabel','strategyNextMilestone']) add(`weekly.${key}`, w[key]);
for (const key of ['pairedDayCount','eligibleDayCount','averageIntakeKcal','averageExpenditureKcal','averageBalanceKcal','narrative']) add(`weekly.energy.${key}`, w.energy[key]);
for (const key of ['averageWeightLb','changeLb','narrative']) add(`weekly.weight.${key}`, w.weight[key]);
add('weekly.photos.narrative', w.photos.narrative);
for (const key of ['trainingDayCount','comparableCategoryCount','improvingCount','steadyCount','plateauingCount','insufficientCount','headline','narrative']) add(`weekly.training.${key}`, w.training[key]);
w.training.highlights.forEach((h, i) => Object.entries(h).forEach(([key, value]) => add(`weekly.training.highlights.${i}.${key}`, value)));
w.training.priorityGroups.forEach((g, i) => Object.entries(g).forEach(([key, value]) => add(`weekly.training.priorityGroups.${i}.${key}`, value)));
add('weekly.coachTake.biggestTakeaway', w.coachTake.biggestTakeaway);
add('weekly.coachTake.recommendation', w.coachTake.recommendation);
w.coachTake.intoNextWeek.forEach((value, i) => add(`weekly.coachTake.intoNextWeek.${i}`, value));
Object.entries(fixture.revisionProvenance).forEach(([key,value]) => add(`revisionProvenance.${key}`, value));
Object.entries(fixture.replacedHistory[0]).forEach(([key,value]) => add(`replacedHistory.0.${key}`, value));

const productionSequence = ['W01','W02','W03','W04','W05','W06','W07','W08','W09','W10','W13','W14','W15','W16','W17','W18','W19','W20','W21','W23','W24','W25','W26','W27','W28','W29','W33','W34','W35','W36','W37'];
const conditionals = {
  W11: { name: 'Energy comparison narrative', present: false, reason: 'comparisonNarrative absent' },
  W12: { name: 'Energy daily semantic rows', present: false, reason: 'showsDailySemanticRows defaults false' },
  W22: { name: 'View Photo Briefing link', present: false, reason: 'photoEventDestination null' },
  W30: { name: 'Training watch', present: false, reason: 'watch absent' },
  W31: { name: 'Body Composition', present: false, reason: 'bodyComposition null' },
  W32: { name: 'Still Unresolved', present: false, reason: 'uncertainty absent' },
};

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1370, height: 1000 }, deviceScaleFactor: 3 });
await page.addInitScript(data => { globalThis.__FIXTURES__ = data; }, fixtures);
await page.goto(`file://${path.join(root,'comparison-board.html')}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
await page.evaluate(() => document.fonts.ready);

const validation = {
  authority,
  fixtureId,
  renderer: 'single shared production-structure renderer; theme class is the only dark/light difference',
  target: { widthPoints: 402, scale: 3, safeAreaTopPoints: 51 },
  expectedSemanticFieldCount: expectedSemantics.size,
  productionSequence,
  conditionals,
  graphInventory: [{ id: 'W15', component: 'WeeklyEnergyCard.chart', section: 'Energy', type: 'grouped-bar', series: ['Intake','Estimated expenditure'], labels: w.energy.dailyBalances.map(p => p.label || p.date.slice(-2)), pointCount: 7, markCount: 14, conditional: 'showsChart && dailyBalances non-empty' }],
  renders: {},
};

async function inspect(theme, includeRecovery) {
  const phone = page.locator(`.phone.${theme}`);
  return phone.evaluate((el, args) => {
    const actual = {};
    const conflicts = [];
    for (const node of el.querySelectorAll('[data-semantic]')) {
      const key = node.dataset.semantic, value = node.dataset.value ?? '';
      if (key in actual && actual[key] !== value) conflicts.push({key, first: actual[key], next: value});
      actual[key] = value;
    }
    const expected = Object.fromEntries(args.expected);
    const missing = Object.keys(expected).filter(key => !(key in actual));
    const mismatches = Object.keys(expected).filter(key => key in actual && expected[key] !== actual[key]).map(key => ({key, expected: expected[key], actual: actual[key]}));
    const extra = Object.keys(actual).filter(key => !(key in expected));
    const sequence = [...el.querySelectorAll('[data-wid]')].map(node => node.dataset.wid);
    const productionOnly = sequence.filter(id => id !== 'R-FUTURE');
    const parentage = [...el.querySelectorAll('[data-wid]')].map(node => ({ id: node.dataset.wid, parent: node.dataset.parent, component: node.dataset.component }));
    const recoveryCount = sequence.filter(id => id === 'R-FUTURE').length;
    const recoveryIndex = sequence.indexOf('R-FUTURE');
    const chart = el.querySelector('[data-wid="W15"]');
    const bars = chart ? [...chart.querySelectorAll('.bar')].map(node => ({series:node.dataset.series,value:Number(node.dataset.value),date:node.parentElement.dataset.date})) : [];
    const hiddenConditionals = Object.keys(args.conditionals).filter(id => el.querySelector(`[data-wid="${id}"]`));
    const rect = el.getBoundingClientRect();
    return {
      widthPoints: Math.round(rect.width),
      heightPoints: Math.round(rect.height),
      semanticFieldCount: Object.keys(actual).length,
      missing, mismatches, extra, conflicts,
      sequence, productionOnly, parentage,
      hiddenConditionals,
      recoveryCount,
      recoveryPositionValid: !args.includeRecovery || (recoveryIndex > sequence.indexOf('W29') && recoveryIndex < sequence.indexOf('W33')),
      recoveryFixtureBoundaryVisible: !args.includeRecovery || el.querySelector('[data-wid="R-FUTURE"]')?.innerText.includes('FUTURE CONTRACT · FIXTURE ONLY'),
      recoveryConfidenceCouplingAbsent: !args.includeRecovery || (!el.querySelector('[data-wid="R-FUTURE"] [data-semantic^="confidence."]') && el.querySelector('[data-wid="R-FUTURE"]')?.innerText.includes('Confidence coupling: none')),
      chart: chart ? { type: chart.querySelector('.chart')?.dataset.chartType, series: chart.querySelector('.chart')?.dataset.chartSeries?.split('|'), title: chart.dataset.chartTitle, pointCount: Number(chart.dataset.chartPointCount), bars } : null,
      navigation: [...el.querySelectorAll('.nav-chip')].map(node => node.innerText.replace('‹','').replace('▦','').trim()),
    };
  }, { expected: [...expectedSemantics], conditionals, includeRecovery });
}

for (const [theme, includeRecovery] of [['baseline',false],['dark',true],['light',true]]) {
  const result = await inspect(theme, includeRecovery);
  const chartExpected = w.energy.dailyBalances.flatMap(p => [
    { series:'Intake', value:p.intakeKcal, date:p.date },
    { series:'Estimated expenditure', value:p.expenditureKcal, date:p.date },
  ]);
  result.chartExact = JSON.stringify(result.chart?.bars) === JSON.stringify(chartExpected)
    && result.chart?.type === 'grouped-bar'
    && JSON.stringify(result.chart?.series) === JSON.stringify(['Intake','Estimated expenditure'])
    && result.chart?.title === 'Daily intake vs estimated expenditure'
    && result.chart?.pointCount === 7;
  result.sequenceExact = JSON.stringify(result.productionOnly) === JSON.stringify(productionSequence);
  result.pass = result.widthPoints === 402
    && result.missing.length === 0 && result.mismatches.length === 0 && result.extra.length === 0 && result.conflicts.length === 0
    && result.sequenceExact && result.hiddenConditionals.length === 0 && result.chartExact
    && result.navigation.join('|') === 'Home|Briefing History'
    && (includeRecovery ? result.recoveryCount === 1 : result.recoveryCount === 0)
    && result.recoveryPositionValid && result.recoveryFixtureBoundaryVisible && result.recoveryConfidenceCouplingAbsent;
  validation.renders[theme] = result;
  if (!result.pass) throw new Error(`${theme} parity failed:\n${JSON.stringify(result,null,2)}`);
}

const baselineParentage = validation.renders.baseline.parentage;
for (const theme of ['dark','light']) {
  const current = validation.renders[theme].parentage.filter(item => item.id !== 'R-FUTURE');
  validation.renders[theme].parentageExact = JSON.stringify(current) === JSON.stringify(baselineParentage);
  if (!validation.renders[theme].parentageExact) throw new Error(`${theme} parentage mismatch`);
}

async function screenshot(theme, name) {
  const loc = page.locator(`.phone.${theme}`);
  const full = path.join(screens, `${name}-full.png`);
  await loc.screenshot({ path: full });
  const meta = await sharp(full).metadata();
  await sharp(full).extract({ left:0, top:0, width:meta.width, height:Math.min(meta.height,874*3) }).png().toFile(path.join(screens,`${name}-above-fold.png`));
  return full;
}
const baselinePath = await screenshot('baseline','build85-baseline');
const darkPath = await screenshot('dark','faithful-dark');
const lightPath = await screenshot('light','faithful-mineral-light');

async function cropElement(theme, selector, name) {
  await page.locator(`.phone.${theme} ${selector}`).screenshot({ path:path.join(screens,`${name}.png`) });
}
for (const theme of ['dark','light']) {
  const prefix = theme === 'dark' ? 'faithful-dark' : 'faithful-mineral-light';
  await cropElement(theme,'[data-wid="W02"]',`${prefix}-confidence`);
  await cropElement(theme,'[data-wid="W08"]',`${prefix}-energy-chart`);
  await cropElement(theme,'[data-wid="R-FUTURE"]',`${prefix}-recovery`);
  await cropElement(theme,'[data-wid="W33"]',`${prefix}-coach-footer`);
}

async function pair(name, leftPath, rightPath, title, leftLabel, rightLabel) {
  const [lm,rm] = await Promise.all([sharp(leftPath).metadata(),sharp(rightPath).metadata()]);
  const gap=42, top=112, width=lm.width+rm.width+gap, height=top+Math.max(lm.height,rm.height)+36;
  const svg=`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#070b11"/><text x="18" y="38" fill="#f5fafc" font-family="Arial,sans-serif" font-size="28" font-weight="700">${title}</text><text x="18" y="78" fill="#9aa8b8" font-family="Arial,sans-serif" font-size="20">${leftLabel}</text><text x="${lm.width+gap+18}" y="78" fill="#9aa8b8" font-family="Arial,sans-serif" font-size="20">${rightLabel}</text></svg>`;
  await sharp(Buffer.from(svg)).composite([{input:leftPath,left:0,top},{input:rightPath,left:lm.width+gap,top}]).png().toFile(path.join(screens,name));
}
await pair('faithful-dark-light-full-pair.png',darkPath,lightPath,'Weekly Briefing · faithful visual restyle','Dark','Mineral light');
await pair('baseline-vs-dark-full.png',baselinePath,darkPath,'Immutable production structure · baseline vs restyle','Build 85 baseline','Faithful dark');
for (const crop of ['confidence','energy-chart','recovery','coach-footer']) {
  await pair(`${crop}-dark-light-pair.png`,path.join(screens,`faithful-dark-${crop}.png`),path.join(screens,`faithful-mineral-light-${crop}.png`),crop.replaceAll('-',' ').replace(/^./,m=>m.toUpperCase()),'Dark','Mineral light');
}

validation.pass = Object.values(validation.renders).every(item => item.pass) && validation.renders.dark.parentageExact && validation.renders.light.parentageExact;
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n');
await browser.close();
console.log(JSON.stringify({pass:validation.pass, renders:Object.fromEntries(Object.entries(validation.renders).map(([k,v])=>[k,{heightPoints:v.heightPoints,semanticFieldCount:v.semanticFieldCount,sequenceExact:v.sequenceExact,chartExact:v.chartExact,parentageExact:v.parentageExact??true,pass:v.pass}]))},null,2));
