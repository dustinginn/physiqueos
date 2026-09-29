import { describe, expect, it } from "vitest";
import { createCanonicalPhotoIntelligenceResult } from "./CanonicalPhotoIntelligenceService.js";
import {
  canonicalEvidenceCandidate,
  createPhotoBriefingHolisticSynthesis,
  selectPhotoBriefingEvidence,
} from "./PhotoBriefingHolisticSynthesisService.js";

const cutoff = "2026-09-20T17:51:47.391Z";
const eventDate = "2026-09-19";

describe("Photo Briefing time-causal evidence", () => {
  it("includes evidence available before cutoff and excludes availability after cutoff", () => {
    const result = selectPhotoBriefingEvidence({ eventDate, cutoff, evidence: [
      candidate("before", "dexa_scan", "2026-09-12", "2026-09-13T02:08:43.147Z"),
      candidate("after", "dexa_scan", "2026-09-12", "2026-09-21T00:00:00Z"),
    ] });
    expect(result.eligible.map((item) => item.id)).toEqual(["before"]);
    expect(result.excluded).toEqual([
      expect.objectContaining({ id: "after", exclusionReason: "available_after_cutoff" }),
    ]);
  });

  it("excludes measured-before/uploaded-after and future-observed evidence", () => {
    const result = selectPhotoBriefingEvidence({ eventDate, cutoff, evidence: [
      candidate("late-upload", "dexa_scan", "2026-09-12", "2026-09-21T00:00:00Z"),
      candidate("late-revision", "dexa_scan", "2026-09-12", "2026-09-13T00:00:00Z", {
        updatedAt: "2026-09-21T00:00:00Z",
      }),
      candidate("future-weight", "weight", "2026-09-20", "2026-09-20T10:00:00Z"),
      candidate("unknown", "training", "2026-09-18", null),
    ] });
    expect(result.eligible).toEqual([]);
    expect(Object.fromEntries(result.excluded.map((item) => [item.id, item.exclusionReason])))
      .toEqual({
        "late-upload": "available_after_cutoff",
        "late-revision": "updated_after_cutoff",
        "future-weight": "observed_after_event",
        unknown: "availability_unknown",
      });
  });

  it("includes weight and training observed and available before the cutoff", () => {
    const result = selectPhotoBriefingEvidence({ eventDate, cutoff, evidence: [
      candidate("weight", "weight", "2026-09-19", "2026-09-19T15:00:00Z"),
      candidate("training", "training", "2026-09-18", "2026-09-18T20:00:00Z"),
    ] });
    expect(result.eligible.map((item) => item.id)).toEqual(["training", "weight"]);
  });
});

describe("Holistic Photo Briefing synthesis", () => {
  it("keeps PI byte-identical and attributes visual, measured, and synthesized claims", () => {
    const pi = photoIntelligence();
    const before = JSON.stringify(pi);
    const evidence = [
      candidate("dexa-aug", "dexa_scan", "2026-08-15", "2026-08-15T20:00:00Z", {
        leanMass: { value: 148.3, unit: "lb" }, bodyFatPercentage: 7.6,
      }),
      candidate("dexa-sep", "dexa_scan", "2026-09-12", "2026-09-13T02:08:43.147Z", {
        leanMass: { value: 153.3, unit: "lb" }, bodyFatPercentage: 8.1,
      }),
    ];
    const result = createPhotoBriefingHolisticSynthesis({
      photoIntelligence: pi, evidence, eventDate, cutoff,
      goalContext: { name: "Build Lean Mass with a body-fat guardrail" },
    });
    expect(JSON.stringify(pi)).toBe(before);
    expect(result.measuredEvidence).toMatchObject({
      sourceId: "dexa-sep", leanMassChangeLb: 5, bodyFatPercentage: 8.1,
    });
    expect(result.convergence).toMatchObject({
      status: "convergent", visualConfidenceChanged: false, causalClaim: false,
    });
    expect(result.userFacingCopy).toMatch(/photos did not measure tissue change/i);
    expect(result.provenance).toMatchObject({
      visualObservationAttribution: "photos",
      measurementAttribution: "DEXA",
      synthesisAttribution: "PhysiqueOS",
    });
  });

  it("cannot change the canonical PI result when holistic evidence changes", () => {
    const pi = photoIntelligence();
    const empty = createPhotoBriefingHolisticSynthesis({
      photoIntelligence: pi, evidence: [], eventDate, cutoff,
    });
    const withDexa = createPhotoBriefingHolisticSynthesis({
      photoIntelligence: pi,
      evidence: [candidate("dexa", "dexa_scan", "2026-09-12", "2026-09-13T02:08:43.147Z", {
        leanMass: { value: 153.3 },
      })],
      eventDate, cutoff,
    });
    expect(empty.visualEvidence).toEqual(withDexa.visualEvidence);
    expect(pi.overallMagnitude).toBe("subtle");
  });

  it("labels prospective output distinctly and does not strengthen divergent evidence", () => {
    const pi = photoIntelligence();
    const result = createPhotoBriefingHolisticSynthesis({
      photoIntelligence: pi,
      evidence: [
        candidate("dexa-prior", "dexa_scan", "2026-08-15", "2026-08-15T20:00:00Z", {
          leanMass: { value: 150 }, bodyFatPercentage: 8,
        }),
        candidate("dexa-latest", "dexa_scan", "2026-09-12", "2026-09-13T02:08:43.147Z", {
          leanMass: { value: 145 }, bodyFatPercentage: 8.5,
        }),
      ],
      eventDate,
      cutoff,
    });
    expect(result.resultLabel).toBe("PROSPECTIVE");
    expect(result.convergence).toMatchObject({
      status: "divergent",
      confidenceEffect: "none",
      visualConfidenceChanged: false,
    });
    expect(result.userFacingCopy).toMatch(/does not align/i);
    expect(result.userFacingCopy).not.toMatch(/strengthens the overall interpretation/i);
  });

  it("uses a replay label only when the caller explicitly supplies one", () => {
    const result = createPhotoBriefingHolisticSynthesis({
      photoIntelligence: photoIntelligence(), evidence: [], eventDate, cutoff,
      resultLabel: "HOLISTIC REPLAY — POST-REVEAL",
    });
    expect(result.resultLabel).toBe("HOLISTIC REPLAY — POST-REVEAL");
  });
});

function candidate(id, type, observedAt, availableAt, extra = {}) {
  const record = { id, evidence_type: type, measuredAt: observedAt, ...extra };
  return canonicalEvidenceCandidate(record, { type, observedAt, availableAt });
}

function photoIntelligence() {
  return createCanonicalPhotoIntelligenceResult({
    caseId: "case-2",
    baselineDate: "2026-07-19",
    comparisonDate: "2026-09-19",
    visualChange: {
      dominantStory: "The upper torso appears subtly fuller while the waist remains stable.",
      overallApparentMagnitude: "subtle",
      regions: [{
        region: "chest", metric: "fullness", direction: "increased",
        apparent_magnitude: "subtle", confidence: "moderate",
        observation: "The chest appears somewhat fuller.",
      }],
    },
    confidenceAndLimitations: { overallReliability: "moderate" },
    unsupportedConclusions: ["muscle gain from photos"],
    photoOnlyInterpretation: "The visible direction is subtle.",
    photoBriefingCopy: "The upper torso appears subtly fuller while the waist remains stable.",
  });
}
