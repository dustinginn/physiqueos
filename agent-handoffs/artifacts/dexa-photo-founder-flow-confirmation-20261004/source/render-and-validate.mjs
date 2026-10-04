import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require=createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const sharp=require('sharp');
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const screens=path.join(root,'screens');
await fs.mkdir(screens,{recursive:true});
const dexa=JSON.parse(await fs.readFile(path.join(root,'DEXA-AUTHORITY.json'),'utf8'));
const photo=JSON.parse(await fs.readFile(path.join(root,'PHOTO-PRODUCTION-AUTHORITY.json'),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1200,height:1200},deviceScaleFactor:2});
const url=(surface,theme='dark')=>`file://${path.join(root,'confirmation.html')}?surface=${surface}&theme=${theme}`;

async function open(surface,theme='dark'){
  await page.goto(url(surface,theme),{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);return page.locator(surface==='before-after'?'.before-after':'.phone');
}
async function shot(surface,theme,name,selector=null){const rootEl=await open(surface,theme),el=selector?rootEl.locator(selector):rootEl,file=path.join(screens,name);await el.screenshot({path:file});return file}

const dexaResults={};
for(const theme of ['dark','light']){
  const units=await open('dexa-units',theme);const unitAudit=await units.evaluate(el=>({width:Math.round(el.getBoundingClientRect().width),text:el.innerText,tables:el.querySelectorAll('.unit-table').length,rows:el.querySelectorAll('.unit-table tbody tr').length}));
  const requiredUnits=[...dexa.dexa.progress.headline,...dexa.dexa.progress.regionalFat,...dexa.dexa.progress.regionalLean,...dexa.dexa.progress.supplemental].flatMap(x=>[x.previous,x.current,x.delta]);
  unitAudit.exactValues=requiredUnits.every(value=>unitAudit.text.includes(value));unitAudit.pass=unitAudit.width===402&&unitAudit.tables===4&&unitAudit.rows===17&&unitAudit.exactValues;
  if(!unitAudit.pass)throw new Error(`DEXA unit audit failed ${theme}: ${JSON.stringify(unitAudit,null,2)}`);
  const unitFile=path.join(screens,`dexa-corrected-units-${theme}.png`);await units.screenshot({path:unitFile});
  const phase=await open('dexa-phase',theme);const phaseAudit=await phase.evaluate(el=>({width:Math.round(el.getBoundingClientRect().width),text:el.innerText,metricCount:el.querySelectorAll('.phase-metric').length,sectionCount:el.querySelectorAll('[data-section="dexa-phase-breakdown"]').length}));
  const t=dexa.dexa.progress.timeline;const expectedPhase=[dexa.attribution.goalTitle,dexa.attribution.phaseName,'Aug 16','Aug 30','14 days','2',...t.metrics.flatMap(m=>[`${m.points[0].value}${m.unit==='%'?'%':` ${m.unit}`}`,`${m.points.at(-1).value}${m.unit==='%'?'%':` ${m.unit}`}`,m.delta]),t.summary];
  phaseAudit.exactValues=expectedPhase.every(value=>phaseAudit.text.includes(value));phaseAudit.pass=phaseAudit.width===402&&phaseAudit.metricCount===4&&phaseAudit.sectionCount===1&&phaseAudit.exactValues;
  if(!phaseAudit.pass)throw new Error(`DEXA phase audit failed ${theme}: ${JSON.stringify(phaseAudit,null,2)}`);
  const phaseFile=path.join(screens,`dexa-restored-phase-breakdown-${theme}.png`);await phase.screenshot({path:phaseFile});
  dexaResults[theme]={unitAudit,phaseAudit,unitFile,phaseFile};
}
await shot('before-after','dark','dexa-before-after-restoration.png');

const photoResults={};
for(const theme of ['dark','light']){
  const phone=await open('photo',theme);const full=path.join(screens,`photo-event-flow-${theme}-full.png`);await phone.screenshot({path:full});
  const audit=await phone.evaluate(el=>({
    width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height),
    sections:[...el.querySelectorAll('[data-section]')].map(n=>n.dataset.section),
    poseNames:[...el.querySelectorAll('.pose-name')].map(n=>n.textContent.trim()),
    poseDates:[...el.querySelectorAll('.pose-date')].map(n=>n.textContent.trim()),
    comparisons:[...el.querySelectorAll('.comparison')].map(n=>({pose:n.dataset.pose,text:n.innerText})),
    fillerCount:el.querySelectorAll('.filler').length,imageCount:el.querySelectorAll('img').length,text:el.innerText,sourceText:el.textContent
  }));
  const expectedSections=['photo-hero','photo-session','photo-visible-change','photo-meaning','photo-coach'];
  const exactPoseLabels=photo.activeViews.map(x=>x.label);
  const exactComparisonPoses=photo.cardContent.progress.comparisons.map(x=>x.poseId);
  const exactCopy=[photo.cardContent.hero.title,photo.cardContent.hero.body,photo.cardContent.snapshot.title,photo.cardContent.snapshot.conditions,photo.cardContent.progress.title,photo.cardContent.progress.body,...photo.cardContent.progress.comparisons.map(x=>x.headline),photo.cardContent.interpretation.title,...photo.cardContent.interpretation.paragraphs,photo.cardContent.coachInsight.body,photo.nextMilestone.label];
  audit.missingCopy=exactCopy.filter(x=>!audit.sourceText.includes(x));
  audit.pass=audit.width===402&&JSON.stringify(audit.sections)===JSON.stringify(expectedSections)&&JSON.stringify(audit.poseNames)===JSON.stringify(exactPoseLabels)&&audit.poseDates.every(x=>x==='Sep 19')&&JSON.stringify(audit.comparisons.map(x=>x.pose))===JSON.stringify(exactComparisonPoses)&&audit.comparisons.length===5&&audit.fillerCount===15&&audit.imageCount===0&&audit.missingCopy.length===0&&audit.text.includes(photo.completion)&&audit.text.includes(photo.supportingEvidence.weight);
  if(!audit.pass)throw new Error(`Photo flow audit failed ${theme}: ${JSON.stringify(audit,null,2)}`);
  const files={full};
  for(const [name,selector] of [['hero','[data-section="photo-hero"]'],['session','[data-section="photo-session"]'],['meaning','[data-section="photo-meaning"]'],['coach','[data-section="photo-coach"]']]){files[name]=path.join(screens,`photo-${name}-${theme}.png`);await phone.locator(selector).screenshot({path:files[name]})}
  const compSection=phone.locator('[data-section="photo-visible-change"]');const comps=compSection.locator('.comparison');
  async function range(start,end,name){const [pb,sb,eb]=await Promise.all([phone.boundingBox(),comps.nth(start).boundingBox(),comps.nth(end).boundingBox()]),meta=await sharp(full).metadata(),scale=2,top=Math.max(0,Math.round((sb.y-pb.y)*scale)-40),bottom=Math.min(meta.height,Math.round((eb.y-pb.y+eb.height)*scale)+20),file=path.join(screens,`${name}-${theme}.png`);await sharp(full).extract({left:0,top,width:meta.width,height:bottom-top}).png().toFile(file);return file}
  files.firstComparisons=await range(0,1,'photo-visible-change-first');files.remainingComparisons=await range(2,4,'photo-visible-change-remaining');
  photoResults[theme]={audit,files};
}
if(photoResults.dark.audit.text!==photoResults.light.audit.text)throw new Error('Photo dark/light content mismatch');

