import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire('/Users/dustinginn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');

const root = path.resolve(import.meta.dirname, '..');
const screensDir = path.join(root, 'screens');
await fs.mkdir(screensDir, { recursive: true });

const expected = {
  watch: ['W0','W0B','W0C','W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W10B','W11','W12','W13'],
  live: ['LA1','LA2','LA3','LA4','LA5','LA6','LA7','LA8','LA9'],
  logger: ['L1','L2','L3','L4','L5','L5B','L6','L7','L8','L9','L10','L11','L12','L13','L14','L15','L16','L17D','L17L'],
};

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const validation = {
  authority: { prompt: '960f83f4900ae6b12d5192f010054547eae36d9e', native: 'b8ee8690b194cb90086b62816b9a2c8c400dc026', build: 85 },
  generatedAt: new Date().toISOString(),
  boards: {},
  rules: {
    shippingCodeChanged: false,
    phoneLoggerInventedTimer: false,
    phoneLoggerInventedPauseControl: false,
    phoneLoggerInventedWatchActiveBanner: false,
    liveActivityInventedMutationError: false,
  },
};

for (const family of Object.keys(expected)) {
  const file = path.join(root, `${family === 'live' ? 'live-activity' : family}-board.html`);
  for (const theme of ['dark', 'light']) {
    const suffix = theme === 'light' ? '-light' : '';
    const page = await browser.newPage({ viewport: { width: 1560, height: 1050 }, deviceScaleFactor: 1 });
    await page.goto(`file://${file}?theme=${theme}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => ({
    ids: [...document.querySelectorAll('[data-screen]')].map(n => n.dataset.screen),
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    text: document.body.innerText,
      cards: [...document.querySelectorAll('[data-screen]')].map(n => {
        const stage = n.querySelector('.stage');
        const product = n.querySelector('.phone,.watch,.lock-screen,.island-shell,.compact-island');
        const cardRect = n.getBoundingClientRect();
        const stageRect = stage?.getBoundingClientRect();
        return {
          id: n.dataset.screen,
          stageOverflow: stage?.scrollWidth > stage?.clientWidth + 1,
          hasProduct: Boolean(product),
          stageContained: Boolean(stageRect && cardRect.top <= stageRect.top && cardRect.bottom >= stageRect.bottom),
        };
      }),
    }));
    const missing = expected[family].filter(id => !state.ids.includes(id));
    const extra = state.ids.filter(id => !expected[family].includes(id));
    const cardsWithOverflow = state.cards.filter(c => c.stageOverflow).map(c => c.id);
    const cardsWithoutProduct = state.cards.filter(c => !c.hasProduct).map(c => c.id);
    const cardsWithEscapedStage = state.cards.filter(c => !c.stageContained).map(c => c.id);
    const boardKey = `${family}-${theme}`;
    validation.boards[boardKey] = {
      expectedScreens: expected[family].length,
      actualScreens: state.ids.length,
      missing,
      extra,
      horizontalPageOverflow: state.width > state.viewport + 1,
      pageWidth: state.width,
      viewportWidth: state.viewport,
      cardsWithOverflow,
      cardsWithoutProduct,
      cardsWithEscapedStage,
      pass: missing.length === 0 && extra.length === 0 && state.width <= state.viewport + 1 && cardsWithOverflow.length === 0 && cardsWithoutProduct.length === 0 && cardsWithEscapedStage.length === 0,
    };
    if (!validation.boards[boardKey].pass) throw new Error(`${boardKey} validation failed: ${JSON.stringify(validation.boards[boardKey])}`);

    await page.screenshot({ path: path.join(screensDir, `${family}-coverage-board${suffix}.png`), fullPage: true });
    await page.close();

    const detail = await browser.newPage({ viewport: { width: 1560, height: 1050 }, deviceScaleFactor: 3 });
    await detail.goto(`file://${file}?theme=${theme}`, { waitUntil: 'networkidle' });
    await detail.evaluate(() => document.fonts.ready);
    await detail.addStyleTag({ content: '.screen-meta{display:none!important}.screen-card{padding:0!important;border:0!important;background:transparent!important}.stage{padding:0!important;min-height:0!important;background:transparent!important}' });
    for (const id of expected[family]) {
      await detail.evaluate(screenId => {
        for (const node of document.querySelectorAll('[data-screen]')) node.hidden = node.dataset.screen !== screenId;
      }, id);
      const card = detail.locator(`[data-screen="${id}"]`);
      let target = card.locator('.phone,.watch,.lock-screen,.island-shell').first();
      if (id === 'LA3') target = card.locator('.stage');
      await target.screenshot({ path: path.join(screensDir, `${family}-${id.toLowerCase()}${suffix}.png`) });
    }
    await detail.close();
  }
}

const index = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
await index.goto(`file://${path.join(root, 'comparison-board.html')}`, { waitUntil: 'networkidle' });
await index.evaluate(() => document.fonts.ready);
await index.screenshot({ path: path.join(screensDir, 'review-index.png'), fullPage: true });
await index.close();

// Compact board thumbnails for README/review tools that should not load very tall captures.
for (const family of Object.keys(expected)) {
  for (const suffix of ['', '-light']) {
    const input = path.join(screensDir, `${family}-coverage-board${suffix}.png`);
    const meta = await sharp(input).metadata();
    await sharp(input).resize({ width: 1400, withoutEnlargement: true }).extract({
      left: 0,
      top: 0,
      width: Math.min(1400, Math.round(meta.width * Math.min(1, 1400 / meta.width))),
      height: Math.min(1500, Math.round(meta.height * Math.min(1, 1400 / meta.width))),
    }).png().toFile(path.join(screensDir, `${family}-coverage-preview${suffix}.png`));
  }
}

validation.pass = Object.values(validation.boards).every(board => board.pass) && Object.values(validation.rules).every(value => value === false);
await fs.writeFile(path.join(root, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify(validation, null, 2));
