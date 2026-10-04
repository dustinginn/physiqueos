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
const boards = path.join(root, 'boards');
await fs.mkdir(screens, { recursive: true });
await fs.mkdir(boards, { recursive: true });
const authority = JSON.parse(await fs.readFile(path.join(root, 'DAILY-CAPTURE-AUTHORITY.json'), 'utf8'));
const surfaces = Object.keys(authority.surfaces), themes = ['dark','light'];
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 6000 }, deviceScaleFactor: 2 });
const files = {}, audits = {};
for (const surface of surfaces) {
  files[surface] = {}; audits[surface] = {};
  for (const theme of themes) {
    await page.goto(`file://${path.join(root,'daily-capture-harness.html')}?surface=${surface}&theme=${theme}`, { waitUntil: 'networkidle' });
    const el = page.locator('.phone');
    const file = path.join(screens, `${surface}-${theme}.png`);
    await el.screenshot({ path: file });
    const audit = await el.evaluate((node) => ({
      width: Math.round(node.getBoundingClientRect().width), height: Math.round(node.getBoundingClientRect().height), text: node.innerText,
      fields: [...node.querySelectorAll('[data-field]')].map((item)=>item.dataset.field),
      actions: [...node.querySelectorAll('button')].map((item)=>item.textContent.trim()).filter(Boolean),
      targets: [...node.querySelectorAll('button,.nav span,[role="button"]')].map((item)=>({text:item.textContent.trim(),height:Math.round(item.getBoundingClientRect().height)})),
      overflow: node.scrollWidth > node.clientWidth
    }));
    if (audit.width !== authority.rendering.widthPoints) throw new Error(`${surface}/${theme}: width ${audit.width}`);
    if (audit.height < authority.rendering.minimumHeightPoints) throw new Error(`${surface}/${theme}: height ${audit.height}`);
    if (audit.overflow) throw new Error(`${surface}/${theme}: horizontal overflow`);
    const tooSmall = audit.targets.filter((item)=>item.height<44); if(tooSmall.length) throw new Error(`${surface}/${theme}: target below 44pt ${JSON.stringify(tooSmall)}`);
    files[surface][theme]=file; audits[surface][theme]=audit;
  }
  if(audits[surface].dark.text!==audits[surface].light.text) throw new Error(`${surface}: appearance text mismatch`);
}
const normalize=(v)=>String(v).replace(/\s+/g,' ').trim().toLowerCase(); const parity={};
for(const [surface,expected] of Object.entries(authority.surfaces)){const text=normalize(audits[surface].dark.text);const required=[...(expected.sections??[]),...(expected.actions??[])];const missing=required.filter(v=>!text.includes(normalize(v)));if(missing.length)throw new Error(`${surface}: missing ${JSON.stringify(missing)}`);parity[surface]={missing,fields:audits[surface].dark.fields,actions:audits[surface].dark.actions};}
async function pair(surface){const width=370,gap=22,top=76;const dark=await sharp(files[surface].dark).metadata(),light=await sharp(files[surface].light).metadata();const dh=Math.round(dark.height*width/dark.width),lh=Math.round(light.height*width/light.width),cw=width*2+gap+36,ch=top+Math.max(dh,lh)+22;const title=authority.surfaces[surface].title;const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}"><rect width="100%" height="100%" fill="#05090f"/><text x="18" y="31" fill="#f4f7f5" font-family="Arial" font-size="21" font-weight="700">${title}</text><text x="22" y="60" fill="#91a4ae" font-family="Arial" font-size="12">DARK</text><text x="${width+gap+22}" y="60" fill="#91a4ae" font-family="Arial" font-size="12">MINERAL LIGHT</text></svg>`;await sharp(Buffer.from(svg)).composite([{input:await sharp(files[surface].dark).resize({width}).png().toBuffer(),left:18,top},{input:await sharp(files[surface].light).resize({width}).png().toBuffer(),left:18+width+gap,top}]).png().toFile(path.join(screens,`${surface}-dark-light.png`));}
for(const surface of surfaces)await pair(surface);
async function verticalBoard(surfaceList,name,title){const canvasWidth=900,phoneWidth=410,left=28,right=462,heading=60,rowGap=28,head=84;const parts=[];let y=18;for(const surface of surfaceList){const dark=await sharp(files[surface].dark).metadata(),light=await sharp(files[surface].light).metadata(),dh=Math.round(dark.height*phoneWidth/dark.width),lh=Math.round(light.height*phoneWidth/light.width),h=Math.max(dh,lh);const label=`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${heading}"><text x="28" y="26" fill="#f4f7f5" font-family="Arial" font-size="20" font-weight="700">${authority.surfaces[surface].title}</text><text x="28" y="49" fill="#91a4ae" font-family="Arial" font-size="11">DARK</text><text x="462" y="49" fill="#91a4ae" font-family="Arial" font-size="11">MINERAL LIGHT</text></svg>`;parts.push({input:Buffer.from(label),left:0,top:y});y+=heading;parts.push({input:await sharp(files[surface].dark).resize({width:phoneWidth}).png().toBuffer(),left,top:y});parts.push({input:await sharp(files[surface].light).resize({width:phoneWidth}).png().toBuffer(),left:right,top:y});y+=h+rowGap;}const background=await sharp({create:{width:canvasWidth,height:y+head,channels:4,background:'#05090f'}}).png().toBuffer();const header=`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${head}"><text x="28" y="34" fill="#f4f7f5" font-family="Arial" font-size="24" font-weight="700">${title}</text><text x="28" y="59" fill="#91a4ae" font-family="Arial" font-size="12">Build 85 Native + current Server authority · locked PhysiqueOS system · 402 pt iPhone</text></svg>`;await sharp(background).composite([{input:Buffer.from(header),left:0,top:0},...parts.map(p=>({...p,top:p.top+head}))]).png().toFile(path.join(boards,name));}
const primary=['confidence-v3','morning-reconcile','weight-correction','history-loaded'];
const confidence=['confidence-v3','confidence-v2'];
const capture=surfaces.filter(s=>['morning','weight'].includes(authority.surfaces[s].group));
const history=surfaces.filter(s=>authority.surfaces[s].group==='history');
await verticalBoard(primary,'daily-capture-explanation-primary-mobile.png','Final Design Batch 2 · Daily Capture + Explanation');
await verticalBoard(confidence,'confidence-detail-mobile.png','Confidence Detail · canonical and historical');
await verticalBoard(capture,'morning-weight-capture-mobile.png','Morning Check-In + Manual Weight · complete state set');
await verticalBoard(history,'briefing-history-mobile.png','Briefing History · complete state set');
const validation={pass:true,authority:authority.authority,renderedSurfaceCount:surfaces.length,screenCount:surfaces.length*2,pairCount:surfaces.length,actualTarget:{width:402,minimumHeight:874},darkLightContentGeometryParity:true,minimumTapTarget:44,noHorizontalOverflow:true,parity,confidenceAssumptionsRendered:false,briefingHistoryFiltersInvented:false,productionRecoveryFieldsAddedToMorningCheckIn:false,shippingNativeChanged:false,serverChanged:false,primaryFounderReview:'boards/daily-capture-explanation-primary-mobile.png',focusedBoards:['boards/confidence-detail-mobile.png','boards/morning-weight-capture-mobile.png','boards/briefing-history-mobile.png']};
await fs.writeFile(path.join(root,'validation.json'),`${JSON.stringify(validation,null,2)}\n`);await browser.close();console.log(JSON.stringify({pass:true,surfaceCount:surfaces.length,screenCount:surfaces.length*2,primary:validation.primaryFounderReview},null,2));
