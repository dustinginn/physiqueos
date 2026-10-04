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
const fixture = JSON.parse(await fs.readFile(path.join(root, 'MIDWEEK-NATIVE-FIXTURE.json'), 'utf8'));
const recovery = JSON.parse(await fs.readFile(path.join(root, 'RECOVERY-MIDWEEK-FUTURE-FIXTURE.json'), 'utf8'));
await fs.mkdir(screens, { recursive: true });

const expectedSemantics = new Map();
const add = (key, value) => expectedSemantics.set(key, String(value));
add('lead.eyebrow', fixture.lead.eyebrow);
add('artifact.evidenceWindow.displayRange', fixture.artifact.evidenceWindow.displayRange);
for (const key of ['headline','meaning','goal','phase']) add(`lead.${key}`, fixture.lead[key]);
for (const key of ['score','band','movement','movementDirection','delta','reason','movementLabel']) add(`lead.confidence.${key}`, fixture.lead.confidence[key]);
for (const key of ['pairedDayCount','eligibleDayCount','headline','balanceHeadline','averageIntakeKcal','averageExpenditureKcal','averageBalanceKcal','chartTitle']) add(`energy.${key}`, fixture.energy[key]);
fixture.energy.dailyBalances.forEach((point, index) => {
  for (const key of ['date','label','weekday','intakeKcal','expenditureKcal','balanceKcal','complete']) add(`energy.dailyBalances.${index}.${key}`, point[key]);
});
for (const key of ['averageWeightLb','changeLb']) add(`weight.${key}`, fixture.weight[key]);
for (const key of ['scanDateDisplay','bodyFatPercent','leanMassLb','fatMassLb']) add(`bodyComposition.${key}`, fixture.bodyComposition[key]);
for (const key of ['headline','trainingDayCount','comparableCategoryCount','improvingCount','steadyCount']) add(`training.${key}`, fixture.training[key]);
fixture.training.highlights.forEach((item, index) => {
  for (const key of ['exerciseName','recordType','performanceValue','delta','headline','detail']) add(`training.highlights.${index}.${key}`, item[key]);
});
add('uncertainty.visibleItems.0.text', fixture.uncertainty.visibleItems[0].text);
add('coaching.action', fixture.coaching.find(item => item.section === 'action').text);
add('coaching.watch', fixture.coaching.find(item => item.section === 'watch').text);

const expectedQuantMarks = new Map([
  ['lead.confidence.score', String(fixture.lead.confidence.score)],
  ['energy.averageIntakeKcal', String(fixture.energy.averageIntakeKcal)],
  ['energy.averageExpenditureKcal', String(fixture.energy.averageExpenditureKcal)],
  ['energy.averageBalanceKcal', String(fixture.energy.averageBalanceKcal)],
  ['weight.averageWeightLb', String(fixture.weight.averageWeightLb)],
  ['weight.changeLb', String(fixture.weight.changeLb)],
  ['bodyComposition.bodyFatPercent', fixture.bodyComposition.bodyFatPercent],
  ['bodyComposition.leanMassLb', fixture.bodyComposition.leanMassLb],
  ['bodyComposition.fatMassLb', fixture.bodyComposition.fatMassLb],
  ['training.trainingDayCount', String(fixture.training.trainingDayCount)],
  ['training.comparableCategoryCount', String(fixture.training.comparableCategoryCount)],
  ['training.improvingCount', String(fixture.training.improvingCount)],
  ['training.steadyCount', String(fixture.training.steadyCount)],
]);
fixture.energy.dailyBalances.forEach((point, index) => {
  for (const key of ['intakeKcal','expenditureKcal','balanceKcal']) expectedQuantMarks.set(`energy.dailyBalances.${index}.${key}`, String(point[key]));
});
fixture.training.highlights.forEach((item, index) => {
  expectedQuantMarks.set(`training.highlights.${index}.performanceValue`, item.performanceValue);
  expectedQuantMarks.set(`training.highlights.${index}.delta`, item.delta);
});

