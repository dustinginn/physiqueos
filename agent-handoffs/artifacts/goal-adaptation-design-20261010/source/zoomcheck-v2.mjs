import fs from 'node:fs'; import { createRequire } from 'node:module';
const { chromium } = createRequire((process.env.PLAYWRIGHT_NODE_MODULES ?? 'node_modules') + '/package.json')('playwright');
const html = fs.readFileSync(process.argv[2], 'utf8'); const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const out = {};
for (const [name, w, h, dsf] of [['browser-zoom-150', 960, 600, 3], ['browser-zoom-200', 720, 450, 4], ['text-135-phone', 390, 844, 2]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}${name.startsWith('text') ? 'html{font-size:135%}body{font-size:135%}' : ''}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  out[name] = await p.evaluate(() => ({ overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, clippedText: [...document.querySelectorAll('.lv,.lk,.notes p,.sub,.lead,.compare td')].filter((e) => e.scrollWidth > e.clientWidth + 1).length }));
  out[name].errors = errs;
  await p.screenshot({ path: `shots-v2/${name}.png` });
}
console.log(JSON.stringify(out)); await b.close();
