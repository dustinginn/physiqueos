const GENERATED_AT = "2026-07-26T17:00:00.000Z";
const CUTOFF = "2026-07-26T06:59:59.999Z";

export const PI_GOAL_CONFIDENCE_CONTRACT_SCENARIOS = Object.freeze([
  "initial_no_prior",
  "increased",
  "held",
  "decreased",
  "strong_training_incomplete_energy",
  "persistent_deficit_falling_weight",
  "near_maintenance_stable_training_photos",
  "improving_training_conflicting_photos",
  "isolated_pr_limited_evidence",
  "authoritative_dexa_support",
  "authoritative_dexa_contradiction",
  "midweek_partial_window",
  "weekly_closed_window",
  "photo_event",
  "dexa_event",
  "contributor_ordering_variation",
  "source_reference_ordering_variation",
  "legacy_44_prior_provenance",
]);

export function createPIGoalConfidenceContractFixture(
  scenario = "initial_no_prior",
  overrides = {}
) {
  const scenarioInput = scenarioDefinition(scenario);
  return merge({
    piVersion: "pi_v3",
    goalId: "goal_build_lean_mass",
    phaseId: "phase_establish_maintenance",
    hasActivePhase: true,
    operatingState: "calibration",
    context: {
      type: "current_active_goal",
      cadence: null,
      evidenceWindowId: null,
      eventId: null,
    },
    evidenceCutoff: CUTOFF,
    score: { current: 50 },
    primaryReason: "The current cross-domain assessment is bounded by available evidence.",
    contributors: [contributor("training", "training", "supporting")],
    unresolvedUncertainty: ["Authoritative outcome measurement remains pending."],
    evidenceCompleteness: { overall: "partial", training: "complete" },
    phaseAwareInterpretation: "Calibration remains the active operating state.",
    coachingImplication: "Continue observing the active plan.",
    reasoning: {
      observations: [{ id: "observation_training", domain: "training", direction: "positive" }],
      claims: [{ id: "claim_training_constructive", domain: "training", direction: "positive" }],
      limitations: ["outcome_measurement_pending"],
      contradictions: [],
      domainInterpretations: [{ id: "training_status", domain: "training", status: "constructive" }],
      authoritativeMeasurement: null,
    },
    provenance: {
      sourceObservationIds: ["observation_training"],
      sourceClaimIds: ["claim_training_constructive"],
      canonicalEvidenceReferences: [{ id: "training_session_1", type: "training" }],
      piDecisionResultId: "pi_decision_weekly",
    },
    generatedAt: GENERATED_AT,
  }, scenarioInput, overrides);
}

