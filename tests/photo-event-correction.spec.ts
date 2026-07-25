import { expect, test } from "@playwright/test";

const eventUrl = "/briefings/photo/photo_session_user_founder_001_2026-07-18";

for (const width of [360, 393]) {
  test(`corrected July 18 Photo Event fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.goto(eventUrl);
    await expect(page.getByRole("heading", { name: "The evidence supports the finish." })).toBeVisible();
    const journey = page.getByTestId("photo-event-journey-comparisons");
    await expect(journey).toContainText("From first upload to now");
    await expect(journey).toContainText("May 21");
    await expect(journey).toContainText("Jul 18");
    await expect(journey).toContainText("First uploaded");
    const recent = page.getByTestId("photo-event-recent-comparisons");
    await expect(recent).toContainText("Since last check-in");
    await expect(recent).toContainText("Jul 11");
    await expect(recent).toContainText("Jul 18");
    await page.getByTestId("journey-comparison-front-relaxed").click();
    await expect(page.getByTestId("photo-event-viewer")).toBeVisible();
    await expect(page.getByTestId("photo-event-viewer").getByText("First uploaded", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close viewer" }).click();
    const baselines = page.getByTestId("photo-event-new-baselines");
    const frontFlexed = baselines.getByTestId("new-pose-baseline").filter({ hasText: "Front flexed" });
    await expect(frontFlexed).toContainText("This front flexed view");
    await frontFlexed.click();
    await expect(page.getByTestId("photo-event-viewer")).toContainText("Front flexed");
    await page.getByRole("button", { name: "Close viewer" }).click();
    await expect(page.getByTestId("photo-event-user-decision").getByRole("button", { name: "Complete Goal" })).toBeVisible();
    await expect(page.getByTestId("photo-event-retry")).toHaveCount(0);
    const metrics = await page.evaluate(() => ({ viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport);
  });
}
