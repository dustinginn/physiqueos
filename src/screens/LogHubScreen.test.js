import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(new URL("./LogHubScreen.jsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/log/page.js", import.meta.url), "utf8");

describe("Log Hub Logged Today presentation", () => {
  it("renders the compact summary above existing logging actions", () => {
    expect(screen.indexOf("<LoggedTodayCard")).toBeLessThan(
      screen.indexOf("<UploadAnythingCard")
    );
    expect(screen).toContain("Logged Today");
    expect(screen).toContain("summary.rows.map");
    expect(screen).toContain("min-h-16");
    expect(screen).toContain("min-w-0");
  });

  it("keeps existing upload and pending-review navigation intact", () => {
    expect(screen).toContain("<UploadAnythingForm action={action}>");
    expect(screen).toContain("`/evidence/review/${review.id}`");
    expect(route).toContain('uploadAnythingAction="/log/upload"');
  });

  it("loads the summary through a read-only canonical service", () => {
    expect(route).toContain("createLoggedTodayService");
    expect(route).toContain("loggedToday={loggedToday}");
    expect(route).not.toContain("createTraining");
    expect(route).not.toContain("createNutrition");
    expect(route).not.toContain("createActivity");
  });
});
