import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');

const root = path.resolve(import.meta.dirname, '..');
const boardPath = path.join(root, 'comparison-board.html');
const screens = path.join(root, 'screens');
const homeFixture = JSON.parse(await fs.readFile(path.join(root, 'HOME-FIXTURE.json'), 'utf8'));
const logFixture = JSON.parse(await fs.readFile(path.join(root, 'LOG-FIXTURE.json'), 'utf8'));

await fs.mkdir(screens, { recursive: true });

function homeExpected(f) {
  const out = {
    'header.greeting': f.header.greeting,
    'header.name': f.header.name,
    'hero.sectionLabel': f.hero.sectionLabel,
    'hero.goalLabel': f.hero.goalLabel,
    'hero.headline': f.hero.headline,
    'hero.primaryTimeline': f.hero.primaryTimeline,
    'hero.supportLine': f.hero.supportLine,
    'hero.confidence': f.hero.confidence.spokenValue,
    'hero.targetLabel': f.hero.targetLabel,
    'hero.targetValue': f.hero.targetValue,
    'hero.remainingLabel': f.hero.remainingLabel,
    'hero.remainingValue': f.hero.remainingValue,
    'nextBestAction.title': f.nextBestAction.title,
    'briefing.sectionLabel': f.briefing.sectionLabel,
    'briefing.title': f.briefing.title,
    'briefing.date': f.briefing.date,
    'briefing.preview': f.briefing.preview,
    'goal.sectionLabel': f.goal.sectionLabel,
    'goal.title': f.goal.title,
    'goal.dateRange': f.goal.dateRange,
    'goal.progressLabel': f.goal.progressLabel,
    'goal.progressValue': f.goal.progressValue,
    'goal.destinationLabel': f.goal.destinationLabel,
    'goal.destinationValue': f.goal.destinationValue,
    'goal.guardrail.label': f.goal.guardrail.label,
    'goal.guardrail.title': f.goal.guardrail.title,
    'goal.guardrail.observation': f.goal.guardrail.observation,
    'priorities.sectionLabel': f.priorities.sectionLabel,
    'priorities.openCount': f.priorities.openCount,
  };
  f.goal.phases.forEach((p, i) => {
    for (const k of ['label', 'title', 'status', 'timing']) out[`goal.phases.${i}.${k}`] = p[k];
    if (p.progress) out[`goal.phases.${i}.progress`] = p.progress;
  });
  f.priorities.items.forEach((p, i) => {
    for (const k of ['title', 'detail', 'state']) out[`priorities.items.${i}.${k}`] = p[k];
  });
  f.navigation.forEach((v, i) => out[`navigation.${i}`] = v);
  return out;
}

function logExpected(f) {
  const out = {
    viewState: f.viewState,
    localDate: f.localDate,
    'header.eyebrow': f.header.eyebrow,
    'header.title': f.header.title,
    'header.subtitle': f.header.subtitle,
    'loggedToday.title': f.loggedToday.title,
    'pendingEvidenceReviews.sectionTitle': f.pendingEvidenceReviews.sectionTitle,
    'pendingEvidenceReviews.sectionSubtitle': f.pendingEvidenceReviews.sectionSubtitle,
    'processingEvidenceReviews.count': String(f.processingEvidenceReviews.length),
    'trainingLogger.title': f.trainingLogger.title,
    'trainingLogger.subtitle': f.trainingLogger.subtitle,
    'trainingLogger.destination': f.trainingLogger.destination,
    'weightAction.label': f.weightAction.label,
    'weightAction.destination': f.weightAction.destination,
    'upload.title': f.upload.title,
    'upload.subtitle': f.upload.subtitle,
    'upload.primaryAction': f.upload.primaryAction,
    'upload.secondaryAction': f.upload.secondaryAction,
    'upload.loadingLabel': f.upload.loadingLabel,
    'upload.continueDraftLabel': f.upload.continueDraftLabel,
    'upload.destination': f.upload.destination,
  };
  f.loggedToday.rows.forEach((r, i) => {
    for (const k of ['kind', 'label', 'systemImage', 'summary', 'processing', 'destination']) out[`loggedToday.rows.${i}.${k}`] = String(r[k]);
    out[`loggedToday.rows.${i}.context`] = r.context ?? '';
  });
  f.pendingEvidenceReviews.items.forEach((r, i) => {
    for (const k of ['id', 'title', 'date', 'summary', 'likelyDuplicate', 'actionLabel', 'destination']) out[`pendingEvidenceReviews.items.${i}.${k}`] = String(r[k]);
  });
  f.upload.sourceOptions.forEach((v, i) => out[`upload.sourceOptions.${i}`] = v);
  Object.entries(f.conditionalStates).forEach(([k, v]) => out[`conditionalStates.${k}`] = v);
  f.navigation.forEach((v, i) => out[`navigation.${i}`] = v);
  return out;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: 3 });
