import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const currentStatePath = path.join(
  repositoryRoot,
  "docs",
  "CONFIDENCE_V2_CURRENT_STATE.md",
);
const supersededDocuments = [
  "CONFIDENCE_ARCHITECTURE_V2.md",
  "CONFIDENCE_PUBLICATION_ARCHITECTURE_V2.md",
  "CONFIDENCE_V2_PRODUCTION_INTEGRATION.md",
  "CONFIDENCE_V2_PHASE_REVIEW_PRODUCTION_CUTOVER.md",
  "PHASE_REVIEW_PRODUCTION_BOUNDARY.md",
  "GOAL_CONTRACT_ARCHITECTURE_V2.md",
  "INTERPRETATION_ARCHITECTURE_V2.md",
  "ACTIVE_GOAL_PHASE_AWARE_PREVIEW.md",
];

describe("Confidence V2 current-state documentation", () => {
  it("records the canonical pipeline, publishers, non-publishers, compatibility, and retirement boundaries", () => {
    const document = fs.readFileSync(currentStatePath, "utf8");

    expect(document).toContain(
      "Goal Contract -> Interpretation -> Forecast -> Narrative -> numeric projection -> canonical assessment -> authorized publication -> persistence -> current/historical reads -> rendering",
    );
    for (const publisher of [
      "Goal initialization",
      "Midweek",
      "Weekly",
      "Monthly",
      "DEXA Event",
      "Qualifying Photo Event",
    ]) {
      expect(document).toContain(`- ${publisher}`);
    }
    for (const nonPublisher of [
      "Daily",
      "Energy",
      "Training",
      "Nutrition",
      "Activity",
      "Weight",
      "Recovery",
      "raw evidence uploads",
    ]) {
      expect(document).toContain(nonPublisher);
    }
    expect(document).toContain("ActiveGoalConfidencePresentationReadService");
    expect(document).toContain("ConfidenceV1CompatibilityAdapter");
    expect(document).toContain("MonthlyPersistedArtifactCompatibilityService");
    expect(document).toContain("August 15 DEXA Phase Review path is production-ready");
    expect(document).toContain("After August 15 candidates");
    expect(document).toContain("After iOS candidates");
    expect(document).toContain("Dead-code inventory");
  });

  it.each(supersededDocuments)(
    "marks %s historical or superseded and links to the current state",
    (filename) => {
      const document = fs.readFileSync(
        path.join(repositoryRoot, "docs", filename),
        "utf8",
      );

      expect(document).toMatch(/historical|superseded/i);
      expect(document).toContain("2026-08-03");
      expect(document).toContain("CONFIDENCE_V2_CURRENT_STATE.md");
      expect(document).toMatch(/do not (use|treat|execute)/i);
    },
  );

  it("names the active presentation owner and not the legacy owner in the active-goal record", () => {
    const document = fs.readFileSync(
      path.join(repositoryRoot, "docs", "ACTIVE_GOAL_PHASE_AWARE_PREVIEW.md"),
      "utf8",
    );

    expect(document).toContain("ActiveGoalConfidencePresentationReadService");
    expect(document).not.toContain("owned by `OverallGoalConfidenceReadService`");
  });
});
