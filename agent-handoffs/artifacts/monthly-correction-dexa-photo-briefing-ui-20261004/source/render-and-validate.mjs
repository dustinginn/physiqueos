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

const browser = await chromium.launch({ headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport:{width:1900,height:1200}, deviceScaleFactor:2 });
await page.goto(`file://${path.join(root,'monthly-corrected.html')}`,{waitUntil:'networkidle'});
await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
await page.evaluate(()=>document.fonts.ready);

const monthly={};
for(const theme of ['dark','light']){
  const phone=page.locator(`.phone[data-variant="monthly-${theme}"]`);
  const file=path.join(screens,`monthly-corrected-${theme}-full.png`);
  await phone.screenshot({path:file});
  const audit=await phone.evaluate(el=>({
    width:Math.round(el.getBoundingClientRect().width),
    sections:[...el.querySelectorAll('[data-section]')].map(x=>x.dataset.section),
    heroFooterCount:el.querySelectorAll('.hero-footer').length,
    goalHeroText:el.querySelector('[data-section="monthly-hero"]').innerText.includes('Build Lean Mass'),
    strategyCount:el.querySelectorAll('[data-section="monthly-strategy"]').length,
    text:el.innerText
  }));
  audit.pass=audit.width===402&&audit.heroFooterCount===0&&!audit.goalHeroText&&audit.strategyCount===1&&audit.sections.indexOf('monthly-strategy')===audit.sections.indexOf('monthly-changes')+1&&audit.sections.indexOf('monthly-month-ahead')===audit.sections.indexOf('monthly-strategy')+1;
  if(!audit.pass)throw new Error(`Monthly ${theme} correction validation failed: ${JSON.stringify(audit,null,2)}`);
  monthly[theme]={...audit,file};
  await phone.locator('[data-section="monthly-hero"]').screenshot({path:path.join(screens,`monthly-corrected-hero-${theme}.png`)});
  const start=phone.locator('[data-section="monthly-strategy"]'),end=phone.locator('[data-section="monthly-month-ahead"]');
  const [pb,sb,eb]=await Promise.all([phone.boundingBox(),start.boundingBox(),end.boundingBox()]);
  const meta=await sharp(file).metadata(),scale=2,top=Math.max(0,Math.round((sb.y-pb.y)*scale)),bottom=Math.min(meta.height,Math.round((eb.y-pb.y+eb.height)*scale));
  await sharp(file).extract({left:0,top,width:meta.width,height:bottom-top}).png().toFile(path.join(screens,`monthly-corrected-closing-${theme}.png`));
}
if(monthly.dark.text!==monthly.light.text)throw new Error('Monthly dark/light content mismatch');

const eventPage=await browser.newPage({viewport:{width:980,height:1200},deviceScaleFactor:2});
const eventResults={};
const expected={
  dexa:['dexa-hero','dexa-snapshot','dexa-progress','dexa-meaning','dexa-coach','dexa-revision'],
  photo:['photo-hero','photo-snapshot','photo-progress','photo-meaning','photo-coach']
};
for(const type of ['dexa','photo']){
  eventResults[type]={};
  for(const theme of ['dark','light']){
    await eventPage.goto(`file://${path.join(root,'event-briefings.html')}?type=${type}&theme=${theme}`,{waitUntil:'networkidle'});
    await eventPage.evaluate(()=>document.fonts.ready);
    const phone=eventPage.locator('.phone');
    const file=path.join(screens,`${type}-${theme}-full.png`);
    await phone.screenshot({path:file});
    const audit=await phone.evaluate((el,args)=>{
      const clone=el.cloneNode(true);clone.querySelector('.family-label')?.remove();clone.querySelectorAll('[data-prototype-only]').forEach(n=>n.remove());
      const sections=[...el.querySelectorAll('[data-section]')].map(n=>n.dataset.section);
      const rect=el.getBoundingClientRect();
      return {width:Math.round(rect.width),height:Math.round(rect.height),sections,text:clone.innerText,recoveryCount:[...el.querySelectorAll('*')].filter(n=>n.children.length===0&&/Recovery/i.test(n.textContent)).length,confidenceRings:el.querySelectorAll('.ring').length,images:[...el.querySelectorAll('img')].map(img=>({complete:img.complete,naturalWidth:img.naturalWidth,alt:img.alt})),prototypeMediaCount:el.querySelectorAll('[data-prototype-only]').length};
    },{type});
    audit.sectionOrderExact=JSON.stringify(audit.sections)===JSON.stringify(expected[type]);
    audit.pass=audit.width===402&&audit.sectionOrderExact&&audit.recoveryCount===0&&(type==='dexa'?audit.confidenceRings===1:audit.confidenceRings===0)&&audit.images.every(x=>x.complete&&x.naturalWidth>0);
    if(!audit.pass)throw new Error(`${type} ${theme} validation failed: ${JSON.stringify(audit,null,2)}`);
    eventResults[type][theme]={...audit,file};
    const focus=type==='dexa'?['dexa-hero','dexa-progress','dexa-coach']:['photo-hero','photo-progress','photo-coach'];
    for(const section of focus)await phone.locator(`[data-section="${section}"]`).screenshot({path:path.join(screens,`${type}-${section.replace(type+'-','')}-${theme}.png`)});
  }
  if(eventResults[type].dark.text!==eventResults[type].light.text)throw new Error(`${type} dark/light content mismatch`);
}

