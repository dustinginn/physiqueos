import { expect, test } from "@playwright/test";

const latestDexaEvent = "/briefings/dexa/evidence_submission_20260718144114116_pdf_1_2026_07_18";

test("latest DEXA event ends the numerical cut and hands off to photo confirmation", async ({ page }) => {
  await page.goto(`http://127.0.0.1:3000${latestDexaEvent}`);
  await expect(page.getByText(/This scan likely marks the numerical finish line of the cut/i)).toBeVisible();
  await expect(page.getByText(/Measured lean tissue increased 1\.3 lb since the last scan/i)).toBeVisible();
  await expect(page.getByText(/Barring your own visual assessment and the relaxed photo confirmation, the evidence indicates this goal is complete/i)).toBeVisible();
  await expect(page.getByText("Ready to upload progress photos for visual confirmation?", { exact: true })).toBeVisible();
  const action = page.getByRole("link", { name: /Upload Progress Photos/i });
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute("href", /confirmationPurpose=visible_abs_completion/);
  await expect(action).toHaveAttribute("href", /numericalThresholdComplete=true/);
  await expect(action).toHaveAttribute("href", /visualCriterionComplete=uncertain/);
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/moved you closer|wait for the next DEXA|measured lean tissue declined|training across \d+ days|\d+ progress-photo check-ins?|\d+ complete nutrition days/i);
});

for (const viewport of [
  { name: "360px", width: 360, height: 800 },
  { name: "393px", width: 393, height: 852 },
  { name: "current iPhone", width: 390, height: 844 },
]) {
  test(`Home terminal goal rows are fully stacked without overlap at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("http://127.0.0.1:3000/");
    const rows = page.locator('[data-goal-layout="stacked"]');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Lower abs→Visible at rest");
    await expect(rows.nth(0)).toContainText("Awaiting visual confirmation");
    await expect(rows.nth(0)).toContainText("DEXA threshold reached");
    await expect(rows.nth(1)).toContainText("7.7% current→8–9% range");
    await expect(rows.nth(1)).toContainText("Ready for next phase");
    await expect(rows.nth(1)).toContainText("Currently below target range");
    await expect(rows.nth(2)).toContainText("149.1 lb baseline→Preserve");
    await expect(rows.nth(2)).toContainText("Achieved");
    await expect(rows.nth(2)).toContainText("147.5 lb latest · −1.6 lb");

    for (let index = 0; index < 3; index += 1) {
      const row = rows.nth(index);
      await expect(row).toHaveAttribute("href", /\/goals\//);
      const blocks = row.locator("h3, p");
      const boxes = await blocks.evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { top: box.top, bottom: box.bottom, overflow: style.overflow, textOverflow: style.textOverflow };
      }));
      for (let blockIndex = 1; blockIndex < boxes.length; blockIndex += 1) {
        expect(boxes[blockIndex].top).toBeGreaterThanOrEqual(boxes[blockIndex - 1].bottom - 1);
      }
      expect(boxes.every((box) => box.textOverflow !== "ellipsis")).toBe(true);
    }
  });
}

test("goal pages and contextual upload agree with terminal states", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/goals/visible-abs");
  await expect(page.getByText(/Awaiting Visual Confirmation/i).first()).toBeVisible();
  await expect(page.getByText(/qualified relaxed photo set is the final visual check/i)).toBeVisible();

  await page.goto("http://127.0.0.1:3000/goals/maintenance");
  await expect(page.getByText(/Ready for Next Phase/i).first()).toBeVisible();
  await expect(page.getByText(/7\.7%.*below the 8–9% maintenance range/i).first()).toBeVisible();

  await page.goto("http://127.0.0.1:3000/goals/lean-mass");
  await expect(page.getByText(/Achieved/i).first()).toBeVisible();
  await expect(page.getByText(/149\.1 lb/).first()).toBeVisible();
  await expect(page.getByText(/147\.5 lb/).first()).toBeVisible();
  await expect(page.getByText(/−1\.6 lb/).first()).toBeVisible();

  await page.goto("http://127.0.0.1:3000/evidence/photos?confirmationPurpose=visible_abs_completion&numericalThresholdComplete=true&requestedEvidence=relaxed_front_photo&sourceContext=dexa_event");
  await expect(page.getByText("Visual confirmation request")).toBeVisible();
  await expect(page.getByText(/DEXA threshold is complete/i)).toBeVisible();
});
