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
const authority=JSON.parse(await fs.readFile(path.join(root,'PRIORITY-AUTHORITY.json'),'utf8'));
const surfaces=['generic','morning','foam','peptide','paused','supplement','evidence','dexa','completed','error'];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1100,height:1600},deviceScaleFactor:2});
const files={},audits={};

for(const surface of surfaces){
  files[surface]={};audits[surface]={};
  for(const theme of ['dark','light']){
    await page.goto(`file://${path.join(root,'priority-detail-harness.html')}?surface=${surface}&theme=${theme}`,{waitUntil:'networkidle'});
    const el=page.locator('.phone');
    const file=path.join(screens,`${surface}-${theme}.png`);
    await el.screenshot({path:file});
    const audit=await el.evaluate(node=>({
      width:Math.round(node.getBoundingClientRect().width),
      height:Math.round(node.getBoundingClientRect().height),
      text:node.innerText,
      theme:node.dataset.theme,
      sections:[...node.querySelectorAll('[data-section]')].map(x=>x.dataset.section),
      action:[...node.querySelectorAll('.button')].map(x=>x.textContent.trim()),
      targets:[...node.querySelectorAll('.button,.secondary,.button-mini,.dose-value')].map(x=>Math.round(x.getBoundingClientRect().height))
    }));
    if(audit.width!==402)throw new Error(`${surface}/${theme}: expected 402pt width, got ${audit.width}`);
    if(audit.targets.some(x=>x<44))throw new Error(`${surface}/${theme}: target below 44pt ${audit.targets}`);
    files[surface][theme]=file;audits[surface][theme]=audit;
  }
  if(audits[surface].dark.text!==audits[surface].light.text)throw new Error(`${surface}: dark/light content mismatch`);
}

const normalize=x=>String(x).replace(/\s+/g,' ').trim();
const forbidden=['Related Goals','Appointment Completion'];
const parity={};
for(const surface of surfaces.filter(x=>x!=='error')){
  const expected=authority.screens[surface];
  const text=normalize(audits[surface].dark.text).toLowerCase();
  const required=[expected.title,expected.subtitle,expected.status,...expected.sections.flat(),expected.primary,expected.secondary,expected.dosePrompt,expected.doseCaption,expected.pausedCopy,expected.completedCopy].filter(Boolean);
  const missing=required.filter(x=>!text.includes(normalize(x).toLowerCase()));
  const presentForbidden=forbidden.filter(x=>text.includes(x.toLowerCase()));
  if(missing.length||presentForbidden.length)throw new Error(`${surface}: missing ${JSON.stringify(missing)} forbidden ${JSON.stringify(presentForbidden)}`);
  parity[surface]={missing,presentForbidden,sections:audits[surface].dark.sections,actions:audits[surface].dark.action};
}
if(!normalize(audits.error.dark.text).includes(normalize(authority.screens.error.message)))throw new Error('Error copy mismatch');

async function board(entries,name,title,width=300){
  const gap=22,top=80,parts=[];let x=0,maxH=0;
  for(const e of entries){const meta=await sharp(e.path).metadata();const h=Math.round(meta.height*(width/meta.width));maxH=Math.max(maxH,h);parts.push({input:await sharp(e.path).resize({width}).png().toBuffer(),left:x,top});x+=width+gap}
  const W=x-gap,H=top+maxH+24;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#05090f"/><text x="16" y="33" fill="#f4f7f5" font-family="Arial" font-size="23" font-weight="700">${title}</text>`;
  let lx=0;for(const e of entries){svg+=`<text x="${lx+5}" y="66" fill="#9aacb7" font-family="Arial" font-size="13">${e.label}</text>`;lx+=width+gap}svg+='</svg>';
  await sharp(Buffer.from(svg)).composite(parts).png().toFile(path.join(screens,name));
}
const pair=async(surface,name,title,width=360)=>board([{label:'Dark',path:files[surface].dark},{label:'Mineral light',path:files[surface].light}],name,title,width);
await pair('generic','generic-dark-light.png','Generic completion template');
await pair('morning','morning-weigh-in-dark-light.png','Morning Weigh-In');
await pair('foam','foam-rolling-dark-light.png','Foam Rolling');
await pair('peptide','tesamorelin-dose-aware-dark-light.png','Tesamorelin · dose-aware');
await pair('peptide','tesamorelin-preparation-consolidated-dark-light.png','Tesamorelin · one Preparation section');
await pair('paused','retatrutide-paused-dark-light.png','Retatrutide · paused');
await pair('supplement','fadogia-dark-light.png','Fadogia Agrestis · every other day');
await board([{label:'Progress Photos · dark',path:files.evidence.dark},{label:'Progress Photos · mineral',path:files.evidence.light},{label:'DEXA · dark',path:files.dexa.dark},{label:'DEXA · mineral',path:files.dexa.light}],'evidence-priorities.png','Evidence-driven priorities',260);
await board([{label:'Completed · dark',path:files.completed.dark},{label:'Completed · mineral',path:files.completed.light},{label:'Error · dark',path:files.error.dark},{label:'Error · mineral',path:files.error.light}],'terminal-states.png','Completed and error states',280);
await board([
  {label:'Morning',path:files.morning.dark},{label:'Foam',path:files.foam.dark},{label:'Peptide',path:files.peptide.dark},{label:'Supplement',path:files.supplement.dark},{label:'Evidence',path:files.evidence.dark},{label:'Completed',path:files.completed.dark}
],'priority-family-board-dark.png','Priority Detail family · dark',210);
await board([
  {label:'Morning',path:files.morning.light},{label:'Foam',path:files.foam.light},{label:'Peptide',path:files.peptide.light},{label:'Supplement',path:files.supplement.light},{label:'Evidence',path:files.evidence.light},{label:'Completed',path:files.completed.light}
],'priority-family-board-light.png','Priority Detail family · mineral light',210);

const validation={pass:true,authority:authority.authority,surfaces,screenCount:surfaces.length*2,actualTarget:{width:402,minHeight:874},darkLightContentParity:true,forbiddenSectionsAbsent:forbidden,templatesCovered:['generic ordinary','morning evidence','recovery support','dose-aware peptide','paused peptide','supplement','progress photos','DEXA appointment','completed','error'],parity,shippingChanges:false,files};
if(audits.peptide.dark.sections.filter(x=>x==='Preparation').length!==1)throw new Error('Tesamorelin must render exactly one Preparation section');
validation.tesamorelinPreparationSections=1;
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n');
await browser.close();
console.log(JSON.stringify({pass:true,screenCount:validation.screenCount,templates:validation.templatesCovered},null,2));