function scenarioDefinition(scenario) {
  switch (scenario) {
    case "initial_no_prior":
      return {};
    case "increased":
      return changedScore(51, 50, "increased");
    case "held":
      return changedScore(50, 50, "held", "none");
    case "decreased":
      return changedScore(49, 50, "decreased");
    case "strong_training_incomplete_energy":
      return {
        contributors: [
          contributor("training", "training", "supporting"),
          contributor("energy", "energy", "limiting", { evidenceCompleteness: "partial" }),
        ],
      };
    case "persistent_deficit_falling_weight":
      return {
        contributors: [
          contributor("energy", "energy", "conflicting"),
          contributor("weight", "weight", "conflicting"),
        ],
      };
    case "near_maintenance_stable_training_photos":
      return {
        contributors: [
          contributor("energy", "energy", "supporting"),
          contributor("training", "training", "neutral"),
          contributor("photos", "photos", "neutral"),
        ],
      };
    case "improving_training_conflicting_photos":
      return {
        contributors: [
          contributor("training", "training", "supporting"),
          contributor("photos", "photos", "conflicting"),
        ],
      };
    case "isolated_pr_limited_evidence":
      return {
        contributors: [
          contributor("isolated_pr", "training", "limiting", {
            strength: "low",
            reason: "One performance event is insufficient for a broad trend.",
          }),
        ],
      };
    case "authoritative_dexa_support":
      return authoritativeDexa("supporting");
    case "authoritative_dexa_contradiction":
      return authoritativeDexa("conflicting");
    case "midweek_partial_window":
      return {
        context: {
          type: "midweek_partial_window",
          cadence: "midweek",
          evidenceWindowId: "midweek_2026-07-26_2026-07-28",
        },
      };
    case "weekly_closed_window":
      return {
        context: {
          type: "weekly_closed_window",
          cadence: "weekly",
          evidenceWindowId: "weekly_2026-07-19_2026-07-25",
        },
      };
    case "photo_event":
      return {
        context: {
          type: "photo_event",
          cadence: "event",
          eventId: "photo_event_2026-07-25",
        },
      };
    case "dexa_event":
      return {
        context: {
          type: "dexa_event",
          cadence: "event",
          eventId: "dexa_event_2026-07-18",
        },
      };
    case "contributor_ordering_variation":
      return {
        contributors: [
          contributor("weight", "weight", "neutral"),
          contributor("energy", "energy", "supporting"),
          contributor("training", "training", "supporting"),
        ],
      };
    case "source_reference_ordering_variation":
      return {
        provenance: {
          sourceObservationIds: ["observation_weight", "observation_training"],
          sourceClaimIds: ["claim_weight", "claim_training_constructive"],
          canonicalEvidenceReferences: [
            { id: "weight_1", type: "weight" },
            { id: "training_session_1", type: "training" },
          ],
          piDecisionResultId: "pi_decision_weekly",
        },
      };
    case "legacy_44_prior_provenance":
      return {
        score: {
          current: 44,
          prior: 44,
          movementDirection: "held",
          movementMagnitude: "none",
          priorScoreProvenance: {
            source: "legacy_home_presentation",
            modelVersion: "overall_goal_confidence_v1",
          },
        },
      };
    default:
      throw new Error(`Unknown PI goal-confidence fixture: ${scenario}`);
  }
}

function contributor(id, domain, direction, overrides = {}) {
  return {
    id: `contributor_${id}`,
    domain,
    label: `${domain} context`,
    direction,
    strength: "moderate",
    confidence: { level: "moderate", method: "pi_reasoning" },
    evidenceCompleteness: "complete",
    reason: `${domain} contributes to the bounded assessment.`,
    sourceObservationIds: [`observation_${id}`],
    sourceClaimIds: [`claim_${id}`],
    canonicalEvidenceReferences: [{ id: `evidence_${id}`, type: domain }],
    affectedScoreMovement: false,
    userFacing: true,
    ...overrides,
  };
}

function changedScore(current, prior, direction, magnitude = "small") {
  return {
    score: {
      current,
      prior,
      movementDirection: direction,
      movementMagnitude: magnitude,
      priorScoreProvenance: {
        source: "canonical_pi_assessment",
        assessmentId: "pi_goal_confidence_prior",
        modelVersion: "pi_goal_confidence_assessment_v1",
      },
    },
  };
}

function authoritativeDexa(direction) {
  return {
    contributors: [
      contributor("dexa", "dexa", direction, {
        strength: "authoritative",
        confidence: { level: "high", method: "authoritative_measurement" },
      }),
    ],
    reasoning: {
      observations: [{ id: "observation_dexa", domain: "dexa", direction }],
      claims: [{ id: "claim_dexa", domain: "dexa", direction }],
      limitations: [],
      contradictions: direction === "conflicting" ? ["dexa_conflicts_with_trend"] : [],
      domainInterpretations: [{ id: "dexa_status", domain: "dexa", status: direction }],
      authoritativeMeasurement: {
        id: "dexa_2026-07-18",
        domain: "dexa",
        authority: "authoritative",
        measurementStatus: "completed",
      },
    },
  };
}

function merge(...values) {
  return values.reduce((result, value) => mergeValue(result, value), {});
}

function mergeValue(left, right) {
  if (!right || typeof right !== "object" || Array.isArray(right)) {
    return right === undefined ? left : structuredClone(right);
  }
  const result = structuredClone(left ?? {});
  for (const [key, value] of Object.entries(right)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergeValue(result[key], value)
      : structuredClone(value);
  }
  return result;
}
