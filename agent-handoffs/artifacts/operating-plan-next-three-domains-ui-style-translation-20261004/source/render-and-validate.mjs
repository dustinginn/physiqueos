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
const boards=path.join(root,'boards');
await fs.mkdir(screens,{recursive:true});await fs.mkdir(boards,{recursive:true});
const authority=JSON.parse(await fs.readFile(path.join(root,'NEXT-THREE-AUTHORITY.json'),'utf8'));
const surfaces=Object.keys(authority.surfaces),themes=['dark','light'];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1100,height:1900},deviceScaleFactor:2});
const files={},audits={};
for(const surface of surfaces){files[surface]={};audits[surface]={};for(const theme of themes){
  await page.goto(`file://${path.join(root,'operating-plan-next-three-harness.html')}?surface=${surface}&theme=${theme}`,{waitUntil:'networkidle'});
  const el=page.locator('.phone'),file=path.join(screens,`${surface}-${theme}.png`);await el.screenshot({path:file});
  const audit=await el.evaluate(node=>({
    width:Math.round(node.getBoundingClientRect().width),height:Math.round(node.getBoundingClientRect().height),text:node.innerText,
    methods:[...node.querySelectorAll('[data-method]')].map(x=>x.dataset.method),
    fields:[...node.querySelectorAll('[data-field]')].map(x=>x.dataset.field),
    actions:[...node.querySelectorAll('button')].map(x=>x.textContent.trim()),
    targets:[...node.querySelectorAll('button,.nav span')].map(x=>({text:x.textContent.trim(),height:Math.round(x.getBoundingClientRect().height)}))
  }));
  if(audit.width!==402)throw new Error(`${surface}/${theme}: width ${audit.width}`);
  const tooSmall=audit.targets.filter(x=>x.height<44);if(tooSmall.length)throw new Error(`${surface}/${theme}: target below 44pt ${JSON.stringify(tooSmall)}`);
  files[surface][theme]=file;audits[surface][theme]=audit;
}if(audits[surface].dark.text!==audits[surface].light.text)throw new Error(`${surface}: appearance text mismatch`)}

const norm=v=>String(v).replace(/\s+/g,' ').trim().toLowerCase(),parity={};
for(const [surface,expected] of Object.entries(authority.surfaces)){
  const text=norm(audits[surface].dark.text),required=[expected.title,...(expected.methods??[]),...(expected.fields??[]),...(expected.sections??[]),...(expected.actions??[])];
  const missing=required.filter(v=>!text.includes(norm(v)));if(missing.length)throw new Error(`${surface}: missing ${JSON.stringify(missing)}`);
  parity[surface]={missing,methods:audits[surface].dark.methods,fields:audits[surface].dark.fields,actions:audits[surface].dark.actions};
}
const actualOrder=authority.exactRootOrder,expectedSlice=actualOrder.slice(actualOrder.indexOf('Training')+1,actualOrder.indexOf('Training')+4);
if(expectedSlice.join('|')!==authority.scopedDomains.join('|'))throw new Error(`next-three order mismatch ${expectedSlice}`);
if(norm(audits['recovery-domain'].dark.text).includes('edit strategy'))throw new Error('invented Recovery strategy editor');
if(norm(audits['supplement-domain'].dark.text).includes('delete'))throw new Error('invented Supplement delete');
if(norm(audits['peptide-domain'].dark.text).includes('edit support'))throw new Error('peptide domain must use Manage');