const productionSequence = ['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21'];
const browser = await chromium.launch({ headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport:{width:1200,height:1000}, deviceScaleFactor:3 });
await page.goto(`file://${path.join(root,'midweek-dark.html')}`, { waitUntil:'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
await page.evaluate(() => document.fonts.ready);

const phone = page.locator('.phone[data-variant="midweek-dark"]');
const inspection = await phone.evaluate((el, args) => {
  const actual = {};
  const conflicts = [];
  for (const node of el.querySelectorAll('[data-semantic]')) {
    const key=node.dataset.semantic, value=node.dataset.value ?? '';
    if (key in actual && actual[key] !== value) conflicts.push({key,first:actual[key],next:value});
    actual[key]=value;
  }
  const expected=Object.fromEntries(args.expected);
  const missing=Object.keys(expected).filter(key => !(key in actual));
  const mismatches=Object.keys(expected).filter(key => key in actual && expected[key] !== actual[key]).map(key => ({key,expected:expected[key],actual:actual[key]}));
  const extra=Object.keys(actual).filter(key => !(key in expected));
  const allSections=[...el.querySelectorAll('[data-section-id]')].map(node => node.dataset.sectionId);
  const productionOnly=allSections.filter(id => id !== 'R-MIDWEEK-FUTURE');
  const recoveryIndex=allSections.indexOf('R-MIDWEEK-FUTURE');
  const chart=el.querySelector('[data-chart="midweek-energy"]');
  const bars=chart ? [...chart.querySelectorAll('.bar')].map(node => ({series:node.dataset.series,value:Number(node.dataset.value),date:node.parentElement.dataset.date})) : [];
  const quant=[...el.querySelectorAll('[data-quant-mark]')].map(node => ({sourceKey:node.dataset.sourceKey,value:node.dataset.value,kind:node.dataset.quantMark}));
  const quantActual=Object.fromEntries(quant.map(mark => [mark.sourceKey,mark.value]));
  const quantExpected=Object.fromEntries(args.expectedQuant);
  const quantMissing=Object.keys(quantExpected).filter(key => !(key in quantActual));
  const quantMismatches=Object.keys(quantExpected).filter(key => key in quantActual && quantExpected[key] !== quantActual[key]).map(key => ({key,expected:quantExpected[key],actual:quantActual[key]}));
  const quantExtra=Object.keys(quantActual).filter(key => !(key in quantExpected));
  const recoveryValues=Object.fromEntries([...el.querySelectorAll('[data-recovery-semantic]')].map(node => [node.dataset.recoverySemantic,node.dataset.value]));
  const text=el.innerText;
  const rect=el.getBoundingClientRect();
  const roleLocation=role => el.querySelector(`[data-narrative-role="${role}"]`)?.dataset.sectionId || el.querySelector(`[data-narrative-role="${role}"]`)?.closest('[data-section-id]')?.dataset.sectionId || null;
  return {
    widthPoints:Math.round(rect.width),heightPoints:Math.round(rect.height),
    semanticFieldCount:Object.keys(actual).length,missing,mismatches,extra,conflicts,
    allSections,productionOnly,
    recoveryPositionValid: recoveryIndex > allSections.indexOf('M17') && recoveryIndex < allSections.indexOf('M18'),
    recoveryFixtureBoundaryVisible:text.includes('FUTURE CONTRACT · FIXTURE ONLY'),
    recoveryConfidenceCouplingAbsent:text.includes('Confidence coupling: none') && !el.querySelector('[data-section-id="R-MIDWEEK-FUTURE"] [data-semantic^="lead.confidence"]'),
    productionRecoveryAbsent:!el.querySelector('[data-semantic^="recovery."]'),
    recoveryValues,
    chart:{type:chart?.dataset.chartType,series:chart?.dataset.chartSeries?.split('|'),pointCount:Number(chart?.dataset.chartPointCount),bars,label:chart?.getAttribute('aria-label')},
    quant,quantMissing,quantMismatches,quantExtra,
    navigation:[...el.querySelectorAll('.nav-chip')].map(node => node.innerText.replace('‹','').replace('▦','').trim()),
    narrativePlacement:{result:roleLocation('result'),meaning:roleLocation('meaning'),confidence:roleLocation('confidence'),action:roleLocation('action'),watch:roleLocation('watch')},
    conditionals:{
      bodyCompositionPresent:Boolean(el.querySelector('[data-section-id="M13"]')),
      priorityGroupsAbsent:!text.includes('PRIORITY MUSCLE GROUPS'),
      trainingWatchAbsent:!text.includes('TRAINING WATCH'),
      biggestTakeawayAbsent:!text.includes('Biggest Takeaway'),
      revisionAbsent:!text.includes('This Briefing was revised'),
      legacyStringsAbsent:Object.values(args.suppressed).every(item => !text.includes(typeof item === 'string' ? item : item.text)),
      oneConfidenceSurface:el.querySelectorAll('[data-semantic="lead.confidence.score"]').length===1,
    },
    accessibility:{
      narrativeSizes:[...el.querySelectorAll('.meaning,.unresolved p,.coach-block p')].map(node => Number.parseFloat(getComputedStyle(node).fontSize)),
      longFormAlignments:[...el.querySelectorAll('.meaning,.unresolved p,.coach-block p')].map(node => getComputedStyle(node).textAlign),
      navTargetHeights:[...el.querySelectorAll('.nav-chip')].map(node => Math.round(node.getBoundingClientRect().height)),
      chartLabel:chart?.getAttribute('aria-label'),
    },
  };
}, {expected:[...expectedSemantics],expectedQuant:[...expectedQuantMarks],suppressed:fixture.suppressed});

const expectedBars=fixture.energy.dailyBalances.flatMap(point => [
  {series:'Intake',value:point.intakeKcal,date:point.date},
  {series:'Estimated expenditure',value:point.expenditureKcal,date:point.date},
]);
inspection.sequenceExact=JSON.stringify(inspection.productionOnly)===JSON.stringify(productionSequence);
inspection.chartExact=inspection.chart.type==='grouped-bar' && JSON.stringify(inspection.chart.series)===JSON.stringify(['Intake','Estimated expenditure']) && inspection.chart.pointCount===2 && JSON.stringify(inspection.chart.bars)===JSON.stringify(expectedBars) && inspection.chart.label==='Daily intake and expenditure across 2 days';
inspection.recoveryFixtureExact=inspection.recoveryValues.statusLabel===recovery.statusLabel
  && inspection.recoveryValues['nightlyMinutes.0']===String(recovery.nightlyMinutes[0])
  && inspection.recoveryValues['nightlyMinutes.1']===String(recovery.nightlyMinutes[1])
  && inspection.recoveryValues['nightlyMinutes.2']===String(recovery.nightlyMinutes[2])
  && inspection.recoveryValues.periodAverageMinutes===String(recovery.periodAverageMinutes)
  && inspection.recoveryValues.personalBaselineMinutes===String(recovery.personalBaselineMinutes);
inspection.narrativePlacementExact=JSON.stringify(inspection.narrativePlacement)===JSON.stringify({result:'M04',meaning:'M05',confidence:'M03',action:'M20',watch:'M21'});
inspection.accessibilityPass=inspection.accessibility.narrativeSizes.every(size => size>=15)
  && inspection.accessibility.longFormAlignments.every(value => value==='left' || value==='start')
  && inspection.accessibility.navTargetHeights.every(value => value>=44)
  && inspection.accessibility.chartLabel==='Daily intake and expenditure across 2 days';
inspection.pass=inspection.widthPoints===402
  && inspection.missing.length===0 && inspection.mismatches.length===0 && inspection.extra.length===0 && inspection.conflicts.length===0
  && inspection.semanticFieldCount===expectedSemantics.size
  && inspection.sequenceExact && inspection.chartExact
  && inspection.quantMissing.length===0 && inspection.quantMismatches.length===0 && inspection.quantExtra.length===0
  && inspection.navigation.join('|')==='Home|Briefing History'
  && Object.values(inspection.conditionals).every(Boolean)
  && inspection.recoveryPositionValid && inspection.recoveryFixtureBoundaryVisible && inspection.recoveryConfidenceCouplingAbsent && inspection.productionRecoveryAbsent && inspection.recoveryFixtureExact
  && inspection.narrativePlacementExact && inspection.accessibilityPass;
if (!inspection.pass) throw new Error(`Midweek parity failed:\n${JSON.stringify(inspection,null,2)}`);

const full=path.join(screens,'midweek-dark-full.png');
await phone.screenshot({path:full});
const meta=await sharp(full).metadata();
await sharp(full).extract({left:0,top:0,width:meta.width,height:Math.min(meta.height,874*3)}).png().toFile(path.join(screens,'midweek-dark-above-fold.png'));

async function crop(selector,name){await phone.locator(selector).screenshot({path:path.join(screens,`${name}.png`)});}
await crop('[data-section-id="M02"]','midweek-dark-hero');
await crop('[data-section-id="M07"]','midweek-dark-energy');
await crop('[data-section-id="M13"]','midweek-dark-body-composition');
await crop('[data-section-id="M15"]','midweek-dark-training');
await crop('[data-section-id="R-MIDWEEK-FUTURE"]','midweek-dark-recovery-future');
await crop('[data-section-id="M19"]','midweek-dark-coach-finale');

const weekly=path.join(screens,'locked-weekly-reference.png');
const familyItems=[];
for (const [label,input] of [['Locked Weekly',weekly],['Midweek translation',full]]) {
  const image=sharp(input);const source=await image.metadata();const width=603;const height=Math.round(source.height*(width/source.width));
  familyItems.push({label,buffer:await image.resize({width}).png().toBuffer(),width,height});
}
const gap=34,top=98,labelHeight=56,boardWidth=familyItems.reduce((sum,item)=>sum+item.width,0)+gap,boardHeight=top+labelHeight+Math.max(...familyItems.map(item=>item.height))+32;
let x=0,labels=`<text x="20" y="46" fill="#f4f7f8" font-family="Arial,sans-serif" font-size="30" font-weight="700">Locked briefing family · dark</text>`;const composites=[];
for(const item of familyItems){labels+=`<text x="${x+14}" y="${top+30}" fill="#9aa8b8" font-family="Arial,sans-serif" font-size="20">${item.label}</text>`;composites.push({input:item.buffer,left:x,top:top+labelHeight});x+=item.width+gap;}
const boardSvg=`<svg width="${boardWidth}" height="${boardHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#070b11"/>${labels}</svg>`;
await sharp(Buffer.from(boardSvg)).composite(composites).png().toFile(path.join(screens,'locked-weekly-midweek-family-board.png'));

const validation={
  pass:true,
  authorities:fixture.authorities,
  target:{widthPoints:402,scale:3,safeAreaTopPoints:51},
  expectedSemanticFieldCount:expectedSemantics.size,
  productionSequence,
  graphInventory:[{id:'M10',component:'WeeklyEnergyCard.chart',section:'Energy',type:'grouped-bar',series:['Intake','Estimated expenditure'],dates:fixture.energy.dailyBalances.map(item=>item.date),pointCount:2,markCount:4,conditional:'module.chartIncluded == true'}],
  quantitativeMarkInventory:Object.fromEntries(expectedQuantMarks),
  conditionalInventory:{
    bodyComposition:'present: contract module included / phase baseline',
    priorityMuscleGroups:'absent: priorityCategories empty',
    trainingWatch:'absent: V3 projection clears legacy Training watch',
    biggestTakeaway:'absent: second movement not decision-changing',
    stillUnresolved:'present: one Server-selected visible item',
    revision:'absent: fixture has no revision provenance',
    productionRecovery:'absent: current contract module included=false / no eligible evidence',
    recoveryFutureFixture:'present only as approved planned future contract, after Training and before Still Unresolved/Coach; no Confidence coupling',
  },
  inspection,
};
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n');
await browser.close();
console.log(JSON.stringify({pass:true,heightPoints:inspection.heightPoints,semanticFieldCount:inspection.semanticFieldCount,quantitativeMarkCount:inspection.quant.length,sequenceExact:inspection.sequenceExact,chartExact:inspection.chartExact,recoveryFixtureExact:inspection.recoveryFixtureExact,accessibilityPass:inspection.accessibilityPass},null,2));
