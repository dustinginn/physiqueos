import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');

const root = path.resolve(import.meta.dirname, '..');
const screensDir = path.join(root, 'screens');
await fs.mkdir(screensDir, { recursive: true });

const nutrition = ['N1','N2','N3','N4','N5','N6','N7','N8'];
const activity = ['A1','A2','A3','A4','A5','A6','A7'];
const expected = [...nutrition, ...activity];
const boardFile = path.join(root, 'evidence-board.html');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const validation = {
  authority: {
    prompt: 'eb186ba2bb0862daf4f487c334ef445336bcab46',
    native: 'b8ee8690b194cb90086b62816b9a2c8c400dc026',
    build: 85,
    trainingLock: 'ca088e80e851c83d0d3e168d88f918232f5338d6'
  },
  generatedAt: new Date().toISOString(),
  expected: { nutrition: nutrition.length, activity: activity.length, total: expected.length },
  boards: {},
  parity: {},
  semanticRules: {
    shippingSourceChanged: false,
    inventedNutritionChart: false,
    inventedActivityChart: false,
    nutritionSourcesPresentedAsAdditive: false,
    nutritionAggregationChanged: false,
    activityWorkoutClassificationInvented: false,
    cooldownStyledOrCountedAsCardio: false,
    evidenceRowsStyledEditable: false,
    healthKitSemanticsChanged: false
  }
};

