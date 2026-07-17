import { expect, test } from "@playwright/test";

const standard = "/briefings/dexa/preview/dexa_2026_06_20";
const simulated = `${standard}?baseline=dexa_2026_04_28`;

for (const colorScheme of ["light", "dark"] as const) {
  test(`DEXA V1.4.5 Preview is readable on mobile in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(simulated);
    await expect(page.getByRole("heading", { name: "The last four weeks produced substantial fat loss." })).toBeVisible();
    await expect(page.getByText("Since Last Scan", { exact: true })).toBeVisible();
    await expect(page.getByText("Since Starting This Cut", { exact: true })).toBeVisible();
    await expect(page.getByText("Simulated", { exact: true })).toBeVisible();
    await expect(page.getByText("Apr 28", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("May 24", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Jun 20", { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("DEXA V1.4.5 preserves the centered mobile composition on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(standard);
  const canvas = page.locator("main");
  expect((await canvas.boundingBox())?.width).toBeLessThanOrEqual(393);
  const canvasBox = await canvas.boundingBox();
  expect(Math.abs((1280 - (canvasBox?.width ?? 0)) / 2 - (canvasBox?.x ?? 0))).toBeLessThanOrEqual(1);
  await expect(page.getByText("Previous", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Current", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^Change /)).toHaveCount(0);
  const desktopGrid = page.locator("[data-comparison-grid]").first();
  expect((await desktopGrid.locator("[data-movement-arrow]").boundingBox()).width).toBe(16);
  expect(await desktopGrid.evaluate((element) => parseFloat(getComputedStyle(element).columnGap))).toBe(4);
  await expect(page.getByText("↓", { exact: true }).first()).toBeVisible();
});

test("DEXA V1.4.5 comparison grid remains aligned on narrow mobile", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(simulated);
  const row = page.locator('[aria-label^="Trunk: previous"]').first();
  const grid = row;
  const previous = await grid.locator(":scope > div").nth(0).boundingBox();
  const arrow = await grid.locator("[data-movement-arrow]").boundingBox();
  const current = await grid.locator(":scope > div").nth(1).boundingBox();
  expect(arrow.width).toBe(16);
  expect(arrow.x - (previous.x + previous.width)).toBeGreaterThanOrEqual(1);
  expect(current.x - (arrow.x + arrow.width)).toBeGreaterThanOrEqual(1);
  expect(Math.abs((arrow.x - (previous.x + previous.width)) - (current.x - (arrow.x + arrow.width)))).toBeLessThanOrEqual(1);
  const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").map(parseFloat));
  expect(columns[2]).toBe(16);
  expect(columns[0]).toBe(68);
  expect(columns[4]).toBe(64);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("DEXA V1.4.5 comparison values share one horizontal band at 393px", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(simulated);
  const grid = page.locator('[aria-label^="Trunk: previous"]').first();
  const boxes = await Promise.all([
    grid.locator("[data-comparison-metric]").boundingBox(),
    grid.locator("[data-comparison-label]").nth(0).boundingBox(),
    grid.locator("[data-comparison-value]").nth(0).boundingBox(),
    grid.locator("[data-movement-arrow]").boundingBox(),
    grid.locator("[data-comparison-label]").nth(1).boundingBox(),
    grid.locator("[data-comparison-value]").nth(1).boundingBox(),
    grid.locator("[data-comparison-delta]").boundingBox(),
  ]);
  expect(boxes.every(Boolean)).toBe(true);
  const rendered = boxes.filter((box): box is NonNullable<typeof box> => box !== null);
  const metric = rendered[0];
  const previousLabel = rendered[1];
  const previousValue = rendered[2];
  const arrow = rendered[3];
  const currentLabel = rendered[4];
  const currentValue = rendered[5];
  const delta = rendered[6];
  expect(previousLabel.y + previousLabel.height).toBeLessThanOrEqual(previousValue.y);
  expect(currentLabel.y + currentLabel.height).toBeLessThanOrEqual(currentValue.y);
  expect(Math.abs(previousLabel.y - currentLabel.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(previousValue.y - currentValue.y)).toBeLessThanOrEqual(1);
  const valueBandTop = Math.max(previousValue.y, currentValue.y);
  const valueBandBottom = Math.min(previousValue.y + previousValue.height, currentValue.y + currentValue.height);
  for (const element of [metric, arrow, delta]) {
    expect(Math.min(element.y + element.height, valueBandBottom) - Math.max(element.y, valueBandTop)).toBeGreaterThan(0);
  }
  const rowHeight = (await grid.boundingBox())?.height ?? 0;
  expect(rowHeight).toBeGreaterThanOrEqual(36);
  expect(rowHeight).toBeLessThanOrEqual(48);
});

test("DEXA V1.4.5 uses the shared arrow grid in all comparison sections", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(simulated);
  const grids = page.locator("[data-comparison-grid]");
  expect(await grids.count()).toBeGreaterThanOrEqual(8);
  const gridClasses = await grids.evaluateAll((elements) => elements.map((element) => element.className));
  expect(new Set(gridClasses).size).toBe(1);
  const arrowCenters = await grids.evaluateAll((elements) => elements.map((element) => {
    const arrow = element.querySelector("[data-movement-arrow]");
    const box = arrow?.getBoundingClientRect();
    return box ? box.x + box.width / 2 : Number.NaN;
  }));
  expect(Math.max(...arrowCenters) - Math.min(...arrowCenters)).toBeLessThanOrEqual(0.5);
  for (const name of ["Regional Fat Change", "Measured Lean Tissue Change", "Other Notable Changes"]) {
    const section = page.getByText(name, { exact: true }).locator("..");
    await expect(section.locator("[data-movement-arrow]").first()).toBeVisible();
  }
});

test("DEXA V1.4.5 content clears fixed overlays at the end of the page", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(simulated);
  const content = page.locator("main > div");
  expect(await content.evaluate((element) => parseFloat(getComputedStyle(element).paddingBottom))).toBeGreaterThanOrEqual(128);
  const finalCoachLine = page.getByText("🎯 What Comes Next", { exact: true }).locator("..");
  await finalCoachLine.scrollIntoViewIfNeeded();
  const box = await finalCoachLine.boundingBox();
  expect(box && box.y + box.height).toBeLessThan(780);
});

for (const width of [393, 390, 375, 360]) {
  test(`DEXA V1.4.5 protects labels and attached units at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.goto(simulated);
    for (const label of ["Visceral Fat", "A/G Ratio", "Trunk", "Arms", "Legs"]) {
      const row = page.locator(`[aria-label^="${label}: previous"]`).first();
    const labelCell = row.locator("[data-comparison-metric]");
      await expect(labelCell).toHaveText(label);
      expect(await labelCell.evaluate((element) => ({ clipped: element.scrollWidth > element.clientWidth, whiteSpace: getComputedStyle(element).whiteSpace }))).toEqual({ clipped: false, whiteSpace: "nowrap" });
    }
    const rmr = page.locator('[aria-label^="RMR: previous"]').first();
    const rmrValues = rmr.locator(":scope > div");
    await expect(rmrValues.nth(0)).toContainText("1809 cal/day");
    await expect(rmrValues.nth(1)).toContainText("1783 cal/day");
    for (const value of await rmrValues.all()) expect(await value.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
