import { describe, expect, it } from "vitest";
import { createCanonicalPhotoIntelligenceResult } from "./CanonicalPhotoIntelligenceService.js";
import {
  canonicalEvidenceCandidate,
  createGoalEvidenceHierarchy,
  createPhotoBriefingHolisticSynthesis,
  evaluateGoalRelativeCompatibility,
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
  it("treats the configured objective, accepted guardrail, and stable photos as compatible evidence roles", () => {
    const result = createPhotoBriefingHolisticSynthesis({
      photoIntelligence: stablePhotoIntelligence(),
      evidence: [
        candidate("dexa-aug", "dexa_scan", "2026-08-15", "2026-08-15T20:00:00Z", {
          leanMass: { value: 148.3 }, bodyFatPercentage: 7.6,
        }),
        candidate("dexa-sep", "dexa_scan", "2026-09-12", "2026-09-13T02:08:43.147Z", {
          leanMass: { value: 153.3 }, bodyFatPercentage: 8.1,
        }),
      ],
      eventDate, cutoff, goalContext: buildGoalContext(),
    });
    expect(result.goalEvidenceHierarchy).toMatchObject({
      primaryObjective:{role:"primary_objective",metric:"lean_mass",direction:"increase",evidenceAuthority:"DEXA"},
      guardrails:[{role:"guardrail",metric:"body_fat_percentage",range:{min:8,max:9,unit:"%"},evidenceAuthority:"DEXA"}],
    });
    expect(result.goalEvidenceHierarchy.supportingEvidence[0]).toEqual({type:"photos",role:"supporting_evidence",canEstablishPrimaryObjective:false});
    expect(result.goalRelativeCompatibility).toMatchObject({
      status:"jointly_supportive",
      objective:{status:"progressing",change:5,value:153.3},
      guardrails:[{status:"within_range",value:8.1}],
      supportingVisualEvidence:{status:"stable",establishesMeasuredObjective:false},
      visualStabilityConflictsWithMeasuredProgress:false,
    });
    expect(result.userFacingCopy).toBe("DEXA measured a 5.0 lb increase in lean mass from August 15, 2026 to September 12, 2026. The latest scan measured 8.1% body fat, within the accepted 8–9% guardrail. The matched photo views look broadly unchanged, so measured progress is ahead of a clear visible size change without an obvious visual tradeoff.");
    expect(result.userFacingCopy).not.toMatch(/visible muscle gain|mixed|more convincing/i);
    expect(result.coachingImplication).not.toMatch(/5\.0|8\.1|8–9/);
  });

  it("reports a guardrail conflict without letting objective progress erase it", () => {
    const hierarchy=createGoalEvidenceHierarchy({goalContext:buildGoalContext()});
    const compatibility=evaluateGoalRelativeCompatibility({
      photoIntelligence:stablePhotoIntelligence(),
      measuredEvidence:{leanMassChangeLb:2,leanMassLb:151,bodyFatPercentage:9.4},
      goalEvidenceHierarchy:hierarchy,
    });
    expect(compatibility).toMatchObject({
      status:"objective_progress_guardrail_conflict",
      objective:{status:"progressing"},
      guardrails:[{status:"above_range"}],
    });
  });

  it("handles missing and multiple guardrails deterministically", () => {
    const missing=createGoalEvidenceHierarchy({goalContext:{activeGoal:{id:"goal",target:{metric:"lean_mass",direction:"increase"}}}});
    expect(missing.guardrails).toEqual([]);
    const multiple=createGoalEvidenceHierarchy({goalContext:{activeGoal:{
      id:"goal",target:{metric:"lean_mass",direction:"increase"},guardrails:[
        {id:"accepted",metric:"body_fat_percentage",min:8,max:9,unit:"%",accepted:true},
        {id:"rejected",text:"Maintain 100–200 lb.",accepted:false},
        {id:"second",text:"Keep body fat between 7-10 percent.",accepted:true},
      ],
    }}});
    expect(multiple.guardrails.map((item)=>item.id)).toEqual(["accepted","second"]);
    expect(multiple.guardrails.map((item)=>item.range)).toEqual([
      {min:8,max:9,unit:"%"},{min:7,max:10,unit:"%"},
    ]);
  });

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
    expect(result.userFacingCopy).toMatch(/photos and measurement make the overall direction more convincing/i);
    expect(result.userFacingCopy).not.toMatch(/independent evidence converges|photo-level direction|visual confidence field|canonical evidence/i);
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
    expect(result.userFacingCopy).toMatch(/does not point in the same direction as the photos/i);
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

function stablePhotoIntelligence() {
  return createCanonicalPhotoIntelligenceResult({
    caseId: "stable-case",
    baselineDate: "2026-08-22",
    comparisonDate: "2026-09-19",
    visualChange: {
      dominantStory: "The matched views look broadly stable.",
      overallApparentMagnitude: "none",
      regions: [{
        region:"whole_body",metric:"muscularity",direction:"stable",
        apparent_magnitude:"none",confidence:"moderate",
        observation:"No visible change in muscularity or fullness.",
      }],
    },
    confidenceAndLimitations:{overallReliability:"moderate"},
    unsupportedConclusions:["muscle gain from photos"],
    photoOnlyInterpretation:"The photos look broadly stable.",
    photoBriefingCopy:"The photos look broadly stable.",
  });
}

function buildGoalContext() {
  return {activeGoal:{
    id:"goal-build",type:"build_lean_mass",title:"Build Lean Mass",
    target:{type:"numeric_change",metric:"lean_mass",direction:"increase",amount:10,unit:"lb"},
    guardrails:[{id:"body-fat",text:"Maintain approximately 8–9% body fat.",accepted:true}],
    progressMeasurement:{outcomeMeasures:[{evidenceType:"dexa_lean_mass",accepted:true}]},
  }};
}
