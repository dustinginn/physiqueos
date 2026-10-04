import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const screens = path.join(root, 'screens');
await fs.mkdir(screens, { recursive: true });

const expected = [
  'watch-metrics-dark','watch-metrics-light','watch-daily-dark','watch-daily-light','watch-metric-comparison',
  'logger-weighted-dark','logger-weighted-light','logger-superset-dark','logger-superset-light','logger-done-comparison'
];
const browser = await chromium.launch({ headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport:{ width:1560,height:1050 }, deviceScaleFactor:1 });
await page.goto(`file://${path.join(root,'focused-corrections.html')}`,{waitUntil:'networkidle'});
await page.evaluate(()=>document.fonts.ready);
const audit = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('[data-render]')];
  return {
    ids: cards.map(n=>n.dataset.render),
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    escaped: cards.filter(n=>{const c=n.getBoundingClientRect(),s=n.querySelector('.review-stage').getBoundingClientRect();return c.top>s.top||c.bottom<s.bottom}).map(n=>n.dataset.render),
    doneTargets: [...document.querySelectorAll('.done-control')].map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})),
    icons: [...document.querySelectorAll('.metric-row')].map(n=>n.dataset.icon)
  };
});
const missing = expected.filter(id=>!audit.ids.includes(id));
const extra = audit.ids.filter(id=>!expected.includes(id));
const undersizedDoneTargets = audit.doneTargets.filter(x=>x.w<44||x.h<44);
const requiredIcons = ['timer','flame','sum','heart','stopwatch','nutrition'];
const missingIcons = requiredIcons.filter(icon=>!audit.icons.includes(icon));
const validation = {
  authority:{prompt:'2b780cd80c15e0c8d057d3c9f4b9f752dd39d1b2',package:'29d2fe1fcd343e4da077b020a120c1e2f14f37ea',native:'b8ee8690b194cb90086b62816b9a2c8c400dc026',build:85},
  expected:expected.length,actual:audit.ids.length,missing,extra,pageOverflow:audit.pageOverflow,escaped:audit.escaped,
  doneTargetCount:audit.doneTargets.length,undersizedDoneTargets,requiredIcons,missingIcons,
  liveActivityChanged:false,shippingCodeChanged:false,
  pass:missing.length===0&&extra.length===0&&!audit.pageOverflow&&audit.escaped.length===0&&undersizedDoneTargets.length===0&&missingIcons.length===0
};
if(!validation.pass)throw new Error(JSON.stringify(validation));
await page.screenshot({path:path.join(screens,'focused-review-board.png'),fullPage:true});
await page.close();

const detail=await browser.newPage({viewport:{width:1560,height:1050},deviceScaleFactor:3});
await detail.goto(`file://${path.join(root,'focused-corrections.html')}`,{waitUntil:'networkidle'});
await detail.evaluate(()=>document.fonts.ready);
await detail.addStyleTag({content:'.review-meta{display:none!important}.review-card{padding:0!important;border:0!important;background:transparent!important}.review-stage{min-height:0!important;padding:0!important;background:transparent!important}'});
for(const id of expected){
  await detail.evaluate(target=>{for(const n of document.querySelectorAll('[data-render]'))n.hidden=n.dataset.render!==target},id);
  const card=detail.locator(`[data-render="${id}"]`);
  let target=card.locator('.watch-shell,.phone').first();
  if(id.includes('comparison'))target=card.locator('.review-stage');
  await target.screenshot({path:path.join(screens,`${id}.png`)});
}
await detail.close();
await fs.writeFile(path.join(root,'validation.json'),JSON.stringify(validation,null,2)+'\n');
await browser.close();
console.log(JSON.stringify(validation,null,2));
