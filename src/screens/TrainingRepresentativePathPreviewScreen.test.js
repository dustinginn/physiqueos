import fs from "node:fs";
import { describe, expect, it } from "vitest";

const preview = fs.readFileSync(
  new URL("./TrainingRepresentativePathPreviewScreen.jsx", import.meta.url),
  "utf8"
);
const canonical = fs.readFileSync(
  new URL("./TrainingKnowledgeScreen.jsx", import.meta.url),
  "utf8"
);

describe("canonical Training presentation reuse", () => {
  it("reduces the representative preview to the canonical screen plus selector", () => {
    expect(preview).toContain("<TrainingKnowledgeScreen");
    expect(preview).toContain("<TrainingTimelineSelector");
    expect(preview).not.toMatch(
      /Movement reference|Period Baseline|Period Latest|Period Trend|Current Standing|Open complete production history/
    );
  });

  it("injects the selector without changing production output when the prop is absent", () => {
    expect(canonical).toContain("trainingEvidenceContext?.selector ?? null");
    expect(canonical).toContain("trainingEvidenceContext?.adaptHref?.");
    expect(canonical).toContain("showSourceWorkouts = true");
    expect(canonical).toContain("<TrainingLibraryHeader");
    expect(canonical).toContain("<MobilePageHeader");
  });

  it("suppresses Source Workouts only on the Spider Curl preview", () => {
    expect(preview).toContain('showSourceWorkouts: view !== "spider"');
    expect(canonical).toContain("showSourceWorkouts && (");
    expect(canonical).toContain("<ExerciseHistoryCard");
    expect(canonical).toContain("<ExerciseMetadataFooter");
  });
});
