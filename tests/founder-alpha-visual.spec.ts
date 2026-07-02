import { test } from "@playwright/test";

const pages = [
  { name: "evidence-hub", path: "/progress" },
  { name: "dexa-report", path: "/progress/dexa" },
  { name: "photos-report", path: "/progress/photos" },
  { name: "home", path: "/" },
];

for (const theme of ["light", "dark"]) {
  test.describe(`Founder Alpha visual smoke / ${theme}`, () => {
    for (const pageConfig of pages) {
      test(`captures ${pageConfig.name}`, async ({ page }) => {
        await page.addInitScript((preferredTheme) => {
          window.localStorage.setItem("physiqueos-theme", preferredTheme);
        }, theme);
        await page.goto(`http://127.0.0.1:3000${pageConfig.path}`);
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          fullPage: false,
          path: `screenshots/${pageConfig.name}-${theme}.png`,
        });
      });
    }
  });
}
