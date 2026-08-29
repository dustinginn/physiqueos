import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(new URL("./LogHubScreen.jsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/log/page.js", import.meta.url), "utf8");
const readService = fs.readFileSync(
  new URL("../application/log/LogReadService.js", import.meta.url),
  "utf8"
);

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
    expect(screen).toContain("<UploadAnythingForm");
    expect(screen).toContain("action={action}");
    expect(screen).toContain("directWeighInAction={directWeighInAction}");
    expect(screen).toContain("`/evidence/review/${review.id}`");
    expect(route).toContain('uploadAnythingAction="/log/upload"');
  });

  it("places direct weigh-in inside the existing Log upload experience", () => {
    expect(route).toContain('import { saveDirectWeighIn } from "./actions"');
    expect(route).toContain("directWeighInAction={saveDirectWeighIn}");
    expect(route).toContain("defaultLogDate={log.localDate}");
    expect(screen).toContain("defaultDate={recoveryContext?.date ?? defaultDate}");
    expect(screen.indexOf("<UploadAnythingForm")).toBeLessThan(
      screen.indexOf("Upload files")
    );
    expect(screen.indexOf("Upload files")).toBeLessThan(
      screen.indexOf("</UploadAnythingForm>")
    );
  });

  it("loads the summary through a read-only canonical service", () => {
    expect(route).toContain("createLogReadService");
    expect(readService).toContain("createLoggedTodayService");
    expect(route).toContain("loggedToday={log.loggedToday}");
    expect(route).not.toContain("createTraining");
    expect(route).not.toContain("createNutrition");
    expect(route).not.toContain("createActivity");
  });
});
