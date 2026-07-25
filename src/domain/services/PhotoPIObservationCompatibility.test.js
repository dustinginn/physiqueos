import { describe, expect, it } from "vitest";
import { createPhotoPIObservations } from "./PhotoPIObservationService";

const comparison = {
  currentSessionId: "session-current",
  comparisonSessionId: "session-prior",
  currentViewId: "view-current",
  comparisonViewId: "view-prior",
  currentDate: "2026-07-24",
  comparisonDate: "2026-07-17",
  poseId: "front-relaxed",
  comparisonPoseId: "front-relaxed",
  contractionState: "relaxed",
  comparisonContractionState: "relaxed",
  bodyView: "front",
  comparisonBodyView: "front",
  imageAvailable: true,
  comparisonImageAvailable: true,
  comparisonQuality: "high",
};

describe("Photo PI structured-semantics compatibility", () => {
  it("keeps legacy prose valid but PI-insufficient without parsing it", () => {
    const result = createPhotoPIObservations({
      comparisons: [{
        ...comparison,
        structuredFindings: [{
          region: "Midsection",
          change: "The waist looks tighter and definition improved.",
          confidence: "high",
        }],
      }],
    });
    expect(result.some((item) => item.kind === "photo_leanness_change")).toBe(false);
    expect(result.find((item) => item.kind === "photo_insufficient_comparison"))
      .toMatchObject({
        explanationData: {
          limitations: ["structured_photo_semantics_unavailable"],
        },
      });
  });

  it.each([
    ["increased", "rising"],
    ["decreased", "falling"],
    ["stable", "stable"],
  ])("maps explicit %s semantics to PI direction %s", (direction, expected) => {
    const result = createPhotoPIObservations({
      comparisons: [{
        ...comparison,
        structuredFindings: [{
          schemaVersion: "photo_interpretation_v2",
          metric: "leanness",
          direction,
          confidence: "moderate",
          change: "Display copy is independent.",
        }],
      }],
    });
    expect(result.find((item) => item.kind === "photo_leanness_change"))
      .toMatchObject({ direction: expected });
  });

  it("prefers explicit structured semantics in a mixed legacy record", () => {
    const result = createPhotoPIObservations({
      comparisons: [{
        ...comparison,
        structuredFindings: [
          { change: "Legacy prose says something unrelated." },
          {
            schemaVersion: "photo_interpretation_v2",
            metric: "whole_body_softness",
            direction: "increased",
            change: "Structured display copy.",
          },
        ],
      }],
    });
    expect(result.find((item) => item.kind === "photo_whole_body_softness_change"))
      .toMatchObject({ direction: "rising" });
  });
});
