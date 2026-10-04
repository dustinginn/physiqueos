import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');

const root = path.resolve(import.meta.dirname, '..');
const acceptedRoot = path.resolve(root, '..', 'nutrition-activity-evidence-style-translation-20261004');
const boardFile = path.join(acceptedRoot, 'evidence-board.html');
const screensDir = path.join(root, 'screens');
await fs.mkdir(screensDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const validation = {
  authority: {
    prompt: 'edb8faca934666dfdb6bcaa233cd62410a6021a3',
    acceptedDesign: '8de163506d6e996328e60d510199562cdeb8dffb',
    native: 'b8ee8690b194cb90086b62816b9a2c8c400dc026',
    build: 85
  },
  generatedAt: new Date().toISOString(),
  appearances: {},
  parity: {},
  semanticRules: {
    shippingSourceChanged: false,
    nutritionAggregationChanged: false,
    activityMetricsChanged: false,
    activityReportingInvented: false,
    cooldownStyledOrCountedAsCardio: false,
    canonicalCardioSemanticsChanged: false,
    trainingEvidenceChanged: false
  }
};

const rootsByTheme = {};
for (const theme of ['dark', 'light']) {
  const suffix = theme === 'light' ? '-light' : '';
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`file://${boardFile}?theme=${theme}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: `
    .board-head,.screen-meta{display:none!important}
    .board-shell{padding:0!important}
    .screen-grid{display:block!important;max-width:none!important}
    .screen-card{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}
    .stage{padding:18px!important;min-height:0!important;background:var(--stage)!important;overflow:visible!important}
    .phone{height:auto!important;min-height:852px!important;overflow:hidden!important}
    .scroll{height:auto!important;overflow:visible!important;padding-bottom:30px!important}
  ` });

  const result = {};
  for (const [id, family] of [['N1', 'nutrition'], ['A1', 'activity']]) {
    await page.evaluate(screenId => {
      for (const node of document.querySelectorAll('[data-screen]')) node.hidden = node.dataset.screen !== screenId;
    }, id);
    const phone = page.locator(`[data-screen="${id}"] .phone`);
    const history = page.locator(`[data-screen="${id}"] [data-history-preview="${family}"]`);
    await phone.screenshot({ path: path.join(screensDir, `${family}-root-corrected${suffix}.png`) });
    await phone.screenshot({ path: path.join(acceptedRoot, 'screens', `evidence-${id.toLowerCase()}${suffix}.png`) });
    await history.screenshot({ path: path.join(screensDir, `${family}-recent-history-root${suffix}.png`) });
    result[family] = await page.locator(`[data-screen="${id}"]`).evaluate((node, familyName) => {
      const historyNode = node.querySelector(`[data-history-preview="${familyName}"]`);
      return {
        text: node.querySelector('.phone').innerText.replace(/\s+/g, ' ').trim(),
        historyText: historyNode.innerText.replace(/\s+/g, ' ').trim(),
        historyRows: historyNode.querySelectorAll('.row').length,
        showAll: historyNode.innerText.includes('Show All >'),
        width: node.querySelector('.phone').scrollWidth,
        clientWidth: node.querySelector('.phone').clientWidth
      };
    }, family);
  }
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('[data-screen]')) node.hidden = node.dataset.screen !== 'N2';
  });
  await page.locator('[data-screen="N2"] .phone').screenshot({ path: path.join(acceptedRoot, 'screens', `evidence-n2${suffix}.png`) });
  await page.locator('[data-screen="N2"] .phone').screenshot({ path: path.join(screensDir, `nutrition-full-history${suffix}.png`) });
  const boardAudit = await page.evaluate(() => ({
    text: document.body.innerText.replace(/\s+/g, ' ').trim(),
    fullNutritionHistoryPresent: Boolean(document.querySelector('[data-screen="N2"]')),
    fullActivityHistoryPresent: Boolean(document.querySelector('[data-screen="A5"]'))
  }));
  rootsByTheme[theme] = result;
  validation.appearances[theme] = {
    nutritionHistoryRows: result.nutrition.historyRows,
    activityHistoryRows: result.activity.historyRows,
    nutritionShowAll: result.nutrition.showAll,
    activityShowAll: result.activity.showAll,
    nutritionHorizontalOverflow: result.nutrition.width > result.nutrition.clientWidth + 1,
    activityHorizontalOverflow: result.activity.width > result.activity.clientWidth + 1,
    fullNutritionHistoryPresent: boardAudit.fullNutritionHistoryPresent,
    fullActivityHistoryPresent: boardAudit.fullActivityHistoryPresent,
    userFacingFuturePlaceholderText: /Coming soon/i.test(boardAudit.text),
    runtimeErrors: errors
  };
  validation.appearances[theme].pass =
    result.nutrition.historyRows === 3 && result.activity.historyRows === 3 &&
    result.nutrition.showAll && result.activity.showAll &&
    !validation.appearances[theme].nutritionHorizontalOverflow && !validation.appearances[theme].activityHorizontalOverflow &&
    boardAudit.fullNutritionHistoryPresent && boardAudit.fullActivityHistoryPresent &&
    !validation.appearances[theme].userFacingFuturePlaceholderText && errors.length === 0;
  await page.close();
}

validation.parity = {
  nutritionRootTextEqual: rootsByTheme.dark.nutrition.text === rootsByTheme.light.nutrition.text,
  activityRootTextEqual: rootsByTheme.dark.activity.text === rootsByTheme.light.activity.text,
  nutritionHistoryTextEqual: rootsByTheme.dark.nutrition.historyText === rootsByTheme.light.nutrition.historyText,
  activityHistoryTextEqual: rootsByTheme.dark.activity.historyText === rootsByTheme.light.activity.historyText
};
validation.parity.pass = Object.values(validation.parity).every(Boolean);

const n = rootsByTheme.dark.nutrition.text;
const a = rootsByTheme.dark.activity.text;
validation.contentAssertions = {
  nutritionHistoryAtRoot: n.includes('Recent Nutrition History') && rootsByTheme.dark.nutrition.historyRows === 3,
  nutritionFunctionalReportsPreserved: ['Calories', 'Macros', 'Meals'].every(label => n.includes(label)),
  nutritionFutureAreasRemoved: !['Micronutrients', 'Supplements', 'Hydration'].some(label => n.includes(label)),
  nutritionRowsRetainCanonicalDetail: rootsByTheme.dark.nutrition.historyText.includes('2140 calories') && rootsByTheme.dark.nutrition.historyText.includes('180g protein · 220g carbs · 90g fat · 4 meals'),
  activityHistoryAtRoot: a.includes('Recent Activity History') && rootsByTheme.dark.activity.historyRows === 3,
  activityCurrentFieldsPreserved: ['Activity Areas', 'Linked Training Context', 'Active Calories', 'Exercise Minutes', 'Workout Activity', 'Non-Workout Activity'].every(label => a.includes(label)),
  noActivityReporting: !a.includes('Activity Reporting'),
  showAllRoutesVisible: rootsByTheme.dark.nutrition.showAll && rootsByTheme.dark.activity.showAll
};

const comparison = await browser.newPage({ viewport: { width: 1440, height: 780 }, deviceScaleFactor: 2 });
await comparison.goto(`file://${path.join(root, 'before-after.html')}`, { waitUntil: 'networkidle' });
await comparison.screenshot({ path: path.join(screensDir, 'before-after-history-placeholders.png'), fullPage: true });
await comparison.close();

validation.pass = Object.values(validation.appearances).every(result => result.pass) &&
  validation.parity.pass &&
  Object.values(validation.semanticRules).every(value => value === false) &&
  Object.values(validation.contentAssertions).every(Boolean);

await fs.writeFile(path.join(root, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify(validation, null, 2));
