import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('<node_modules>/playwright/package.json');
const { chromium } = require('playwright');
const A='<work>/lockedBC/agent-handoffs/artifacts/';
const boards={
 T:{file:A+'training-evidence-style-translation-20261004/training-evidence-board.html',ids:['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12','T13','T14','T15','T16']},
 NA:{file:A+'nutrition-activity-evidence-style-translation-20261004/evidence-board.html',ids:['N1','N2','N3','N4','N5','N6','N7','N8','A1','A2','A3','A4','A5','A6','A7']},
 W:{file:A+'energy-weight-recovery-evidence-style-translation-20261004/evidence-board.html',ids:['W1','W2']},
};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const out={};
for (const [k,b] of Object.entries(boards)) {
 const page=await browser.newPage({viewport:{width:820,height:1040},deviceScaleFactor:1});
 await page.goto('file://'+b.file+'?theme=dark',{waitUntil:'networkidle'}); await page.evaluate(()=>document.fonts.ready);
 await page.addStyleTag({content:'.phone{height:auto!important;min-height:0!important;transform:none!important}.scroll{height:auto!important;overflow:visible!important}'});
 for (const id of b.ids) {
  out[id]=await page.evaluate((id)=>{
   const phone=document.querySelector(`[data-screen="${id}"] .phone`); const pr=phone.getBoundingClientRect(); const pcs=getComputedStyle(phone);
   const items=[];
   phone.querySelectorAll('*').forEach(el=>{const r=el.getBoundingClientRect(); if(!r.width||!r.height)return; const cs=getComputedStyle(el);
     const own=[...el.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent.trim()).join(' ').trim();
     items.push({c:(typeof el.className==='string'?el.className:el.getAttribute('class'))||el.tagName.toLowerCase(),t:own.slice(0,44),x:+(r.left-pr.left).toFixed(1),y:+(r.top-pr.top).toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),fs:cs.fontSize,fw:cs.fontWeight,lh:cs.lineHeight,ls:cs.letterSpacing,col:cs.color,bg:cs.backgroundColor==='rgba(0, 0, 0, 0)'?'':cs.backgroundColor,br:cs.borderRadius==='0px'?'':cs.borderRadius,bd:cs.borderTopWidth!=='0px'?cs.borderTopWidth+' '+cs.borderTopColor:'',bl:cs.borderLeftWidth!=='0px'?cs.borderLeftWidth+' '+cs.borderLeftColor:'',ff:cs.fontFamily.split(',')[0]});});
   return {phone:{w:pr.width,h:pr.height,border:pcs.borderLeftWidth,ff:pcs.fontFamily},items};
  },id);
 }
 await page.close();
}
fs.writeFileSync('<work>/measureBC.json',JSON.stringify(out));
await browser.close();
console.log(Object.keys(out).map(k=>k+':'+out[k].items.length+':'+out[k].phone.w+'x'+out[k].phone.h+':'+out[k].phone.border+':'+out[k].phone.ff.split(',')[0]).join('\n'));
