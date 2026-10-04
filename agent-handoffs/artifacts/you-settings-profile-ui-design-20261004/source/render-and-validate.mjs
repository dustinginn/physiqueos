import { chromium } from "/Users/dustinginn/Developer/PhysiqueOS/server/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const screensDirectory = path.join(root, "screens");
const screenIds = ["D1", "Y1", "S1", "P1", "DS1", "DS2", "DS3", "A1"];
const themes = ["dark", "light"];
fs.mkdirSync(screensDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 430, height: 930 }, deviceScaleFactor: 2 });
const runtimeErrors = [];
page.on("pageerror", error => runtimeErrors.push(String(error)));

const results = [];
for (const id of screenIds) {
  for (const theme of themes) {
    const url = `${pathToFileURL(path.join(root, "screen.html")).href}?screen=${id}&theme=${theme}`;
    await page.goto(url);
    await page.waitForTimeout(80);
    const metrics = await page.evaluate(() => {
      const phone = document.querySelector(".phone");
      const scroll = document.querySelector(".screen-scroll");
      return {
        theme: document.documentElement.dataset.theme,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        phoneRight: phone?.getBoundingClientRect().right ?? null,
        phoneLeft: phone?.getBoundingClientRect().left ?? null,
        clippedContent: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : false,
      };
    });
    const output = path.join(screensDirectory, `${id.toLowerCase()}-${theme}.png`);
    await page.screenshot({ path: output, fullPage: true });
    results.push({ id, theme, output: path.relative(root, output), ...metrics });
  }
}

await page.setViewportSize({ width: 900, height: 1200 });
await page.goto(pathToFileURL(path.join(root, "beta-readiness-board.html")).href);
await page.locator(".wrap").screenshot({ path: path.join(screensDirectory, "beta-readiness-architecture-summary.png") });

await page.setViewportSize({ width: 920, height: 1200 });
await page.goto(pathToFileURL(path.join(root, "review-board.html")).href);
await page.waitForFunction(() => [...document.images].every(image => image.complete));
const reviewMetrics = await page.evaluate(() => ({
  width: document.documentElement.scrollWidth,
  viewportWidth: window.innerWidth,
  imageCount: document.images.length,
  brokenImages: [...document.images].filter(image => !image.naturalWidth).map(image => image.getAttribute("src")),
}));
await page.screenshot({ path: path.join(screensDirectory, "you-settings-primary-mobile-review-board.png"), fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await page.waitForFunction(() => [...document.images].every(image => image.complete));
const mobileMetrics = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  viewportWidth: window.innerWidth,
  brokenImages: [...document.images].filter(image => !image.naturalWidth).map(image => image.getAttribute("src")),
}));

await browser.close();

const failures = [
  ...results.filter(result => result.bodyWidth > result.viewportWidth || result.phoneLeft < 0 || result.phoneRight > result.viewportWidth || result.clippedContent),
  ...(runtimeErrors.length ? [{ runtimeErrors }] : []),
  ...(reviewMetrics.width > reviewMetrics.viewportWidth || reviewMetrics.brokenImages.length ? [{ reviewMetrics }] : []),
  ...(mobileMetrics.scrollWidth > mobileMetrics.viewportWidth || mobileMetrics.brokenImages.length ? [{ mobileMetrics }] : []),
];
const validation = {
  schemaVersion: 1,
  screens: screenIds,
  themes,
  renderCount: results.length,
  runtimeErrors,
  reviewMetrics,
  mobileMetrics,
  results,
  pass: failures.length === 0,
  failures,
};
fs.writeFileSync(path.join(root, "validation.json"), `${JSON.stringify(validation, null, 2)}\n`);
if (!validation.pass) {
  console.error(JSON.stringify(validation, null, 2));
  process.exit(1);
}
console.log(`Rendered and validated ${results.length} product screens plus two review boards.`);
