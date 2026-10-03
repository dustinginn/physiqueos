import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const root = path.resolve(process.argv[2]);
const board = path.join(root, 'comparison-board.html');
const output = path.join(root, 'screens');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'FIXTURE.json'), 'utf8'));
const variants = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'b4'];

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
  validation[variant] = { requiredFields: Object.keys(required).length, mismatches: 0 };
  await phone.screenshot({ path: path.join(output, `${variant}-full.png`) });
  measurements[variant] = await phone.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
  await phone.evaluate((element) => element.classList.add('capture-fold'));
  const foldPath = path.join(output, `${variant}-above-fold.png`);
  await phone.screenshot({ path: foldPath });
  execFileSync('/usr/bin/sips', ['-c', '2622', '1206', foldPath], { stdio: 'ignore' });
  await phone.evaluate((element) => element.classList.remove('capture-fold'));
}

await page.evaluate(() => {
  const pair = document.createElement('div');
  pair.id = 'round3-convergence-triptych';
  pair.style.cssText = 'display:flex;gap:20px;align-items:flex-start;padding:24px;background:#080b11;width:max-content';
  for (const key of ['a1', 'a2', 'a3']) pair.append(document.querySelector(`.phone[data-variant="${key}"]`).cloneNode(true));
  document.body.prepend(pair);
});
await page.locator('#round3-convergence-triptych').screenshot({ path: path.join(output, 'convergence-triptych.png') });
await page.locator('#round3-convergence-triptych').evaluate((element) => element.remove());

await page.evaluate(() => {
  const sheet = document.createElement('div');
  sheet.id = 'round3-structural-grayscale';
  sheet.style.cssText = 'display:grid;grid-template-columns:repeat(5,221px);gap:16px;padding:24px;background:#f4f4f1;color:#111;font:700 13px system-ui;width:max-content';
  const names = { a1: 'Preferred Dark', b1: 'B1 Modular', b2: 'B2 Editorial', b3: 'B3 Execution', b4: 'B4 Immersive' };
  for (const key of ['a1', 'b1', 'b2', 'b3', 'b4']) {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;flex-direction:column;gap:10px;align-items:center';
    const label = document.createElement('div');
    label.textContent = names[key];
    const shell = document.createElement('div');
    shell.style.cssText = 'width:221px;height:481px;overflow:hidden;border-radius:28px;background:#ddd';
    const clone = document.querySelector(`.phone[data-variant="${key}"]`).cloneNode(true);
    clone.style.cssText += ';transform:scale(.55);transform-origin:top left;filter:grayscale(1);box-shadow:none';
    shell.append(clone);
    item.append(label, shell);
    sheet.append(item);
  }
  document.body.prepend(sheet);
});
await page.locator('#round3-structural-grayscale').screenshot({ path: path.join(output, 'structural-grayscale-test.png') });
await page.locator('#round3-structural-grayscale').evaluate((element) => element.remove());

await page.locator('.jump').evaluate((element) => { element.style.display = ''; });
await page.screenshot({ path: path.join(output, 'comparison-board-overview.png'), fullPage: true });
process.stdout.write(`${JSON.stringify({ measurements, validation }, null, 2)}\n`);
await browser.close();