const viewerResults={};
for(const theme of ['dark','light']){
  viewerResults[theme]={};
  for(const [surface,name,expectedFillers] of [['single-viewer','single-photo-viewer',1],['pair-viewer','paired-comparison-viewer',2],['pair-zoom','paired-comparison-viewer-zoomed',2]]){
    const el=await open(surface,theme);const file=path.join(screens,`${name}-${theme}.png`);await el.screenshot({path:file});const audit=await el.evaluate(node=>({width:Math.round(node.getBoundingClientRect().width),fillers:node.querySelectorAll('.filler').length,text:node.innerText,zoomed:node.querySelectorAll('.large-pair.zoomed').length,closeHeight:Math.round(node.querySelector('.close').getBoundingClientRect().height)}));
    audit.pass=audit.width===402&&audit.fillers===expectedFillers&&audit.closeHeight>=44&&(surface==='single-viewer'?audit.text.includes('Front relaxed')&&audit.text.includes('Sep 19'):audit.text.includes('Previous · Aug 22')&&audit.text.includes('Current · Sep 19'))&&(surface==='pair-zoom'?audit.zoomed===1:audit.zoomed===0);
    if(!audit.pass)throw new Error(`${surface} ${theme} validation failed: ${JSON.stringify(audit,null,2)}`);viewerResults[theme][surface]={...audit,file};
  }
}

