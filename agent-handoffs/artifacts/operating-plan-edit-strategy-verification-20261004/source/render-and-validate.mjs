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
const acceptedRoot=path.resolve(root,'../operating-plan-ui-style-translation-20261004');
await fs.mkdir(screens,{recursive:true});
const authority=JSON.parse(await fs.readFile(path.join(root,'EDIT-FLOW-AUTHORITY.json'),'utf8'));
const surfaces=['nutrition','training','training-error'];
const themes=['dark','light'];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1100,height:1900},deviceScaleFactor:2});
const files={},audits={};

for(const surface of surfaces){
  files[surface]={};audits[surface]={};
  for(const theme of themes){
    await page.goto(`file://${path.join(root,'edit-strategy-harness.html')}?surface=${surface}&theme=${theme}`,{waitUntil:'networkidle'});
    const el=page.locator('.op-edit-phone');
    const file=path.join(screens,`${surface}-${theme}.png`);
    await el.screenshot({path:file});
    const audit=await el.evaluate(node=>({
      width:Math.round(node.getBoundingClientRect().width),
      height:Math.round(node.getBoundingClientRect().height),
      text:node.innerText,
      sections:[...node.querySelectorAll('[data-section]')].map(x=>x.dataset.section),
      frequencies:[...node.querySelectorAll('[data-frequency]')].map(x=>[x.dataset.frequency,x.querySelector('.oe-count span')?.textContent.trim()]),
      selected:[...node.querySelectorAll('[aria-pressed="true"]')].map(x=>x.textContent.trim()),
      errors:[...node.querySelectorAll('[role="alert"]')].map(x=>x.textContent.trim()),
      targets:[...node.querySelectorAll('button,.oe-cancel')].map(x=>Math.round(x.getBoundingClientRect().height))
    }));
    if(audit.width!==402)throw new Error(`${surface}/${theme}: expected 402pt width, got ${audit.width}`);
    if(audit.targets.some(x=>x<44))throw new Error(`${surface}/${theme}: target below 44pt ${audit.targets}`);
    files[surface][theme]=file;audits[surface][theme]=audit;
  }
  if(audits[surface].dark.text!==audits[surface].light.text)throw new Error(`${surface}: dark/light text mismatch`);
}

const normalize=value=>String(value).replace(/\s+/g,' ').trim().toLowerCase();
function requireText(surface,values){const text=normalize(audits[surface].dark.text);const missing=values.filter(x=>!text.includes(normalize(x)));if(missing.length)throw new Error(`${surface} missing ${JSON.stringify(missing)}`);return missing}
requireText('nutrition',[authority.nutrition.eyebrow,authority.nutrition.title,authority.nutrition.subtitle,...authority.nutrition.sections,...Object.values(authority.nutrition.current).filter(x=>typeof x==='string'),...Object.values(authority.nutrition.options).flat(),authority.nutrition.saveAction,'Cancel']);
if(audits.nutrition.dark.sections.join('|')!==authority.nutrition.sections.join('|'))throw new Error('nutrition section order mismatch');
requireText('training',[authority.training.eyebrow,authority.training.title,authority.training.subtitle,...authority.training.sections,...authority.training.frequencies.flatMap(x=>[x[0],`${x[1]}x / week`]),...authority.training.priorities,...authority.training.progressionOptions,authority.training.saveAction,'Cancel']);
if(audits.training.dark.sections.join('|')!==authority.training.sections.join('|'))throw new Error('training section order mismatch');
if(audits.training.dark.frequencies.map(x=>x[0]).join('|')!==authority.training.frequencies.map(x=>x[0]).join('|'))throw new Error('training frequency order mismatch');
if(audits.training.dark.selected.join('|')!==['Back','Chest','Moderate'].join('|'))throw new Error(`training selection mismatch ${audits.training.dark.selected}`);
if(audits['training-error'].dark.errors.join('|')!==authority.training.error)throw new Error('error copy mismatch');

await page.goto(`file://${path.join(acceptedRoot,'operating-plan-harness.html')}?surface=energy&theme=dark`,{waitUntil:'networkidle'});
const acceptedEnergy=await page.locator('.op-phone').evaluate(node=>({text:node.innerText,buttons:[...node.querySelectorAll('button')].map(x=>x.textContent.trim())}));
if(acceptedEnergy.buttons.length!==0||normalize(acceptedEnergy.text).includes('edit strategy'))throw new Error('accepted Energy unexpectedly exposes an editor');

