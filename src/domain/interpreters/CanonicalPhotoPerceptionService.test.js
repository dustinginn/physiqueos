import { describe, expect, it } from "vitest";
import {
  CANONICAL_PHOTO_PERCEPTION_PROMPT_VERSION,
  CANONICAL_PHOTO_PERCEPTION_VERSION,
  PHOTO_ONLY_CONTEXT_BOUNDARY,
  assertProspectivePhotoPerceptionSource,
  getCanonicalPhotoPerceptionSystemPrompt,
  getCanonicalPhotoPerceptionUserPrompt,
  interpretFrozenPhotoPerceptionForGoal,
  normalizeCanonicalPhotoPerception,
  stablePerceptionProjection,
} from "./CanonicalPhotoPerceptionService.js";

const visibleAbs = { activeGoal: { title: "Visible Abs" } };
const buildLeanMass = {
  activeGoal: { title: "Build Lean Mass" },
  guardrail: { bodyFatPercentage: "accepted_range" },
};

describe("Canonical Photo Perception goal boundary", () => {
  it("keeps the model prompt photo-only and exposes no Goal parameter", () => {
    const system = getCanonicalPhotoPerceptionSystemPrompt();
    const user = getCanonicalPhotoPerceptionUserPrompt({
      captureDate: "2026-09-19",
      photoSetId: "set",
      photos: [{
        fileName: "current.jpg", dataUrl: "private", view: "front", pose: "relaxed",
        conditions: { postWorkout: true, notes: "Active Goal: Visible Abs" },
      }],
      previousPhotoSet: { captureDate: "2026-08-22", photos: [{ fileName: "prior.jpg", dataUrl: "private", view: "front", pose: "relaxed" }] },
      comparisonMetadata: { match_status: "exact_match" },
    });
    expect(system).toContain("goal-blind");
    expect(system).toContain("Stable, no obvious deterioration, and insufficient directional evidence are valuable results");
    expect(user).not.toContain("Visible Abs");
    expect(user).not.toContain("Build Lean Mass");
    expect(user).not.toContain("Active Goal");
    expect(user).toContain('"postWorkout": true');
    expect(user).not.toContain("private");
  });

  it.each([
    {
      name: "stable waist and subtly increased upper-body fullness",
      observations: [
        observation("waist", "leanness", "stable", "none", "Waist leanness appears stable."),
        observation("upper body", "muscularity", "increased", "subtle", "Upper-body fullness subtly increased."),
      ],
      visible: { direction: "neutral", copy: "Leanness appears maintained" },
      build: { direction: "supportive", copy: "supportive of the build" },
    },
    {
      name: "increased waist softness and muscularity",
      observations: [
        observation("waist", "whole_body_softness", "increased", "moderate", "Waist softness visibly increased."),
        observation("upper body", "muscularity", "increased", "moderate", "Muscularity visibly increased."),
      ],
      visible: { direction: "counter_directional", copy: "counter-directional" },
      build: { direction: "mixed", copy: "mixed for the build" },
    },
    {
      name: "leaner waist and stable muscularity",
      observations: [
        observation("waist", "leanness", "increased", "moderate", "Waist appears visibly leaner."),
        observation("upper body", "muscularity", "stable", "none", "Muscularity appears stable."),
      ],
      visible: { direction: "supportive", copy: "visually leaner" },
      build: { direction: "neutral", copy: "do not show a clear build signal" },
    },
  ])("keeps perception byte-identical across Goal swap: $name", ({ observations, visible, build }) => {
    const perception = fixture(observations);
    const before = stablePerceptionProjection(perception);
    const blind = interpretFrozenPhotoPerceptionForGoal(perception, null);
    const visibleResult = interpretFrozenPhotoPerceptionForGoal(perception, visibleAbs);
    const buildResult = interpretFrozenPhotoPerceptionForGoal(perception, buildLeanMass);

    expect(stablePerceptionProjection(perception)).toBe(before);
    expect(visibleResult.perceptionFingerprint).toBe(before);
    expect(buildResult.perceptionFingerprint).toBe(before);
    expect(blind.direction).toBe("goal_blind");
    expect(visibleResult.direction).toBe(visible.direction);
    expect(visibleResult.interpretation).toContain(visible.copy);
    expect(buildResult.direction).toBe(build.direction);
    expect(buildResult.interpretation).toContain(build.copy);
  });

  it("preserves observation-specific comparability and stable findings", () => {
    const perception = fixture([
      observation("waist", "leanness", "stable", "none", "No obvious waist deterioration.", {
        rating: "good",
        applicable_claims: ["broad stability"],
        compromised_claims: ["subtle waist-width change"],
        rationale: "Framing differs, so broad stability is more reliable than a small width claim.",
      }),
    ], {
      overall: "moderate",
      dimensions: [
        { dimension: "framing_and_scale", rating: "limited", reason: "Camera distance differs." },
        { dimension: "pose", rating: "good", reason: "The relaxed pose matches." },
      ],
      confounders: ["camera distance"],
    });
    expect(perception.observations[0]).toMatchObject({ direction: "stable", magnitude: "none" });
    expect(perception.observations[0].comparability).toMatchObject({
      rating: "good",
      applicableClaims: ["broad stability"],
      compromisedClaims: ["subtle waist-width change"],
    });
    expect(perception.captureComparability.overall).toBe("moderate");
  });

  it("rejects schema-13/legacy goal-aware analysis as a prospective source", () => {
    expect(() => assertProspectivePhotoPerceptionSource({
      schemaVersion: 13,
      provenance: { producerVersion: "photo-interpreter-production-v1" },
    })).toThrowError(expect.objectContaining({ code: "PHOTO_PERCEPTION_SOURCE_CONTAMINATED" }));
  });
});

function fixture(observations, captureComparability = {
  overall: "good",
  dimensions: [{ dimension: "pose", rating: "good", reason: "Like-for-like pose." }],
  confounders: [],
}) {
  return normalizeCanonicalPhotoPerception({
    photo_set_id: "sep19",
    capture_date: "2026-09-19",
    comparison_metadata: {
      current_capture_date: "2026-09-19", previous_capture_date: "2026-08-22", days_elapsed: 28,
      current_view: "front", current_pose: "relaxed", previous_view: "front", previous_pose: "relaxed", match_status: "exact_match",
    },
    source_classification: { current_view: "front", current_pose: "relaxed", previous_view: "front", previous_pose: "relaxed" },
    capture_comparability: captureComparability,
    observations,
    dominant_visual_story: "Photo-only fixture.",
    overall_photo_only_magnitude: observations.some((item) => item.magnitude === "moderate") ? "moderate" : "subtle",
    photo_only_reliability: "moderate",
    confounders: captureComparability.confounders,
  }, {
    captureDate: "2026-09-19",
    photoSetId: "sep19",
    model: "fixture-model",
  });
}

function observation(region, metric, direction, magnitude, change, comparability = {
  rating: "good",
  applicable_claims: ["stated observation"],
  compromised_claims: [],
  rationale: "Like-for-like enough for this observation.",
}) {
  return {
    observation_id: `${region}_${metric}`.replace(/\s+/g, "_"),
    region,
    metric,
    direction,
    magnitude,
    confidence: "moderate",
    change,
    confounders: [],
    comparability,
  };
}

expect(CANONICAL_PHOTO_PERCEPTION_VERSION).toBe("canonical_photo_perception_v1");
expect(CANONICAL_PHOTO_PERCEPTION_PROMPT_VERSION).toBe("canonical_photo_perception_goal_blind_v1");
expect(PHOTO_ONLY_CONTEXT_BOUNDARY).toContain("goal_phase_strategy");
