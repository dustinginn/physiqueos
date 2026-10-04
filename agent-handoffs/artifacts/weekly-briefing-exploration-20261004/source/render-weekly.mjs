import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');

const root = path.resolve(import.meta.dirname, '..');
const boardPath = path.join(root, 'comparison-board.html');
const screens = path.join(root, 'screens');
const fixture = JSON.parse(await fs.readFile(path.join(root, 'WEEKLY-FIXTURE.json'), 'utf8'));
await fs.mkdir(screens, { recursive: true });

function flatten(value, prefix = '', out = {}) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}.${index}`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) flatten(item, prefix ? `${prefix}.${key}` : key, out);
  } else {
    out[prefix] = String(value);
  }
  return out;
}

const expected = flatten({
  briefing: fixture.briefing,
  confidence: fixture.confidence,
  domains: fixture.domains,
  recoveryFutureFixture: fixture.recoveryFutureFixture,
  provenance: fixture.provenance,
});

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 3 });
await page.goto(`file://${boardPath}`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: '.slide{display:block!important;position:static!important;height:auto!important}.stage{height:auto!important;overflow:visible!important}.artifact{padding:0!important}.board-head,.carousel-head,.board-foot,.appearance-label{display:none!important}.pair{margin:0!important}' });

const variants = ['editorial-dark', 'editorial-light', 'executive-dark', 'executive-light', 'coaching-dark', 'coaching-light'];
const validation = {
  authority: fixture.authority,
  target: { widthPoints: 402, scale: 3, safeAreaMode: 'iPhone Dynamic Island, 51 pt simulated top status region' },
  variants: {},
};

for (const variant of variants) {
  const phone = page.locator(`.phone[data-variant="${variant}"]`);
  await phone.scrollIntoViewIfNeeded();
  const result = await phone.evaluate((el, expectedMap) => {
    const actual = {};
    for (const node of el.querySelectorAll('[data-semantic]')) {
      const key = node.dataset.semantic;
      const value = node.dataset.value ?? '';
      if (actual[key] === undefined) actual[key] = value;
      else if (actual[key] !== value) actual[key] = `__CONFLICT__${actual[key]}__${value}`;
    }
    const missing = [];
    const mismatches = [];
    const extra = [];
    for (const [key, value] of Object.entries(expectedMap)) {
      if (!(key in actual)) missing.push(key);
      else if (actual[key] !== value) mismatches.push({ key, expected: value, actual: actual[key] });
    }
    for (const key of Object.keys(actual)) if (!(key in expectedMap)) extra.push(key);
    const rect = el.getBoundingClientRect();
    const bodySize = Number.parseFloat(getComputedStyle(el.querySelector('.body')).fontSize);
    const fixtureNotes = [...el.querySelectorAll('.fixture-note')].map(node => node.innerText);
    return {
      widthPoints: Math.round(rect.width),
      heightPoints: Math.round(rect.height),
      semanticFields: Object.keys(actual).length,
      expectedFields: Object.keys(expectedMap).length,
      missing,
      mismatches,
      extra,
      confidenceGeometry: [...el.querySelectorAll('[data-confidence-geometry]')].map(node => node.dataset.confidenceGeometry),
      recoveryFixtureBoundaryVisible: fixtureNotes.some(text => text.includes('not present in the current production Weekly projection') && text.includes('not production data') && text.includes('confidence coupling: none')),
      bodySize,
    };
  }, expected);
  result.pass = result.widthPoints === 402 && result.missing.length === 0 && result.mismatches.length === 0 && result.extra.length === 0 && result.confidenceGeometry.every(v => v === '79') && result.recoveryFixtureBoundaryVisible && result.bodySize >= 13;
  validation.variants[variant] = result;
  if (!result.pass) throw new Error(`${variant} validation failed: ${JSON.stringify(result, null, 2)}`);

  const fullPath = path.join(screens, `${variant}-full.png`);
  await phone.screenshot({ path: fullPath });
  const meta = await sharp(fullPath).metadata();
  const foldHeight = Math.min(meta.height, 874 * 3);
  await sharp(fullPath).extract({ left: 0, top: 0, width: meta.width, height: foldHeight }).png().toFile(path.join(screens, `${variant}-above-fold.png`));
  const footerHeight = Math.min(meta.height, 874 * 3);
  await sharp(fullPath).extract({ left: 0, top: meta.height - footerHeight, width: meta.width, height: footerHeight }).png().toFile(path.join(screens, `${variant}-footer.png`));
  const recoveryNode = phone.locator('.recovery').first();
  await recoveryNode.screenshot({ path: path.join(screens, `${variant}-recovery.png`) });
}

async function compositePair(name, darkVariant, lightVariant, title) {
  const darkPath = path.join(screens, `${darkVariant}-full.png`);
  const lightPath = path.join(screens, `${lightVariant}-full.png`);
  const [darkMeta, lightMeta] = await Promise.all([sharp(darkPath).metadata(), sharp(lightPath).metadata()]);
  const gap = 42;
  const top = 110;
  const width = darkMeta.width + lightMeta.width + gap;
  const height = top + Math.max(darkMeta.height, lightMeta.height) + 36;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#070b11"/><text x="18" y="38" fill="#F5FAFC" font-family="-apple-system,sans-serif" font-size="28" font-weight="700">${title}</text><text x="18" y="78" fill="#95A4B5" font-family="-apple-system,sans-serif" font-size="20">Dark</text><text x="${darkMeta.width + gap + 18}" y="78" fill="#95A4B5" font-family="-apple-system,sans-serif" font-size="20">Mineral light</text></svg>`;
  await sharp(Buffer.from(svg)).composite([
    { input: darkPath, left: 0, top },
    { input: lightPath, left: darkMeta.width + gap, top },
  ]).png().toFile(path.join(screens, name));
}

await compositePair('structured-editorial-pair.png', 'editorial-dark', 'editorial-light', 'Weekly 01 · Structured Editorial');
await compositePair('executive-brief-pair.png', 'executive-dark', 'executive-light', 'Weekly 02 · Executive Brief');
await compositePair('coaching-story-pair.png', 'coaching-dark', 'coaching-light', 'Weekly 03 · Coaching Story');

await fs.writeFile(path.join(root, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify(validation, null, 2));