async function board(entries,name,title,width=370){
  const gap=22,top=78,parts=[];let x=18,maxH=0;
  for(const entry of entries){const meta=await sharp(entry.path).metadata();const h=Math.round(meta.height*(width/meta.width));maxH=Math.max(maxH,h);parts.push({input:await sharp(entry.path).resize({width}).png().toBuffer(),left:x,top});x+=width+gap}
  const W=x-gap+18,H=top+maxH+24;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#05090f"/><text x="18" y="32" fill="#f4f7f5" font-family="Arial" font-size="22" font-weight="700">${title}</text>`;
  let labelX=18;for(const entry of entries){svg+=`<text x="${labelX+4}" y="63" fill="#9aacb7" font-family="Arial" font-size="13">${entry.label}</text>`;labelX+=width+gap}svg+='</svg>';
  await sharp(Buffer.from(svg)).composite(parts).png().toFile(path.join(screens,name));
}

const energyDark=path.join(acceptedRoot,'screens','energy-dark.png');
const energyLight=path.join(acceptedRoot,'screens','energy-light.png');
await board([{label:'Dark · no Edit Strategy action',path:energyDark},{label:'Mineral light · no Edit Strategy action',path:energyLight}],'energy-no-editor-dark-light.png','Energy · production read-only proof');
await board([{label:'Dark',path:files.nutrition.dark},{label:'Mineral light',path:files.nutrition.light}],'nutrition-edit-dark-light.png','Nutrition · Edit Strategy');
await board([{label:'Dark',path:files.training.dark},{label:'Mineral light',path:files.training.light}],'training-edit-dark-light.png','Training · Edit Strategy');
await board([{label:'Dark',path:files['training-error'].dark},{label:'Mineral light',path:files['training-error'].light}],'training-validation-error-dark-light.png','Training · production save error');

const rows=[
  {title:'Energy · no production editor',dark:energyDark,light:energyLight},
  {title:'Nutrition · Edit Strategy',dark:files.nutrition.dark,light:files.nutrition.light},
  {title:'Training · Edit Strategy',dark:files.training.dark,light:files.training.light},
  {title:'Representative production error',dark:files['training-error'].dark,light:files['training-error'].light}
];
async function mobileComposite(){
  const W=900,phoneW=410,gap=24,x1=28,x2=x1+phoneW+gap,heading=58,rowGap=34,parts=[];let y=22;
  for(const row of rows){
    const md=await sharp(row.dark).metadata(),ml=await sharp(row.light).metadata();
    const hd=Math.round(md.height*(phoneW/md.width)),hl=Math.round(ml.height*(phoneW/ml.width)),h=Math.max(hd,hl);
    const titleSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${heading}"><text x="28" y="28" fill="#f4f7f5" font-family="Arial" font-size="21" font-weight="700">${row.title}</text><text x="28" y="49" fill="#91a4ae" font-family="Arial" font-size="12">Dark</text><text x="462" y="49" fill="#91a4ae" font-family="Arial" font-size="12">Mineral light</text></svg>`;
    parts.push({input:Buffer.from(titleSvg),left:0,top:y});y+=heading;
    parts.push({input:await sharp(row.dark).resize({width:phoneW}).png().toBuffer(),left:x1,top:y});
    parts.push({input:await sharp(row.light).resize({width:phoneW}).png().toBuffer(),left:x2,top:y});
    y+=h+rowGap;
  }
  const bg=await sharp({create:{width:W,height:y,channels:4,background:'#05090f'}}).png().toBuffer();
  await sharp(bg).composite(parts).png().toFile(path.join(screens,'operating-plan-edit-mobile-review.png'));
}
await mobileComposite();

const validation={pass:true,authority:authority.authority,screenCount:6,acceptedEnergyContextReused:true,actualTarget:{width:402,minHeight:874},darkLightContentParity:true,energy:{editable:false,editAction:null,buttons:acceptedEnergy.buttons},nutrition:{sections:audits.nutrition.dark.sections,selected:audits.nutrition.dark.selected},training:{sections:audits.training.dark.sections,frequencies:audits.training.dark.frequencies,selected:audits.training.dark.selected},representativeError:audits['training-error'].dark.errors,successState:'dismisses back to strategy detail; no separate success state',shippingChanges:false,primaryFounderReview:'screens/operating-plan-edit-mobile-review.png',files};
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n');
await browser.close();
console.log(JSON.stringify({pass:true,screenCount:6,energyEditor:false,primary:validation.primaryFounderReview},null,2));