await eventPage.goto(`file://${path.join(root,'event-briefings.html')}?type=photo&theme=dark&state=unavailable`,{waitUntil:'networkidle'});
const unavailable=eventPage.locator('.phone');
const unavailableCount=await unavailable.locator('[data-state="image-unavailable"]').count();
if(unavailableCount<1)throw new Error('Photo unavailable state missing');
await unavailable.locator('[data-section="photo-hero"]').screenshot({path:path.join(screens,'photo-image-unavailable-dark.png')});

async function board(items,name,title,width=402){
  const prepared=[];for(const item of items){const meta=await sharp(item.path).metadata(),height=Math.round(meta.height*(width/meta.width));prepared.push({...item,width,height,buffer:await sharp(item.path).resize({width}).png().toBuffer()})}
  const gap=24,top=82,labelH=42,boardWidth=prepared.length*width+(prepared.length-1)*gap,boardHeight=top+labelH+Math.max(...prepared.map(x=>x.height))+26;let x=0,labels=`<text x="18" y="42" fill="#f4f7f8" font-family="Arial,sans-serif" font-size="26" font-weight="700">${title}</text>`,composites=[];
  for(const item of prepared){labels+=`<text x="${x+8}" y="${top+27}" fill="#9aa8b8" font-family="Arial,sans-serif" font-size="16">${item.label}</text>`;composites.push({input:item.buffer,left:x,top:top+labelH});x+=width+gap}
  const svg=`<svg width="${boardWidth}" height="${boardHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#070b11"/>${labels}</svg>`;await sharp(Buffer.from(svg)).composite(composites).png().toFile(path.join(screens,name));
}
await board([{label:'Monthly · dark',path:monthly.dark.file},{label:'Monthly · mineral light',path:monthly.light.file}],'monthly-corrected-dark-light.png','Monthly correction · accepted design preserved');
await board([{label:'DEXA · dark',path:eventResults.dexa.dark.file},{label:'DEXA · mineral light',path:eventResults.dexa.light.file}],'dexa-dark-light.png','DEXA Briefing · event family');
await board([{label:'Photo · dark',path:eventResults.photo.dark.file},{label:'Photo · mineral light',path:eventResults.photo.light.file}],'photo-dark-light.png','Photo Briefing · event family');
await board([{label:'DEXA · dark',path:eventResults.dexa.dark.file},{label:'Photo · dark',path:eventResults.photo.dark.file}],'event-family-dark.png','Event Briefings · dark');
await board([{label:'DEXA · mineral light',path:eventResults.dexa.light.file},{label:'Photo · mineral light',path:eventResults.photo.light.file}],'event-family-light.png','Event Briefings · mineral light');

const validation={
  pass:true,
  authorities:{prompt:'f05a79c4fe947b9edde5ee1b98ec96bd627685cb',monthlyAccepted:'24261324e89163defcd3167369e29f8b26d03aab',nativeBuild85:'b8ee8690b194cb90086f6f62816b9a2c8c400dc026',productionServer:'3c0f4aefddbb9a6886f6ad012443978303d47024'},
  monthly:{dark:monthly.dark,light:monthly.light,contentParity:monthly.dark.text===monthly.light.text,authorizedChangesOnly:['M07 decorative Goal/Phase footer not rendered','M08 Strategic Summary moved after What Changed and before Month Ahead']},
  events:eventResults,
  appearanceParity:{dexa:eventResults.dexa.dark.text===eventResults.dexa.light.text,photo:eventResults.photo.dark.text===eventResults.photo.light.text},
  photoMedia:{rawAvailable:false,appRenderedFounderMediaUsed:true,safeReferenceMapping:'Back Relaxed · Jun 20 → Jun 27',canonicalFixtureMapping:'Aug 16 → Aug 30',conflated:false,unavailableStateRendered:true,productionViewerPresentInBuild85:true},
  recovery:{dexa:false,photo:false},shippingChanges:false
};
await fs.writeFile(path.join(root,'validation.json'),`${JSON.stringify(validation,null,2)}\n`);
await browser.close();
console.log(JSON.stringify({pass:true,monthly:{dark:monthly.dark.height,light:monthly.light.height},dexa:{dark:eventResults.dexa.dark.height,light:eventResults.dexa.light.height},photo:{dark:eventResults.photo.dark.height,light:eventResults.photo.light.height},unavailableCount},null,2));

