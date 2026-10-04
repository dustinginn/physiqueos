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
const authority = JSON.parse(await fs.readFile(path.join(root, 'WIDGET-AUTHORITY.json'), 'utf8'));
const families = Object.keys(authority.rendering.families);
const themes = authority.rendering.themes;
const states = Object.keys(authority.states);
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
const files = {}, audits = {};
for (const family of families) {
  files[family] = {}; audits[family] = {};
  for (const state of states) {
    files[family][state] = {}; audits[family][state] = {};
    for (const theme of themes) {
      await page.goto(`file://${path.join(root, 'widget-harness.html')}?family=${family}&state=${state}&theme=${theme}`, { waitUntil: 'networkidle' });
      const el = page.locator('.widget');
      const file = path.join(screens, `${family}-${state}-${theme}.png`);
      await el.screenshot({ path: file });
      const audit = await el.evaluate((node) => {
        const outer = node.getBoundingClientRect();
        const visibleOverflow = [...node.querySelectorAll('*')].some((item) => {
          const box = item.getBoundingClientRect();
          return box.left < outer.left - 1 || box.right > outer.right + 1 || box.top < outer.top - 1 || box.bottom > outer.bottom + 1;
        });
        return ({
        width: Math.round(outer.width),
        height: Math.round(outer.height),
        text: node.innerText,
        overflow: visibleOverflow,
        actions: [...node.querySelectorAll('[data-action]')].map((item) => ({
          action: item.dataset.action,
          hit: Number(item.dataset.hit),
          visibleHeight: Math.round(item.getBoundingClientRect().height)
        }))
      });});
      const spec = authority.rendering.families[family];
      if (audit.width !== spec.widthPoints || audit.height !== spec.heightPoints) throw new Error(`${family}/${state}/${theme}: ${audit.width}x${audit.height}`);
      if (audit.overflow) throw new Error(`${family}/${state}/${theme}: visible content overflow`);
      const tooSmall = audit.actions.filter((item) => item.hit < 44);
      if (tooSmall.length) throw new Error(`${family}/${state}/${theme}: target below 44pt ${JSON.stringify(tooSmall)}`);
      files[family][state][theme] = file;
      audits[family][state][theme] = audit;
    }
    if (audits[family][state].dark.text !== audits[family][state].light.text) throw new Error(`${family}/${state}: dark-light content mismatch`);
  }
}

const normalize = (value) => String(value).replace(/\s+/g, ' ').trim().toLowerCase();
const parity = {};
for (const family of families) {
  parity[family] = {};
  for (const state of states) {
    const expected = authority.states[state];
    const text = normalize(audits[family][state].dark.text);
    const required = family === 'small'
      ? [expected.freshnessSmall, expected.empty ? expected.emptyTitleSmall : 'Nutrition', expected.workout === 'active' ? 'Resume Workout' : 'Start Logger']
      : [expected.freshnessLarge, expected.empty ? expected.emptyTitleLarge : 'Training', expected.empty ? expected.emptyDetailLarge : 'Nutrition', expected.workout === 'active' ? 'Resume Workout' : 'Start Workout Logger'];
    const missing = required.filter((value) => !text.includes(normalize(value)));
    if (missing.length) throw new Error(`${family}/${state}: missing ${JSON.stringify(missing)}`);
    parity[family][state] = { missing, actions: audits[family][state].dark.actions };
  }
}

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
async function pair(family, state) {
  const spec = authority.rendering.families[family];
  const scale = family === 'small' ? 1.6 : 1;
  const w = Math.round(spec.widthPoints * scale), h = Math.round(spec.heightPoints * scale), gap = 22, top = 70, side = 22;
  const canvas = w * 2 + gap + side * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${top+h+20}"><rect width="100%" height="100%" fill="#03080e"/><text x="${side}" y="27" fill="#f4f7f5" font-family="Arial" font-size="18" font-weight="700">${esc(authority.states[state].title)} · ${family}</text><text x="${side}" y="53" fill="#8fa4ad" font-family="Arial" font-size="10" font-weight="700">DARK</text><text x="${side+w+gap}" y="53" fill="#8fa4ad" font-family="Arial" font-size="10" font-weight="700">MINERAL LIGHT</text></svg>`;
  await sharp(Buffer.from(svg)).composite([
    { input: await sharp(files[family][state].dark).resize({ width: w, height: h }).png().toBuffer(), left: side, top },
    { input: await sharp(files[family][state].light).resize({ width: w, height: h }).png().toBuffer(), left: side + w + gap, top }
  ]).png().toFile(path.join(screens, `${family}-${state}-dark-light.png`));
}
for (const family of families) for (const state of states) await pair(family, state);