await page.goto(`file://${boardPath}`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: '.jump{display:none!important}.phone-wrap{position:static!important}' });

const variants = ['home-dark', 'home-light', 'baseline', 'direct-dark', 'direct-light', 'command-dark', 'command-light', 'editorial-dark', 'editorial-light'];
const expectedHome = homeExpected(homeFixture);
const expectedLog = logExpected(logFixture);
const validation = { authority: { prompt: '9d9a6b7d0b254c91aa8da93fd5f9ced3b17a9011', native: logFixture.authority.nativeSHA }, target: { points: [402, 874], scale: 3 }, variants: {} };

for (const variant of variants) {
  const locator = page.locator(`.phone[data-variant="${variant}"]`);
  await locator.scrollIntoViewIfNeeded();
  const result = await locator.evaluate((el, expected) => {
    const actual = {};
    for (const node of el.querySelectorAll('[data-semantic]')) {
      const k = node.dataset.semantic;
      const v = node.dataset.value ?? '';
      if (actual[k] === undefined) actual[k] = v;
      else if (actual[k] !== v) actual[k] = `__CONFLICT__${actual[k]}__${v}`;
    }
    const missing = [];
    const mismatches = [];
    const extra = [];
    for (const [k, v] of Object.entries(expected)) {
      if (!(k in actual)) missing.push(k);
      else if (String(v) !== actual[k]) mismatches.push({ key: k, expected: String(v), actual: actual[k] });
    }
    for (const k of Object.keys(actual)) if (!(k in expected)) extra.push(k);
    const rect = el.getBoundingClientRect();
    return {
      semanticFields: Object.keys(actual).length,
      expectedFields: Object.keys(expected).length,
      missing,
      mismatches,
      extra,
      widthPoints: Math.round(rect.width),
      heightPoints: Math.round(rect.height),
      targetPresentationLabel: el.querySelector('[data-semantic="hero.targetLabel"]')?.dataset.presentationLabel ?? null,
      confidenceGeometry: [...el.querySelectorAll('[data-confidence-geometry]')].map(n => n.dataset.confidenceGeometry),
      hiddenRedundantHomeLabels: ['hero.goalLabel', 'goal.title'].filter(k => el.querySelector(`[data-semantic="${k}"]`)?.hidden),
    };
  }, variant.startsWith('home-') ? expectedHome : expectedLog);
  result.pass = result.missing.length === 0 && result.mismatches.length === 0 && result.extra.length === 0;
  if (variant.startsWith('home-')) {
    result.pass &&= result.targetPresentationLabel === 'Target Date';
    result.pass &&= JSON.stringify(result.confidenceGeometry) === JSON.stringify(['79', '79']);
    result.pass &&= result.hiddenRedundantHomeLabels.length === 2;
  }
  validation.variants[variant] = result;
  if (!result.pass) throw new Error(`${variant} parity failed: ${JSON.stringify(result, null, 2)}`);

  const fullPath = path.join(screens, `${variant}-full.png`);
  await locator.screenshot({ path: fullPath });
  const metadata = await sharp(fullPath).metadata();
  const foldHeight = Math.min(2622, metadata.height);
  await sharp(fullPath).extract({ left: 0, top: 0, width: metadata.width, height: foldHeight }).png().toFile(path.join(screens, `${variant}-above-fold.png`));
}

