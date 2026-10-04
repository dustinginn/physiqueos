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
await fs.mkdir(screens, { recursive: true });

const weeklyFixtures = JSON.parse(await fs.readFile(path.join(root, 'WEEKLY-NATIVE-FIXTURES.json'), 'utf8'));
const weekly = weeklyFixtures.find(item => item.id === 'weekly_briefing_2026-08-23_2026-08-29');
const bodySource = weeklyFixtures.find(item => item.id === 'weekly_briefing_2026-07-12_2026-07-18').weekly.bodyComposition;
const midweek = JSON.parse(await fs.readFile(path.join(root, 'MIDWEEK-NATIVE-FIXTURE.json'), 'utf8'));
if (!weekly || !bodySource || !midweek) throw new Error('Missing authority fixture');

const expected = new Map();
const add = (scope, key, value) => expected.set(`${scope}.${key}`, String(value));
const w = weekly.weekly;
for (const [key, value] of Object.entries({
  'confidence.score': weekly.confidence.score,
  'confidence.band': weekly.confidence.band,
  'confidence.movementDirection': weekly.confidence.movementDirection,
  'confidence.delta': weekly.confidence.delta,
  'confidence.primaryReason': weekly.confidence.primaryReason,
  periodLabel: w.periodLabel, reportingRangeLabel: w.reportingRangeLabel,
  heroHeadline: w.heroHeadline, heroBody: w.heroBody,
  strategyPhaseLabel: w.strategyPhaseLabel, strategyWeekLabel: w.strategyWeekLabel,
  strategyNextMilestone: w.strategyNextMilestone,
  'energy.pairedDayCount': w.energy.pairedDayCount,
  'energy.eligibleDayCount': w.energy.eligibleDayCount,
  'energy.averageIntakeKcal': w.energy.averageIntakeKcal,
  'energy.averageExpenditureKcal': w.energy.averageExpenditureKcal,
  'energy.averageBalanceKcal': w.energy.averageBalanceKcal,
  'energy.narrative': w.energy.narrative,
  'weight.averageWeightLb': w.weight.averageWeightLb,
  'weight.changeLb': w.weight.changeLb,
  'weight.narrative': w.weight.narrative,
  'training.headline': w.training.headline,
  'training.narrative': w.training.narrative,
  'training.trainingDayCount': w.training.trainingDayCount,
  'training.comparableCategoryCount': w.training.comparableCategoryCount,
  'training.improvingCount': w.training.improvingCount,
  'training.steadyCount': w.training.steadyCount,
  'training.plateauingCount': w.training.plateauingCount,
  'coachTake.biggestTakeaway': w.coachTake.biggestTakeaway,
  'coachTake.recommendation': w.coachTake.recommendation,
  'revision.reason': weekly.revisionProvenance.reason,
  'revision.previousHeadline': weekly.replacedHistory[0].headline,
})) add('weekly', key, value);
w.training.highlights.forEach((item, index) => {
  for (const key of ['exerciseName','recordType','performanceValue','delta','detail']) add('weekly', `training.highlights.${index}.${key}`, item[key]);
});
w.training.priorityGroups.forEach((item, index) => {
  for (const key of ['label','statusLabel','comparableExerciseCount']) add('weekly', `training.priorityGroups.${index}.${key}`, item[key]);
});
w.coachTake.intoNextWeek.forEach((value, index) => add('weekly', `coachTake.intoNextWeek.${index}`, value));

