import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repo = path.resolve(root, '../../..');
const screens = path.join(root, 'screens');
await fs.mkdir(screens, { recursive: true });

const source = JSON.parse(await fs.readFile(path.join(root, 'MONTHLY-SOURCE-FIXTURE.json'), 'utf8'));
const recovery = JSON.parse(await fs.readFile(path.join(root, 'RECOVERY-MONTHLY-FUTURE-FIXTURE.json'), 'utf8'));
const expected = new Map();
const add = (key, value) => expected.set(`monthly.${key}`, String(value));
for (const [key, value] of Object.entries({
  'hero.eyebrow': source.hero.eyebrow,
  'hero.range': source.hero.range,
  'hero.period': source.hero.period,
  'hero.confidence.score': source.hero.confidence.score,
  'hero.confidence.band': source.hero.confidence.band,
  'hero.confidence.movement': source.hero.confidence.movement,
  'hero.confidence.explanation': source.hero.confidence.explanation,
  'hero.headline': source.hero.headline,
  'hero.narrative': source.hero.narrative,
  'goal.goal': source.goalContext.goal,
  'goal.phase': source.goalContext.phase,
  'strategy.label': source.strategy.label,
  'strategy.copy': source.strategy.copy,
  'strategy.recommendation': source.strategy.recommendation,
  'training.headline': source.training.headline,
  'training.narrative': source.training.narrative,
  'training.insight': source.training.insight,
  'energy.phase': source.energy.phase,
  'energy.headline': source.energy.headline,
  'energy.narrative': source.energy.narrative,
  'energy.insight': source.energy.insight,
  'body.date': source.bodyComposition.referenceDate,
  'body.headline': source.bodyComposition.headline,
  'body.narrative': source.bodyComposition.narrative,
  'body.callout': source.bodyComposition.callout,
  'changes.title': source.changes.title,
  'ahead.title': source.monthAhead.title,
  'ahead.intro': source.monthAhead.introduction,
  'recovery.title': recovery.title,
  'recovery.summary': recovery.summary,
  'recovery.status': recovery.status,
  'recovery.average': recovery.periodAverageMinutes,
  'recovery.baseline': recovery.personalBaselineMinutes,
  'recovery.commentaryTitle': recovery.commentary.title,
  'recovery.commentary': recovery.commentary.body,
  'recovery.foam': recovery.foam.value,
  'recovery.foamDetail': recovery.foam.detail,
  'recovery.caveat': recovery.caveat
})) add(key, value);
source.hero.highlights.forEach((item, index) => Object.entries(item).forEach(([key, value]) => add(`hero.highlights.${index}.${key}`, value)));
source.training.records.forEach((item, index) => Object.entries(item).forEach(([key, value]) => add(`training.records.${index}.${key}`, value)));
source.bodyComposition.metrics.forEach((item, index) => Object.entries(item).forEach(([key, value]) => add(`body.metrics.${index}.${key}`, value)));
source.changes.items.forEach((item, index) => Object.entries(item).forEach(([key, value]) => add(`changes.items.${index}.${key}`, value)));
source.monthAhead.items.forEach((item, index) => Object.entries(item).forEach(([key, value]) => add(`ahead.items.${index}.${key}`, value)));

