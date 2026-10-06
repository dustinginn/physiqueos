import { createRequire } from 'node:module';
const require = createRequire('<node_modules>/playwright/package.json');
const { chromium } = require('playwright');
const root='<work>/locked/agent-handoffs/artifacts/dexa-photos-timeline-evidence-style-translation-20261004';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
for (const theme of ['dark','light']) {
 const page=await browser.newPage({viewport:{width:620,height:940},deviceScaleFactor:3});
 await page.goto(`file://${root}/evidence-board.html?theme=${theme}`,{waitUntil:'networkidle'}); await page.evaluate(()=>document.fonts.ready);
 await page.addStyleTag({content:'.screen-meta{display:none!important}.screen-card{padding:0!important;border:0!important;background:transparent!important}.stage{padding:0!important;min-height:0!important;background:transparent!important}.screen-scrim,.pdf-sheet{display:none!important}'});
 await page.evaluate(()=>{for(const n of document.querySelectorAll('[data-screen]')) n.hidden=n.dataset.screen!=='S1'});
 await page.locator('[data-screen="S1"] .phone').screenshot({path:`<work>/ref-s1-states-${theme}.png`});
 const rects=await page.evaluate(()=>[...document.querySelectorAll('[data-screen="S1"] .state')].map(n=>{const r=n.getBoundingClientRect(),p=n.closest('.phone').getBoundingClientRect();return [r.top-p.top,r.height]}));
 console.log(theme, JSON.stringify(rects));
 await page.close();
}
await browser.close();
