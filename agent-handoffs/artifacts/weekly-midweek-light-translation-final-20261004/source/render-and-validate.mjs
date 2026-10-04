import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const previousRoot = path.resolve(root, '../recurring-briefing-family-refinement-20261004');
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

const expectedWeeklySections = ['weekly-navigation','weekly-hero','weekly-energy','weekly-weight','weekly-body-composition','weekly-training','weekly-recovery','weekly-finale','weekly-provenance'];
const expectedMidweekSections = ['midweek-navigation','midweek-hero','midweek-energy','midweek-weight','midweek-body-composition','midweek-training','midweek-recovery','midweek-finale','midweek-provenance'];
const expectedRecovery = { weekly:[403,412,395,418,407,399,416], midweek:[407,419,411] };

const browser = await chromium.launch({ headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport:{width:1900,height:1000}, deviceScaleFactor:3 });
await page.addInitScript(({ weeklyFixtures, midweek }) => {
  globalThis.__WEEKLY_FIXTURES__ = weeklyFixtures;
  globalThis.__MIDWEEK_FIXTURE__ = midweek;
}, { weeklyFixtures, midweek });
await page.goto(`file://${path.join(root, 'family-final.html')}`, { waitUntil:'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
await page.evaluate(() => document.fonts.ready);

async function inspect(variant) {
  return page.locator(`.phone[data-variant="${variant}"]`).evaluate((el, args) => {
    const actual = Object.fromEntries([...el.querySelectorAll('[data-semantic]')].map(node => [node.dataset.semantic, node.dataset.value ?? '']));
    const expected = Object.fromEntries(args.expected.filter(([key]) => key.startsWith(`${args.cadence}.`)));
    const missing = Object.keys(expected).filter(key => !(key in actual));
    const mismatches = Object.keys(expected).filter(key => key in actual && expected[key] !== actual[key]).map(key => ({key,expected:expected[key],actual:actual[key]}));
    const extra = Object.keys(actual).filter(key => !(key in expected));
    const sections = [...el.querySelectorAll('[data-section]')].map(node => node.dataset.section);
    const energy = el.querySelector(`[data-chart="${args.cadence}-energy"]`);
    const energyMarks = [...energy.querySelectorAll('[data-series]')].map(node => ({series:node.dataset.series,value:Number(node.dataset.value),sourceKey:node.dataset.sourceKey}));
    const recovery = el.querySelector(`[data-section="${args.cadence}-recovery"]`);
    const recoveryPoints = [...recovery.querySelectorAll('.sleep-point')].map(node => Number(node.dataset.value));
    const rect = el.getBoundingClientRect();
    const geometry = [...el.querySelectorAll('[data-section]')].map(node => {
      const r=node.getBoundingClientRect();
      return {section:node.dataset.section,x:Math.round(r.x-rect.x),y:Math.round(r.y-rect.y),width:Math.round(r.width),height:Math.round(r.height)};
    });
    const bodySourceNode=el.querySelector('[data-section="weekly-body-composition"]');
    return {
      variant:args.variant,cadence:args.cadence,appearance:args.appearance,
      widthPoints:Math.round(rect.width),heightPoints:Math.round(rect.height),innerText:el.innerText,
      semantic:actual,semanticCount:Object.keys(actual).length,missing,mismatches,extra,sections,geometry,
      photosAbsent:!el.innerText.includes('Photos'),unresolvedAbsent:!el.innerText.includes('Still Unresolved'),
      confidenceCount:el.querySelectorAll(`[data-semantic="${args.cadence}.${args.cadence==='weekly'?'confidence.score':'lead.confidence.score'}"]`).length,
      energy:{pointCount:Number(energy.dataset.pointCount),marks:energyMarks,label:energy.getAttribute('aria-label')},
      recovery:{points:recoveryPoints,label:recovery.querySelector('svg').getAttribute('aria-label'),fixtureOnly:recovery.dataset.fixtureOnly,confidenceCoupling:recovery.dataset.confidenceCoupling,status:recovery.querySelector('.status-pill').innerText.trim()},
      bodySource:bodySourceNode?.dataset.sourceFixture ?? null,
      biggestTakeaway:el.innerText.includes('Biggest Takeaway'),
      navTargets:[...el.querySelectorAll('.nav-chip')].map(node=>Math.round(node.getBoundingClientRect().height)),
      narrativeSizes:[...el.querySelectorAll('.meaning,.body-copy,.weight-note,.coach-block p')].map(node=>Number.parseFloat(getComputedStyle(node).fontSize)),
      weightTypography:{value:Number.parseFloat(getComputedStyle(el.querySelector('.weight-value')).fontSize),delta:Number.parseFloat(getComputedStyle(el.querySelector('.weight-delta')).fontSize),context:Number.parseFloat(getComputedStyle(el.querySelector('.weight-note')).fontSize)},
      appearanceTokens:{background:getComputedStyle(el).getPropertyValue('--bg').trim(),text:getComputedStyle(el).getPropertyValue('--text').trim(),secondary:getComputedStyle(el).getPropertyValue('--secondary').trim(),muted:getComputedStyle(el).getPropertyValue('--muted').trim(),purple:getComputedStyle(el).getPropertyValue('--purple').trim(),green:getComputedStyle(el).getPropertyValue('--green').trim(),blue:getComputedStyle(el).getPropertyValue('--blue').trim(),amber:getComputedStyle(el).getPropertyValue('--amber').trim(),cyan:getComputedStyle(el).getPropertyValue('--cyan').trim()},
    };
  }, { expected:[...expected], cadence:variant.split('-')[0], appearance:variant.split('-')[1], variant });
}

const variants=['weekly-dark','weekly-light','midweek-dark','midweek-light'];
const renders=Object.fromEntries(await Promise.all(variants.map(async variant => [variant, await inspect(variant)])));
const weeklyEnergyExpected=w.energy.dailyBalances.flatMap((p,i)=>[{series:'Intake',value:p.intakeKcal,sourceKey:`weekly.energy.dailyBalances.${i}.intakeKcal`},{series:'Estimated expenditure',value:p.expenditureKcal,sourceKey:`weekly.energy.dailyBalances.${i}.expenditureKcal`}]);
const midweekEnergyExpected=m.energy.dailyBalances.flatMap((p,i)=>[{series:'Intake',value:p.intakeKcal,sourceKey:`midweek.energy.dailyBalances.${i}.intakeKcal`},{series:'Estimated expenditure',value:p.expenditureKcal,sourceKey:`midweek.energy.dailyBalances.${i}.expenditureKcal`}]);
for (const result of Object.values(renders)) {
  const expectedSections=result.cadence==='weekly'?expectedWeeklySections:expectedMidweekSections;
  const expectedEnergy=result.cadence==='weekly'?weeklyEnergyExpected:midweekEnergyExpected;
  const expectedPoints=expectedRecovery[result.cadence];
  result.sectionOrderExact=JSON.stringify(result.sections)===JSON.stringify(expectedSections);
  result.energyExact=JSON.stringify(result.energy.marks)===JSON.stringify(expectedEnergy) && result.energy.pointCount===(result.cadence==='weekly'?7:2);
  result.recoveryExact=JSON.stringify(result.recovery.points)===JSON.stringify(expectedPoints) && result.recovery.fixtureOnly==='true' && result.recovery.confidenceCoupling==='none' && result.recovery.status==='Green' && result.recovery.label.includes('Baseline 405 minutes');
  result.accessibilityPass=result.navTargets.every(v=>v>=44)&&result.narrativeSizes.every(v=>v>=15)&&result.recovery.label.length>40;
  result.pass=result.widthPoints===402&&result.missing.length===0&&result.mismatches.length===0&&result.extra.length===0&&result.sectionOrderExact&&result.energyExact&&result.recoveryExact&&result.photosAbsent&&result.unresolvedAbsent&&result.confidenceCount===1&&result.biggestTakeaway&&result.accessibilityPass&&JSON.stringify(result.weightTypography)===JSON.stringify({value:27,delta:13,context:15})&&(result.cadence!=='weekly'||result.bodySource==='weekly_briefing_2026-07-12_2026-07-18');
  if(!result.pass)throw new Error(`${result.variant} validation failed:\n${JSON.stringify(result,null,2)}`);
}

function normalizedGeometry(result){return result.geometry.map(({section,x,width,height})=>({section,x,width,height}));}
const appearanceParity={};
for(const cadence of ['weekly','midweek']){
  const dark=renders[`${cadence}-dark`],light=renders[`${cadence}-light`];
  appearanceParity[cadence]={
    contentExact:dark.innerText===light.innerText,
    semanticsExact:JSON.stringify(dark.semantic)===JSON.stringify(light.semantic),
    sectionOrderExact:JSON.stringify(dark.sections)===JSON.stringify(light.sections),
    sectionGeometryExact:JSON.stringify(normalizedGeometry(dark))===JSON.stringify(normalizedGeometry(light)),
    energyExact:JSON.stringify(dark.energy)===JSON.stringify(light.energy),
    recoveryExact:JSON.stringify(dark.recovery)===JSON.stringify(light.recovery),
    heightExact:dark.heightPoints===light.heightPoints,
    appearanceTokensDifferent:JSON.stringify(dark.appearanceTokens)!==JSON.stringify(light.appearanceTokens),
  };
  appearanceParity[cadence].pass=Object.values(appearanceParity[cadence]).every(Boolean);
  if(!appearanceParity[cadence].pass)throw new Error(`${cadence} dark/light parity failed:\n${JSON.stringify(appearanceParity[cadence],null,2)}`);
}

function luminance(hex){const values=hex.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16)/255).map(value=>value<=.03928?value/12.92:((value+.055)/1.055)**2.4);return .2126*values[0]+.7152*values[1]+.0722*values[2]}
function contrast(a,b){let left=luminance(a),right=luminance(b);if(left<right)[left,right]=[right,left];return (left+.05)/(right+.05)}
const lightContrast={background:'#f1f1e9',ratios:{text:contrast('#102638','#f1f1e9'),secondary:contrast('#4e6470','#f1f1e9'),muted:contrast('#576b73','#f1f1e9'),purple:contrast('#684ac7','#f1f1e9'),green:contrast('#0b6b4d','#f1f1e9'),blue:contrast('#0e607a','#f1f1e9'),amber:contrast('#875400','#f1f1e9'),cyan:contrast('#0d6670','#f1f1e9')}};
lightContrast.pass=Object.values(lightContrast.ratios).every(value=>value>=4.5);
if(!lightContrast.pass)throw new Error(`Light contrast failed: ${JSON.stringify(lightContrast)}`);

