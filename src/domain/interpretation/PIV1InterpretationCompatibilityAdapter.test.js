import { describe, expect, it } from "vitest";
import {
  adaptLegacyGoalToShadowContract,
  adaptPIV1EvidenceToInterpretationDescriptors,
  adaptPIV1ExecutionToInterpretationState,
  adaptPIV1StrategyToInterpretationHypothesis,
  adaptPIV1ToInterpretationInput,
} from "./PIV1InterpretationCompatibilityAdapter";

describe("PIV1InterpretationCompatibilityAdapter", () => {
  it("does not infer Objective semantics from a legacy Goal name", () => {
    const result = adaptPIV1ToInterpretationInput({
      goal: {
        id: "goal_legacy",
        name: "Build Muscle",
        title: "Build Muscle",
      },
      assessment: {
        id: "pi_assessment|legacy",
        evidenceCutoff: "2026-07-31T23:59:59.999Z",
        score: { current: 82 },
        contributors: [],
      },
    });

    expect(result.goalContract.objectives).toEqual([]);
    expect(result.compatibility.missingMetadata).toContain("objectives");
    expect(result.compatibility.inferredMetadata).toEqual([]);
  });

  it("ignores V1 score and prose changes deterministically", () => {
    const base = {
      goal: { id: "goal_legacy" },
      assessment: {
        id: "pi_assessment|legacy",
        evidenceCutoff: "2026-07-31T23:59:59.999Z",
        score: { current: 10 },
        primaryReason: "legacy reason one",
        coachingImplication: "legacy coaching one",
        contributors: [],
      },
    };
    const changed = structuredClone(base);
    changed.assessment.score.current = 99;
    changed.assessment.primaryReason = "legacy reason two";
    changed.assessment.coachingImplication = "legacy coaching two";

    expect(adaptPIV1ToInterpretationInput(changed))
      .toEqual(adaptPIV1ToInterpretationInput(base));
  });

  it("maps contributor Strength and Agreement without inventing relevance", () => {
    const result = adaptPIV1ToInterpretationInput({
      goal: { id: "goal_legacy" },
      assessment: {
        id: "pi_assessment|legacy",
        evidenceCutoff: "2026-07-31T23:59:59.999Z",
        contributors: [{
          id: "contributor_dexa",
          domain: "dexa",
          direction: "conflicting",
          strength: "authoritative",
          evidenceCompleteness: "complete",
          canonicalEvidenceReferences: [{ id: "dexa|july" }],
        }],
      },
    });

    expect(result.evidenceDescriptors[0]).toMatchObject({
      capability: "dexa",
      strength: "authoritative",
      agreement: "contradicts",
    });
    expect(result.goalContract.relevantEvidence.entries).toEqual([]);
    expect(result.compatibility.missingMetadata).toContain("objectives");
  });

  it("uses only explicit legacy targets and relevance bindings", () => {
    const goal = {
      id: "goal_explicit",
      target: {
        metric: "lean_mass_lb",
        direction: "increase",
        targetValue: 10,
        unit: "lb",
      },
      expectedTrajectory: { segments: [] },
      strategyHypothesis: {
        hypothesisId: "hypothesis_explicit",
        statement: "explicit_hypothesis",
      },
    };
    const first = adaptLegacyGoalToShadowContract(goal);
    const objectiveId = first.objectives[0].objectiveId;
    goal.progressMeasurement = {
      outcomeMeasures: [{
        id: "map_explicit_dexa",
        evidenceType: "dexa",
        role: "outcome",
        objectiveRefs: [objectiveId],
      }],
    };
    const result = adaptLegacyGoalToShadowContract(goal);

    expect(result.objectives[0].measurement.metricOrCapability)
      .toBe("lean_mass_lb");
    expect(result.relevantEvidence.entries[0].appliesTo.objectiveRefs)
      .toEqual([objectiveId]);
    expect(result.provenance.inferredMetadata).toEqual([]);
  });

  it("exposes deterministic Strategy, Execution, and Evidence adapters", () => {
    expect(adaptPIV1StrategyToInterpretationHypothesis()).toMatchObject({
      hypothesisId: null,
      statement: null,
      expectedResponses: [],
    });
    expect(adaptPIV1ExecutionToInterpretationState()).toEqual({
      adequacy: "unknown",
      elapsedTimeAdequacy: "unknown",
      opportunityStatus: "unknown",
      completionStatus: "unknown",
      consistencyStatus: "unknown",
      deviationRefs: [],
      refs: [],
    });
    expect(adaptPIV1EvidenceToInterpretationDescriptors({
      id: "assessment_explicit",
      evidenceCutoff: "2026-07-31T23:59:59.999Z",
      contributors: [{
        id: "training",
        domain: "training",
        direction: "supporting",
        strength: "high",
      }],
    })[0]).toMatchObject({
      capability: "training",
      strength: "high",
      agreement: "supports",
    });
  });
});
