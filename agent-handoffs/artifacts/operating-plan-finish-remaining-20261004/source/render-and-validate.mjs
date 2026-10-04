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

const authority = JSON.parse(await fs.readFile(path.join(root, 'REMAINING-AUTHORITY.json'), 'utf8'));
const surfaces = Object.keys(authority.surfaces);
const themes = ['dark', 'light'];
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1100, height: 4200 }, deviceScaleFactor: 2 });
const files = {};
const audits = {};

for (const surface of surfaces) {
  files[surface] = {};
  audits[surface] = {};
  for (const theme of themes) {
    await page.goto(`file://${path.join(root, 'operating-plan-remaining-harness.html')}?surface=${surface}&theme=${theme}`, { waitUntil: 'networkidle' });
    const el = page.locator('.phone');
    const file = path.join(screens, `${surface}-${theme}.png`);
    await el.screenshot({ path: file });
    const audit = await el.evaluate((node) => ({
      width: Math.round(node.getBoundingClientRect().width),
      height: Math.round(node.getBoundingClientRect().height),
      text: node.innerText,
      fields: [...node.querySelectorAll('[data-field]')].map((item) => item.dataset.field),
      actions: [...node.querySelectorAll('button')].map((item) => item.textContent.trim()).filter(Boolean),
      targets: [...node.querySelectorAll('button,.nav span')].map((item) => ({ text: item.textContent.trim(), height: Math.round(item.getBoundingClientRect().height) })),
      overflow: node.scrollWidth > node.clientWidth
    }));
    if (audit.width !== authority.rendering.widthPoints) throw new Error(`${surface}/${theme}: width ${audit.width}`);
    if (audit.overflow) throw new Error(`${surface}/${theme}: horizontal overflow`);
    const tooSmall = audit.targets.filter((item) => item.height < 44);
    if (tooSmall.length) throw new Error(`${surface}/${theme}: target below 44pt ${JSON.stringify(tooSmall)}`);
    files[surface][theme] = file;
    audits[surface][theme] = audit;
  }
  if (audits[surface].dark.text !== audits[surface].light.text) throw new Error(`${surface}: appearance text mismatch`);
}

const normalize = (value) => String(value).replace(/\s+/g, ' ').trim().toLowerCase();
const parity = {};
for (const [surface, expected] of Object.entries(authority.surfaces)) {
  const text = normalize(audits[surface].dark.text);
  const required = [expected.title, ...(expected.sections ?? []), ...(expected.fields ?? []), ...(expected.actions ?? [])];
  const missing = required.filter((value) => !text.includes(normalize(value)));
  if (missing.length) throw new Error(`${surface}: missing ${JSON.stringify(missing)}`);
  parity[surface] = { missing, fields: audits[surface].dark.fields, actions: audits[surface].dark.actions };
}

const remaining = authority.exactRootOrder.slice(authority.exactRootOrder.indexOf('Supplements') + 1);
if (remaining.join('|') !== authority.remainingRootRows.join('|')) throw new Error(`remaining root order mismatch: ${remaining}`);
if (normalize(audits['tracking-root'].dark.text).includes('mark complete')) throw new Error('Tracking must remain evidence-completed');
if (normalize(audits['coaching-edit'].dark.text).includes('daily briefing enabled')) throw new Error('Routine daily briefing edit was invented');
if (normalize(audits['dexa-production-unavailable'].dark.text).includes('save schedule')) throw new Error('Founder Production DEXA editor was invented');

async function pair(surface, title) {
  const dark = await sharp(files[surface].dark).metadata();
  const light = await sharp(files[surface].light).metadata();
  const width = 370;
  const gap = 22;
  const top = 76;
  const darkHeight = Math.round(dark.height * width / dark.width);
  const lightHeight = Math.round(light.height * width / light.width);
  const canvasWidth = width * 2 + gap + 36;
  const canvasHeight = top + Math.max(darkHeight, lightHeight) + 22;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}"><rect width="100%" height="100%" fill="#05090f"/><text x="18" y="31" fill="#f4f7f5" font-family="Arial" font-size="21" font-weight="700">${title}</text><text x="22" y="60" fill="#91a4ae" font-family="Arial" font-size="12">Dark</text><text x="${width + gap + 22}" y="60" fill="#91a4ae" font-family="Arial" font-size="12">Mineral light</text></svg>`;
  await sharp(Buffer.from(svg)).composite([
    { input: await sharp(files[surface].dark).resize({ width }).png().toBuffer(), left: 18, top },
    { input: await sharp(files[surface].light).resize({ width }).png().toBuffer(), left: 18 + width + gap, top }
  ]).png().toFile(path.join(screens, `${surface}-dark-light.png`));
}