const previousPage=await browser.newPage({viewport:{width:1000,height:1000},deviceScaleFactor:3});
await previousPage.addInitScript(({weeklyFixtures,midweek})=>{globalThis.__WEEKLY_FIXTURES__=weeklyFixtures;globalThis.__MIDWEEK_FIXTURE__=midweek;},{weeklyFixtures,midweek});
await previousPage.goto(`file://${path.join(previousRoot,'family-dark.html')}`,{waitUntil:'networkidle'});
await previousPage.waitForFunction(()=>document.documentElement.dataset.ready==='true');
await previousPage.evaluate(()=>document.fonts.ready);

async function signature(targetPage, selector){return targetPage.locator(selector).evaluate(el=>{const base=el.getBoundingClientRect();const props=['display','position','width','height','paddingTop','paddingRight','paddingBottom','paddingLeft','fontSize','lineHeight','fontWeight','gridTemplateColumns','gridTemplateRows','columnGap','rowGap','alignItems','justifyContent','borderRadius'];return [el,...el.querySelectorAll('*')].map(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node),rect=r.width===0&&r.height===0?[0,0,0,0]:[Math.round(r.x-base.x),Math.round(r.y-base.y),Math.round(r.width),Math.round(r.height)];return{tag:node.tagName,className:typeof node.className==='string'?node.className:'',section:node.dataset?.section??null,semantic:node.dataset?.semantic??null,text:node.children.length===0?node.textContent:null,rect,style:Object.fromEntries(props.map(prop=>[prop,s[prop]]))}})});}
const darkPreservation={midweekSections:{},weeklySections:{}};
for(const section of ['midweek-navigation','midweek-hero','midweek-energy','midweek-weight','midweek-body-composition','midweek-training','midweek-recovery','midweek-finale','midweek-provenance']){
  const [oldSig,newSig]=await Promise.all([signature(previousPage,`.phone.midweek [data-section="${section}"]`),signature(page,`.phone[data-variant="midweek-dark"] [data-section="${section}"]`)]);
  darkPreservation.midweekSections[section]=JSON.stringify(oldSig)===JSON.stringify(newSig);
}
for(const section of ['weekly-hero','weekly-energy','weekly-weight','weekly-body-composition','weekly-training','weekly-recovery','weekly-finale','weekly-provenance']){
  const oldSelector=section==='weekly-body-composition'?'[data-section="weekly-body-composition"]':`[data-section="${section}"]`;
  const [oldSig,newSig]=await Promise.all([signature(previousPage,`.phone.weekly ${oldSelector}`),signature(page,`.phone[data-variant="weekly-dark"] ${oldSelector}`)]);
  darkPreservation.weeklySections[section]=JSON.stringify(oldSig)===JSON.stringify(newSig);
}
darkPreservation.onlyWeeklyOrderChanged=Object.values(darkPreservation.midweekSections).every(Boolean)&&Object.values(darkPreservation.weeklySections).every(Boolean);
if(!darkPreservation.onlyWeeklyOrderChanged)throw new Error(`Dark preservation failed:\n${JSON.stringify(darkPreservation,null,2)}`);

