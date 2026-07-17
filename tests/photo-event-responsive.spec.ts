import { expect, test } from "@playwright/test";

const route = "/briefings/photo/photo_session_user_founder_001_2026-07-11";

for (const viewport of [
  { name: "360px mobile", width: 360, height: 780 },
  { name: "393px mobile", width: 393, height: 852 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
]) {
  test(`Photo Event preserves its mobile composition at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(route);
    await expect(page.getByTestId("photo-event-hero")).toBeVisible();
    await expect(page.getByTestId("photo-event-snapshot")).toBeVisible();
    await expect(page.getByTestId("photo-event-progress")).toBeVisible();
    const canvas = page.locator("main");
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox?.width).toBeLessThanOrEqual(393);
    expect(Math.abs((viewport.width - (canvasBox?.width ?? 0)) / 2 - (canvasBox?.x ?? 0))).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await page.locator("main > div").evaluate((element) => parseFloat(getComputedStyle(element).paddingBottom))).toBeGreaterThanOrEqual(128);
    const gallery = page.getByTestId("photo-event-snapshot").locator("button");
    await expect(gallery).toHaveCount(3);
  });
}