const expectedSections = ['monthly-navigation','monthly-hero','monthly-strategy','monthly-training','monthly-energy','monthly-recovery','monthly-body-composition','monthly-changes','monthly-month-ahead','monthly-provenance'];
const browser = await chromium.launch({ headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport:{width:1900,height:1000}, deviceScaleFactor:2 });
await page.goto(`file://${path.join(root, 'monthly-family.html')}`, { waitUntil:'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
await page.evaluate(() => document.fonts.ready);

async function inspect(theme) {
  return page.locator(`.phone[data-variant="monthly-${theme}"]`).evaluate((el, args) => {
    const actual = Object.fromEntries([...el.querySelectorAll('[data-semantic]')].map(node => [node.dataset.semantic, node.dataset.value ?? '']));
    const expected = Object.fromEntries(args.expected);
    const missing = Object.keys(expected).filter(key => !(key in actual));
    const mismatches = Object.keys(expected).filter(key => key in actual && expected[key] !== actual[key]).map(key => ({key,expected:expected[key],actual:actual[key]}));
    const extra = Object.keys(actual).filter(key => !(key in expected));
    const sections = [...el.querySelectorAll('[data-section]')].map(node => node.dataset.section);
    const rect = el.getBoundingClientRect();
    const geometry = [...el.querySelectorAll('[data-section]')].map(node => { const r=node.getBoundingClientRect(); return {section:node.dataset.section,x:Math.round(r.x-rect.x),y:Math.round(r.y-rect.y),width:Math.round(r.width),height:Math.round(r.height)}; });
    const energy = [...el.querySelectorAll('[data-chart="monthly-energy"] .week-group')].map(node => ({shown:node.dataset.shown,sourceKey:node.dataset.sourceKey,marks:[...node.querySelectorAll('[data-series]')].map(mark=>({series:mark.dataset.series,value:Number(mark.dataset.value)}))}));
    const recovery = el.querySelector('[data-section="monthly-recovery"]');
    const ring = getComputedStyle(el.querySelector('.ring')).backgroundImage;
    return {
      theme:args.theme,widthPoints:Math.round(rect.width),heightPoints:Math.round(rect.height),innerText:el.innerText,actual,missing,mismatches,extra,sections,geometry,energy,
      recovery:{fixtureOnly:recovery.dataset.fixtureOnly,confidenceCoupling:recovery.dataset.confidenceCoupling,points:[...recovery.querySelectorAll('.sleep-point')].map(node=>Number(node.dataset.value)),aria:recovery.querySelector('svg').getAttribute('aria-label')},
      confidenceCount:el.querySelectorAll('[data-semantic="monthly.hero.confidence.score"]').length,
      ring,
      conditionals:{goalMilestone:!el.innerText.includes('Goal Milestone'),definingMoments:!el.innerText.includes('Defining Moments'),uncertainty:!el.innerText.includes('Still Unresolved'),photos:!el.innerText.includes('Photos')},
      narrativeSizes:[...el.querySelectorAll('.meaning,.body-copy,.coach p,.insight p,.change-item p,.action p')].map(node=>Number.parseFloat(getComputedStyle(node).fontSize)),
      navigationTargets:[...el.querySelectorAll('.nav-chip')].map(node=>Math.round(node.getBoundingClientRect().height)),
      tokens:{bg:getComputedStyle(el).getPropertyValue('--bg').trim(),text:getComputedStyle(el).getPropertyValue('--text').trim(),secondary:getComputedStyle(el).getPropertyValue('--secondary').trim(),muted:getComputedStyle(el).getPropertyValue('--muted').trim(),purple:getComputedStyle(el).getPropertyValue('--purple').trim(),green:getComputedStyle(el).getPropertyValue('--green').trim(),blue:getComputedStyle(el).getPropertyValue('--blue').trim(),amber:getComputedStyle(el).getPropertyValue('--amber').trim(),cyan:getComputedStyle(el).getPropertyValue('--cyan').trim()}
    };
  }, { expected:[...expected], theme });
}

const renders = { dark:await inspect('dark'), light:await inspect('light') };
const expectedEnergy = source.energy.weeks.map((week,index)=>({shown:String(week.shown),sourceKey:`energy.weeks.${index}`,marks:week.shown?[{series:'Intake',value:week.intake},{series:'Estimated expenditure',value:week.expenditure}]:[]}));
for (const result of Object.values(renders)) {
  result.sectionOrderExact=JSON.stringify(result.sections)===JSON.stringify(expectedSections);
  result.energyExact=JSON.stringify(result.energy)===JSON.stringify(expectedEnergy);
  result.recoveryExact=JSON.stringify(result.recovery.points)===JSON.stringify(recovery.weeklyAverageMinutes)&&result.recovery.fixtureOnly==='true'&&result.recovery.confidenceCoupling==='none'&&result.recovery.aria.includes('Personal baseline 404 minutes')&&result.recovery.aria.includes('Status Yellow');
  result.accessibilityPass=result.navigationTargets.every(v=>v>=44)&&result.narrativeSizes.every(v=>v>=12)&&result.recovery.aria.length>80;
  result.pass=result.widthPoints===402&&result.missing.length===0&&result.mismatches.length===0&&result.extra.length===0&&result.sectionOrderExact&&result.energyExact&&result.recoveryExact&&result.confidenceCount===1&&Object.values(result.conditionals).every(Boolean)&&result.ring.includes('79%')&&result.accessibilityPass;
  if(!result.pass) throw new Error(`${result.theme} validation failed:\n${JSON.stringify(result,null,2)}`);
}
const normalizeGeometry=result=>result.geometry.map(({section,x,width,height})=>({section,x,width,height}));
const appearanceParity={
  contentExact:renders.dark.innerText===renders.light.innerText,
  semanticsExact:JSON.stringify(renders.dark.actual)===JSON.stringify(renders.light.actual),
  sectionOrderExact:JSON.stringify(renders.dark.sections)===JSON.stringify(renders.light.sections),
  geometryExact:JSON.stringify(normalizeGeometry(renders.dark))===JSON.stringify(normalizeGeometry(renders.light)),
  energyExact:JSON.stringify(renders.dark.energy)===JSON.stringify(renders.light.energy),
  recoveryExact:JSON.stringify(renders.dark.recovery)===JSON.stringify(renders.light.recovery),
  heightExact:renders.dark.heightPoints===renders.light.heightPoints,
  tokensDifferent:JSON.stringify(renders.dark.tokens)!==JSON.stringify(renders.light.tokens)
};
appearanceParity.pass=Object.values(appearanceParity).every(Boolean);
if(!appearanceParity.pass) throw new Error(`Appearance parity failed:\n${JSON.stringify(appearanceParity,null,2)}`);

function luminance(hex){const values=hex.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16)/255).map(value=>value<=.03928?value/12.92:((value+.055)/1.055)**2.4);return .2126*values[0]+.7152*values[1]+.0722*values[2]}
function contrast(a,b){let left=luminance(a),right=luminance(b);if(left<right)[left,right]=[right,left];return (left+.05)/(right+.05)}
const lightContrast={background:'#f1f1e9',ratios:{text:contrast('#102638','#f1f1e9'),secondary:contrast('#4e6470','#f1f1e9'),muted:contrast('#576b73','#f1f1e9'),purple:contrast('#684ac7','#f1f1e9'),green:contrast('#0b6b4d','#f1f1e9'),blue:contrast('#0e607a','#f1f1e9'),amber:contrast('#875400','#f1f1e9'),cyan:contrast('#0d6670','#f1f1e9')}};
lightContrast.pass=Object.values(lightContrast.ratios).every(value=>value>=4.5);
if(!lightContrast.pass) throw new Error(`Light contrast failed: ${JSON.stringify(lightContrast)}`);