async function screenshotPhone(variant){const file=path.join(screens,`${variant}-full.png`);await page.locator(`.phone[data-variant="${variant}"]`).screenshot({path:file});return file}
const fullPaths={};for(const variant of variants)fullPaths[variant]=await screenshotPhone(variant);

async function makeBoard(items,name,title,width=603){const prepared=[];for(const item of items){const image=sharp(item.path);const meta=await image.metadata();const height=Math.round(meta.height*(width/meta.width));prepared.push({...item,buffer:await image.resize({width}).png().toBuffer(),width,height})}const gap=28,top=88,labelH=52,boardWidth=prepared.length*width+(prepared.length-1)*gap,boardHeight=top+labelH+Math.max(...prepared.map(item=>item.height))+28;let x=0,labels=`<text x="18" y="42" fill="#f4f7f8" font-family="Arial,sans-serif" font-size="28" font-weight="700">${title}</text>`;const composites=[];for(const item of prepared){labels+=`<text x="${x+12}" y="${top+30}" fill="#9aa8b8" font-family="Arial,sans-serif" font-size="18">${item.label}</text>`;composites.push({input:item.buffer,left:x,top:top+labelH});x+=width+gap}const svg=`<svg width="${boardWidth}" height="${boardHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#070b11"/>${labels}</svg>`;await sharp(Buffer.from(svg)).composite(composites).png().toFile(path.join(screens,name))}
await makeBoard([{label:'Weekly · dark',path:fullPaths['weekly-dark']},{label:'Weekly · mineral light',path:fullPaths['weekly-light']}],'weekly-dark-light.png','Weekly Briefing · appearance translation');
await makeBoard([{label:'Midweek · dark',path:fullPaths['midweek-dark']},{label:'Midweek · mineral light',path:fullPaths['midweek-light']}],'midweek-dark-light.png','Midweek Briefing · appearance translation');
await makeBoard([{label:'Weekly · dark',path:fullPaths['weekly-dark']},{label:'Weekly · mineral light',path:fullPaths['weekly-light']},{label:'Midweek · dark',path:fullPaths['midweek-dark']},{label:'Midweek · mineral light',path:fullPaths['midweek-light']}],'recurring-family-four-up.png','Recurring Briefing family · dark and mineral light',402);

