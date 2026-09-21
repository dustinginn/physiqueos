import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../services/PINarrativeAssessmentService", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, createPINarrativeAssessment: vi.fn(original.createPINarrativeAssessment) };
});

import { createPINarrativeAssessment } from "../../services/PINarrativeAssessmentService";
import { createBriefingNavigationReadService } from "../../../application/briefings/BriefingNavigationReadService.js";
import {
  DEXA_SCAN_ID, fixtures, prepareDexaV3, preparePhotoV3,
} from "../../../testSupport/briefingFamilyV3Harness.js";
import {
  derivePhotoStructuredObservationsV3, withStructuredPhotoObservationsV3,
} from "../PhotoEventStructuredObservationsV3.js";

// Text digests recorded from the pristine production base (895935bd) on the
// same evidence. The unified V3 correction must not change what DEXA or Photo
// say. Structured fields (uncertainty, identity digests) are additive.
const BASE_DEXA_TEXT_SHA256 = "75f822e7f5c4674742e3231c2e17f3fc7f0806a696dff076e1a40d764a02f13c";
const BASE_PHOTO_TEXT_SHA256 = "75f822e7f5c4674742e3231c2e17f3fc7f0806a696dff076e1a40d764a02f13c";
// The same events published with a prior Weekly in the store (production's normal shape).
const BASE_WITH_PRIOR_WEEKLY_TEXT_SHA256 = "4269bad26fbba30f7945038865874d70cda7a59602f5c7c1bcb49844a1a2ae7f";
// The accepted Sep 19 Photo artifact's stored V3 text (a stored artifact is served, never rebuilt).
const ACCEPTED_SEP19_PHOTO_TEXT_SHA256 = "a139d9834a66e550998d7fb21f95254ed1707096b25d6f91eaa5cd834aab5791";

const textDigest = (narrative) => createHash("sha256").update(JSON.stringify({
  summary: narrative.summary, detail: narrative.detail, sections: narrative.sections, coachTake: narrative.coachTake,
})).digest("hex");

function serve(artifact, extra = {}) {
  const store = {
    getAnalysis: vi.fn(), listHistory: vi.fn(async () => ({ artifacts: [] })),
    getArtifact: vi.fn(async () => ({
      artifact, user: { id: "owner", timeZone: "America/Los_Angeles" }, goals: [], phaseReviewDecisions: [],
      workItems: [], revision: 1, confidenceAssessment: null, mediaObjects: [], ...extra,
    })),
  };
  return createBriefingNavigationReadService({ store }).getNativeArtifact({ artifactId: artifact.id });
}

describe("DEXA Event: unified V3 regression golden", () => {
  it("keeps the DEXA narrative and Confidence identical to the pristine production base", async () => {
    const { prepared, artifact } = await prepareDexaV3();
    expect(textDigest(artifact.briefing.narrativeV3)).toBe(BASE_DEXA_TEXT_SHA256);
    expect(prepared.assessment.currentPercentage).toBe(76);
  });

  it("resolves the Build Lean Mass strategy without adding Energy prose or a firmer/softer recommendation", async () => {
    const { prepared, artifact } = await prepareDexaV3();
    expect(prepared.goalContract.goalLabel).toBe("Build Lean Mass");
    expect(prepared.goalContract.strategy.operatingState.value).toBe("phase_execution");
    expect(JSON.stringify(prepared.strategicInterpretation)).not.toMatch(/maintenance|\bcalibration\b/i);
    expect(prepared.strategicInterpretation.recommendation).toEqual({
      action: "continue_current_strategy", reason: "strategy_supported", urgency: "routine",
      nextEvidencePurpose: "confirm_persistence",
    });
    expect(artifact.briefing.narrativeV3.energy ?? null).toBeNull();
    expect(artifact.briefing.narrativeV3.energyExecution).toBeUndefined();
  });

  it("serves the stored DEXA payload as stored, without a legacy rebuild", async () => {
    const stored = structuredClone(fixtures.dexaEventArtifact);
    vi.mocked(createPINarrativeAssessment).mockClear();
    const served = await serve(stored);
    const narrative = served.artifact.briefing.dexaEventNarrative;
    const original = stored.briefing.dexaEventNarrative;
    // Everything except the Confidence projection is byte-identical to storage.
    const { goalConfidence: _servedConfidence, ...servedRest } = narrative;
    const { goalConfidence: _storedConfidence, ...storedRest } = original;
    expect(servedRest).toEqual(storedRest);
    expect(narrative.scanId).toBe(DEXA_SCAN_ID);
    expect(createPINarrativeAssessment).not.toHaveBeenCalled();
  });
});

