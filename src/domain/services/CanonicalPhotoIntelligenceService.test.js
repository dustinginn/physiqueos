import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalPhotoIntelligenceFromBlindResult,
  createCanonicalPhotoIntelligenceResult,
  createCanonicalPhotoIntelligenceFromSession,
} from "./CanonicalPhotoIntelligenceService.js";

const readCase = (number) => JSON.parse(readFileSync(new URL(
  `../../../agent-handoffs/photo-intelligence/founder-cases/case-${number}-${number === 1 ? "2026-05-21-to-2026-07-18" : "2026-07-19-to-2026-09-19"}-BLIND-pre-human-reference.json`,
  import.meta.url,
), "utf8"));

describe("Canonical Photo Intelligence", () => {
  it("calibrates the obvious multi-region Case 1 replay to major", () => {
    const frozen = readCase(1);
    const before = JSON.stringify(frozen);
    const result = canonicalPhotoIntelligenceFromBlindResult(frozen);
    expect(result.overallMagnitude).toBe("major");
    expect(result.magnitudeCalibration).toMatchObject({
      reportedMagnitude: "moderate",
      promotionApplied: true,
      subtleFindingsCannotPromote: true,
    });
    expect(result.resultLabel).toMatch(/SECOND PASS.*POST-REVEAL/);
    expect(result.exactPhotoBriefingCopy).toMatch(/clear visual transformation/i);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it("preserves the subtle Case 2 call and removes routine capture coaching", () => {
    const result = canonicalPhotoIntelligenceFromBlindResult(readCase(2));
    expect(result.overallMagnitude).toBe("subtle");
    expect(result.magnitudeCalibration.promotionApplied).toBe(false);
    expect(result.exactPhotoBriefingCopy).not.toMatch(/next matched|photo.*confirm/i);
    expect(result.exactPhotoBriefingCopy).toMatch(/visible change is subtle/i);
  });

  it("has a complete photo-only contract with stable output independent of holistic context", () => {
    const input = {
      caseId: "held-out-shape",
      baselineDate: "2026-01-01",
      comparisonDate: "2026-02-01",
      visualChange: {
        overallApparentMagnitude: "subtle",
        regions: [{
          region: "whole_body", metric: "shape", direction: "improved",
          apparent_magnitude: "subtle", confidence: "high", observation: "Small difference.",
        }],
      },
      confidenceAndLimitations: { overallReliability: "high" },
      unsupportedConclusions: ["causation"],
      photoBriefingCopy: "Small visual difference.",
    };
    const first = createCanonicalPhotoIntelligenceResult(input);
    const second = createCanonicalPhotoIntelligenceResult(structuredClone(input));
    expect(second).toEqual(first);
    expect(first.provenance).toMatchObject({
      evidenceClass: "photo_only", nonPhotoEvidenceUsed: false,
    });
    expect(first).toHaveProperty("comparability");
    expect(first).toHaveProperty("observations");
    expect(first).toHaveProperty("unsupportedConclusions");
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("does not promote mixed, opposing, or isolated pronounced findings", () => {
    const base = {
      reportedMagnitude: "pronounced",
      overallReliability: "high",
    };
    const finding = (region, direction, magnitude = "moderate", confidence = "high") => ({
      region, metric: "muscularity", direction,
      apparentMagnitude: magnitude, confidence,
    });
    const single = createCanonicalPhotoIntelligenceResult({
      caseId: "single", baselineDate: "2026-01-01", comparisonDate: "2026-02-01",
      visualChange: { overallApparentMagnitude: base.reportedMagnitude, regions: [
        finding("chest", "increased", "pronounced", "low"),
      ] },
      confidenceAndLimitations: { overallReliability: base.overallReliability },
    });
    expect(single.overallMagnitude).toBe("moderate");

    const opposed = createCanonicalPhotoIntelligenceResult({
      caseId: "opposed", baselineDate: "2026-01-01", comparisonDate: "2026-02-01",
      visualChange: { overallApparentMagnitude: "moderate", regions: [
        finding("overall_silhouette", "increased"),
        finding("one", "increased"), finding("two", "increased"),
        finding("three", "decreased"), finding("four", "decreased"),
        finding("five", "mixed"),
      ] },
      confidenceAndLimitations: { overallReliability: "high" },
    });
    expect(opposed.overallMagnitude).toBe("moderate");
    expect(opposed.magnitudeCalibration.promotionApplied).toBe(false);
  });

  it("emits a photo-only goal-relative direction for production sessions", () => {
    const result = createCanonicalPhotoIntelligenceFromSession({
      goalContext: { activeGoal: { id: "lean-mass", title: "Build Lean Mass" } },
      session: {
        id: "session", captureDate: "2026-09-19", synthesis: { observations: [] },
        views: [{
          poseId: "front-relaxed", canonicalPhotoId: "current",
          comparisonStatus: "comparable", conditionDifferences: [],
          comparison: {
            previousDate: "2026-07-19", previousCanonicalViewId: "prior",
            previousSessionId: "prior-session",
          },
          structuredFindings: [{
            region: "chest", metric: "fullness", direction: "increased",
            magnitude: "subtle", confidence: "moderate",
            change: "Chest fullness appears subtly increased.",
          }],
        }],
      },
    });
    expect(result.goalRelativeInterpretation).toMatchObject({
      direction: "supportive", strength: "emerging_visual_support",
    });
    expect(result.goalRelativeInterpretation.interpretation).toMatch(/photo-only.*Build Lean Mass/i);
    expect(result.provenance.nonPhotoEvidenceUsed).toBe(false);
  });

  it("keeps counter-directional and mixed strategy implications semantically aligned", () => {
    const produce = (findings) => createCanonicalPhotoIntelligenceFromSession({
      goalContext: { activeGoal: { id: "lean-mass", title: "Build Lean Mass" } },
      session: {
        id: "session", captureDate: "2026-09-19", synthesis: { observations: [] },
        views: [{
          poseId: "front-relaxed", canonicalPhotoId: "current",
          comparisonStatus: "comparable", conditionDifferences: [],
          comparison: { previousDate: "2026-07-19" },
          structuredFindings: findings,
        }],
      },
    });
    const counter = produce([{
      region: "chest", metric: "fullness", direction: "decreased",
      magnitude: "moderate", confidence: "high", change: "Chest fullness decreased.",
    }]);
    expect(counter.goalRelativeInterpretation).toMatchObject({
      direction: "counter_directional",
    });
    expect(counter.goalRelativeInterpretation.photoOnlyStrategyImplication)
      .toMatch(/^Treat this as counter-directional photo evidence/i);
    expect(counter.goalRelativeInterpretation.photoOnlyStrategyImplication)
      .not.toMatch(/supporting evidence/i);

    const mixed = produce([{
      region: "chest", metric: "fullness", direction: "increased",
      magnitude: "moderate", confidence: "high", change: "Chest fullness increased.",
    }, {
      region: "waist", metric: "waist_size", direction: "increased",
      magnitude: "moderate", confidence: "high", change: "Waist size increased.",
    }]);
    expect(mixed.goalRelativeInterpretation).toMatchObject({ direction: "mixed" });
    expect(mixed.goalRelativeInterpretation.photoOnlyStrategyImplication)
      .toMatch(/^Treat this as mixed photo evidence/i);
  });
});