const m = midweek;
for (const [key, value] of Object.entries({
  'lead.eyebrow': m.lead.eyebrow,
  'evidenceWindow.displayRange': m.artifact.evidenceWindow.displayRange,
  'lead.confidence.score': m.lead.confidence.score,
  'lead.confidence.band': m.lead.confidence.band,
  'lead.confidence.movementLabel': m.lead.confidence.movementLabel,
  'lead.confidence.reason': m.lead.confidence.reason,
  'lead.headline': m.lead.headline,
  'lead.meaning': m.lead.meaning,
  'lead.goal': m.lead.goal,
  'lead.phase': m.lead.phase,
  'energy.headline': m.energy.headline,
  'energy.balanceHeadline': m.energy.balanceHeadline,
  'energy.averageIntakeKcal': m.energy.averageIntakeKcal,
  'energy.averageExpenditureKcal': m.energy.averageExpenditureKcal,
  'energy.chartTitle': m.energy.chartTitle,
  'weight.averageWeightLb': m.weight.averageWeightLb,
  'weight.changeLb': m.weight.changeLb,
  'bodyComposition.scanDateDisplay': m.bodyComposition.scanDateDisplay,
  'bodyComposition.bodyFatPercent': m.bodyComposition.bodyFatPercent,
  'bodyComposition.leanMassLb': m.bodyComposition.leanMassLb,
  'bodyComposition.fatMassLb': m.bodyComposition.fatMassLb,
  'training.headline': m.training.headline,
  'training.trainingDayCount': m.training.trainingDayCount,
  'training.comparableCategoryCount': m.training.comparableCategoryCount,
  'training.improvingCount': m.training.improvingCount,
  'training.steadyCount': m.training.steadyCount,
  'coaching.action': m.coaching.find(item => item.section === 'action').text,
  'coaching.watch': m.coaching.find(item => item.section === 'watch').text,
})) add('midweek', key, value);
m.energy.dailyBalances.forEach((item, index) => add('midweek', `energy.dailyBalances.${index}.weekday`, item.weekday));
m.training.highlights.forEach((item, index) => {
  for (const key of ['exerciseName','recordType','performanceValue','delta','headline','detail']) add('midweek', `training.highlights.${index}.${key}`, item[key]);
});

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 3 });
await page.addInitScript(({ weeklyFixtures, midweek }) => {
  globalThis.__WEEKLY_FIXTURES__ = weeklyFixtures;
  globalThis.__MIDWEEK_FIXTURE__ = midweek;
}, { weeklyFixtures, midweek });
await page.goto(`file://${path.join(root, 'family-dark.html')}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
await page.evaluate(() => document.fonts.ready);

const inspect = await page.evaluate(({ expected, bodySource, suppressedTakeaway, weeklyEnergy, midweekEnergy }) => {
  const root = document.getElementById('board');
  const actual = Object.fromEntries([...root.querySelectorAll('[data-semantic]')].map(node => [node.dataset.semantic, node.dataset.value ?? '']));
  const exp = Object.fromEntries(expected);
  const missing = Object.keys(exp).filter(key => !(key in actual));
  const mismatches = Object.keys(exp).filter(key => key in actual && exp[key] !== actual[key]).map(key => ({ key, expected: exp[key], actual: actual[key] }));
  const extra = Object.keys(actual).filter(key => !(key in exp));
  const phone = cadence => root.querySelector(`.phone.${cadence}`);
  const sections = cadence => [...phone(cadence).querySelectorAll('[data-section]')].map(node => node.dataset.section);
  const text = cadence => phone(cadence).innerText;
  const chart = cadence => {
    const node = phone(cadence).querySelector(`[data-chart="${cadence}-energy"]`);
    return { pointCount: Number(node.dataset.pointCount), marks: [...node.querySelectorAll('[data-series]')].map(mark => ({ series: mark.dataset.series, value: Number(mark.dataset.value), sourceKey: mark.dataset.sourceKey })) };
  };
  const sleep = cadence => {
    const section = phone(cadence).querySelector(`[data-section="${cadence}-recovery"]`);
    return { fixtureOnly: section.dataset.fixtureOnly === 'true', confidenceCoupling: section.dataset.confidenceCoupling, points: [...section.querySelectorAll('.sleep-point')].map(mark => Number(mark.dataset.value)), aria: section.querySelector('svg').getAttribute('aria-label'), status: section.querySelector('.status-pill').innerText.trim() };
  };
  const px = (cadence, selector, property='fontSize') => Number.parseFloat(getComputedStyle(phone(cadence).querySelector(selector))[property]);
  return {
    width: { weekly: Math.round(phone('weekly').getBoundingClientRect().width), midweek: Math.round(phone('midweek').getBoundingClientRect().width) },
    heights: { weekly: Math.round(phone('weekly').getBoundingClientRect().height), midweek: Math.round(phone('midweek').getBoundingClientRect().height) },
    semanticFieldCount: Object.keys(actual).length, missing, mismatches, extra,
    sections: { weekly: sections('weekly'), midweek: sections('midweek') },
    photosAbsent: !text('weekly').includes('Photos') && !text('midweek').includes('Photos'),
    unresolvedAbsent: !text('weekly').includes('Still Unresolved') && !text('midweek').includes('Still Unresolved'),
    biggestTakeaway: {
      weekly: Boolean(phone('weekly').querySelector('[data-section="weekly-finale"]')) && text('weekly').includes('Biggest Takeaway'),
      midweek: phone('midweek').querySelector('[data-target-key="midweek.coaching.coachTake"]')?.dataset.value === suppressedTakeaway,
    },
    bodyComposition: {
      weekly: Object.fromEntries([...phone('weekly').querySelectorAll('[data-target-key^="bodyComposition"]')].map(node => [node.dataset.targetKey, node.dataset.value])),
      weeklySource: phone('weekly').querySelector('[data-section="weekly-body-composition"]').dataset.sourceFixture,
      expectedWeekly: { 'bodyComposition.bodyFatPercent': bodySource.bodyFatPercent, 'bodyComposition.leanMassLb': bodySource.leanMassLb, 'bodyComposition.fatMassLb': bodySource.fatMassLb },
      midweekPresent: Boolean(phone('midweek').querySelector('[data-section="midweek-body-composition"]')),
    },
    confidenceCount: { weekly: phone('weekly').querySelectorAll('[data-semantic="weekly.confidence.score"]').length, midweek: phone('midweek').querySelectorAll('[data-semantic="midweek.lead.confidence.score"]').length },
    energy: { weekly: chart('weekly'), midweek: chart('midweek'), expectedWeekly: weeklyEnergy.flatMap((p,i) => [{ series:'Intake', value:p.intakeKcal, sourceKey:`weekly.energy.dailyBalances.${i}.intakeKcal` }, { series:'Estimated expenditure', value:p.expenditureKcal, sourceKey:`weekly.energy.dailyBalances.${i}.expenditureKcal` }]), expectedMidweek: midweekEnergy.flatMap((p,i) => [{ series:'Intake', value:p.intakeKcal, sourceKey:`midweek.energy.dailyBalances.${i}.intakeKcal` }, { series:'Estimated expenditure', value:p.expenditureKcal, sourceKey:`midweek.energy.dailyBalances.${i}.expenditureKcal` }]) },
    recovery: { weekly: sleep('weekly'), midweek: sleep('midweek') },
    weightTypography: { weekly: { value:px('weekly','.weight-value'), delta:px('weekly','.weight-delta'), context:px('weekly','.weight-note') }, midweek: { value:px('midweek','.weight-value'), delta:px('midweek','.weight-delta'), context:px('midweek','.weight-note') } },
    navTargets: [...root.querySelectorAll('.nav-chip')].map(node => Math.round(node.getBoundingClientRect().height)),
    narrativeSizes: [...root.querySelectorAll('.meaning,.body-copy,.weight-note,.coach-block p')].map(node => Number.parseFloat(getComputedStyle(node).fontSize)),
  };
}, { expected: [...expected], bodySource, suppressedTakeaway: m.suppressed.coachTake.text, weeklyEnergy: w.energy.dailyBalances, midweekEnergy: m.energy.dailyBalances });

const expectedWeeklySections = ['weekly-navigation','weekly-hero','weekly-energy','weekly-weight','weekly-training','weekly-recovery','weekly-body-composition','weekly-finale','weekly-provenance'];
const expectedMidweekSections = ['midweek-navigation','midweek-hero','midweek-energy','midweek-weight','midweek-body-composition','midweek-training','midweek-recovery','midweek-finale','midweek-provenance'];
inspect.sectionOrderExact = JSON.stringify(inspect.sections.weekly) === JSON.stringify(expectedWeeklySections) && JSON.stringify(inspect.sections.midweek) === JSON.stringify(expectedMidweekSections);
inspect.bodyCompositionExact = JSON.stringify(inspect.bodyComposition.weekly) === JSON.stringify(inspect.bodyComposition.expectedWeekly) && inspect.bodyComposition.weeklySource === 'weekly_briefing_2026-07-12_2026-07-18' && inspect.bodyComposition.midweekPresent;
inspect.energyExact = JSON.stringify(inspect.energy.weekly.marks) === JSON.stringify(inspect.energy.expectedWeekly) && JSON.stringify(inspect.energy.midweek.marks) === JSON.stringify(inspect.energy.expectedMidweek) && inspect.energy.weekly.pointCount === 7 && inspect.energy.midweek.pointCount === 2;
inspect.recoveryExact = JSON.stringify(inspect.recovery.weekly.points) === JSON.stringify([403,412,395,418,407,399,416]) && JSON.stringify(inspect.recovery.midweek.points) === JSON.stringify([407,419,411]) && inspect.recovery.weekly.fixtureOnly && inspect.recovery.midweek.fixtureOnly && inspect.recovery.weekly.confidenceCoupling === 'none' && inspect.recovery.midweek.confidenceCoupling === 'none' && inspect.recovery.weekly.status === 'Green' && inspect.recovery.midweek.status === 'Green' && inspect.recovery.weekly.aria.includes('Baseline 405 minutes') && inspect.recovery.midweek.aria.includes('Baseline 405 minutes');
inspect.weightTypographyExact = JSON.stringify(inspect.weightTypography.weekly) === JSON.stringify({value:27,delta:13,context:15}) && JSON.stringify(inspect.weightTypography.midweek) === JSON.stringify({value:27,delta:13,context:15});
inspect.accessibilityPass = inspect.navTargets.every(value => value >= 44) && inspect.narrativeSizes.every(value => value >= 15) && inspect.recovery.weekly.aria.length > 40 && inspect.recovery.midweek.aria.length > 40;
inspect.pass = inspect.width.weekly === 402 && inspect.width.midweek === 402 && inspect.missing.length === 0 && inspect.mismatches.length === 0 && inspect.extra.length === 0 && inspect.photosAbsent && inspect.unresolvedAbsent && inspect.biggestTakeaway.weekly && inspect.biggestTakeaway.midweek && inspect.confidenceCount.weekly === 1 && inspect.confidenceCount.midweek === 1 && inspect.sectionOrderExact && inspect.bodyCompositionExact && inspect.energyExact && inspect.recoveryExact && inspect.weightTypographyExact && inspect.accessibilityPass;
if (!inspect.pass) throw new Error(`Recurring family validation failed:\n${JSON.stringify(inspect, null, 2)}`);

async function screenshot(selector, name) { await page.locator(selector).screenshot({ path: path.join(screens, name) }); }
await screenshot('.phone.weekly', 'weekly-dark-full.png');
await screenshot('.phone.midweek', 'midweek-dark-full.png');
await screenshot('#board', 'weekly-midweek-family-board.png');
await screenshot('.phone.weekly [data-section="weekly-recovery"]', 'weekly-dark-recovery.png');
await screenshot('.phone.midweek [data-section="midweek-recovery"]', 'midweek-dark-recovery.png');
await screenshot('.phone.weekly [data-section="weekly-body-composition"]', 'weekly-dark-body-composition.png');
await screenshot('.phone.midweek [data-section="midweek-body-composition"]', 'midweek-dark-body-composition.png');
await screenshot('.phone.weekly [data-section="weekly-finale"]', 'weekly-dark-finale.png');
await screenshot('.phone.midweek [data-section="midweek-finale"]', 'midweek-dark-finale.png');
for (const cadence of ['weekly','midweek']) {
  const input = path.join(screens, `${cadence}-dark-full.png`);
  const meta = await sharp(input).metadata();
  await sharp(input).extract({ left:0, top:0, width:meta.width, height:Math.min(meta.height, 874*3) }).png().toFile(path.join(screens, `${cadence}-dark-above-fold.png`));
}

const validation = {
  pass: true,
  authorities: { prompt: 'd3501e1a747d05a888b786a0ca1f014dea03f299', nativeBuild85: 'b8ee8690b194cb90086b62816b9a2c8c400dc026', productionServer: '3c0f4aefddbb9a6886f6ad012443978303d47024', recoveryPrototype: '1bfa92ef874c3c96f05b23a9d3cbdfb956384156' },
  target: { widthPoints:402, scale:3, safeAreaTopPoints:51 },
  sectionParity: {
    weekly: ['Hero / Confidence','Energy','Weight','Training','Recovery — future contract','Body Composition — founder parity target','Biggest Takeaway','What To Do','Into Next Week','Revision / provenance'],
    midweek: ['Hero / Confidence','Energy','Weight','Body Composition','Training','Recovery — future contract','Biggest Takeaway','What To Do','What To Watch','Revision / provenance'],
    intentionallyAbsent: ['Photos','Still Unresolved'],
  },
  graphInventory: [
    { cadence:'weekly', section:'Energy', type:'grouped bar', pointCount:7, markCount:14 },
    { cadence:'midweek', section:'Energy', type:'grouped bar', pointCount:2, markCount:4 },
    { cadence:'weekly', section:'Recovery', type:'Sleep trend line + area + baseline', pointCount:7, status:'Green', fixtureOnly:true },
    { cadence:'midweek', section:'Recovery', type:'Sleep trend line + area + baseline', pointCount:3, status:'Green', fixtureOnly:true },
  ],
  inspection: inspect,
};
await fs.writeFile(path.join(root, 'validation.json'), `${JSON.stringify(validation, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ pass:true, heights:inspect.heights, semanticFieldCount:inspect.semanticFieldCount, photosAbsent:inspect.photosAbsent, unresolvedAbsent:inspect.unresolvedAbsent, bodyCompositionExact:inspect.bodyCompositionExact, recoveryExact:inspect.recoveryExact, weightTypographyExact:inspect.weightTypographyExact, accessibilityPass:inspect.accessibilityPass }, null, 2));