const baselineHeight = validation.variants.baseline.heightPoints;
validation.verticalImpact = {};
for (const variant of variants) {
  const height = validation.variants[variant].heightPoints;
  validation.verticalImpact[variant] = variant.startsWith('home-')
    ? { fullHeightPoints: height, relation: 'selected Home reference; no Log baseline comparison' }
    : { fullHeightPoints: height, deltaVsCurrentLogPoints: height - baselineHeight };
}

async function composite(name, items, title) {
  const gap = 54;
  const top = 132;
  const images = [];
  let maxH = 0;
  for (const [variant, label] of items) {
    const p = path.join(screens, `${variant}-full.png`);
    const meta = await sharp(p).metadata();
    images.push({ input: p, left: images.length * (meta.width + gap), top, label, width: meta.width, height: meta.height });
    maxH = Math.max(maxH, meta.height);
  }
  const width = images.reduce((sum, im) => sum + im.width, 0) + gap * (images.length - 1);
  const height = top + maxH + 60;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#070b11"/><text x="24" y="42" fill="#F3F8FA" font-family="-apple-system,sans-serif" font-size="30" font-weight="700">${title}</text>${images.map(im => `<text x="${im.left + 12}" y="98" fill="#A8B5C5" font-family="-apple-system,sans-serif" font-size="24" font-weight="600">${im.label}</text>`).join('')}</svg>`;
  await sharp(Buffer.from(svg)).composite(images.map(({ input, left, top: imageTop }) => ({ input, left, top: imageTop }))).png().toFile(path.join(screens, name));
}

await composite('corrected-home-pair.png', [['home-dark', 'Corrected Home · Dark'], ['home-light', 'Corrected Home · Mineral Light']], 'Selected Home · corrected and frozen');
await composite('log-dark-three-way.png', [['direct-dark', 'Direct Translation'], ['command-dark', 'Compact Command Center'], ['editorial-dark', 'Editorial / Open']], 'Log approaches · dark appearance');
await composite('log-light-three-way.png', [['direct-light', 'Direct Translation'], ['command-light', 'Compact Command Center'], ['editorial-light', 'Editorial / Open']], 'Log approaches · mineral light appearance');
await composite('log-all-approaches-grid.png', [['direct-dark', 'Direct · Dark'], ['direct-light', 'Direct · Light'], ['command-dark', 'Command · Dark'], ['command-light', 'Command · Light'], ['editorial-dark', 'Editorial · Dark'], ['editorial-light', 'Editorial · Light']], 'Log exploration · all six full-page screens');

await page.setViewportSize({ width: 1700, height: 1200 });
await page.evaluate(({ baselineHeight, variants }) => {
  for (const [variant, height] of Object.entries(variants)) {
    const key = variant === 'home-dark' ? 'homeDark' : variant === 'home-light' ? 'homeLight' : variant.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const el = document.querySelector(`[data-impact="${key}"]`);
    if (!el) continue;
    if (variant.startsWith('home-')) el.textContent = `${height} pt`;
    else {
      const delta = height - baselineHeight;
      el.textContent = `${height} pt · ${delta === 0 ? 'baseline' : `${delta > 0 ? '+' : ''}${delta} pt vs baseline`}`;
    }
  }
}, { baselineHeight, variants: Object.fromEntries(variants.map(v => [v, validation.variants[v].heightPoints])) });
await page.screenshot({ path: path.join(screens, 'comparison-board-overview.png'), fullPage: true });

await fs.writeFile(path.join(root, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify(validation, null, 2));
