// Proves Web's existing presentation read path (unchanged contract) renders
// a V3-published assessment correctly, using V3's own structured narrative
// factors rather than the generic V1-era text-mining fallback. This is what
// makes "Web requires no rewrite" a verified claim, not an assumption.
import { describe, expect, it } from "vitest";
import { resolveActiveGoalConfidencePresentation } from "../services/ActiveGoalConfidencePresentationReadService";
import { createCanonicalConfidenceAssessmentV3 } from "../confidence/CanonicalConfidenceAssessmentModel";
import { deriveStrategicInterpretation } from "./StrategicInterpretationService";
import { projectStrategicConfidence } from "./StrategicConfidenceProjectionService";
import { generateNarrativeV3 } from "./NarrativeV3Service";
import { evaluateEvidenceEligibility } from "./EvidenceEligibilityService";

function buildV3Assessment() {
  const interpretationInput = {
    goalProgress: { status: "available", direction: "increase", requiredProgress: 10, remainingGap: 5, cumulativeProgress: 5 },
    observedInterval: { priorValue: 148.3, priorObservedOn: "2026-08-15", currentValue: 153.3, currentObservedOn: "2026-09-12" },
    deadline: { remainingDays: 49 },
    guardrails: [{
      id: "body_fat_range", currentValue: 8.1, priorValue: 7.6,
      guardrail: { lowerBound: 8, upperBound: 9, lowerBoundMeaning: "unsafe_direction", upperBoundMeaning: "unsafe_direction" },
    }],
    evidence: { domain: "dexa", goalOutcomeMetric: "lean_mass" },
    evidenceQuality: { hasValidComparableReference: true },
    persistenceContext: { priorConfirmingIntervalCount: 0 },
  };
  const interpretation = deriveStrategicInterpretation(interpretationInput);
  const projection = projectStrategicConfidence({
    previousPercentage: 62, confidenceBand: "moderate", interpretation, baseCeiling: 8,
  });
  const eligibility = evaluateEvidenceEligibility({
    evidenceRefs: [{ id: "dexa-1", domain: "dexa", observedOn: "2026-09-12", status: "active" }],
    primaryDomains: ["dexa"],
    asOf: "2026-09-17",
  });
  const narrative = generateNarrativeV3({ interpretation, eligibility, projection, goalTitle: "Build Lean Mass" });

  return createCanonicalConfidenceAssessmentV3({
    goalId: "goal", phaseId: "phase",
    goalContractVersion: "1",
    publisherType: "v3_strategic_activation",
    originatingBriefingId: "occ", briefingArtifactId: "artifact", evidenceWindowId: "window",
    priorAssessmentId: "prior", confidenceBand: "moderate",
    interpretation, projection, narrative, eligibility,
    publicationTimestamp: "2026-09-17T12:00:00.000Z",
    sourceCutoff: "2026-09-17T00:00:00.000Z",
    idempotencyKey: "key",
  });
}

describe("Web presentation of a V3-published assessment", () => {
  it("renders structured V3 factors, not the generic text-mining fallback", () => {
    const assessment = buildV3Assessment();
    const canonical = {
      goalConfidenceSnapshots: [{
        id: "snapshot", goalId: "goal", phaseId: "phase",
        currentAssessmentId: assessment.id, currentScore: assessment.currentPercentage,
        scoreBand: assessment.confidenceBand, historyRecordId: "history",
      }],
      goalConfidenceHistory: [{
        id: "history", goalId: "goal", phaseId: "phase",
        assessmentId: assessment.id, publisherType: assessment.publisherType, assessment,
      }],
    };
    const presentation = resolveActiveGoalConfidencePresentation({
      activeGoal: { id: "goal", phases: [{ id: "phase", status: "active" }] },
      activePhase: { id: "phase" },
      store: canonical,
    });
    expect(presentation.status).not.toBe("unavailable");
    expect(presentation.value).toBe(79);
    expect(presentation.piVersion).toBe("confidence_v3");
    expect(presentation.explanationDetail.supportingFactors.length).toBeGreaterThan(0);
    expect(presentation.explanationDetail.supportingFactors[0]).toMatch(/feasibility|demonstrated/i);
  });
});