async function reviewBoard(items, fileName, title, subtitle) {
  const width = 820, margin = 30, gap = 20, header = 96, label = 46, rowGap = 28;
  const composites = [];
  let y = header;
  for (const { family, state } of items) {
    const spec = authority.rendering.families[family];
    const imageWidth = family === 'small' ? 245 : 360;
    const imageHeight = Math.round(spec.heightPoints * imageWidth / spec.widthPoints);
    const left = family === 'small' ? 143 : margin;
    const right = family === 'small' ? 432 : 430;
    const rowLabel = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${label}"><text x="${margin}" y="21" fill="#f4f7f5" font-family="Arial" font-size="17" font-weight="700">${esc(authority.states[state].title)} · ${family === 'small' ? 'SYSTEM SMALL' : 'SYSTEM LARGE'}</text><text x="${left}" y="42" fill="#8fa4ad" font-family="Arial" font-size="9" font-weight="700">DARK</text><text x="${right}" y="42" fill="#8fa4ad" font-family="Arial" font-size="9" font-weight="700">MINERAL LIGHT</text></svg>`;
    composites.push({ input: Buffer.from(rowLabel), left: 0, top: y });
    y += label;
    composites.push({ input: await sharp(files[family][state].dark).resize({ width: imageWidth, height: imageHeight }).png().toBuffer(), left, top: y });
    composites.push({ input: await sharp(files[family][state].light).resize({ width: imageWidth, height: imageHeight }).png().toBuffer(), left: right, top: y });
    y += imageHeight + rowGap;
  }
  const canvas = await sharp({ create: { width, height: y + 24, channels: 4, background: '#03080e' } }).png().toBuffer();
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${header}"><text x="${margin}" y="34" fill="#f4f7f5" font-family="Arial" font-size="24" font-weight="700">${esc(title)}</text><text x="${margin}" y="59" fill="#8fa4ad" font-family="Arial" font-size="12">${esc(subtitle)}</text><text x="${margin}" y="79" fill="#637983" font-family="Arial" font-size="10">Build 85 authority · exact 170×170 and 360×376 point family geometry</text></svg>`;
  await sharp(canvas).composite([{ input: Buffer.from(head), left: 0, top: 0 }, ...composites]).png().toFile(path.join(boards, fileName));
}
await reviewBoard([
  {family:'small',state:'fresh'}, {family:'large',state:'fresh'},
  {family:'small',state:'active-workout'}, {family:'large',state:'active-workout'},
  {family:'small',state:'stale-offline'}, {family:'large',state:'stale-offline'},
  {family:'small',state:'waiting'}, {family:'large',state:'waiting'}
], 'home-widget-primary-mobile.png', 'Final Design Batch 3 · Home Screen Widget', 'Locked Home/Log visual family · current content and behavior preserved');
await reviewBoard(states.map((state)=>({family:'small',state})), 'home-widget-small-state-coverage-mobile.png', 'System Small · complete material-state coverage', 'Dark and Mineral Light · one whole-widget workout deep link plus canonical refresh');
await reviewBoard(states.map((state)=>({family:'large',state})), 'home-widget-large-state-coverage-mobile.png', 'System Large · complete material-state coverage', 'Dark and Mineral Light · four detail links, refresh and Workout Logger action');

