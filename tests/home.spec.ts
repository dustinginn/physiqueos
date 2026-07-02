import { test } from "@playwright/test";
import fs from "fs";

test("capture homepage", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000");

  await page.waitForLoadState("networkidle");

  await page.screenshot({
    path: "screenshots/home.png",
    fullPage: false,
  });

  if (fs.existsSync("screenshots/home.png")) {
    console.log("✅ Screenshot saved to screenshots/home.png");
  }
});