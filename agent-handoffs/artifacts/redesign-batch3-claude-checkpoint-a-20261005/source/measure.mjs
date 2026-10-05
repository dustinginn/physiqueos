import { createRequire } from 'node:module';
const require = createRequire('<node_modules>/playwright/package.json');
const { chromium } = require('playwright');
const root='<work>/locked/agent-handoffs/artifacts/dexa-photos-timeline-evidence-style-translation-20261004';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:620,height:940},deviceScaleFactor:3});
await page.goto(`file://${root}/evidence-board.html?theme=dark`,{waitUntil:'networkidle'});
await page.evaluate(()=>document.fonts.ready);
await page.addStyleTag({content:'.screen-meta{display:none!important}.screen-card{padding:0!important;border:0!important;background:transparent!important}.stage{padding:0!important;min-height:0!important;background:transparent!important}'});
const out=await page.evaluate(()=>{
 const res={};
 for(const id of ['H1','T1','S1']){
  for(const n of document.querySelectorAll('[data-screen]')) n.hidden=n.dataset.screen!==id;
  const phone=document.querySelector(`[data-screen="${id}"] .phone`); const pr=phone.getBoundingClientRect();
  const items=[];
  phone.querySelectorAll('*').forEach(el=>{const r=el.getBoundingClientRect(); if(!r.width)return; const cs=getComputedStyle(el);
   const own=[...el.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent.trim()).join('');
   items.push({cls:el.className,tag:el.tagName,text:own.slice(0,40),x:+(r.left-pr.left).toFixed(2),y:+(r.top-pr.top).toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2),fs:cs.fontSize,fw:cs.fontWeight,lh:cs.lineHeight,ls:cs.letterSpacing,color:cs.color,bg:cs.backgroundColor});});
  res[id]={phone:{w:pr.width,h:pr.height},items};
 }
 return res;});
console.log(JSON.stringify(out));
await browser.close();
