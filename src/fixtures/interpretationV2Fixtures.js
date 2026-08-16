export function createInterpretationV2Fixture(overrides = {}) {
  const fixture = {
    goalContract: {
      contractVersion: "goal_contract_v2_fixture_v1",
      contractId: "goal_contract|build_muscle|fixture_v1",
      goal: {
        goalId: "goal_build_muscle",
        goalVersion: "2026-07-01T00:00:00.000Z",
        category: "body_composition",
      },
      objectives: [{
        objectiveId: "objective_lean_mass_response",
        measurement: { metricOrCapability: "lean_mass_change_lb" },
        target: { desiredDirection: "increase", unit: "lb" },
        completionThreshold: { operator: "gte", value: 10 },
        contradictionThreshold: { operator: "lte", value: -1 },
        required: true,
      }],
      guardrails: [{
        guardrailId: "guardrail_body_fat",
        monitoredMetricOrCapability: "body_fat_pct",
        constraint: { kind: "bounded_range", min: 8, max: 10,
          unit: "percent" },
        warningThreshold: { operator: "gt", value: 10 },
        pressureThreshold: { operator: "gt", value: 11 },
        violationThreshold: { operator: "gt", value: 12 },
        required: true,
      }],
      objectiveEvaluationPolicy: { aggregateRule: "all_required" },
      expectedTrajectory: {
        segments: [{
          segmentId: "trajectory_july",
          startBoundary: "2026-07-01",
          endBoundary: "2026-07-31",
          measurableChangeExpectation: "expected",
          expectedObjectiveRanges: [{
            expectationId: "expectation_lean_mass_july",
            objectiveRef: "objective_lean_mass_response",
            min: 1,
            max: 3,
            unit: "lb",
          }],
        }],
      },
      strategyHypothesis: {
        hypothesisId: "hypothesis_progressive_training",
        strategyRef: {
          strategyId: "strategy_hypertrophy_v1",
          strategyVersion: "2026-07-01T00:00:00.000Z",
        },
        statement: "progressive_training_supports_lean_mass_response",
        expectedResponses: [
          { responseId: "response_training_exposure" },
          { responseId: "response_lean_mass_adaptation" },
        ],
      },
      relevantEvidence: {
        entries: [
          {
            evidenceMapId: "map_dexa_objective",
            evidenceCapability: "dexa_body_composition",
            appliesTo: {
              objectiveRefs: ["objective_lean_mass_response"],
              guardrailRefs: [],
              hypothesisRefs: ["response_lean_mass_adaptation"],
              milestoneRefs: [],
            },
            role: "primary",
            expectedEventType: "dexa_scan",
            expectedCadenceOrWindow: {
              eventType: "dexa_scan",
              window: "next_scheduled_dexa_window",
            },
          },
          {
            evidenceMapId: "map_dexa_guardrail",
            evidenceCapability: "dexa_body_composition",
            appliesTo: {
              objectiveRefs: [],
              guardrailRefs: ["guardrail_body_fat"],
              hypothesisRefs: [],
              milestoneRefs: [],
            },
            role: "monitoring",
            expectedEventType: "dexa_scan",
            expectedCadenceOrWindow: {
              eventType: "dexa_scan",
              window: "next_scheduled_dexa_window",
            },
          },
          {
            evidenceMapId: "map_training_response",
            evidenceCapability: "training_execution",
            appliesTo: {
              objectiveRefs: ["objective_lean_mass_response"],
              guardrailRefs: [],
              hypothesisRefs: ["response_training_exposure"],
              milestoneRefs: [],
            },
            role: "supporting",
            expectedEventType: "training_summary",
            expectedCadenceOrWindow: {
              eventType: "training_summary",
              window: "current_training_block",
            },
          },
        ],
      },
      provenance: { inputFingerprint: "sha256_goal_contract_fixture" },
    },
    strategyHypothesis: null,
    executionState: {
      adequacy: "adequate",
      elapsedTimeAdequacy: "adequate",
      refs: ["execution_state|july_2026"],
    },
    evidenceDescriptors: [
      {
        id: "evidence_dexa_july_18",
        capability: "dexa_body_composition",
        observedAt: "2026-07-18T16:00:00.000Z",
        strength: "authoritative",
        agreement: "supports",
        temporalApplicability: "applicable",
        independenceGroup: "dexa_july_18",
        quality: {
          status: "complete",
          provenanceIntegrity: "high",
          temporalAdequacy: "adequate",
          comparisonAdequacy: "adequate",
          limitations: [],
        },
        measurements: [
          {
            metric: "lean_mass_change_lb",
            value: 2,
            unit: "lb",
            observedAt: "2026-07-18T16:00:00.000Z",
          },
          {
            metric: "body_fat_pct",
            value: 9,
            unit: "percent",
            observedAt: "2026-07-18T16:00:00.000Z",
          },
        ],
        sourceObservationIds: ["dexa_observation|july_18"],
        sourceClaimIds: ["dexa_claim|lean_mass", "dexa_claim|body_fat"],
      },
      {
        id: "evidence_training_july",
        capability: "training_execution",
        observedAt: "2026-07-31T20:00:00.000Z",
        strength: "high",
        agreement: "supports",
        temporalApplicability: "applicable",
        independenceGroup: "training_log_july",
        quality: {
          status: "complete",
          provenanceIntegrity: "high",
          temporalAdequacy: "adequate",
          comparisonAdequacy: "not_required",
          limitations: [],
        },
        measurements: [],
        sourceObservationIds: ["training_observation|july"],
        sourceClaimIds: ["training_claim|execution"],
      },
    ],
    evaluationContext: {
      type: "monthly_shadow_evaluation",
      windowStart: "2026-07-01T00:00:00.000Z",
      evidenceCutoff: "2026-07-31T23:59:59.999Z",
      interpretedAt: "2026-08-01T12:00:00.000Z",
      priorInterpretationId: null,
      trajectorySegmentId: "trajectory_july",
      elapsedTimeAdequacy: "adequate",
    },
    compatibility: { missingMetadata: [] },
  };
  fixture.strategyHypothesis = structuredClone(fixture.goalContract.strategyHypothesis);
  return mergeFixture(fixture, overrides);
}

function mergeFixture(fixture, overrides) {
  const result = structuredClone(fixture);
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = value;
  }
  return result;
}