describe("Photo Event: unified V3 regression golden", () => {
  it("keeps the accepted Sep 19 Photo text snapshot as stored", () => {
    expect(textDigest(fixtures.photoEventArtifact.briefing.narrativeV3)).toBe(ACCEPTED_SEP19_PHOTO_TEXT_SHA256);
  });

  it("serves the stored Photo V3 payload and never rebuilds a legacy narrative", async () => {
    const stored = structuredClone(fixtures.photoEventArtifact);
    vi.mocked(createPINarrativeAssessment).mockClear();
    const served = await serve(stored);
    expect(served.artifact.briefing.narrativeV3).toEqual(stored.briefing.narrativeV3);
    expect(served.artifact.briefing.photoEventNarrative.overallSummary)
      .toEqual(stored.briefing.photoEventNarrative.overallSummary);
    expect(createPINarrativeAssessment).not.toHaveBeenCalled();
  });

  it("keeps Photo narrative and Confidence identical to the pristine base, with or without structured observations", async () => {
    const plain = await preparePhotoV3({ structured: false });
    const structured = await preparePhotoV3({ structured: true });
    expect(textDigest(plain.artifact.briefing.narrativeV3)).toBe(BASE_PHOTO_TEXT_SHA256);
    expect(textDigest(structured.artifact.briefing.narrativeV3)).toBe(BASE_PHOTO_TEXT_SHA256);
    expect(plain.prepared.assessment.currentPercentage).toBe(76);
    expect(structured.prepared.assessment.currentPercentage).toBe(76);
    expect(plain.prepared.strategicInterpretation.recommendation)
      .toEqual(structured.prepared.strategicInterpretation.recommendation);
  });

  it("lets structured photo observations enter the V3 evidence when they exist", async () => {
    const plain = await preparePhotoV3({ structured: false });
    const structured = await preparePhotoV3({ structured: true });
    const ids = (result) => result.prepared.assessment.evidenceEligibility.eligibleObservations.map((item) => item.observationId);
    expect(ids(structured).length).toBeGreaterThan(ids(plain).length);
  });

  it("derives structured observations purely from the existing structured photo intelligence", () => {
    const narrative = structuredClone(fixtures.photoEventArtifact.briefing.photoEventNarrative);
    const before = JSON.stringify(narrative);
    const derived = derivePhotoStructuredObservationsV3(narrative);
    expect(derived.structured_observations.length).toBeGreaterThan(0);
    expect(derived.structured_observations.every((item) => item.direction === "observed")).toBe(true);
    expect(JSON.stringify(narrative)).toBe(before);
    const enriched = withStructuredPhotoObservationsV3(narrative);
    expect(enriched).not.toBe(narrative);
    expect(JSON.stringify(narrative)).toBe(before);
    expect(enriched.poseInterpretations).toEqual(narrative.poseInterpretations);
  });

  it("does not pull a prior Weekly's Energy into a Photo Event (text, recommendation and Confidence equal the pristine base)", async () => {
    const { prepared, artifact } = await preparePhotoV3({ withPriorWeekly: true });
    expect(textDigest(artifact.briefing.narrativeV3)).toBe(BASE_WITH_PRIOR_WEEKLY_TEXT_SHA256);
    expect(prepared.assessment.currentPercentage).toBe(79);
    expect(prepared.strategicInterpretation.energyExecution ?? null).toBeNull();
    expect(artifact.briefing.narrativeV3.energy ?? null).toBeNull();
    expect(prepared.strategicInterpretation.recommendation.strength).toBeUndefined();
    expect(prepared.strategicInterpretation.uncertaintyProfile.some((item) => item.domain === "energy")).toBe(false);
  });
});

describe("DEXA Event with a prior Weekly in the store", () => {
  it("does not pull a prior Weekly's Energy into a DEXA Event (text, recommendation and Confidence equal the pristine base)", async () => {
    const { prepared, artifact } = await prepareDexaV3({ withPriorWeekly: true });
    expect(textDigest(artifact.briefing.narrativeV3)).toBe(BASE_WITH_PRIOR_WEEKLY_TEXT_SHA256);
    expect(prepared.assessment.currentPercentage).toBe(79);
    expect(prepared.strategicInterpretation.energyExecution ?? null).toBeNull();
    expect(prepared.strategicInterpretation.recommendation.strength).toBeUndefined();
    expect(artifact.briefing.narrativeV3.energy ?? null).toBeNull();
  });
});
