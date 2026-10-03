import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const root = path.resolve(process.argv[2] || '.');
const board = path.join(root, 'comparison-board.html');
const output = path.join(root, 'screens');
const variants = ['current', 'refined', 'restrained', 'compact', 'modern', 'editorial', 'daylight'];

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 3 });
await page.goto(pathToFileURL(board).href);
await page.evaluate(() => document.fonts.ready);
await page.locator('.jump').evaluate((element) => { element.style.display = 'none'; });

const measurements = {};
for (const variant of variants) {
  const phone = page.locator(`.phone[data-variant="${variant}"]`);
  await phone.screenshot({ path: path.join(output, `${variant}-full.png`) });
  measurements[variant] = await phone.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
    contentHeight: element.scrollHeight
  }));
  await phone.evaluate((element) => element.classList.add('capture-fold'));
  const foldPath = path.join(output, `${variant}-above-fold.png`);
  await phone.screenshot({ path: foldPath });
  execFileSync('/usr/bin/sips', ['-c', '2622', '1206', foldPath], { stdio: 'ignore' });
  await phone.evaluate((element) => element.classList.remove('capture-fold'));
}

await page.locator('.jump').evaluate((element) => { element.style.display = ''; });
await page.screenshot({ path: path.join(output, 'comparison-board-overview.png'), fullPage: true });
process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`);
await browser.close();
