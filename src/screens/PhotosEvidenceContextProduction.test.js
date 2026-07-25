import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(
  new URL("./ProgressPlaceholderScreen.jsx", import.meta.url),
  "utf8"
);
const gallery = fs.readFileSync(
  new URL("../components/progress/ProgressPhotoGallery.jsx", import.meta.url),
  "utf8"
);
const route = fs.readFileSync(
  new URL("../app/progress/photos/page.js", import.meta.url),
  "utf8"
);

describe("Photos Evidence Context production presentation", () => {
  it("uses the canonical production route and shared selector", () => {
    expect(route).toContain("getPhotosTimelineReport");
    expect(route).toContain("<ProgressPlaceholderScreen");
    expect(screen).toContain('ariaLabel="Photos evidence context"');
    expect(screen).toContain('currentPath="/progress/photos"');
  });

  it("removes Related Goals only from Photos", () => {
    expect(screen).toContain('report.id !== "photos" &&');
    expect(screen).toContain('mode="related-goals"');
  });

  it("preserves briefing, gallery, complete session views, and existing styling", () => {
    expect(gallery).toContain("Read Photo Briefing");
    expect(gallery).toContain("selectedSessionRecords");
    expect(gallery).toContain("Open gallery");
    expect(gallery).not.toContain("TrainingTimelineSelector");
    expect(gallery).not.toMatch(/goal tag|baseline badge/i);
  });
});
