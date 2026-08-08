import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createBriefingGoalConfidenceBlock } from "./BriefingGoalConfidencePresentationService";
import { confidenceHeadline, movementLabel } from "../../components/briefings/BriefingConfidenceAnchor";

const canonical = {
  canonicalSeries: true, source: "canonical_pi_snapshot",
  value: 58, band: "moderate", priorScore: 44, delta: 14,
  movementDirection: "increased", movementMagnitude: "material",
  primaryReason: "Confidence increased because training remained constructive while energy remains incomplete.",
  supportingContributors: [
    { reason: "Training remained constructive.", userFacing: true },
    { reason: "Photos supported stable condition.", userFacing: true },
    { reason: "Internal contributor.", userFacing: false },
  ],
  limitingContributors: [
    { reason: "Energy evidence remains incomplete.", userFacing: true },
    { reason: "Weight remains mixed.", userFacing: true },
  ],
  unresolvedUncertainty: ["Maintenance calibration is not yet conclusive."],
  assessmentId: "assessment-58", goalId: "goal-build",
  phaseId: "phase-maintenance", operatingState: "calibration",
  evidenceCutoff: "2026-07-26T06:59:59.999Z",
  assessmentTimestamp: "2026-07-26T17:21:41.904Z",
  modelVersion: "pi_goal_confidence_assessment_v1", piVersion: "pi_v3",
  scoringTrace: { coefficients: [1, 2] }, semanticDigest: "private",
  commitId: "private",
};

describe("Weekly canonical confidence integration", () => {
  it("maps one bounded, provenance-safe generation-time artifact contract", () => {
    const block = createBriefingGoalConfidenceBlock(canonical, {
      capturedAt: "2026-07-27T01:00:00.000Z",
    });
    expect(block).toMatchObject({
      score: 58, band: "moderate", priorScore: 44, delta: 14,
      movementDirection: "increased", assessmentId: "assessment-58",
      source: "canonical_pi_snapshot",
      captureSemantics: "canonical_assessment_at_briefing_generation",
      assessmentContext: {
        goalId: "goal-build", phaseId: "phase-maintenance",
        operatingState: "calibration",
      },
    });
    expect(block.supportingReasons).toHaveLength(2);
    expect(block.limitingReasons).toHaveLength(2);
    expect(JSON.stringify(block)).not.toMatch(
      /scoringTrace|coefficients|semanticDigest|commitId|revision/
    );
  });

  it("omits unavailable and legacy confidence instead of fabricating 44", () => {
    expect(createBriefingGoalConfidenceBlock({
      ...canonical, canonicalSeries: false,
    })).toBeNull();
    expect(createBriefingGoalConfidenceBlock({
      ...canonical, source: "legacy_overall_goal_confidence",
    })).toBeNull();
  });

  it("presents every movement state in text and explains movement plainly", () => {
    expect(movementLabel(canonical)).toBe("▲ +14");
    expect(movementLabel({ movementDirection: "held" })).toBe("— No change");
    expect(movementLabel({ movementDirection: "decreased", delta: -4 })).toBe("▼ −4");
    expect(movementLabel({ movementDirection: "initial" })).toBe("Initial assessment");
    expect(movementLabel({ movementDirection: "unknown" })).toBe("Movement unavailable");
    expect(confidenceHeadline({
      ...canonical,
      supportingReasons: ["Training stayed constructive."],
      limitingReasons: ["Energy remains incomplete."],
    })).toBe(canonical.primaryReason);
  });

  it("keeps Weekly generation consumption-only and historical confidence optional", () => {
    const service = fs.readFileSync("src/domain/services/WeeklyNarrativeService.js", "utf8");
    const screen = fs.readFileSync("src/screens/WeeklyBriefingScreen.jsx", "utf8");
    expect(service).toContain("resolveActiveGoalConfidencePresentation");
    expect(service).toContain("createBriefingGoalConfidenceBlock");
    expect(service).not.toMatch(/PIGoalConfidenceRefreshService|PIGoalConfidencePersistenceService/);
    expect(screen).toMatch(/presentation\.hero\.confidence\s*&&/);
    expect(screen).not.toMatch(/44%|overall_goal_confidence_v1/);
  });

  it("reuses one non-animating accessible wheel across Midweek and Weekly", () => {
    const anchor = fs.readFileSync("src/components/briefings/BriefingConfidenceAnchor.jsx", "utf8");
    const midweek = fs.readFileSync("src/screens/MidweekBriefingScreen.jsx", "utf8");
    const weekly = fs.readFileSync("src/screens/WeeklyBriefingScreen.jsx", "utf8");
    expect(anchor).toContain("ConfidenceRing");
    expect(anchor).toContain("animate={false}");
    expect(anchor).toContain("Goal confidence ${canonicalConfidence.score} percent");
    expect(midweek).toContain("BriefingConfidenceAnchor");
    expect(weekly).toContain("BriefingConfidenceAnchor");
  });
});
