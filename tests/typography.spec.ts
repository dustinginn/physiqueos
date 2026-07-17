import { expect, test } from "@playwright/test";

const routes = ["/", "/briefing/daily", "/goals", "/progress", "/log"];

test("Plus Jakarta Sans is loaded globally from a local WOFF2 asset", async ({ page, request }) => {
  const fontResponses: Array<{ contentType: string; status: number; url: string }> = [];
  page.on("response", (response) => {
    if (/\.woff2(?:\?|$)/.test(response.url())) {
      fontResponses.push({
        contentType: response.headers()["content-type"] ?? "",
        status: response.status(),
        url: response.url(),
      });
    }
  });

  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  const typography = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const family = root.getPropertyValue("--font-sans").trim();
    const primaryFamily = family.split(",")[0].trim();
    return {
      bodyFamily: body.fontFamily,
      family,
      rootClass: document.documentElement.className,
      weights: [500, 700, 800].map((weight) => document.fonts.check(`${weight} 16px ${primaryFamily}`)),
    };
  });

  expect(typography.rootClass).toMatch(/plusJakarta|plus_jakarta/i);
  expect(typography.family).toBeTruthy();
  const normalizeFamily = (value: string) => value.replaceAll('"', "").replace(/\s+/g, " ").trim();
  expect(normalizeFamily(typography.bodyFamily)).toBe(normalizeFamily(typography.family));
  expect(typography.bodyFamily).not.toMatch(/Arial/i);
  expect(typography.weights).toEqual([true, true, true]);
  expect(fontResponses.length).toBeGreaterThan(0);
  expect(fontResponses.every((response) => response.status === 200)).toBe(true);
  expect(fontResponses.every((response) => /font\/woff2|application\/font-woff2|application\/octet-stream/i.test(response.contentType))).toBe(true);

  const fontResponse = await request.get(fontResponses[0].url);
  expect(fontResponse.status()).toBe(200);
});

for (const route of routes) {
  test(`${route} inherits the loaded global font`, async ({ page }) => {
    await page.goto(route);
    const result = await page.locator("body").evaluate((body) => {
      const bodyFamily = getComputedStyle(body).fontFamily;
      const sample = body.querySelector("h1, h2, p, a, button");
      return { bodyFamily, sampleFamily: sample ? getComputedStyle(sample).fontFamily : null };
    });
    expect(result.bodyFamily).not.toMatch(/Arial/i);
    expect(result.sampleFamily).toBe(result.bodyFamily);
  });
}