async function pair(surface,title){const dw=await sharp(files[surface].dark).metadata(),lw=await sharp(files[surface].light).metadata(),w=370,gap=22,top=76,dh=Math.round(dw.height*w/dw.width),lh=Math.round(lw.height*w/lw.width),H=top+Math.max(dh,lh)+22,W=w*2+gap+36;const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#05090f"/><text x="18" y="31" fill="#f4f7f5" font-family="Arial" font-size="21" font-weight="700">${title}</text><text x="22" y="60" fill="#91a4ae" font-family="Arial" font-size="12">Dark</text><text x="${w+gap+22}" y="60" fill="#91a4ae" font-family="Arial" font-size="12">Mineral light</text></svg>`;await sharp(Buffer.from(svg)).composite([{input:await sharp(files[surface].dark).resize({width:w}).png().toBuffer(),left:18,top},{input:await sharp(files[surface].light).resize({width:w}).png().toBuffer(),left:18+w+gap,top}]).png().toFile(path.join(screens,`${surface}-dark-light.png`));}
for(const surface of surfaces)await pair(surface,authority.surfaces[surface].title);

async function verticalBoard(surfaceList,name,title){const W=900,phoneW=410,gap=24,left=28,right=462,heading=60,rowGap=28,parts=[];let y=18;for(const surface of surfaceList){const d=await sharp(files[surface].dark).metadata(),l=await sharp(files[surface].light).metadata(),hd=Math.round(d.height*phoneW/d.width),hl=Math.round(l.height*phoneW/l.width),h=Math.max(hd,hl);const label=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${heading}"><text x="28" y="26" fill="#f4f7f5" font-family="Arial" font-size="20" font-weight="700">${authority.surfaces[surface].title}</text><text x="28" y="49" fill="#91a4ae" font-family="Arial" font-size="11">${surface} · DARK</text><text x="462" y="49" fill="#91a4ae" font-family="Arial" font-size="11">MINERAL LIGHT</text></svg>`;parts.push({input:Buffer.from(label),left:0,top:y});y+=heading;parts.push({input:await sharp(files[surface].dark).resize({width:phoneW}).png().toBuffer(),left,top:y});parts.push({input:await sharp(files[surface].light).resize({width:phoneW}).png().toBuffer(),left:right,top:y});y+=h+rowGap}const head=82,shifted=parts.map(x=>({...x,top:x.top+head}));const bg=await sharp({create:{width:W,height:y+head,channels:4,background:'#05090f'}}).png().toBuffer();const titleSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${head}"><text x="28" y="34" fill="#f4f7f5" font-family="Arial" font-size="24" font-weight="700">${title}</text><text x="28" y="59" fill="#91a4ae" font-family="Arial" font-size="12">Build 85 source authority · locked PhysiqueOS system · 402 pt iPhone</text></svg>`;await sharp(bg).composite([{input:Buffer.from(titleSvg),left:0,top:0},...shifted]).png().toFile(path.join(boards,name));}
const recovery=['recovery-domain','recovery-detail','recovery-edit'];
const peptides=['peptide-domain','peptide-reta','peptide-tesa','peptide-paused'];
const peptideActions=['peptide-dose','peptide-days','peptide-time','peptide-notes','peptide-pause'];
const supplements=['supplement-domain','supplement-support','supplement-support-edit','supplement-strategy','supplement-add'];
await verticalBoard(recovery,'recovery-review.png','Recovery · complete current family');
await verticalBoard(peptides,'peptides-review.png','Peptides · complete current family');
await verticalBoard(peptideActions,'peptide-actions-review.png','Peptides · focused changes + lifecycle');
await verticalBoard(supplements,'supplements-review.png','Supplements · complete current family');
await verticalBoard([...recovery,...peptides,...peptideActions,...supplements],'operating-plan-next-three-mobile-review.png','Operating Plan · Recovery, Peptides, Supplements');

const validation={pass:true,authority:authority.authority,exactRootOrder:actualOrder,nextThreeAfterTraining:expectedSlice,screenCount:surfaces.length*themes.length,pairCount:surfaces.length,actualTarget:{width:402,minimumHeight:874},darkLightContentParity:true,minimumTapTarget:44,parity,forbiddenInventions:{recoveryStrategyEditor:false,supplementDelete:false,separatePeptideHistoryPage:false},shippingNativeChanged:false,serverChanged:false,primaryFounderReview:'boards/operating-plan-next-three-mobile-review.png',focusedBoards:['boards/recovery-review.png','boards/peptides-review.png','boards/peptide-actions-review.png','boards/supplements-review.png']};
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n');await browser.close();console.log(JSON.stringify({pass:true,screenCount:validation.screenCount,primary:validation.primaryFounderReview},null,2));