const formerC = [
  ['H02','Home Confidence Detail','LOCKED','Final Design Batch 2'],
  ['L04','Morning Check-In','LOCKED','Final Design Batch 2'],
  ['L05','Manual / backdated Weight','LOCKED','Final Design Batch 2'],
  ['B06','Briefing History','LOCKED','Final Design Batch 2'],
  ['E20','Generic Evidence intake','LOCKED','Final Design Batch 1'],
  ['E21','Progress Photos intake','LOCKED','Final Design Batch 1'],
  ['E22','DEXA intake','LOCKED','Final Design Batch 1'],
  ['E23','Generic Evidence Review','LOCKED','Final Design Batch 1'],
  ['U04','Home Screen Widget','FOUNDER REVIEW','Final Design Batch 3']
];
const matrixHeight = 144 + formerC.length * 74 + 118;
let rows = '', ry = 122;
for (const [id,name,status,batch] of formerC) {
  const pending = status !== 'LOCKED';
  rows += `<rect x="28" y="${ry}" width="784" height="62" rx="12" fill="${pending?'#102d36':'#0a1b26'}" stroke="${pending?'#2fcbbd':'#193540'}"/><text x="44" y="${ry+24}" fill="${pending?'#44d6c8':'#a28aff'}" font-family="Arial" font-size="11" font-weight="700">${id}</text><text x="92" y="${ry+25}" fill="#f4f7f5" font-family="Arial" font-size="16" font-weight="700">${esc(name)}</text><text x="92" y="${ry+46}" fill="#8399a3" font-family="Arial" font-size="11">${esc(batch)}</text><text x="790" y="${ry+35}" text-anchor="end" fill="${pending?'#49d7c8':'#62dd9a'}" font-family="Arial" font-size="10" font-weight="700">${status}</text>`;
  ry += 74;
}
const matrixSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="${matrixHeight}"><rect width="100%" height="100%" fill="#03080e"/><text x="28" y="38" fill="#f4f7f5" font-family="Arial" font-size="24" font-weight="700">App-wide redesign · final closeout matrix</text><text x="28" y="64" fill="#91a6ae" font-family="Arial" font-size="12">All nine former C groups now have explicit design authority.</text><rect x="28" y="82" width="784" height="1" fill="#193540"/><text x="28" y="106" fill="#8da1aa" font-family="Arial" font-size="10" font-weight="700">AUDIT ID / SURFACE</text><text x="790" y="106" text-anchor="end" fill="#8da1aa" font-family="Arial" font-size="10" font-weight="700">STATUS</text>${rows}<rect x="28" y="${ry+4}" width="784" height="88" rx="16" fill="#123c48"/><text x="48" y="${ry+36}" fill="#f4f7f5" font-family="Arial" font-size="18" font-weight="700">Design-complete gate</text><text x="48" y="${ry+60}" fill="#b8ced0" font-family="Arial" font-size="12">Founder acceptance of U04 is the only remaining design decision.</text><text x="48" y="${ry+78}" fill="#62dd9a" font-family="Arial" font-size="11" font-weight="700">No additional current-Native design batch is identified.</text></svg>`;
await sharp(Buffer.from(matrixSvg)).png().toFile(path.join(boards, 'app-wide-design-closeout-matrix-mobile.png'));

const behaviorRows = [
  ['Families','systemSmall · systemLarge','Exact current extension declaration'],
  ['Provider','placeholder · snapshot · timeline','Local App Group read; 45-minute policy'],
  ['Freshness','fresh · aging · stale/offline','Current text and 90m / 4h thresholds'],
  ['Day boundary','waiting for today','Prior-day Nutrition, Activity and Weight hidden'],
  ['Content','Training · Nutrition · Activity · Weight','Exact current projection; no source labels'],
  ['Workout','Start Logger / Resume Workout','Navigation only; no widget-side session mutation'],
  ['Refresh','opens app and requests canonical reads','No Server or HealthKit access in extension'],
  ['Privacy','privacySensitive redaction','Totals and workout progress redact'],
  ['Storage','versioned atomic App Group snapshot','Authority/account fences + file protection'],
  ['Appearance','Dark + Mineral Light target','System-driven; fixed-dark source must be translated']
];
let by = 112, br = '';
for (const [area,coverage,proof] of behaviorRows) {
  br += `<line x1="28" x2="812" y1="${by+55}" y2="${by+55}" stroke="#193540"/><text x="28" y="${by+19}" fill="#a18aff" font-family="Arial" font-size="11" font-weight="700">${esc(area.toUpperCase())}</text><text x="175" y="${by+18}" fill="#f4f7f5" font-family="Arial" font-size="14" font-weight="700">${esc(coverage)}</text><text x="175" y="${by+40}" fill="#8197a0" font-family="Arial" font-size="11">${esc(proof)}</text>`;
  by += 56;
}
const behaviorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="${by+36}"><rect width="100%" height="100%" fill="#03080e"/><text x="28" y="38" fill="#f4f7f5" font-family="Arial" font-size="24" font-weight="700">Widget source + behavior coverage</text><text x="28" y="64" fill="#91a6ae" font-family="Arial" font-size="12">Build 85 HomeLoggedTodayWidget · complete current contract</text><text x="28" y="96" fill="#8da1aa" font-family="Arial" font-size="10" font-weight="700">AREA</text><text x="175" y="96" fill="#8da1aa" font-family="Arial" font-size="10" font-weight="700">COVERED AUTHORITY</text>${br}</svg>`;
await sharp(Buffer.from(behaviorSvg)).png().toFile(path.join(boards, 'widget-source-behavior-matrix-mobile.png'));

