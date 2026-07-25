import { expect, test } from "@playwright/test";

for (const width of [360, 393]) {
  test(`Final Photo Event completion controls fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.goto("http://127.0.0.1:3000/lab/photo-completion");
    await expect(page.getByRole("heading", { name: "You did it." })).toBeVisible();
    const journeyComparison = page.getByTestId("photo-event-journey-comparison");
    await expect(journeyComparison).toBeVisible();
    await expect(journeyComparison.getByAltText("Previous Front Relaxed")).toBeVisible();
    await expect(journeyComparison.getByAltText("Final Front Relaxed")).toBeVisible();
    const decision = page.getByTestId("photo-event-user-decision");
    await expect(decision).toBeVisible();
    await expect(decision.getByRole("button", { name: "Complete Goal" })).toBeVisible();
    await expect(decision.getByRole("link", { name: "Keep Goal Open" })).toBeVisible();
    const metrics = await page.evaluate(() => ({ viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport);
    for (const control of [decision.getByRole("button", { name: "Complete Goal" }), decision.getByRole("link", { name: "Keep Goal Open" })]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(48);
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    }
  });
}

test("Post-completion Photo Event celebrates and leaves next-goal creation inactive", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/lab/photo-completion?completed=1");
  await expect(page.getByTestId("photo-event-completed")).toContainText("Visible Abs at Rest is complete.");
  const preview = page.getByTestId("next-goal-preview");
  await expect(preview).toContainText("Build Lean Mass while maintaining 8–9% body fat");
  const button = preview.getByRole("button", { name: /Create Next Goal.*Coming next/i });
  await expect(button).toBeDisabled();
  await expect(page.getByTestId("photo-event-user-decision")).toHaveCount(0);
});

test("Existing ordinary Photo Event remains an ordinary update", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/briefings/photo/photo_session_user_founder_001_2026-07-11");
  await expect(page.getByTestId("photo-event-hero")).toBeVisible();
  await expect(page.getByTestId("photo-event-user-decision")).toHaveCount(0);
  await expect(page.getByTestId("next-goal-preview")).toHaveCount(0);
});