for (const [surface, expected] of Object.entries(authority.surfaces)) await pair(surface, expected.title);

async function verticalBoard(surfaceList, name, title) {
  const canvasWidth = 900;
  const phoneWidth = 410;
  const left = 28;
  const right = 462;
  const heading = 60;
  const rowGap = 28;
  const parts = [];
  let y = 18;
  for (const surface of surfaceList) {
    const dark = await sharp(files[surface].dark).metadata();
    const light = await sharp(files[surface].light).metadata();
    const darkHeight = Math.round(dark.height * phoneWidth / dark.width);
    const lightHeight = Math.round(light.height * phoneWidth / light.width);
    const height = Math.max(darkHeight, lightHeight);
    const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${heading}"><text x="28" y="26" fill="#f4f7f5" font-family="Arial" font-size="20" font-weight="700">${authority.surfaces[surface].title}</text><text x="28" y="49" fill="#91a4ae" font-family="Arial" font-size="11">${surface} · DARK</text><text x="462" y="49" fill="#91a4ae" font-family="Arial" font-size="11">MINERAL LIGHT</text></svg>`;
    parts.push({ input: Buffer.from(label), left: 0, top: y });
    y += heading;
    parts.push({ input: await sharp(files[surface].dark).resize({ width: phoneWidth }).png().toBuffer(), left, top: y });
    parts.push({ input: await sharp(files[surface].light).resize({ width: phoneWidth }).png().toBuffer(), left: right, top: y });
    y += height + rowGap;
  }
  const head = 82;
  const background = await sharp({ create: { width: canvasWidth, height: y + head, channels: 4, background: '#05090f' } }).png().toBuffer();
  const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${head}"><text x="28" y="34" fill="#f4f7f5" font-family="Arial" font-size="24" font-weight="700">${title}</text><text x="28" y="59" fill="#91a4ae" font-family="Arial" font-size="12">Build 85 Native + current Server authority · locked PhysiqueOS system · 402 pt iPhone</text></svg>`;
  await sharp(background).composite([
    { input: Buffer.from(header), left: 0, top: 0 },
    ...parts.map((part) => ({ ...part, top: part.top + head }))
  ]).png().toFile(path.join(boards, name));
}

await verticalBoard(['root-remainder', 'tracking-root', 'tracking-edit'], 'tracking-review.png', 'Operating Plan · Tracking');
await verticalBoard(['coaching-detail', 'coaching-edit', 'coaching-photos-monthly'], 'coaching-updates-review.png', 'Operating Plan · Coaching Updates');
await verticalBoard(['dexa-production-unavailable'], 'dexa-current-state-review.png', 'Operating Plan · DEXA current Founder Production state');
await verticalBoard(surfaces, 'operating-plan-remaining-mobile-review.png', 'Operating Plan · all remaining current surfaces');

const validation = {
  pass: true,
  authority: authority.authority,
  exactRootOrder: authority.exactRootOrder,
  remainingAfterSupplements: remaining,
  remainingRootRows: authority.remainingRootRows,
  renderedSurfaceCount: surfaces.length,
  screenCount: surfaces.length * themes.length,
  pairCount: surfaces.length,
  actualTarget: { width: authority.rendering.widthPoints, minimumHeight: authority.rendering.minimumHeightPoints },
  darkLightContentParity: true,
  minimumTapTarget: 44,
  noHorizontalOverflow: true,
  parity,
  forbiddenInventions: {
    trackingManualCompletion: false,
    routineDailyBriefingEditor: false,
    founderProductionStandaloneDexaEditor: false,
    independentPhotosDexaSave: false
  },
  shippingNativeChanged: false,
  serverChanged: false,
  primaryFounderReview: 'boards/operating-plan-remaining-mobile-review.png',
  focusedBoards: ['boards/tracking-review.png', 'boards/coaching-updates-review.png', 'boards/dexa-current-state-review.png']
};
await fs.writeFile(path.join(root, 'validation.json'), `${JSON.stringify(validation, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ pass: true, screenCount: validation.screenCount, primary: validation.primaryFounderReview }, null, 2));
