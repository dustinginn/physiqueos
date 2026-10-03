import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const root = path.resolve(process.argv[2]);
const board = path.join(root, 'comparison-board.html');
const output = path.join(root, 'screens');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'FIXTURE.json'), 'utf8'));
const variants = ['t1l', 't1d', 't2l', 't2d', 't3d', 't3l'];

fs.mkdirSync(output, { recursive: true });

const required = {
  'header.greeting': fixture.header.greeting,
  'header.name': fixture.header.name,
  'hero.sectionLabel': fixture.hero.sectionLabel,
  'hero.goalLabel': fixture.hero.goalLabel,
  'hero.headline': fixture.hero.headline,
  'hero.primaryTimeline': fixture.hero.primaryTimeline,
  'hero.supportLine': fixture.hero.supportLine,
  'hero.confidence': fixture.hero.confidence.spokenValue,
  'hero.targetLabel': fixture.hero.targetLabel,
  'hero.targetValue': fixture.hero.targetValue,
  'hero.remainingLabel': fixture.hero.remainingLabel,
  'hero.remainingValue': fixture.hero.remainingValue,
  'nextBestAction.title': fixture.nextBestAction.title,
  'briefing.sectionLabel': fixture.briefing.sectionLabel,
  'briefing.title': fixture.briefing.title,
  'briefing.date': fixture.briefing.date,
  'briefing.preview': fixture.briefing.preview,
  'goal.sectionLabel': fixture.goal.sectionLabel,
  'goal.title': fixture.goal.title,
  'goal.dateRange': fixture.goal.dateRange,
  'goal.progressLabel': fixture.goal.progressLabel,
  'goal.progressValue': fixture.goal.progressValue,
  'goal.destinationLabel': fixture.goal.destinationLabel,
  'goal.destinationValue': fixture.goal.destinationValue,
  'goal.guardrail.label': fixture.goal.guardrail.label,
  'goal.guardrail.title': fixture.goal.guardrail.title,
  'goal.guardrail.observation': fixture.goal.guardrail.observation,
  'priorities.sectionLabel': fixture.priorities.sectionLabel,
  'priorities.openCount': fixture.priorities.openCount
};

fixture.goal.phases.forEach((phase, index) => {
  for (const key of ['label', 'title', 'status', 'timing']) required[`goal.phases.${index}.${key}`] = phase[key];
  if (phase.progress) required[`goal.phases.${index}.progress`] = phase.progress;
});
fixture.priorities.items.forEach((item, index) => {
  required[`priorities.items.${index}.title`] = item.title;
  required[`priorities.items.${index}.detail`] = item.detail;
  required[`priorities.items.${index}.state`] = item.state;
});
fixture.navigation.forEach((item, index) => { required[`navigation.${index}`] = item; });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 3 });
await page.goto(pathToFileURL(board).href);
await page.evaluate(() => document.fonts.ready);
await page.locator('.jump').evaluate((element) => { element.style.display = 'none'; });

const validation = {};
const measurements = {};
for (const variant of variants) {
  const phone = page.locator(`.phone[data-variant="${variant}"]`);
  const fields = await phone.locator('[data-semantic]').evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => [node.dataset.semantic, node.dataset.value])));
  const mismatches = Object.entries(required).filter(([key, value]) => fields[key] !== String(value));
  if (mismatches.length) throw new Error(`${variant} semantic parity failed: ${JSON.stringify(mismatches)}`);

  const geometry = await phone.locator('[data-confidence-geometry]').evaluateAll((nodes) => nodes.map((node) => node.dataset.confidenceGeometry));
  if (geometry.some((value) => value !== '79')) throw new Error(`${variant} confidence geometry failed: ${JSON.stringify(geometry)}`);
  const expectedMeters = variant.startsWith('t3') ? 2 : variant.startsWith('t1') ? 1 : 0;
  if (geometry.length !== expectedMeters) throw new Error(`${variant} expected ${expectedMeters} confidence geometry marks, found ${geometry.length}`);

  validation[variant] = {
    requiredFields: Object.keys(required).length,
    mismatches: 0,
    confidenceGeometry: geometry,
    confidenceGeometryValid: true
  };
  await phone.screenshot({ path: path.join(output, `${variant}-full.png`) });
  measurements[variant] = await phone.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height
  }));
  await phone.evaluate((element) => element.classList.add('capture-fold'));
  const foldPath = path.join(output, `${variant}-above-fold.png`);
  await phone.screenshot({ path: foldPath });
  execFileSync('/usr/bin/sips', ['-c', '2622', '1206', foldPath], { stdio: 'ignore' });
  await phone.evaluate((element) => element.classList.remove('capture-fold'));
}

async function captureGroup(id, keys, file, background = '#080b11') {
  await page.evaluate(({ id, keys, background }) => {
    const group = document.createElement('div');
    group.id = id;
    group.style.cssText = `display:flex;gap:20px;align-items:flex-start;padding:24px;background:${background};width:max-content`;
    for (const key of keys) group.append(document.querySelector(`.phone[data-variant="${key}"]`).cloneNode(true));
    document.body.prepend(group);
  }, { id, keys, background });
  await page.locator(`#${id}`).screenshot({ path: path.join(output, file) });
  await page.locator(`#${id}`).evaluate((element) => element.remove());
}

await captureGroup('round4-track1', ['t1l', 't1d'], 'track1-side-by-side.png');
await captureGroup('round4-track2', ['t2l', 't2d'], 'track2-side-by-side.png');
await captureGroup('round4-track3', ['t3d', 't3l'], 'track3-side-by-side.png');
await captureGroup('round4-all-dark', ['t1d', 't2d', 't3d'], 'dark-tracks-triptych.png');

await page.locator('.jump').evaluate((element) => { element.style.display = ''; });
await page.screenshot({ path: path.join(output, 'comparison-board-overview.png'), fullPage: true });

fs.writeFileSync(path.join(root, 'validation.json'), `${JSON.stringify({ measurements, validation }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ measurements, validation }, null, 2)}\n`);
await browser.close();