async function focusScreenshot(cadence,theme,selector,name){const file=path.join(screens,`${name}-${theme}.png`);await page.locator(`.phone[data-variant="${cadence}-${theme}"] ${selector}`).screenshot({path:file});return file}
async function rangeScreenshot(cadence,theme,startSelector,endSelector,name){const phone=page.locator(`.phone[data-variant="${cadence}-${theme}"]`),start=phone.locator(startSelector),end=phone.locator(endSelector);const [phoneBox,startBox,endBox]=await Promise.all([phone.boundingBox(),start.boundingBox(),end.boundingBox()]);const input=fullPaths[`${cadence}-${theme}`],scale=3,top=Math.round((startBox.y-phoneBox.y)*scale),bottom=Math.round((endBox.y-phoneBox.y+endBox.height)*scale);const meta=await sharp(input).metadata();const file=path.join(screens,`${name}-${theme}.png`);await sharp(input).extract({left:0,top,width:meta.width,height:bottom-top}).png().toFile(file);return file}
for(const cadence of ['weekly','midweek']){
  for(const theme of ['dark','light']){
    await focusScreenshot(cadence,theme,`[data-section="${cadence}-hero"]`,`${cadence}-hero`);
    await rangeScreenshot(cadence,theme,`[data-section="${cadence}-weight"]`,`[data-section="${cadence}-body-composition"]`,`${cadence}-weight-body-composition`);
    await focusScreenshot(cadence,theme,`[data-section="${cadence}-recovery"]`,`${cadence}-recovery`);
    await focusScreenshot(cadence,theme,`[data-section="${cadence}-finale"]`,`${cadence}-finale`);
  }
  for(const focus of ['hero','weight-body-composition','recovery','finale']){
    await makeBoard([{label:`${cadence} · dark`,path:path.join(screens,`${cadence}-${focus}-dark.png`)},{label:`${cadence} · mineral light`,path:path.join(screens,`${cadence}-${focus}-light.png`)}],`${cadence}-${focus}-dark-light.png`,`${cadence[0].toUpperCase()+cadence.slice(1)} · ${focus.replaceAll('-',' ')}`,603);
  }
}

const validation={pass:true,authorities:{prompt:'f01c03002071f92f2742c1679eaa6bdebd1abc2f',acceptedDark:'2599068c327111b7f3622cfc1918d4df07f7f789',nativeBuild85:'b8ee8690b194cb90086b62816b9a2c8c400dc026',productionServer:'3c0f4aefddbb9a6886f6ad012443978303d47024',recoveryPrototype:'1bfa92ef874c3c96f05b23a9d3cbdfb956384156'},target:{widthPoints:402,scale:3,safeAreaTopPoints:51},requiredOrder:{weekly:expectedWeeklySections,midweek:expectedMidweekSections},renders,appearanceParity,darkPreservation,lightContrast};
await fs.writeFile(path.join(root,'validation.json'),`${JSON.stringify(validation,null,2)}\n`);
await previousPage.close();await browser.close();
console.log(JSON.stringify({pass:true,heights:Object.fromEntries(Object.entries(renders).map(([key,value])=>[key,value.heightPoints])),appearanceParity,darkPreservation,lightContrast},null,2));
