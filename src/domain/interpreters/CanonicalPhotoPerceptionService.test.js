import { describe, expect, it } from "vitest";
import {
  CANONICAL_PHOTO_PERCEPTION_PROMPT_VERSION,
  CANONICAL_PHOTO_PERCEPTION_VERSION,
  PHOTO_ONLY_BOUNDARY_ATTESTATION_VERSION,
  PHOTO_ONLY_CONTEXT_BOUNDARY,
  assertPhotoOnlyProviderInput,
  assertProspectivePhotoPerceptionSource,
  createCanonicalPhotoPerceptionProviderInput,
  getCanonicalPhotoPerceptionSystemPrompt,
  getCanonicalPhotoPerceptionUserPrompt,
  interpretCanonicalPhotoPerceptionWithVision,
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
        fileName: "current.jpg", dataUrl: "data:image/jpeg;base64,YWJj", view: "front", pose: "relaxed",
        conditions: { postWorkout: true, notes: "Active Goal: Visible Abs" },
      }],
      previousPhotoSet: { captureDate: "2026-08-22", photos: [{ fileName: "prior.jpg", dataUrl: "data:image/jpeg;base64,ZGVm", view: "front", pose: "relaxed" }] },
      comparisonMetadata: { match_status: "exact_match" },
    });
    expect(system).toContain("goal-blind");
    expect(system).toContain("Stable, no obvious deterioration, and insufficient directional evidence are valuable results");
    expect(user).not.toContain("Visible Abs");
    expect(user).not.toContain("Build Lean Mass");
    expect(user).not.toContain("Active Goal");
    expect(user).toContain('"postWorkout": true');
    expect(user).not.toContain("base64");
  });

  it("structurally excludes arbitrary semantic caller text from every model-visible metadata surface", () => {
    const probes = [
      "INJECT_VISIBLE_ABS_01",
      "INJECT_BUILD_LEAN_MASS_02",
      "INJECT_GUARDRAIL_03",
      "INJECT_PHASE_04",
      "INJECT_STRATEGY_05",
      "INJECT_TARGET_BODY_FAT_06",
      "INJECT_COACHING_INSTRUCTION_07",
    ];
    const prompt = getCanonicalPhotoPerceptionUserPrompt({
      captureDate: `2026-09-19T${probes[0]}`,
      photoSetId: probes[1],
      comparisonMetadata: { injected: probes[2] },
      photos: [{
        id: probes[3],
        canonicalId: probes[4],
        mediaId: probes[5],
        fileName: probes[6],
        storagePath: probes[0],
        capturedAt: probes[1],
        view: "front",
        pose: "relaxed",
        dataUrl: "data:image/jpeg;base64,YWJj",
        conditions: {
          morning: probes[0], fasted: { nested: probes[1] }, postWorkout: [probes[2]],
          pump: probes[3], sameLighting: probes[4], edited: probes[5],
          lighting: probes[6], location: probes[0], timeOfDay: probes[1],
          cameraDistance: probes[2], framing: probes[3], angle: probes[4],
          clothing: probes[5], notes: probes[6], unknown: { nested: [probes[0]] },
        },
        unknown: { nested: probes },
      }],
      previousPhotoSet: {
        photoSetId: probes[2],
        captureDate: probes[3],
        strategy: probes[4],
        metadata: { nested: probes[5] },
        photos: [{
          fileName: probes[6], capturedAt: probes[0], view: "front", pose: "relaxed",
          dataUrl: "data:image/jpeg;base64,ZGVm",
          conditions: { lighting: probes[1], notes: probes[2], morning: true },
        }],
      },
    });
    for (const probe of probes) expect(prompt).not.toContain(probe);
    expect(prompt).not.toContain("fileName");
    expect(prompt).not.toContain("photoSetId");
    expect(prompt).not.toContain("capturedAt");
    expect(prompt).not.toContain("location");
    expect(prompt).toContain('"label": "current_image_1"');
    expect(prompt).toContain('"label": "previous_image_1"');
    expect(prompt).toContain('"morning": true');
  });

  it("builds only typed metadata and fails closed when the provider object is altered", () => {
    const input = createCanonicalPhotoPerceptionProviderInput({
      captureDate: "2026-02-31 arbitrary strategy",
      photos: [{ view: "rear", pose: "flexed", conditions: { pump: true, lighting: "Visible Abs" } }],
      previousPhotoSet: { captureDate: "Build Lean Mass", photos: [] },
    });
    expect(input.capture_date).toBeNull();
    expect(input.comparison_metadata).toMatchObject({
      current_capture_date: null,
      previous_capture_date: null,
      current_view: "back",
      current_pose: "flexed",
    });
    expect(input.current_photos[0]).toEqual({
      label: "current_image_1",
      view: "back",
      pose: "flexed",
      conditions: { pump: true },
    });
    expect(assertPhotoOnlyProviderInput(input)).toBe(true);
    expect(() => assertPhotoOnlyProviderInput({ ...input, strategy: "injected" }))
      .toThrowError(expect.objectContaining({ code: "PHOTO_PERCEPTION_INPUT_BOUNDARY_VIOLATION" }));
    expect(() => assertPhotoOnlyProviderInput({ ...input, required_order: ["INJECT_COACHING"] }))
      .toThrowError(expect.objectContaining({ code: "PHOTO_PERCEPTION_INPUT_BOUNDARY_VIOLATION" }));
    expect(() => createCanonicalPhotoPerceptionProviderInput({
      captureDate: "2026-09-19",
      photos: [{ dataUrl: "INJECT_VISIBLE_ABS", view: "front", pose: "relaxed" }],
    })).toThrowError(expect.objectContaining({ code: "PHOTO_PERCEPTION_INPUT_BOUNDARY_VIOLATION" }));
  });

  it("attests the exact sanitized provider payload before invocation", async () => {
    let requestBody;
    const result = await interpretCanonicalPhotoPerceptionWithVision({
      apiKey: "test-key",
      captureDate: "2026-09-19",
      photoSetId: "INJECT_BUILD_LEAN_MASS_ID",
      photos: [{
        fileName: "INJECT_VISIBLE_ABS_FILE",
        view: "front", pose: "relaxed", dataUrl: "data:image/jpeg;base64,YWJj",
        conditions: { postWorkout: true, lighting: "INJECT_STRATEGY_LIGHTING" },
      }],
      previousPhotoSet: {
        photoSetId: "INJECT_GUARDRAIL_PRIOR",
        captureDate: "2026-08-22",
        photos: [{ fileName: "INJECT_PHASE_PRIOR", view: "front", pose: "relaxed", dataUrl: "data:image/jpeg;base64,ZGVm" }],
      },
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ output_text: JSON.stringify(providerOutput()) }), { status: 200 });
      },
    });
    const modelVisibleText = requestBody.input.flatMap((item) => item.content)
      .filter((item) => item.type === "input_text").map((item) => item.text).join("\n");
    expect(modelVisibleText).not.toMatch(/INJECT_/);
    expect(modelVisibleText).toContain("current_image_1");
    expect(modelVisibleText).toContain("previous_image_1");
    expect(result.photoSetId).toBe("INJECT_BUILD_LEAN_MASS_ID");
    expect(result.provenance).toMatchObject({
      goalContextUsed: false,
      nonPhotoEvidenceUsed: false,
      photoOnlyContextBoundary: true,
      boundaryAttestationVersion: PHOTO_ONLY_BOUNDARY_ATTESTATION_VERSION,
    });
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
    boundaryAttested: true,
  });
}

function providerOutput() {
  return {
    photo_set_id: "photo_comparison_1",
    capture_date: "2026-09-19",
    comparison_metadata: {
      current_capture_date: "2026-09-19", previous_capture_date: "2026-08-22", days_elapsed: 28,
      current_view: "front", current_pose: "relaxed", previous_view: "front", previous_pose: "relaxed", match_status: "exact_match",
    },
    source_classification: { current_view: "front", current_pose: "relaxed", previous_view: "front", previous_pose: "relaxed" },
    capture_comparability: { overall: "good", dimensions: [], confounders: [] },
    observations: [observation("waist", "leanness", "stable", "none", "Waist appears stable.")],
    dominant_visual_story: "The photos appear visually stable.",
    overall_photo_only_magnitude: "none",
    photo_only_reliability: "moderate",
    confounders: [],
  };
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
expect(CANONICAL_PHOTO_PERCEPTION_PROMPT_VERSION).toBe("canonical_photo_perception_goal_blind_v2");
expect(PHOTO_ONLY_CONTEXT_BOUNDARY).toContain("goal_phase_strategy");
