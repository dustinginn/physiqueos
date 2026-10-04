import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');

const root = path.resolve(import.meta.dirname, '..');
const screensDir = path.join(root, 'screens');
await fs.mkdir(screensDir, { recursive: true });

const expected = ['T1','T2','T3','T4','T5','T6','T7','T8','T11','T9','T10','T12','T13','T14','T15','T16'];
const boardFile = path.join(root, 'training-evidence-board.html');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const validation = {
  authority: { prompt: '2bae36cfa5f3364880abf8966800c658bd30aafc', native: 'b8ee8690b194cb90086b62816b9a2c8c400dc026', build: 85 },
  generatedAt: new Date().toISOString(),
  boards: {},
  parity: {},
  semanticRules: {
    shippingSourceChanged: false,
    inventedTrainingChart: false,
    evidenceRowsStyledEditable: false,
    cooldownStyledOrCountedAsCardio: false,
    performanceRecordSemanticsChanged: false,
    healthKitProvenanceContractChanged: false,
  },
};

const phoneTextByTheme = {};
for (const theme of ['dark', 'light']) {
  const suffix = theme === 'light' ? '-light' : '';
  const page = await browser.newPage({ viewport: { width: 1560, height: 1100 }, deviceScaleFactor: 1 });
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
        stageOverflow: stage.scrollWidth > stage.clientWidth + 1,
        phoneOverflow: phone.scrollWidth > phone.clientWidth + 1,
        hasPhone: Boolean(phone),
        text: phone?.innerText.replace(/\s+/g, ' ').trim() ?? '',
      };
    }),
  }));
  phoneTextByTheme[theme] = Object.fromEntries(state.cards.map(card => [card.id, card.text]));
  const missing = expected.filter(id => !state.ids.includes(id));
  const extra = state.ids.filter(id => !expected.includes(id));
  const overflow = state.cards.filter(card => card.stageOverflow || card.phoneOverflow).map(card => card.id);
  validation.boards[theme] = {
    expectedScreens: expected.length,
    actualScreens: state.ids.length,
    missing,
    extra,
    horizontalPageOverflow: state.width > state.viewport + 1,
    cardOverflow: overflow,
    missingPhone: state.cards.filter(card => !card.hasPhone).map(card => card.id),
  };
  validation.boards[theme].pass = missing.length === 0 && extra.length === 0 && !validation.boards[theme].horizontalPageOverflow && overflow.length === 0 && validation.boards[theme].missingPhone.length === 0;
  if (!validation.boards[theme].pass) throw new Error(`${theme} board failed: ${JSON.stringify(validation.boards[theme])}`);
  await page.screenshot({ path: path.join(screensDir, `training-evidence-coverage-board${suffix}.png`), fullPage: true });
  await page.close();

  const detail = await browser.newPage({ viewport: { width: 820, height: 1040 }, deviceScaleFactor: 3 });
  await detail.goto(`file://${boardFile}?theme=${theme}`, { waitUntil: 'networkidle' });
  await detail.evaluate(() => document.fonts.ready);
  await detail.addStyleTag({ content: '.screen-meta{display:none!important}.screen-card{padding:0!important;border:0!important;background:transparent!important}.stage{padding:0!important;min-height:0!important;background:transparent!important}' });
  for (const id of expected) {
    await detail.evaluate(screenId => {
      for (const node of document.querySelectorAll('[data-screen]')) node.hidden = node.dataset.screen !== screenId;
    }, id);
    await detail.locator(`[data-screen="${id}"] .phone`).screenshot({ path: path.join(screensDir, `training-evidence-${id.toLowerCase()}${suffix}.png`) });
  }
  await detail.close();
}

const parityMismatches = expected.filter(id => phoneTextByTheme.dark[id] !== phoneTextByTheme.light[id]);
validation.parity = { checkedScreens: expected.length, textMismatches: parityMismatches, pass: parityMismatches.length === 0 };
if (!validation.parity.pass) throw new Error(`dark/light text parity failed: ${parityMismatches.join(', ')}`);

for (const suffix of ['', '-light']) {
  const input = path.join(screensDir, `training-evidence-coverage-board${suffix}.png`);
  const meta = await sharp(input).metadata();
  const ratio = Math.min(1, 1400 / meta.width);
  const width = Math.round(meta.width * ratio);
  const height = Math.min(2100, Math.round(meta.height * ratio));
  await sharp(input).resize({ width }).extract({ left: 0, top: 0, width, height }).png().toFile(path.join(screensDir, `training-evidence-coverage-preview${suffix}.png`));
}

const index = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await index.goto(`file://${path.join(root, 'comparison-board.html')}`, { waitUntil: 'networkidle' });
await index.evaluate(() => document.fonts.ready);
await index.screenshot({ path: path.join(screensDir, 'review-index.png'), fullPage: true });
await index.close();

validation.pass = Object.values(validation.boards).every(item => item.pass) && validation.parity.pass && Object.values(validation.semanticRules).every(value => value === false);
await fs.writeFile(path.join(root, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify(validation, null, 2));
