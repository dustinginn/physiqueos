import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createMidweekGoalConfidenceBlock } from "./MidweekBriefingService";

const confidence = {
  canonicalSeries: true, value: 58, band: "moderate", priorScore: 44,
  delta: 14, movementDirection: "increased", movementMagnitude: "material",
  primaryReason: "Training remained constructive while Energy remains incomplete.",
  supportingContributors: [
    { reason: "Training remained constructive.", userFacing: true },
    { reason: "Photos supported stable condition.", userFacing: true },
    { reason: "Hidden.", userFacing: false },
  ],
  limitingContributors: [
    { reason: "Energy evidence is incomplete.", userFacing: true },
    { reason: "Weight remains mixed.", userFacing: true },
  ],
  unresolvedUncertainty: ["Maintenance is not established."],
  assessmentId: "assessment", evidenceCutoff: "2026-07-26T06:59:59.999Z",
  source: "canonical_pi_snapshot", modelVersion: "pi_goal_confidence_assessment_v1",
  piVersion: "pi_v3", trace: { internalWeights: true },
};

describe("Midweek canonical confidence integration", () => {
  it("creates a bounded historical artifact block without internal scoring data", () => {
    const block = createMidweekGoalConfidenceBlock(confidence);
    expect(block).toMatchObject({
      score: 58, band: "moderate", priorScore: 44, delta: 14,
      movementDirection: "increased", movementMagnitude: "material",
      assessmentId: "assessment", source: "canonical_pi_snapshot",
    });
    expect(block.supportingReasons).toHaveLength(2);
    expect(block).not.toHaveProperty("trace");
    expect(JSON.stringify(block)).not.toMatch(/internalWeights|commitId|semanticDigest/);
  });

  it("keeps historical artifacts without canonical confidence valid", () => {
    expect(createMidweekGoalConfidenceBlock({
      canonicalSeries: false,
    })).toBeNull();
    const source = fs.readFileSync(
      "src/screens/MidweekBriefingScreen.jsx", "utf8");
    expect(source).toContain("briefing.goalConfidence&&");
    expect(source).not.toMatch(/44%|overall_goal_confidence_v1/);
  });

  it("uses the shared wheel, stable rendering, accessible text, and typed movement labels", () => {
    const source = fs.readFileSync(
      "src/components/briefings/BriefingConfidenceAnchor.jsx", "utf8");
    expect(source).toContain("ConfidenceRing");
    expect(source).toContain("animate={false}");
    expect(source).toContain("Goal confidence ${canonicalConfidence.score} percent");
    expect(source).toContain("▲ +");
    expect(source).toContain("— No change");
    expect(source).toContain("▼ −");
    expect(source).toContain("Initial assessment");
    expect(source).toContain("Movement unavailable");
    expect(source).not.toMatch(/confidence vector|evidence topology|cross-domain score/i);
  });

  it("does not import refresh or persistence into Midweek generation", () => {
    const source = fs.readFileSync(
      "src/domain/services/MidweekBriefingService.js", "utf8");
    expect(source).not.toMatch(/PIGoalConfidenceRefreshService|PIGoalConfidencePersistenceService/);
  });
});
