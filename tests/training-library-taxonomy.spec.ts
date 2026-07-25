import { expect, test } from "@playwright/test";

test("Training Library surfaces each corrected exercise in one primary category", async ({
  page,
}) => {
  await page.goto("/progress/training/library/quads");
  await expect(page.getByText("Bulgarian Split Squat (Smith Machine)", { exact: true })).toBeVisible();
  await expect(page.getByText("Leg Extensions", { exact: true })).toBeVisible();
  await expect(page.getByText("Seated Hip Abductions", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Leg Press (Feet Middle)", { exact: true })).toBeVisible();
  await expect(page.getByText("Leg Press (Sumo Stance)", { exact: true })).toBeVisible();
  await expect(page.getByText("Pendulum Squat Machine", { exact: true })).toBeVisible();
  await expect(page.getByText("Glute Squats", { exact: true })).toHaveCount(0);

  await page.goto("/progress/training/library/glutes");
  await expect(page.getByText("Glute Squats", { exact: true })).toBeVisible();
  await expect(page.getByText("Hyperextension Machine", { exact: true })).toBeVisible();
  await expect(page.getByText("Romanian Deadlifts", { exact: true })).toBeVisible();
  await expect(page.getByText("Glute Squats", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Hyperextension Machine", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Romanian Deadlifts", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Seated Hip Abductions", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Seated Hip Adductions", { exact: true })).toBeVisible();

  await page.goto("/progress/training/library/hamstrings");
  await expect(page.getByText("Lying Leg Curls", { exact: true })).toBeVisible();
  await expect(page.getByText("Lying Leg Curls", { exact: true })).toHaveCount(1);

  await page.goto("/progress/training/library/biceps");
  await expect(page.getByText("Lying Leg Curls", { exact: true })).toHaveCount(0);

  for (const category of ["quads", "hamstrings", "back", "biceps"]) {
    await page.goto(`/progress/training/library/${category}`);
    await expect(page.getByText("Hyperextension Machine", { exact: true })).toHaveCount(0);
  }
});
