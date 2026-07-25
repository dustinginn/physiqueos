import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import { createPIBodyFatGuardrailNarrativeCandidate } from "./PINarrativeCandidateService";
import { createEarlyPhaseBodyFatGuardrailAssessment } from "./PIBodyFatGuardrailService";

describe("early Phase 1 body-fat guardrail", () => {
  it.each([0, 27])("treats comparable Photo drift as guardrail evidence on phase day %s", (day) => {
    const assessment = createEarlyPhaseBodyFatGuardrailAssessment({
      observations: [photo("falling", 1, "moderate", day)],
      goalContext: context(day),
    });
    expect(assessment).toMatchObject({
      state: "possible_drift",
      phaseAgeBand: "week_1_to_4",
      bodyFatTargetRange: { min: 8, max: 9, unit: "%" },
    });
    expect(createPIBodyFatGuardrailNarrativeCandidate({ assessment })).toMatchObject({
      candidateType: "body_fat_guardrail",
      explanationData: { quantifiedBodyFatEstimate: null, causalInference: false },
    });
  });

  it("ends special early-phase eligibility at day 28", () => {
    expect(createEarlyPhaseBodyFatGuardrailAssessment({
      observations: [photo("falling", 1, "moderate", 28)],
      goalContext: context(28),
    }).state).toBe("insufficient");
  });

  it("requires Photo direction and cannot be created from Weight or Energy alone", () => {
    const assessment = createEarlyPhaseBodyFatGuardrailAssessment({
      observations: [
        routine("weight", "weight_short_window_change", "rising"),
        routine("energy", "energy_balance", "rising"),
      ],
      goalContext: context(7),
    });
    expect(assessment.state).toBe("insufficient");
  });

  it("strengthens only repeated comparable Photo drift", () => {
    const assessment = createEarlyPhaseBodyFatGuardrailAssessment({
      observations: [photo("falling", 2, "high", 14)],
      goalContext: context(14),
    });
    expect(assessment.state).toBe("repeated_possible_drift");
    expect(assessment.confidence.level).toBe("moderate");
  });

  it("keeps stable comparable Photos stable", () => {
    expect(createEarlyPhaseBodyFatGuardrailAssessment({
      observations: [photo("stable", 1, "moderate", 14)],
      goalContext: context(14),
    }).state).toBe("stable");
  });

  it("does not elevate a low-comparability Photo", () => {
    expect(createEarlyPhaseBodyFatGuardrailAssessment({
      observations: [photo("falling", 1, "low", 14)],
      goalContext: context(14),
    }).state).toBe("insufficient");
  });

  it("applies DEXA precedence to contradict Photo drift", () => {
    const assessment = createEarlyPhaseBodyFatGuardrailAssessment({
      observations: [
        photo("falling", 2, "high", 14),
        routine("dexa", "dexa_body_fat_percentage_change", "falling", "high"),
      ],
      goalContext: context(14),
    });
    expect(assessment.state).toBe("contradicted");
    expect(assessment.confidence.level).toBe("high");
    expect(assessment.participatingDomains).toEqual(["dexa", "photos"]);
  });

  it("is not applicable without a lean-mass Goal and canonical guardrail", () => {
    expect(createEarlyPhaseBodyFatGuardrailAssessment({
      observations: [photo("falling", 1, "moderate", 7)],
      goalContext: { ...context(7), semanticGoalType: "fat_loss" },
    }).state).toBe("insufficient");
    expect(createEarlyPhaseBodyFatGuardrailAssessment({
      observations: [photo("falling", 1, "moderate", 7)],
      goalContext: { ...context(7), targetRanges: [], guardrailRelevant: false },
    }).state).toBe("insufficient");
  });

  it("never treats Photo muscularity as early lean-mass proof", () => {
    const muscularity = photo("rising", 2, "high", 7);
    muscularity.kind = "photo_muscularity_change";
    muscularity.subject.id = "muscularity";
    const assessment = createEarlyPhaseBodyFatGuardrailAssessment({
      observations: [muscularity],
      goalContext: context(7),
    });
    expect(assessment.state).toBe("insufficient");
    expect(JSON.stringify(assessment)).not.toMatch(/hypertrophy|muscle gain|fat gain|body-fat estimate/i);
  });
});

function photo(direction, repeatedDirectionCount, level, day) {
  const observation = routine("photos", "photo_leanness_change", direction, level);
  observation.goalContext = {
    ...context(day),
    observationRole: "guardrail",
    evidencePurpose: "early_phase_body_fat_monitoring",
  };
  observation.explanationData = { comparisonQuality: level === "low" ? "low" : "high", repeatedDirectionCount };
  return observation;
}
function routine(domain, kind, direction, level = "moderate") {
  return createPIObservation({
    domain, kind, semanticScope: "weekly",
    subject: { type: "whole_body_metric", id: domain === "photos" ? "leanness" : domain === "dexa" ? "body_fat_percentage" : domain, label: domain },
    status: direction === "stable" ? "stable" : "observed", direction,
    evidenceWindow: { startDate: "2026-07-20", endDate: "2026-07-27" },
    supportingEvidenceIds: [`${domain}-evidence`],
    confidence: { level, method: "fixture" },
    explanationData: {},
    provenance: { producer: `${domain}_fixture`, producerVersion: "v1", calculationMethod: "fixture", sourceEvidenceIds: [`${domain}-evidence`] },
  });
}
function context(day) {
  return {
    activeGoalId: "goal-build", semanticGoalType: "lean_mass_gain",
    phaseAgeDays: day, phaseAgeBand: day < 28 ? "week_1_to_4" : "week_5_to_8",
    guardrailRelevant: true,
    targetRanges: [{ id: "body-fat", measure: "body_fat_percentage", role: "guardrail", min: 8, max: 9 }],
  };
}