async function board(items,name,title,width=402){const prepared=[];for(const item of items){const meta=await sharp(item.path).metadata(),height=Math.round(meta.height*(width/meta.width));prepared.push({...item,height,buffer:await sharp(item.path).resize({width}).png().toBuffer()})}const gap=24,top=82,labelH=42,w=prepared.length*width+(prepared.length-1)*gap,h=top+labelH+Math.max(...prepared.map(x=>x.height))+26;let x=0,labels=`<text x="18" y="42" fill="#f4f7f8" font-family="Arial" font-size="26" font-weight="700">${title}</text>`,parts=[];for(const item of prepared){labels+=`<text x="${x+8}" y="${top+27}" fill="#9aa8b8" font-family="Arial" font-size="16">${item.label}</text>`;parts.push({input:item.buffer,left:x,top:top+labelH});x+=width+gap}const svg=`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#070b11"/>${labels}</svg>`;await sharp(Buffer.from(svg)).composite(parts).png().toFile(path.join(screens,name))}
await board([{label:'Units · dark',path:dexaResults.dark.unitFile},{label:'Units · mineral light',path:dexaResults.light.unitFile}],'dexa-units-dark-light.png','DEXA · field-specific units restored');
await board([{label:'Phase breakdown · dark',path:dexaResults.dark.phaseFile},{label:'Phase breakdown · mineral light',path:dexaResults.light.phaseFile}],'dexa-phase-breakdown-dark-light.png','DEXA · full production phase breakdown');
await board([{label:'Photo flow · dark',path:photoResults.dark.files.full},{label:'Photo flow · mineral light',path:photoResults.light.files.full}],'photo-flow-dark-light.png','Photo Event · production flow with filler pixels');
await board([{label:'Single viewer · dark',path:viewerResults.dark['single-viewer'].file},{label:'Paired · dark',path:viewerResults.dark['pair-viewer'].file},{label:'Synchronized zoom · dark',path:viewerResults.dark['pair-zoom'].file}],'photo-interaction-states-dark.png','Photo expansion states · dark',300);
await board([{label:'Single viewer · mineral',path:viewerResults.light['single-viewer'].file},{label:'Paired · mineral',path:viewerResults.light['pair-viewer'].file},{label:'Synchronized zoom · mineral',path:viewerResults.light['pair-zoom'].file}],'photo-interaction-states-light.png','Photo expansion states · mineral light',300);
await board([{label:'Hero',path:photoResults.dark.files.hero},{label:'This Photo Session',path:photoResults.dark.files.session},{label:'What Complete Evidence Means',path:photoResults.dark.files.meaning},{label:"Coach's Insight",path:photoResults.dark.files.coach}],'photo-flow-map-dark.png','Photo Event flow landmarks',300);

const validation={pass:true,authorities:{prompt:'e5f303aff07e830be25f7a397e21f84ce6257fba',nativeBuild85:'b8ee8690b194cb90086f6f62816b9a2c8c400dc026',productionServer:'3c0f4aefddbb9a6886f6ad012443978303d47024',photoFixture:'src/fixtures/briefingFamilyV3/photoEventArtifact.json'},dexa:dexaResults,photo:photoResults,viewers:viewerResults,intentionalSubstitution:{fillerPixelsOnly:true,canonicalContentSubstitutions:0,founderMediaIncluded:false},shippingChanges:false};
await fs.writeFile(path.join(root,'validation.json'),`${JSON.stringify(validation,null,2)}\n`);
await browser.close();console.log(JSON.stringify({pass:true,dexa:{unitRows:dexaResults.dark.unitAudit.rows,phaseMetrics:dexaResults.dark.phaseAudit.metricCount},photo:{poses:photoResults.dark.audit.poseNames.length,comparisons:photoResults.dark.audit.comparisons.length,height:photoResults.dark.audit.height},viewers:{single:true,paired:true,synchronizedZoom:true}},null,2));
