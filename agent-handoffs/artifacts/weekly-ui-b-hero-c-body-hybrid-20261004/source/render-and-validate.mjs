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
const wideLeashAuthority = 'd28114d39d41c2efd2f5bbe4d3a72305e4759720';
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
add('confidence.delta', c.delta);
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
const expectedQuantMarks = new Map([['confidence.score', String(c.score)]]);
w.energy.dailyBalances.forEach((p, i) => {
  expectedQuantMarks.set(`weekly.energy.dailyBalances.${i}.intakeKcal`, String(p.intakeKcal));
  expectedQuantMarks.set(`weekly.energy.dailyBalances.${i}.expenditureKcal`, String(p.expenditureKcal));
});
for (const key of ['trainingDayCount','comparableCategoryCount','improvingCount','steadyCount','plateauingCount','insufficientCount']) {
  expectedQuantMarks.set(`weekly.training.${key}`, String(w.training[key]));
}
w.training.priorityGroups.forEach((g, i) => expectedQuantMarks.set(`weekly.training.priorityGroups.${i}.comparableExerciseCount`, String(g.comparableExerciseCount)));

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1370, height: 1000 }, deviceScaleFactor: 3 });
await page.addInitScript(data => { globalThis.__FIXTURES__ = data; }, fixtures);
await page.goto(`file://${path.join(root,'comparison-board.html')}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
await page.evaluate(() => document.fonts.ready);

const validation = {
  authority,
  wideLeashAuthority,
  fixtureId,
  renderer: 'single shared frozen-semantic renderer; direction classes alter visual composition only',
  target: { widthPoints: 402, scale: 3, safeAreaTopPoints: 51 },
  expectedSemanticFieldCount: expectedSemantics.size,
  productionSequence,
  conditionals,
  graphInventory: [{ id: 'W15', component: 'WeeklyEnergyCard.chart', section: 'Energy', type: 'grouped-bar', series: ['Intake','Estimated expenditure'], labels: w.energy.dailyBalances.map(p => p.label || p.date.slice(-2)), pointCount: 7, markCount: 14, conditional: 'showsChart && dailyBalances non-empty' }],
  quantitativeMarkInventory: Object.fromEntries(expectedQuantMarks),
  renders: {},
};

async function inspect(variant, includeRecovery) {
  const phone = page.locator(`.phone[data-variant="${variant}"]`);
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
    const quantitativeMarks = [...el.querySelectorAll('[data-quant-mark]')].map(node => ({ sourceKey: node.dataset.sourceKey, value: node.dataset.value, kind: node.dataset.quantMark }));
    const quantActual = Object.fromEntries(quantitativeMarks.map(mark => [mark.sourceKey, mark.value]));
    const quantExpected = Object.fromEntries(args.expectedQuantMarks);
    const quantMissing = Object.keys(quantExpected).filter(key => !(key in quantActual));
    const quantMismatches = Object.keys(quantExpected).filter(key => key in quantActual && quantActual[key] !== quantExpected[key]).map(key => ({key, expected:quantExpected[key], actual:quantActual[key]}));
    const quantExtra = Object.keys(quantActual).filter(key => !(key in quantExpected));
    const rect = el.getBoundingClientRect();
    return {
      widthPoints: Math.round(rect.width),
      heightPoints: Math.round(rect.height),
      semanticFieldCount: Object.keys(actual).length,
      missing, mismatches, extra, conflicts,
      sequence, productionOnly, parentage,
      hiddenConditionals,
      quantitativeMarks, quantMissing, quantMismatches, quantExtra,
      recoveryCount,
      recoveryPositionValid: !args.includeRecovery || (recoveryIndex > sequence.indexOf('W29') && recoveryIndex < sequence.indexOf('W33')),
      recoveryFixtureBoundaryVisible: !args.includeRecovery || el.querySelector('[data-wid="R-FUTURE"]')?.innerText.includes('FUTURE CONTRACT · FIXTURE ONLY'),
      recoveryConfidenceCouplingAbsent: !args.includeRecovery || (!el.querySelector('[data-wid="R-FUTURE"] [data-semantic^="confidence."]') && el.querySelector('[data-wid="R-FUTURE"]')?.innerText.includes('Confidence coupling: none')),
      chart: chart ? { type: chart.querySelector('.chart')?.dataset.chartType, series: chart.querySelector('.chart')?.dataset.chartSeries?.split('|'), title: chart.dataset.chartTitle, pointCount: Number(chart.dataset.chartPointCount), bars } : null,
      navigation: [...el.querySelectorAll('.nav-chip')].map(node => node.innerText.replace('‹','').replace('▦','').trim()),
      accessibility: {
        bodySizes: [...el.querySelectorAll('.body-copy,.hero .narrative,.coach p')].map(node => Number.parseFloat(getComputedStyle(node).fontSize)),
        priorityAlignments: [...el.querySelectorAll('.priority')].map(node => getComputedStyle(node).textAlign),
        priorityWidths: [...el.querySelectorAll('.priority')].map(node => Math.round(node.getBoundingClientRect().width)),
        chartLabel: chart?.querySelector('.chart')?.getAttribute('aria-label') || null,
      },
      layoutSignature: (() => {
        const box = id => { const r=el.querySelector(`[data-wid="${id}"]`)?.getBoundingClientRect(); return r ? [Math.round(r.width),Math.round(r.height)] : null; };
        const heroCard=el.querySelector('.hero'), energyCard=el.querySelector('[data-wid="W08"]>.card'), trainingCard=el.querySelector('[data-wid="W23"]>.card');
        return {
          pageHeight: Math.round(rect.height), hero: box('W02'), energy: box('W08'), training: box('W23'),
          priorityDisplay: getComputedStyle(el.querySelector('.priority-list')).display,
          priorityColumns: getComputedStyle(el.querySelector('.priority-list')).gridTemplateColumns,
          heroRadius: getComputedStyle(heroCard).borderRadius,
          energyRadius: getComputedStyle(energyCard).borderRadius,
          trainingBackground: getComputedStyle(trainingCard).backgroundColor,
          chartDisplay: getComputedStyle(el.querySelector('.chart')).display,
          chartColumns: getComputedStyle(el.querySelector('.chart')).gridTemplateColumns,
          highlightColumns: getComputedStyle(el.querySelector('.highlight')).gridTemplateColumns,
        };
      })(),
    };
  }, { expected: [...expectedSemantics], expectedQuantMarks: [...expectedQuantMarks], conditionals, includeRecovery });
}

const variants = ['immersive-story-dark','dense-analytical-dark','hybrid-dark'];
for (const variant of variants) {
  const result = await inspect(variant, true);
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
    && result.quantMissing.length === 0 && result.quantMismatches.length === 0 && result.quantExtra.length === 0
    && result.navigation.join('|') === 'Home|Briefing History'
    && result.recoveryCount === 1
    && result.recoveryPositionValid && result.recoveryFixtureBoundaryVisible && result.recoveryConfidenceCouplingAbsent;
  result.accessibilityPass = result.accessibility.bodySizes.every(size => size >= 15)
    && result.accessibility.priorityAlignments.every(value => value === 'left' || value === 'start')
    && result.accessibility.priorityWidths.every(width => width >= 150)
    && result.accessibility.chartLabel === 'Daily intake and expenditure across 7 days';
  result.pass = result.pass && result.accessibilityPass;
  validation.renders[variant] = result;
  if (!result.pass) throw new Error(`${variant} parity failed:\n${JSON.stringify(result,null,2)}`);
}

const canonicalParentage = validation.renders['dense-analytical-dark'].parentage.filter(item => item.id !== 'R-FUTURE');
for (const variant of variants) {
  const current = validation.renders[variant].parentage.filter(item => item.id !== 'R-FUTURE');
  validation.renders[variant].parentageExact = JSON.stringify(current) === JSON.stringify(canonicalParentage);
  if (!validation.renders[variant].parentageExact) throw new Error(`${variant} parentage mismatch`);
}

const directions = ['immersive-story','dense-analytical','hybrid'];

async function screenshot(variant) {
  const loc = page.locator(`.phone[data-variant="${variant}"]`);
  const full = path.join(screens, `${variant}-full.png`);
  await loc.screenshot({ path: full });
  const meta = await sharp(full).metadata();
  await sharp(full).extract({ left:0, top:0, width:meta.width, height:Math.min(meta.height,874*3) }).png().toFile(path.join(screens,`${variant}-above-fold.png`));
  return full;
}
const fullPaths = {};
for (const variant of variants) fullPaths[variant] = await screenshot(variant);

async function cropElement(variant, selector, name) {
  await page.locator(`.phone[data-variant="${variant}"] ${selector}`).screenshot({ path:path.join(screens,`${name}.png`) });
}
for (const variant of variants) {
  await cropElement(variant,'[data-wid="W02"]',`${variant}-hero`);
}
await cropElement('hybrid-dark','[data-wid="W23"]','hybrid-dark-training');
await cropElement('hybrid-dark','[data-wid="R-FUTURE"]','hybrid-dark-recovery');
await cropElement('hybrid-dark','[data-wid="W33"]','hybrid-dark-coach-footer');

async function cropSeam() {
  const phone = page.locator('.phone[data-variant="hybrid-dark"]');
  const hero = phone.locator('[data-wid="W02"]');
  const energy = phone.locator('[data-wid="W08"]');
  const [phoneBox, heroBox, energyBox] = await Promise.all([phone.boundingBox(), hero.boundingBox(), energy.boundingBox()]);
  if (!phoneBox || !heroBox || !energyBox) throw new Error('Unable to resolve hybrid seam bounds');
  const scale = 3;
  const top = Math.max(0, heroBox.y - phoneBox.y + heroBox.height - 220);
  const bottom = Math.min(phoneBox.height, energyBox.y - phoneBox.y + 340);
  await sharp(fullPaths['hybrid-dark']).extract({ left:0, top:Math.round(top*scale), width:Math.round(phoneBox.width*scale), height:Math.round((bottom-top)*scale) }).png().toFile(path.join(screens,'hybrid-dark-hero-energy-seam.png'));
}
await cropSeam();

async function compositionSignature(variant, selector) {
  return page.locator(`.phone[data-variant="${variant}"] ${selector}`).evaluate(root => {
    const rootRect = root.getBoundingClientRect();
    const round = value => Math.round(value * 100) / 100;
    const properties = [
      'display','position','width','height','paddingTop','paddingRight','paddingBottom','paddingLeft',
      'backgroundImage','backgroundColor',
      'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderRadius',
      'gridTemplateColumns','gridTemplateRows','columnGap','rowGap','fontSize','lineHeight',
      'fontWeight','textAlign','alignItems','justifyContent','overflow','color','opacity',
    ];
    return [root, ...root.querySelectorAll('*')].map((node, index) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const normalizedRect = style.display === 'none' || style.display === 'contents'
        ? [0,0,0,0]
        : [round(rect.x-rootRect.x), round(rect.y-rootRect.y), round(rect.width), round(rect.height)];
      return {
        index,
        tag: node.tagName,
        className: typeof node.className === 'string' ? node.className : '',
        wid: node.dataset?.wid || null,
        semantic: node.dataset?.semantic || null,
        text: node.children.length === 0 ? node.textContent : null,
        rect: normalizedRect,
        style: Object.fromEntries(properties.map(property => [property, style[property]])),
      };
    });
  });
}

function firstSignatureDifference(left, right) {
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    if (JSON.stringify(left[index]) !== JSON.stringify(right[index])) return { index, left:left[index] ?? null, right:right[index] ?? null };
  }
  return null;
}

const heroBSignature = await compositionSignature('immersive-story-dark','[data-wid="W02"] .hero');
const heroHybridSignature = await compositionSignature('hybrid-dark','[data-wid="W02"] .hero');
const bodySelectors = ['[data-wid="W01"]','[data-wid="W08"]','[data-wid="W17"]','[data-wid="W20"]','[data-wid="W23"]','[data-wid="R-FUTURE"]','[data-wid="W33"]','[data-wid="W37"]'];
const bodyComparisons = {};
for (const selector of bodySelectors) {
  const [cBody, hybridBody] = await Promise.all([
    compositionSignature('dense-analytical-dark',selector),
    compositionSignature('hybrid-dark',selector),
  ]);
  bodyComparisons[selector] = {
    computedGeometryAndStyleExact: JSON.stringify(cBody) === JSON.stringify(hybridBody),
    firstDifference: firstSignatureDifference(cBody, hybridBody),
  };
}
validation.hybridComposition = {
  method: 'Computed geometry and visual-style signatures; positions are normalized to each compared section root so vertical raster phase cannot create false negatives.',
  heroComputedGeometryAndStyleExactToB: JSON.stringify(heroBSignature) === JSON.stringify(heroHybridSignature),
  heroFirstDifference: firstSignatureDifference(heroBSignature, heroHybridSignature),
  bodyComputedGeometryAndStyleExactToC: Object.values(bodyComparisons).every(item => item.computedGeometryAndStyleExact),
  bodyComparisons,
  allowedChange: 'W02 lead/hero presentation only',
};
validation.hybridComposition.pass = validation.hybridComposition.heroComputedGeometryAndStyleExactToB && validation.hybridComposition.bodyComputedGeometryAndStyleExactToC;
if (!validation.hybridComposition.pass) throw new Error(`Hybrid composition source mismatch:\n${JSON.stringify(validation.hybridComposition,null,2)}`);

const directionNames = { 'immersive-story':'B · Immersive Story', 'dense-analytical':'C · Dense Analytical', hybrid:'B Hero + C Body Hybrid' };

async function comparisonGrid(kind, title) {
  const items=[];
  for (const direction of directions) {
    const input=kind==='full' ? fullPaths[`${direction}-dark`] : path.join(screens,`${direction}-dark-${kind}.png`);
    const image=sharp(input);
    const meta=await image.metadata();
    const scale=kind==='full'?402/meta.width:1;
    const output=kind==='full'?await image.resize({width:402}).png().toBuffer():input;
    items.push({direction,input:output,meta:{width:kind==='full'?402:meta.width,height:Math.round(meta.height*scale)}});
  }
  const gap=24,labelH=70,top=88,colWidths=items.map(x=>x.meta.width),width=colWidths.reduce((a,b)=>a+b,0)+gap*2,height=top+labelH+Math.max(...items.map(x=>x.meta.height))+28;
  let x=0;const composites=[];let labels=`<text x="18" y="42" fill="#f5fafc" font-family="Arial,sans-serif" font-size="28" font-weight="700">${title}</text>`;
  for(const item of items){labels+=`<text x="${x+12}" y="${top+30}" fill="#9aa8b8" font-family="Arial,sans-serif" font-size="18">${directionNames[item.direction]}</text>`;composites.push({input:item.input,left:x,top:top+labelH});x+=item.meta.width+gap;}
  const svg=`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#070b11"/>${labels}</svg>`;
  await sharp(Buffer.from(svg)).composite(composites).png().toFile(path.join(screens,`${kind}-all-directions.png`));
}
await comparisonGrid('full','B / C / Hybrid full-length comparison');
await fs.rename(path.join(screens,'full-all-directions.png'),path.join(screens,'b-c-hybrid-full-comparison.png'));

validation.pass = Object.values(validation.renders).every(item => item.pass && item.parentageExact) && validation.hybridComposition.pass;
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n');
await browser.close();
console.log(JSON.stringify({pass:validation.pass, renders:Object.fromEntries(Object.entries(validation.renders).map(([k,v])=>[k,{heightPoints:v.heightPoints,semanticFieldCount:v.semanticFieldCount,sequenceExact:v.sequenceExact,chartExact:v.chartExact,parentageExact:v.parentageExact??true,pass:v.pass}]))},null,2));