const textByTheme = {};
const metricLabelsByTheme = {};
for (const theme of ['dark', 'light']) {
  const suffix = theme === 'light' ? '-light' : '';
  const page = await browser.newPage({ viewport: { width: 1510, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`file://${boardFile}?theme=${theme}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const state = await page.evaluate(() => ({
    ids: [...document.querySelectorAll('[data-screen]')].map(node => node.dataset.screen),
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    cards: [...document.querySelectorAll('[data-screen]')].map(node => {
      const stage = node.querySelector('.stage');
      const phone = node.querySelector('.phone');
      return {
        id: node.dataset.screen,
        family: node.dataset.family,
        stageOverflow: stage.scrollWidth > stage.clientWidth + 1,
        phoneOverflow: phone.scrollWidth > phone.clientWidth + 1,
        hasPhone: Boolean(phone),
        text: phone?.innerText.replace(/\s+/g, ' ').trim() ?? '',
        metricLabels: [...node.querySelectorAll('.metric-label')].map(label => label.textContent.trim())
      };
    })
  }));
  textByTheme[theme] = Object.fromEntries(state.cards.map(card => [card.id, card.text]));
  metricLabelsByTheme[theme] = Object.fromEntries(state.cards.map(card => [card.id, card.metricLabels]));
  const missing = expected.filter(id => !state.ids.includes(id));
  const extra = state.ids.filter(id => !expected.includes(id));
  const duplicates = state.ids.filter((id, index) => state.ids.indexOf(id) !== index);
  const overflow = state.cards.filter(card => card.stageOverflow || card.phoneOverflow).map(card => card.id);
  const familyCounts = {
    nutrition: state.cards.filter(card => card.family === 'nutrition').length,
    activity: state.cards.filter(card => card.family === 'activity').length
  };
  validation.boards[theme] = {
    actualScreens: state.ids.length,
    familyCounts,
    missing,
    extra,
    duplicates,
    horizontalPageOverflow: state.width > state.viewport + 1,
    cardOverflow: overflow,
    missingPhone: state.cards.filter(card => !card.hasPhone).map(card => card.id),
    runtimeErrors: errors
  };
  validation.boards[theme].pass = missing.length === 0 && extra.length === 0 && duplicates.length === 0 &&
    familyCounts.nutrition === nutrition.length && familyCounts.activity === activity.length &&
    !validation.boards[theme].horizontalPageOverflow && overflow.length === 0 &&
    validation.boards[theme].missingPhone.length === 0 && errors.length === 0;
  if (!validation.boards[theme].pass) throw new Error(`${theme} board failed: ${JSON.stringify(validation.boards[theme])}`);
  await page.screenshot({ path: path.join(screensDir, `nutrition-activity-coverage-board${suffix}.png`), fullPage: true });
  await page.close();

  const detail = await browser.newPage({ viewport: { width: 820, height: 1040 }, deviceScaleFactor: 3 });
  await detail.goto(`file://${boardFile}?theme=${theme}`, { waitUntil: 'networkidle' });
  await detail.evaluate(() => document.fonts.ready);
  await detail.addStyleTag({ content: '.screen-meta{display:none!important}.screen-card{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}.stage{padding:0!important;min-height:0!important;background:transparent!important}' });
  for (const id of expected) {
    await detail.evaluate(screenId => {
      for (const node of document.querySelectorAll('[data-screen]')) node.hidden = node.dataset.screen !== screenId;
    }, id);
    await detail.locator(`[data-screen="${id}"] .phone`).screenshot({ path: path.join(screensDir, `evidence-${id.toLowerCase()}${suffix}.png`) });
  }
  await detail.close();
}

const parityMismatches = expected.filter(id => textByTheme.dark[id] !== textByTheme.light[id]);
validation.parity = { checkedScreens: expected.length, textMismatches: parityMismatches, pass: parityMismatches.length === 0 };
if (!validation.parity.pass) throw new Error(`dark/light text parity failed: ${parityMismatches.join(', ')}`);

const combinedText = Object.values(textByTheme.dark).join(' ');
validation.contentAssertions = {
  nutritionCanonicalOrder: ['Calories','Protein','Carbohydrates','Fat'].every(label => combinedText.includes(label)),
  nutritionSourceScoped: textByTheme.dark.N3.includes('Source · Typed evidence') && textByTheme.dark.N4.includes('Source · Apple Health') && !textByTheme.dark.N3.includes('Typed evidence +') && !textByTheme.dark.N4.includes('Apple Health +'),
  totalsOnlyCopyExact: combinedText.includes('Daily totals only. No meal detail for this day.'),
  activityMetricOrder: JSON.stringify(metricLabelsByTheme.dark.A3) === JSON.stringify(['Active Calories','Total Calories','Exercise Minutes','Stand Hours','Workout Calories','Non-Workout Calories','Move Goal','Linked Workouts']),
  partialDayExact: textByTheme.dark.A4.includes("Apple Health is still updating today's total. Workout energy (567 cal) is above the active total so far (171 cal); non-workout calories show 0 until it catches up."),
  noActivityReportingTitle: !Object.values(textByTheme.dark).some(text => text.includes('Activity Reporting')),
  noCooldownMisclassification: !Object.values(textByTheme.dark).some(text => /Cooldown.*Cardio|Cardio.*Cooldown/.test(text))
};
if (Object.values(validation.contentAssertions).some(value => value !== true)) throw new Error(`content assertion failed: ${JSON.stringify(validation.contentAssertions)}`);

for (const suffix of ['', '-light']) {
  const input = path.join(screensDir, `nutrition-activity-coverage-board${suffix}.png`);
  const meta = await sharp(input).metadata();
  const width = Math.min(1400, meta.width);
  const ratio = width / meta.width;
  const height = Math.min(2600, Math.round(meta.height * ratio));
  await sharp(input).resize({ width: Math.round(meta.width * ratio) }).extract({ left: 0, top: 0, width, height }).png().toFile(path.join(screensDir, `nutrition-activity-coverage-preview${suffix}.png`));
}

const review = await browser.newPage({ viewport: { width: 1500, height: 1080 }, deviceScaleFactor: 1 });
await review.goto(`file://${path.join(root, 'comparison-board.html')}`, { waitUntil: 'networkidle' });
await review.evaluate(() => document.fonts.ready);
await review.screenshot({ path: path.join(screensDir, 'review-index.png'), fullPage: true });
await review.close();

validation.pass = Object.values(validation.boards).every(item => item.pass) && validation.parity.pass &&
  Object.values(validation.semanticRules).every(value => value === false) && Object.values(validation.contentAssertions).every(value => value === true);
await fs.writeFile(path.join(root, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify(validation, null, 2));