const full={};
for(const theme of ['dark','light']){const file=path.join(screens,`monthly-${theme}-full.png`);await page.locator(`.phone[data-variant="monthly-${theme}"]`).screenshot({path:file});full[theme]=file}
async function board(items,name,title,width=603){const prepared=[];for(const item of items){const image=sharp(item.path),meta=await image.metadata(),height=Math.round(meta.height*(width/meta.width));prepared.push({...item,buffer:await image.resize({width}).png().toBuffer(),width,height})}const gap=28,top=88,labelH=50,boardWidth=prepared.length*width+(prepared.length-1)*gap,boardHeight=top+labelH+Math.max(...prepared.map(x=>x.height))+28;let x=0,labels=`<text x="18" y="42" fill="#f4f7f8" font-family="Arial,sans-serif" font-size="28" font-weight="700">${title}</text>`,composites=[];for(const item of prepared){labels+=`<text x="${x+12}" y="${top+30}" fill="#9aa8b8" font-family="Arial,sans-serif" font-size="18">${item.label}</text>`;composites.push({input:item.buffer,left:x,top:top+labelH});x+=width+gap}const svg=`<svg width="${boardWidth}" height="${boardHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#070b11"/>${labels}</svg>`;await sharp(Buffer.from(svg)).composite(composites).png().toFile(path.join(screens,name))}
await board([{label:'Monthly · dark',path:full.dark},{label:'Monthly · mineral light',path:full.light}],'monthly-dark-light.png','Monthly Briefing · locked-family translation');

