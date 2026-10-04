import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(import.meta.dirname, '..');
const screensDir = path.join(root, 'screens');
await fs.mkdir(screensDir,{recursive:true});
const families={hub:['H1'],dexa:['D1','D2','D3'],photos:['P1','P2','P3','P4'],timeline:['T1'],states:['S1']};
const expected=Object.values(families).flat();
const boardFile=path.join(root,'evidence-board.html');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const validation={authority:{prompt:'f5d72b2be4ad214a05ede419a1db55443e489fcd',nativeBuild85:'b8ee8690b194cb90086b62816b9a2c8c400dc026',serverBuild85:'3c0f4aefddbb9a6886f6ad012443978303d47024'},generatedAt:new Date().toISOString(),expected:{total:expected.length,...Object.fromEntries(Object.entries(families).map(([k,v])=>[k,v.length]))},boards:{},parity:{},semanticRules:{shippingSourceChanged:false,healthMetricsShown:false,comingSoonShown:false,dexaBriefingSubstituted:false,photoBriefingSubstituted:false,timelineFilterInvented:false,timelineNavigationInvented:false,founderMediaReboundToFixtureDates:false}};
const textByTheme={};
for(const theme of ['dark','light']){
 const suffix=theme==='light'?'-light':'';
 const page=await browser.newPage({viewport:{width:1500,height:1080},deviceScaleFactor:1});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`file://${boardFile}?theme=${theme}`,{waitUntil:'networkidle'}); await page.evaluate(()=>document.fonts.ready);
 const state=await page.evaluate(()=>({ids:[...document.querySelectorAll('[data-screen]')].map(n=>n.dataset.screen),width:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth,cards:[...document.querySelectorAll('[data-screen]')].map(n=>({id:n.dataset.screen,family:n.dataset.family,text:n.querySelector('.phone')?.innerText.replace(/\s+/g,' ').trim()||'',stageOverflow:n.querySelector('.stage').scrollWidth>n.querySelector('.stage').clientWidth+1,phoneOverflow:n.querySelector('.phone').scrollWidth>n.querySelector('.phone').clientWidth+1}))}));
 textByTheme[theme]=Object.fromEntries(state.cards.map(c=>[c.id,c.text]));
 const missing=expected.filter(x=>!state.ids.includes(x)); const extra=state.ids.filter(x=>!expected.includes(x)); const overflow=state.cards.filter(c=>c.stageOverflow||c.phoneOverflow).map(c=>c.id); const counts=Object.fromEntries(Object.keys(families).map(f=>[f,state.cards.filter(c=>c.family===f).length]));
 validation.boards[theme]={actualScreens:state.ids.length,familyCounts:counts,missing,extra,horizontalPageOverflow:state.width>state.viewport+1,cardOverflow:overflow,runtimeErrors:errors};
 validation.boards[theme].pass=!missing.length&&!extra.length&&!overflow.length&&!errors.length&&!validation.boards[theme].horizontalPageOverflow&&Object.entries(families).every(([f,v])=>counts[f]===v.length);
 if(!validation.boards[theme].pass) throw new Error(`${theme} board failed ${JSON.stringify(validation.boards[theme])}`);
 await page.screenshot({path:path.join(screensDir,`coverage-board${suffix}.png`),fullPage:true}); await page.close();
 const detail=await browser.newPage({viewport:{width:620,height:940},deviceScaleFactor:3});
 await detail.goto(`file://${boardFile}?theme=${theme}`,{waitUntil:'networkidle'}); await detail.evaluate(()=>document.fonts.ready);
 await detail.addStyleTag({content:'.screen-meta{display:none!important}.screen-card{padding:0!important;border:0!important;background:transparent!important}.stage{padding:0!important;min-height:0!important;background:transparent!important}'});
 for(const id of expected){await detail.evaluate(screenId=>{for(const n of document.querySelectorAll('[data-screen]'))n.hidden=n.dataset.screen!==screenId},id); await detail.locator(`[data-screen="${id}"] .phone`).screenshot({path:path.join(screensDir,`evidence-${id.toLowerCase()}${suffix}.png`)});}
 await detail.close();
}
validation.parity={checkedScreens:expected.length,textMismatches:expected.filter(id=>textByTheme.dark[id]!==textByTheme.light[id])}; validation.parity.pass=!validation.parity.textMismatches.length;
const all=Object.values(textByTheme.dark).join(' '); const h=textByTheme.dark.H1; const d=textByTheme.dark.D1+' '+textByTheme.dark.D2+' '+textByTheme.dark.D3; const p=textByTheme.dark.P1+' '+textByTheme.dark.P2+' '+textByTheme.dark.P3+' '+textByTheme.dark.P4; const t=textByTheme.dark.T1;
validation.contentAssertions={hubOrder:h.indexOf('Training')<h.indexOf('Nutrition')&&h.indexOf('Nutrition')<h.lastIndexOf('Timeline')&&h.lastIndexOf('Recovery')<h.lastIndexOf('Timeline'),timelineLast:h.trim().endsWith('›'),healthMetricsAbsent:!/Health Metrics/i.test(h),comingSoonAbsent:!/Coming Soon/i.test(all),dexaSummaryExact:['9.4%','16.9 lb','159.5 lb','179.4 lb','2,240 kcal/day'].every(x=>d.includes(x)),dexaInlineHistory:d.includes('Scan History')&&d.includes('Close')&&d.includes('no scan-detail destination'),dexaMetricsComplete:['VAT Mass','VAT Volume','Android Fat %','Gynoid Fat %','A/G Ratio','Bone Mineral Content','Total BMD','T-Score','Z-Score'].every(x=>d.includes(x)),photosHierarchy:['Latest Photo Set','Photo Briefing','Uploaded Photos','Comparison','Session details'].every(x=>p.includes(x)),photoMediaStates:['Retry photo','Photo unavailable','Lower-resolution preview'].every(x=>p.includes(x)),photoViewerCurrent:p.includes('1 of 2')&&p.includes('Pinch to zoom'),timelineBounded:t.includes('Showing 8 of 124'),timelineNoInventedControls:!/(Filter|Load More|Search Timeline)/i.test(t),historicalPhotoIssuesNotPresentedAsOpen:!/(being prepared|retry does not work)/i.test(all)};
if(!validation.parity.pass||Object.values(validation.contentAssertions).some(v=>v!==true)) throw new Error(`content/parity failed ${JSON.stringify(validation)}`);
const review=await browser.newPage({viewport:{width:1060,height:980},deviceScaleFactor:1}); await review.goto(`file://${path.join(root,'comparison-board.html')}`,{waitUntil:'networkidle'}); await review.evaluate(()=>document.fonts.ready); const reviewState=await review.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth,images:[...document.images].map(i=>({src:i.getAttribute('src'),complete:i.complete,width:i.naturalWidth,height:i.naturalHeight}))})); if(reviewState.width>reviewState.viewport+1||reviewState.images.some(i=>!i.complete||!i.width))throw new Error(`review failed ${JSON.stringify(reviewState)}`); await review.screenshot({path:path.join(screensDir,'primary-mobile-review-board.png'),fullPage:true}); await review.close();
const files=(await fs.readdir(screensDir)).filter(f=>f.endsWith('.png')).sort(); validation.renders=[]; for(const file of files){const bytes=await fs.readFile(path.join(screensDir,file)); const meta=await sharp(bytes).metadata(); validation.renders.push({file,width:meta.width,height:meta.height,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
validation.primaryComposite='screens/primary-mobile-review-board.png'; validation.pass=Object.values(validation.boards).every(x=>x.pass)&&validation.parity.pass&&Object.values(validation.semanticRules).every(v=>v===false)&&Object.values(validation.contentAssertions).every(v=>v===true);
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n'); await browser.close(); console.log(JSON.stringify({pass:validation.pass,boards:validation.boards,parity:validation.parity,renderCount:validation.renders.length,primaryComposite:validation.primaryComposite,contentAssertions:validation.contentAssertions},null,2));
