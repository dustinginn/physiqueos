import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const runtimeModules = process.env.CODEX_NODE_MODULES;
if (!runtimeModules) throw new Error('CODEX_NODE_MODULES is required.');
const require = createRequire(path.join(runtimeModules, 'package.json'));
const { chromium } = require('playwright');

const root = path.resolve(process.argv[2] || '.');
const source = path.join(root, 'source', 'options.html');
const output = path.join(root, 'screens');
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const page = await browser.newPage({ viewport: { width: 1320, height: 1100 }, deviceScaleFactor: 3 });
await page.goto(pathToFileURL(source).href);
await page.evaluate(() => document.fonts.ready);

const names = [
  'option-a-dark', 'option-a-light', 'option-b-dark', 'option-b-light',
  'option-a-dark-large', 'option-a-light-large',
  'option-b-dark-large', 'option-b-light-large'
];
const measurements = {};
for (const name of names) {
  const phone = page.locator(`[data-capture="${name}"]`);
  await phone.screenshot({ path: path.join(output, `${name}.png`) });
  measurements[name] = await phone.evaluate(element => {
    const box = element.getBoundingClientRect();
    const supporting = element.querySelector('.supporting').getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      supportingWidth: supporting.width,
      supportingHeight: supporting.height,
      overflowX: element.scrollWidth - element.clientWidth,
      overflowY: element.scrollHeight - element.clientHeight
    };
  });
}

const boardPath = path.join(root, 'comparison-board.png');
await page.screenshot({ path: boardPath, fullPage: true });
// Keep the review board readable while avoiding a 13 MiB, 15k-pixel-tall
// duplicate of the individually preserved 3x screenshots.
execFileSync('/usr/bin/sips', ['-Z', '6000', boardPath], { stdio: 'ignore' });
process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`);
await browser.close();