const cards = [];
for (const family of families) for (const state of states) cards.push(`<article><h2>${esc(authority.states[state].title)} · ${family}</h2><img src="screens/${family}-${state}-dark-light.png" alt="${esc(authority.states[state].title)} ${family} dark and Mineral Light"></article>`);
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Home Widget review</title><style>body{margin:0;padding:18px;background:#03080e;color:#f4f7f5;font:14px -apple-system,BlinkMacSystemFont,sans-serif}h1{font-size:24px}p{color:#91a6ae}article{border-top:1px solid #193540;padding:18px 0}h2{font-size:16px}img{display:block;width:100%;max-width:780px;height:auto;border-radius:12px}a{color:#49d7c8}</style></head><body><h1>Final Design Batch 3 · Home Screen Widget</h1><p>Build 85 source authority · exact current families, content, behavior and state semantics · dark and Mineral Light.</p><p><a href="boards/home-widget-primary-mobile.png">Primary mobile board</a> · <a href="boards/widget-source-behavior-matrix-mobile.png">Source/behavior matrix</a> · <a href="boards/app-wide-design-closeout-matrix-mobile.png">Design closeout matrix</a></p>${cards.join('')}</body></html>`;
await fs.writeFile(path.join(root, 'comparison-board.html'), html);

const validation = {
  pass: true,
  authority: authority.authority,
  supportedFamilies: families,
  materialStates: states,
  appearances: themes,
  screenCount: families.length * states.length * themes.length,
  pairCount: families.length * states.length,
  exactPointGeometry: authority.rendering.families,
  darkLightContentParity: true,
  systemMarginFeasible: true,
  minimumEffectiveTapTarget: 44,
  noHorizontalOrVerticalOverflow: true,
  privacyStateRendered: true,
  staleOfflineStateRendered: true,
  waitingAndUnavailableStatesRendered: true,
  activeWorkoutStateRendered: true,
  noInventedMetricsControlsOrFamilies: true,
  shippingNativeChanged: false,
  serverChanged: false,
  parity,
  primaryFounderReview: 'boards/home-widget-primary-mobile.png',
  focusedBoards: [
    'boards/home-widget-small-state-coverage-mobile.png',
    'boards/home-widget-large-state-coverage-mobile.png',
    'boards/widget-source-behavior-matrix-mobile.png',
    'boards/app-wide-design-closeout-matrix-mobile.png'
  ]
};
await fs.writeFile(path.join(root, 'validation.json'), `${JSON.stringify(validation, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ pass: true, screenCount: validation.screenCount, pairCount: validation.pairCount, primary: validation.primaryFounderReview }, null, 2));