async function focused(theme,selector,name){const file=path.join(screens,`${name}-${theme}.png`);await page.locator(`.phone[data-variant="monthly-${theme}"] ${selector}`).screenshot({path:file});return file}
async function range(theme,startSelector,endSelector,name){const phone=page.locator(`.phone[data-variant="monthly-${theme}"]`),start=phone.locator(startSelector),end=phone.locator(endSelector),[pb,sb,eb]=await Promise.all([phone.boundingBox(),start.boundingBox(),end.boundingBox()]),meta=await sharp(full[theme]).metadata(),scale=2,top=Math.max(0,Math.round((sb.y-pb.y)*scale)),bottom=Math.min(meta.height,Math.round((eb.y-pb.y+eb.height)*scale)),file=path.join(screens,`${name}-${theme}.png`);await sharp(full[theme]).extract({left:0,top,width:meta.width,height:bottom-top}).png().toFile(file);return file}
const focusPairs={
  hero:['[data-section="monthly-hero"]','[data-section="monthly-hero"]'],
  energy:['[data-section="monthly-energy"]','[data-section="monthly-energy"]'],
  training:['[data-section="monthly-training"]','[data-section="monthly-training"]'],
  recovery:['[data-section="monthly-recovery"]','[data-section="monthly-recovery"]'],
  changes:['[data-section="monthly-changes"]','[data-section="monthly-changes"]']
};
for(const [name,[selector]] of Object.entries(focusPairs)){for(const theme of ['dark','light'])await focused(theme,selector,`monthly-${name}`);await board([{label:`${name} · dark`,path:path.join(screens,`monthly-${name}-dark.png`)},{label:`${name} · mineral light`,path:path.join(screens,`monthly-${name}-light.png`)}],`monthly-${name}-dark-light.png`,`Monthly · ${name}`,603)}
for(const theme of ['dark','light']){
  await focused(theme,'[data-section="monthly-body-composition"]','monthly-weight-body-composition');
  await range(theme,'[data-section="monthly-strategy"]','[data-section="monthly-strategy"]','monthly-coach-take');
  await range(theme,'[data-section="monthly-month-ahead"]','[data-section="monthly-month-ahead"]','monthly-actions-close');
  await range(theme,'[data-section="monthly-month-ahead"]','[data-section="monthly-provenance"]','monthly-provenance-footer');
}
for(const name of ['weight-body-composition','coach-take','actions-close','provenance-footer']) await board([{label:`${name} · dark`,path:path.join(screens,`monthly-${name}-dark.png`)},{label:`${name} · mineral light`,path:path.join(screens,`monthly-${name}-light.png`)}],`monthly-${name}-dark-light.png`,`Monthly · ${name.replaceAll('-',' ')}`,603);

const priorDark=path.join(repo,'agent-handoffs/artifacts/weekly-midweek-light-translation-final-20261004/screens');
const priorLight=path.join(repo,'agent-handoffs/artifacts/briefing-light-log-density-final-polish-20261004/screens');
await board([{label:'Weekly · dark',path:path.join(priorDark,'weekly-dark-full.png')},{label:'Midweek · dark',path:path.join(priorDark,'midweek-dark-full.png')},{label:'Monthly · dark',path:full.dark}],'recurring-family-dark.png','Recurring Briefing family · dark',402);
await board([{label:'Weekly · mineral light',path:path.join(priorLight,'weekly-light-rich-fields-full.png')},{label:'Midweek · mineral light',path:path.join(priorLight,'midweek-light-rich-fields-full.png')},{label:'Monthly · mineral light',path:full.light}],'recurring-family-light.png','Recurring Briefing family · mineral light',402);

const validation={pass:true,authorities:{prompt:'acdd33664aafb6dc99503a2b415724b02cff223e',nativeBuild85:'b8ee8690b194cb90086b62816b9a2c8c400dc026',productionServer:'3c0f4aefddbb9a6886f6ad012443978303d47024',monthlySourceReport:'agent-handoffs/reports/20260928T110000Z-briefing-intelligence-september-mtd-monthly-review-preview.md',recoveryArchitecture:'4ade4f1d83badc192329289f85ba1b24f390f416'},target:{widthPoints:402,scale:2,safeAreaTopPoints:51},expectedSemanticCount:expected.size,requiredOrder:expectedSections,renders,appearanceParity,lightContrast,fixtureBoundary:{monthlyPublished:false,recoveryFixtureOnly:true,recoveryActivated:false,recoveryConfidenceCoupling:'none'},shippingChanges:false};
await fs.writeFile(path.join(root,'validation.json'),`${JSON.stringify(validation,null,2)}\n`);
await browser.close();
console.log(JSON.stringify({pass:true,semanticCount:expected.size,heights:{dark:renders.dark.heightPoints,light:renders.light.heightPoints},appearanceParity,lightContrast},null,2));
