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
const priorityRoot=path.resolve(root,'../priority-detail-ui-style-translation-20261004');
await fs.mkdir(screens,{recursive:true});
const authority=JSON.parse(await fs.readFile(path.join(root,'OPERATING-PLAN-AUTHORITY.json'),'utf8'));
const surfaces=['root','energy','nutrition','training'];
const themes=['dark','light'];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1100,height:1700},deviceScaleFactor:2});
const files={},audits={};

for(const surface of surfaces){
  files[surface]={};audits[surface]={};
  for(const theme of themes){
    await page.goto(`file://${path.join(root,'operating-plan-harness.html')}?surface=${surface}&theme=${theme}`,{waitUntil:'networkidle'});
    const el=page.locator('.op-phone');
    const file=path.join(screens,`${surface}-${theme}.png`);
    await el.screenshot({path:file});
    const audit=await el.evaluate(node=>({
      width:Math.round(node.getBoundingClientRect().width),
      height:Math.round(node.getBoundingClientRect().height),
      text:node.innerText,
      domains:[...node.querySelectorAll('[data-domain]')].map(x=>x.dataset.domain),
      fields:[...node.querySelectorAll('[data-field]')].map(x=>x.dataset.field),
      actions:[...node.querySelectorAll('button')].map(x=>x.textContent.trim()),
      targets:[...node.querySelectorAll('.op-domain,.op-action,.back')].map(x=>Math.round(x.getBoundingClientRect().height))
    }));
    if(audit.width!==402)throw new Error(`${surface}/${theme}: expected 402pt width, got ${audit.width}`);
    if(audit.targets.some(x=>x<44))throw new Error(`${surface}/${theme}: target below 44pt ${audit.targets}`);
    files[surface][theme]=file;audits[surface][theme]=audit;
  }
  if(audits[surface].dark.text!==audits[surface].light.text)throw new Error(`${surface}: dark/light text mismatch`);
}

const norm=value=>String(value).replace(/\s+/g,' ').trim().toLowerCase();
const rootText=norm(audits.root.dark.text);
const requiredRoot=[authority.surfaces.root.eyebrow,authority.surfaces.root.title,authority.surfaces.root.purpose,...authority.surfaces.root.scopedDomains.flatMap(x=>[x.domain,x.title,x.detail,x.status]),...authority.surfaces.root.remainingDomainOrder];
const rootMissing=requiredRoot.filter(value=>!rootText.includes(norm(value)));
if(rootMissing.length)throw new Error(`root missing ${JSON.stringify(rootMissing)}`);
if(audits.root.dark.domains.join('|')!==['ENERGY STRATEGY','NUTRITION','TRAINING','RECOVERY','PEPTIDES','SUPPLEMENTS','TRACKING','COACHING UPDATES'].join('|'))throw new Error('root domain order mismatch');

const parity={root:{missing:rootMissing,domainOrder:audits.root.dark.domains}};
for(const surface of ['energy','nutrition','training']){
  const expected=authority.surfaces[surface];
  const text=norm(audits[surface].dark.text);
  const required=[expected.eyebrow,expected.title,expected.purpose,expected.goal,expected.started,expected.status,...expected.fields.flat(),expected.editAction].filter(Boolean);
  const missing=required.filter(value=>!text.includes(norm(value)));
  if(missing.length)throw new Error(`${surface} missing ${JSON.stringify(missing)}`);
  if(audits[surface].dark.fields.join('|')!==expected.fields.slice(surface==='training'?1:2).map(x=>x[0]).join('|'))throw new Error(`${surface} field order mismatch`);
  if(surface==='energy'&&text.includes('edit strategy'))throw new Error('energy invented edit action');
  if(surface==='energy'&&text.includes('phase history'))throw new Error('energy invented production phase history');
  parity[surface]={missing,fieldOrder:audits[surface].dark.fields,actions:audits[surface].dark.actions};
}

async function board(entries,name,title,width=370){
  const gap=22,top=78,parts=[];let x=18,maxH=0;
  for(const entry of entries){const meta=await sharp(entry.path).metadata();const h=Math.round(meta.height*(width/meta.width));maxH=Math.max(maxH,h);parts.push({input:await sharp(entry.path).resize({width}).png().toBuffer(),left:x,top});x+=width+gap}
  const W=x-gap+18,H=top+maxH+24;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#05090f"/><text x="18" y="32" fill="#f4f7f5" font-family="Arial" font-size="22" font-weight="700">${title}</text>`;
  let labelX=18;for(const entry of entries){svg+=`<text x="${labelX+4}" y="63" fill="#9aacb7" font-family="Arial" font-size="13">${entry.label}</text>`;labelX+=width+gap}svg+='</svg>';
  await sharp(Buffer.from(svg)).composite(parts).png().toFile(path.join(screens,name));
}
for(const surface of surfaces)await board([{label:'Dark',path:files[surface].dark},{label:'Mineral light',path:files[surface].light}],`${surface}-dark-light.png`,surface==='root'?'Operating Plan root':`${surface[0].toUpperCase()+surface.slice(1)} strategy detail`);

const rows=[
  {title:'Priority Detail · locked correction',dark:path.join(priorityRoot,'screens','peptide-dark.png'),light:path.join(priorityRoot,'screens','peptide-light.png')},
  {title:'Operating Plan root',dark:files.root.dark,light:files.root.light},
  {title:'Energy Strategy',dark:files.energy.dark,light:files.energy.light},
  {title:'Nutrition Strategy',dark:files.nutrition.dark,light:files.nutrition.light},
  {title:'Training Strategy',dark:files.training.dark,light:files.training.light}
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
  await sharp(bg).composite(parts).png().toFile(path.join(screens,'operating-plan-mobile-review.png'));
}
await mobileComposite();
await board([{label:'Dark',path:files.energy.dark},{label:'Mineral light',path:files.energy.light},{label:'Dark',path:files.nutrition.dark},{label:'Mineral light',path:files.nutrition.light},{label:'Dark',path:files.training.dark},{label:'Mineral light',path:files.training.light}],'operating-plan-family-board.png','Operating Plan strategy family',250);

const validation={pass:true,authority:authority.authority,screenCount:8,actualTarget:{width:402,minHeight:874},darkLightContentParity:true,rootDomainOrder:audits.root.dark.domains,parity,energyPhaseHistoryProjected:false,energyEditActionProjected:false,shippingChanges:false,primaryFounderReview:'screens/operating-plan-mobile-review.png',files};
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n');
await browser.close();
console.log(JSON.stringify({pass:true,screenCount:8,primary:validation.primaryFounderReview},null,2));
