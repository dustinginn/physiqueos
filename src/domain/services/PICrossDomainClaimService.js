import {
  PI_CONFIDENCE_LEVELS,
  PI_MATERIALITY_LEVELS,
  validatePIObservation,
} from "./PIObservationService";

export const PI_CLAIM_SCHEMA_VERSION = "pi_claim_v1";
export const PI_CLAIM_SYNTHESIZER_VERSION = "pi_weight_energy_claims_v1";
export const PI_TRAINING_WEIGHT_CLAIM_SYNTHESIZER_VERSION =
  "pi_training_weight_claims_v1";

export const PI_CLAIM_KINDS = Object.freeze([
  "intake_weight_stability",
  "intake_weight_change",
  "expenditure_weight_stability",
  "expenditure_weight_change",
  "energy_balance_weight_stability",
  "energy_balance_weight_change",
  "insufficient_energy_to_explain_weight",
  "insufficient_weight_to_support_energy_claim",
  "training_progress_weight_stability",
  "training_progress_weight_change",
  "training_regression_weight_stability",
  "training_regression_weight_change",
  "training_volume_weight_stability",
  "training_volume_weight_change",
  "weight_change_training_stability",
  "insufficient_training_to_support_weight_claim",
  "insufficient_weight_to_support_training_claim",
  "dexa_lean_mass_training_relationship",
  "dexa_body_fat_weight_relationship",
  "photo_leanness_weight_relationship",
  "photo_dexa_body_fat_corroboration",
  "dexa_body_composition_confirmation",
  "training_progress_with_positive_energy_support",
  "training_progress_with_neutral_energy_support",
  "training_progress_despite_negative_energy_balance",
  "training_stability_with_positive_energy_balance",
  "training_stability_with_declining_energy_support",
  "training_decline_with_negative_energy_balance",
  "training_decline_despite_positive_energy_balance",
  "training_volume_growth_with_energy_support",
  "training_energy_relationship_insufficient",
  "training_energy_relationship",
  "training_progress_with_consistent_protein_support",
  "training_stability_with_consistent_protein_support",
  "training_decline_with_inconsistent_protein_support",
  "training_volume_growth_with_consistent_protein_support",
  "training_volume_growth_with_incomplete_nutrition_support",
  "training_progress_despite_incomplete_nutrition_evidence",
  "training_decline_despite_adequate_protein_support",
  "nutrition_training_relationship_insufficient",
  "nutrition_training_relationship",
  "recovery_training_relationship",
  "recovery_energy_relationship",
]);

const ENERGY_RELATIONSHIPS = Object.freeze({
  energy_intake: "intake",
  energy_expenditure: "expenditure",
  energy_balance: "energy_balance",
});
const CONFIDENCE_ORDER = Object.freeze([
  "unevaluated",
  "low",
  "moderate",
  "high",
  "very_high",
]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MACHINE_KEY_PATTERN = /^[a-z0-9]+(?:[._|:-][a-z0-9]+)*$/;

export function createPICrossDomainClaimId({
  kind,
  participatingDomains,
  semanticScope,
} = {}) {
  const normalizedKind = requiredEnum(kind, "kind", PI_CLAIM_KINDS);
  const domains = normalizeDomains(participatingDomains);
  const scope = requiredMachineKey(semanticScope, "semanticScope");
  return ["pi_claim", domains.join("+"), normalizedKind, scope].join("|");
}

export function createPICrossDomainClaim(input = {}) {
  const normalized = { ...input };
  if (!normalized.id) {
    normalized.id = createPICrossDomainClaimId({
      kind: normalized.kind,
      participatingDomains: normalized.participatingDomains,
      semanticScope: normalized.semanticScope,
    });
  }
  return normalizePICrossDomainClaim(normalized);
}

export function normalizePICrossDomainClaim(input = {}) {
  assertPlainObject(input, "claim");
  const claim = {
    id: requiredString(input.id, "id"),
    schemaVersion: requiredEnum(
      input.schemaVersion ?? PI_CLAIM_SCHEMA_VERSION,
      "schemaVersion",
      [PI_CLAIM_SCHEMA_VERSION]
    ),
    kind: requiredEnum(input.kind, "kind", PI_CLAIM_KINDS),
    participatingObservationIds: normalizeStrings(
      input.participatingObservationIds,
      "participatingObservationIds"
    ),
    participatingDomains: normalizeDomains(input.participatingDomains),
    evidenceWindow: normalizeEvidenceWindow(input.evidenceWindow),
    confidence: normalizeConfidence(input.confidence),
    materiality: normalizeMateriality(input.materiality),
    explanationData: normalizeJsonObject(
      input.explanationData,
      "explanationData"
    ),
    provenance: normalizeClaimProvenance(input.provenance),
    limitations: normalizeStrings(input.limitations, "limitations"),
  };
  validatePICrossDomainClaim(claim);
  return claim;
}

export function validatePICrossDomainClaim(input) {
  assertPlainObject(input, "claim");
  requiredString(input.id, "id");
  requiredEnum(input.schemaVersion, "schemaVersion", [PI_CLAIM_SCHEMA_VERSION]);
  requiredEnum(input.kind, "kind", PI_CLAIM_KINDS);
  normalizeStrings(
    input.participatingObservationIds,
    "participatingObservationIds"
  );
  normalizeDomains(input.participatingDomains);
  normalizeEvidenceWindow(input.evidenceWindow);
  normalizeConfidence(input.confidence);
  normalizeMateriality(input.materiality);
  normalizeJsonObject(input.explanationData, "explanationData");
  normalizeClaimProvenance(input.provenance);
  normalizeStrings(input.limitations, "limitations");
  return true;
}

export function isPICrossDomainClaim(value) {
  try {
    validatePICrossDomainClaim(value);
    return true;
  } catch {
    return false;
  }
}

export function createPICrossDomainClaims(observations = []) {
  if (!Array.isArray(observations)) {
    throw new Error("observations must be an array.");
  }
  const normalized = deduplicateObservations(observations);
  const unsupported = normalized.filter(
    (observation) => !["weight", "energy", "training", "dexa", "photos"].includes(observation.domain)
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported PI claim domains: ${[...new Set(unsupported.map((item) => item.domain))].sort().join(", ")}.`
    );
  }
  const weight = normalized.filter((item) => item.domain === "weight");
  const energy = normalized.filter((item) => item.domain === "energy");
  const training = normalized.filter((item) => item.domain === "training");
  return [
    ...createWeightEnergyClaims(weight, energy),
    ...(training.length > 0
      ? createTrainingWeightClaims(training, weight)
      : []),
  ].sort((left, right) => left.id.localeCompare(right.id));
}

export function createWeightEnergyClaims(
  weightObservations = [],
  energyObservations = []
) {
  const weights = validateDomainObservations(weightObservations, "weight");
  const energies = validateDomainObservations(energyObservations, "energy");
  const coverageByHorizon = new Map(
    energies
      .filter((item) => item.kind === "paired_day_coverage")
      .map((item) => [semanticHorizon(item), item])
  );
  const metrics = energies.filter((item) =>
    Object.hasOwn(ENERGY_RELATIONSHIPS, item.kind)
  );
  const claims = [];
  const matchedWeights = new Set();
  const matchedMetrics = new Set();

  metrics.forEach((energy) => {
    const compatibleWeights = weights
      .filter((weight) => compatible(weight, energy))
      .sort(preferWeightObservation);
    const weight = compatibleWeights[0];
    if (!weight) return;
    compatibleWeights.forEach((item) => matchedWeights.add(item.id));
    matchedMetrics.add(energy.id);
    claims.push(
      relationshipClaim({
        coverage: coverageByHorizon.get(semanticHorizon(energy)) ?? null,
        energy,
        weight,
      })
    );
  });

  weights
    .filter(isObserved)
    .filter((weight) => !matchedWeights.has(weight.id))
    .forEach((weight) => {
      claims.push(insufficientEnergyClaim(weight, metrics));
    });
  metrics
    .filter(isObserved)
    .filter((energy) => !matchedMetrics.has(energy.id))
    .forEach((energy) => {
      claims.push(insufficientWeightClaim(energy, weights));
    });

  return deduplicateClaims(claims).sort((left, right) =>
    left.id.localeCompare(right.id)
  );
}

export function createTrainingWeightClaims(
  trainingObservations = [],
  weightObservations = []
) {
  const training = validateDomainObservations(trainingObservations, "training");
  const weights = validateDomainObservations(weightObservations, "weight");
  const candidates = training.flatMap(trainingSignalCandidates);
  const groups = groupTrainingCandidates(candidates);
  const claims = [];
  const matchedTrainingIds = new Set();
  const matchedWeightIds = new Set();

  groups.forEach((group) => {
    const compatibleWeights = weights
      .filter((item) => isMeasurableWeight(item))
      .filter((item) => trainingWeightCompatible(group[0], item))
      .sort(preferWeightObservation);
    const selectedWeight = compatibleWeights[0];
    if (!selectedWeight) return;
    const selectedTraining = selectTrainingCandidate(group);
    const suppressed = group
      .filter((candidate) => candidate.observation.id !== selectedTraining.observation.id)
      .map((candidate) => candidate.observation.id)
      .sort();
    const conflicting = hasConflictingTrainingSignals(
      candidates,
      selectedTraining,
      selectedWeight
    );
    group.forEach((candidate) =>
      matchedTrainingIds.add(candidate.observation.id)
    );
    compatibleWeights.forEach((item) => matchedWeightIds.add(item.id));
    claims.push(
      trainingWeightRelationshipClaim({
        conflicting,
        selectedTraining,
        suppressed,
        weight: selectedWeight,
      })
    );
  });

  preferredWeightsByHorizon(weights)
    .filter((weight) => !matchedWeightIds.has(weight.id))
    .forEach((weight) => {
      claims.push(insufficientTrainingClaim(weight, training, candidates));
    });

  groups
    .map(selectTrainingCandidate)
    .filter((candidate) => !matchedTrainingIds.has(candidate.observation.id))
    .forEach((candidate) => {
      claims.push(insufficientWeightForTrainingClaim(candidate, weights));
    });

  if (candidates.length === 0 && training.length > 0) {
    preferredWeightsByHorizon(weights).forEach((weight) => {
      if (claims.some((claim) =>
        claim.kind === "insufficient_training_to_support_weight_claim" &&
        claim.explanationData.weightObservationId === weight.id
      )) return;
      claims.push(insufficientTrainingClaim(weight, training, candidates));
    });
  }

  return deduplicateClaims(claims).sort((left, right) =>
    left.id.localeCompare(right.id)
  );
}

function trainingWeightRelationshipClaim({
  conflicting,
  selectedTraining,
  suppressed,
  weight,
}) {
  const training = selectedTraining.observation;
  const horizon = relationshipHorizon(training, weight);
  const evidenceWindow = sharedEvidenceWindow(training, weight);
  const overlap = classifyEvidenceOverlap(training, weight, evidenceWindow);
  const narrow = training.subject.type === "exercise";
  const limitations = [
    ...(training.confidence.limitations ?? []),
    ...(weight.confidence.limitations ?? []),
    ...(narrow ? ["training_scope_isolated_exercise"] : []),
    ...(overlap === "partial" ? ["evidence_window_overlap_partial"] : []),
    ...(conflicting ? ["conflicting_training_directions"] : []),
  ];
  const kind = trainingWeightClaimKind(selectedTraining, weight);
  const goalContext = {
    training: summarizeGoalContext(training.goalContext),
    weight: summarizeGoalContext(weight.goalContext),
  };
  const observations = [training, weight];

  return createPICrossDomainClaim({
    kind,
    semanticScope: `${horizon}.${selectedTraining.relationship}`,
    participatingObservationIds: observations.map((item) => item.id),
    participatingDomains: ["training", "weight"],
    evidenceWindow,
    confidence: claimConfidence(observations, limitations),
    materiality: neutralMateriality(),
    explanationData: {
      semanticHorizon: horizon,
      relationship: selectedTraining.relationship,
      trainingObservationId: training.id,
      weightObservationId: weight.id,
      trainingKind: training.kind,
      trainingSubject: training.subject,
      trainingStatus: training.status,
      trainingDirection: selectedTraining.direction,
      weightKind: weight.kind,
      weightDirection: weight.direction,
      trainingSemanticScope: trainingScope(training),
      weightSemanticHorizon: semanticHorizon(weight),
      sharedEvidenceWindow: evidenceWindow,
      evidenceOverlap: overlap,
      trainingEvidenceCount: training.supportingEvidenceIds.length,
      weightSampleCount: weightSampleCount(weight),
      selectedObservationRationale: selectedTraining.rationale,
      suppressedEligibleTrainingObservationIds: suppressed,
      goalContext,
      confidenceBasis: {
        method: "weakest_participant_with_limitation_reduction",
        participantLevels: observations.map((item) => ({
          observationId: item.id,
          level: item.confidence.level,
        })),
      },
      limitations: [...new Set(limitations)].sort(),
    },
    provenance: trainingClaimProvenance(observations, {
      selectedTrainingObservationId: training.id,
      selectedWeightObservationId: weight.id,
      suppressedTrainingObservationIds: suppressed,
    }),
    limitations,
  });
}

function insufficientTrainingClaim(weight, training, candidates) {
  const horizon = semanticHorizon(weight);
  const limitations = [
    "training_observation_unavailable_or_ineligible",
    ...trainingAvailabilityLimitations(weight, training, candidates),
  ];
  return createPICrossDomainClaim({
    kind: "insufficient_training_to_support_weight_claim",
    semanticScope: horizon,
    participatingObservationIds: [weight.id],
    participatingDomains: ["weight"],
    evidenceWindow: weight.evidenceWindow,
    confidence: claimConfidence([weight], limitations),
    materiality: neutralMateriality(),
    explanationData: {
      semanticHorizon: horizon,
      trainingObservationId: null,
      weightObservationId: weight.id,
      trainingKind: null,
      trainingSubject: null,
      trainingStatus: "unavailable",
      trainingDirection: "unavailable",
      weightKind: weight.kind,
      weightDirection: weight.direction,
      trainingSemanticScope: null,
      weightSemanticHorizon: horizon,
      sharedEvidenceWindow: weight.evidenceWindow,
      evidenceOverlap: "unavailable",
      trainingEvidenceCount: 0,
      weightSampleCount: weightSampleCount(weight),
      selectedObservationRationale: "no_eligible_training_observation",
      suppressedEligibleTrainingObservationIds: [],
      goalContext: {
        training: null,
        weight: summarizeGoalContext(weight.goalContext),
      },
      confidenceBasis: {
        method: "weakest_participant_with_limitation_reduction",
        participantLevels: [
          { observationId: weight.id, level: weight.confidence.level },
        ],
      },
      limitations,
    },
    provenance: trainingClaimProvenance([weight], {
      selectedTrainingObservationId: null,
      selectedWeightObservationId: weight.id,
      suppressedTrainingObservationIds: [],
    }),
    limitations,
  });
}

function insufficientWeightForTrainingClaim(candidate, weights) {
  const training = candidate.observation;
  const horizon = trainingHorizon(training) ?? "unspecified_horizon";
  const limitations = [
    "weight_observation_unavailable_for_training_relationship",
    ...weightAvailabilityLimitations(training, weights),
  ];
  return createPICrossDomainClaim({
    kind: "insufficient_weight_to_support_training_claim",
    semanticScope: `${horizon}.${candidate.relationship}`,
    participatingObservationIds: [training.id],
    participatingDomains: ["training"],
    evidenceWindow: training.evidenceWindow,
    confidence: claimConfidence([training], limitations),
    materiality: neutralMateriality(),
    explanationData: {
      semanticHorizon: horizon,
      relationship: candidate.relationship,
      trainingObservationId: training.id,
      weightObservationId: null,
      trainingKind: training.kind,
      trainingSubject: training.subject,
      trainingStatus: training.status,
      trainingDirection: candidate.direction,
      weightKind: null,
      weightDirection: "unavailable",
      trainingSemanticScope: trainingScope(training),
      weightSemanticHorizon: null,
      sharedEvidenceWindow: training.evidenceWindow,
      evidenceOverlap: "unavailable",
      trainingEvidenceCount: training.supportingEvidenceIds.length,
      weightSampleCount: 0,
      selectedObservationRationale: candidate.rationale,
      suppressedEligibleTrainingObservationIds: [],
      goalContext: {
        training: summarizeGoalContext(training.goalContext),
        weight: null,
      },
      confidenceBasis: {
        method: "weakest_participant_with_limitation_reduction",
        participantLevels: [
          { observationId: training.id, level: training.confidence.level },
        ],
      },
      limitations,
    },
    provenance: trainingClaimProvenance([training], {
      selectedTrainingObservationId: training.id,
      selectedWeightObservationId: null,
      suppressedTrainingObservationIds: [],
    }),
    limitations,
  });
}

function trainingSignalCandidates(observation) {
  if (
    observation.kind !== "training_performance" ||
    observation.status === "insufficient_data" ||
    !["training_scope", "training_category", "exercise"].includes(
      observation.subject.type
    )
  ) {
    return [];
  }
  const candidates = [];
  const prDetected =
    observation.subject.type === "exercise" &&
    observation.explanationData?.pr_detection?.detected === true;
  const volumeDirection =
    observation.subject.type === "exercise"
      ? observation.explanationData?.volume_trend?.direction
      : null;

  if (prDetected || observation.status === "improving") {
    candidates.push({
      observation,
      relationship: "progress",
      direction: "improving",
      explicitProgressiveOverload: prDetected,
      rationale: prDetected
        ? "explicit_progressive_overload_precedence"
        : `${scopeName(observation)}_performance_trend`,
    });
  }
  if (observation.status === "regressing") {
    candidates.push({
      observation,
      relationship: "regression",
      direction: "regressing",
      explicitProgressiveOverload: false,
      rationale: `${scopeName(observation)}_performance_trend`,
    });
  }
  if (["up", "down", "flat"].includes(volumeDirection)) {
    candidates.push({
      observation,
      relationship: "volume",
      direction: { up: "rising", down: "falling", flat: "stable" }[
        volumeDirection
      ],
      explicitProgressiveOverload: false,
      rationale: "exercise_volume_trend",
    });
  }
  if (
    ["stable", "plateauing"].includes(observation.status) &&
    observation.subject.type !== "exercise"
  ) {
    candidates.push({
      observation,
      relationship: "stability",
      direction: "stable",
      explicitProgressiveOverload: false,
      rationale: `${scopeName(observation)}_performance_stability`,
    });
  }
  return candidates;
}

function groupTrainingCandidates(candidates) {
  const groups = new Map();
  candidates.forEach((candidate) => {
    const horizon = trainingHorizon(candidate.observation) ?? "weight_defined";
    const key = `${candidate.relationship}|${horizon}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  });
  return [...groups.values()].sort((left, right) =>
    `${left[0].relationship}|${trainingHorizon(left[0].observation) ?? ""}`
      .localeCompare(
        `${right[0].relationship}|${trainingHorizon(right[0].observation) ?? ""}`
      )
  );
}

function selectTrainingCandidate(candidates) {
  return [...candidates].sort(compareTrainingCandidates)[0];
}

function compareTrainingCandidates(left, right) {
  const leftScope = trainingCandidatePriority(left);
  const rightScope = trainingCandidatePriority(right);
  return (
    leftScope - rightScope ||
    CONFIDENCE_ORDER.indexOf(right.observation.confidence.level) -
      CONFIDENCE_ORDER.indexOf(left.observation.confidence.level) ||
    right.observation.supportingEvidenceIds.length -
      left.observation.supportingEvidenceIds.length ||
    left.observation.id.localeCompare(right.observation.id)
  );
}

function trainingCandidatePriority(candidate) {
  if (candidate.explicitProgressiveOverload) return 0;
  return {
    training_scope: 1,
    training_category: 2,
    exercise: candidate.relationship === "volume" ? 3 : 4,
  }[candidate.observation.subject.type] ?? 9;
}

function trainingWeightClaimKind(candidate, weight) {
  const weightState = weight.direction === "stable" ? "stability" : "change";
  if (candidate.relationship === "progress") {
    return `training_progress_weight_${weightState}`;
  }
  if (candidate.relationship === "regression") {
    return `training_regression_weight_${weightState}`;
  }
  if (candidate.relationship === "volume") {
    return `training_volume_weight_${weightState}`;
  }
  return "weight_change_training_stability";
}

function trainingWeightCompatible(candidate, weight) {
  const training = candidate.observation;
  const explicitHorizon = trainingHorizon(training);
  const horizonsCompatible =
    explicitHorizon == null || explicitHorizon === semanticHorizon(weight);
  const shared = sharedEvidenceWindow(training, weight);
  if (!horizonsCompatible || !shared) return false;
  if (
    training.subject.type === "exercise" &&
    daysInclusive(shared.startDate, shared.endDate) < 2
  ) {
    return false;
  }
  return true;
}

function relationshipHorizon(training, weight) {
  return trainingHorizon(training) ?? semanticHorizon(weight);
}

function trainingHorizon(observation) {
  const explicit = observation.explanationData?.calculationHorizon;
  if (explicit) return explicit;
  return observation.id.startsWith("pi|")
    ? semanticHorizon(observation)
    : null;
}

function trainingScope(observation) {
  return `${scopeName(observation)}.${observation.subject.id ?? observation.subject.semanticKey}`;
}

function scopeName(observation) {
  return {
    training_scope: "overall",
    training_category: "category",
    exercise: "exercise",
  }[observation.subject.type] ?? "unsupported";
}

function classifyEvidenceOverlap(training, weight, shared) {
  if (!shared) return "none";
  const trainingDays = daysInclusive(
    training.evidenceWindow.startDate,
    training.evidenceWindow.endDate
  );
  const weightDays = daysInclusive(
    weight.evidenceWindow.startDate,
    weight.evidenceWindow.endDate
  );
  const sharedDays = daysInclusive(shared.startDate, shared.endDate);
  return sharedDays === Math.min(trainingDays, weightDays) ? "complete" : "partial";
}

function hasConflictingTrainingSignals(candidates, selected, weight) {
  if (!["progress", "regression"].includes(selected.relationship)) return false;
  const opposite = selected.relationship === "progress" ? "regression" : "progress";
  return candidates.some(
    (candidate) =>
      candidate.relationship === opposite &&
      trainingWeightCompatible(candidate, weight)
  );
}

function trainingAvailabilityLimitations(weight, training, candidates) {
  if (training.length === 0) return ["relationship_unavailable"];
  if (candidates.length === 0) {
    return training.some((item) => item.status === "insufficient_data")
      ? ["training_observation_insufficient"]
      : ["training_observation_ineligible"];
  }
  const limitations = [];
  if (
    candidates.every((candidate) => {
      const horizon = trainingHorizon(candidate.observation);
      return horizon != null && horizon !== semanticHorizon(weight);
    })
  ) {
    limitations.push("semantic_horizon_mismatch");
  }
  if (
    candidates.every(
      (candidate) => !sharedEvidenceWindow(candidate.observation, weight)
    )
  ) {
    limitations.push("evidence_windows_do_not_overlap");
  }
  if (
    candidates.every(
      (candidate) =>
        candidate.observation.subject.type === "exercise" &&
        daysInclusive(
          sharedEvidenceWindow(candidate.observation, weight)?.startDate,
          sharedEvidenceWindow(candidate.observation, weight)?.endDate
        ) < 2
    )
  ) {
    limitations.push("training_scope_too_narrow_for_overlap");
  }
  return limitations.length > 0 ? limitations : ["relationship_unavailable"];
}

function weightAvailabilityLimitations(training, weights) {
  if (weights.length === 0) return ["relationship_unavailable"];
  if (weights.every((item) => !isMeasurableWeight(item))) {
    return ["weight_observation_insufficient"];
  }
  const explicitHorizon = trainingHorizon(training);
  if (
    explicitHorizon &&
    weights.every((item) => semanticHorizon(item) !== explicitHorizon)
  ) {
    return ["semantic_horizon_mismatch"];
  }
  if (weights.every((item) => !sharedEvidenceWindow(item, training))) {
    return ["evidence_windows_do_not_overlap"];
  }
  return ["relationship_unavailable"];
}

function preferredWeightsByHorizon(weights) {
  const groups = new Map();
  weights.filter(isMeasurableWeight).forEach((weight) => {
    const horizon = semanticHorizon(weight);
    groups.set(horizon, [...(groups.get(horizon) ?? []), weight]);
  });
  return [...groups.values()].map((items) =>
    [...items].sort(preferWeightObservation)[0]
  );
}

function isMeasurableWeight(observation) {
  return (
    isObserved(observation) &&
    [
      "weight_short_window_change",
      "weight_average_change",
      "weight_daily_rolling_average_change",
    ].includes(observation.kind) &&
    ["rising", "falling", "stable"].includes(observation.direction)
  );
}

function summarizeGoalContext(context) {
  if (!context) return null;
  return {
    activeGoalId: context.activeGoalId,
    semanticGoalType: context.semanticGoalType,
    goalPhase: context.goalPhase,
    phaseAgeBand: context.phaseAgeBand,
    observationRole: context.observationRole,
    primaryOutcomeRelevance: context.primaryOutcomeRelevance,
    guardrailRelevance: context.guardrailRelevance,
  };
}

function weightSampleCount(weight) {
  return (
    weight.explanationData?.sampleCount ??
    (weight.explanationData?.currentSampleCount ?? 0) +
      (weight.explanationData?.comparisonSampleCount ?? 0)
  );
}

function trainingClaimProvenance(observations, diagnostics) {
  return {
    producer: "pi_cross_domain_claim_service",
    producerVersion: PI_TRAINING_WEIGHT_CLAIM_SYNTHESIZER_VERSION,
    calculationMethod: "training_weight_observation_relationship",
    sourceObservationIds: observations.map((item) => item.id),
    sourceEvidenceIds: observations.flatMap(
      (item) => item.provenance.sourceEvidenceIds ?? []
    ),
    producerChain: observations.map((item) => ({
      observationId: item.id,
      producer: item.provenance.producer,
      producerVersion: item.provenance.producerVersion,
    })),
    synthesisDiagnostics: diagnostics,
  };
}

function relationshipClaim({ coverage, energy, weight }) {
  const relationship = ENERGY_RELATIONSHIPS[energy.kind];
  const weightState = weight.direction === "stable" ? "stability" : "change";
  const kind = `${relationship}_weight_${weightState}`;
  const horizon = semanticHorizon(weight);
  const participating = [weight, energy, ...(coverage ? [coverage] : [])];
  const coverageSummary = summarizeCoverage(coverage);
  const limitations = claimLimitations(participating, coverageSummary);
  const evidenceWindow = sharedEvidenceWindow(weight, energy);

  return createPICrossDomainClaim({
    kind,
    semanticScope: horizon,
    participatingObservationIds: participating.map((item) => item.id),
    participatingDomains: ["weight", "energy"],
    evidenceWindow,
    confidence: claimConfidence(participating, limitations),
    materiality: neutralMateriality(),
    explanationData: {
      semanticHorizon: horizon,
      relationship,
      weightDirection: weight.direction,
      energyDirection: energy.direction,
      energyKind: energy.kind,
      coverage: coverageSummary,
      participatingObservationIds: participating.map((item) => item.id).sort(),
      sharedEvidenceWindow: evidenceWindow,
      confidenceBasis: {
        method: "weakest_participant_with_limitation_reduction",
        participantLevels: participating.map((item) => ({
          observationId: item.id,
          level: item.confidence.level,
        })),
      },
      limitations,
    },
    provenance: claimProvenance(participating),
    limitations,
  });
}

function insufficientEnergyClaim(weight, energyCandidates) {
  const horizon = semanticHorizon(weight);
  const limitations = [
    "energy_observation_unavailable_for_compatible_horizon_and_window",
    ...availabilityLimitations(weight, energyCandidates),
  ];
  return createPICrossDomainClaim({
    kind: "insufficient_energy_to_explain_weight",
    semanticScope: horizon,
    participatingObservationIds: [weight.id],
    participatingDomains: ["weight"],
    evidenceWindow: weight.evidenceWindow,
    confidence: claimConfidence([weight], limitations),
    materiality: neutralMateriality(),
    explanationData: {
      semanticHorizon: horizon,
      weightDirection: weight.direction,
      energyDirection: "unavailable",
      coverage: { state: "missing", completePairedDays: 0 },
      participatingObservationIds: [weight.id],
      sharedEvidenceWindow: weight.evidenceWindow,
      confidenceBasis: {
        method: "weakest_participant_with_limitation_reduction",
        participantLevels: [
          { observationId: weight.id, level: weight.confidence.level },
        ],
      },
      limitations,
    },
    provenance: claimProvenance([weight]),
    limitations,
  });
}

function insufficientWeightClaim(energy, weightCandidates) {
  const horizon = semanticHorizon(energy);
  const limitations = [
    "weight_observation_unavailable_for_compatible_horizon_and_window",
    ...availabilityLimitations(energy, weightCandidates),
  ];
  return createPICrossDomainClaim({
    kind: "insufficient_weight_to_support_energy_claim",
    semanticScope: `${horizon}.${ENERGY_RELATIONSHIPS[energy.kind]}`,
    participatingObservationIds: [energy.id],
    participatingDomains: ["energy"],
    evidenceWindow: energy.evidenceWindow,
    confidence: claimConfidence([energy], limitations),
    materiality: neutralMateriality(),
    explanationData: {
      semanticHorizon: horizon,
      relationship: ENERGY_RELATIONSHIPS[energy.kind],
      weightDirection: "unavailable",
      energyDirection: energy.direction,
      energyKind: energy.kind,
      coverage: { state: "unavailable", completePairedDays: null },
      participatingObservationIds: [energy.id],
      sharedEvidenceWindow: energy.evidenceWindow,
      confidenceBasis: {
        method: "weakest_participant_with_limitation_reduction",
        participantLevels: [
          { observationId: energy.id, level: energy.confidence.level },
        ],
      },
      limitations,
    },
    provenance: claimProvenance([energy]),
    limitations,
  });
}

function compatible(weight, energy) {
  return (
    isObserved(weight) &&
    isObserved(energy) &&
    ["rising", "falling", "stable"].includes(weight.direction) &&
    ["rising", "falling", "stable"].includes(energy.direction) &&
    semanticHorizon(weight) === semanticHorizon(energy) &&
    Boolean(sharedEvidenceWindow(weight, energy))
  );
}

function availabilityLimitations(observation, candidates) {
  if (candidates.length === 0) return ["relationship_unavailable"];
  const limitations = [];
  if (
    candidates.every(
      (candidate) => semanticHorizon(candidate) !== semanticHorizon(observation)
    )
  ) {
    limitations.push("semantic_horizon_mismatch");
  }
  if (
    candidates.every(
      (candidate) => !sharedEvidenceWindow(candidate, observation)
    )
  ) {
    limitations.push("evidence_windows_do_not_overlap");
  }
  if (candidates.every((candidate) => !isObserved(candidate))) {
    limitations.push("participating_observation_insufficient");
  }
  return limitations.length > 0 ? limitations : ["relationship_unavailable"];
}

function summarizeCoverage(coverage) {
  if (!coverage) return { state: "missing", completePairedDays: 0 };
  const completePairedDays =
    coverage.explanationData?.completePairedDays ?? 0;
  const partialDays = coverage.explanationData?.partialDays ?? 0;
  const state =
    coverage.status === "insufficient_data" || completePairedDays === 0
      ? "missing"
      : partialDays > 0 || coverage.confidence.limitations.length > 0
        ? "partial"
        : "complete";
  return {
    state,
    completePairedDays,
    partialDays,
    nutritionOnlyDays:
      coverage.explanationData?.nutritionOnlyDays ?? 0,
    activityOnlyDays:
      coverage.explanationData?.activityOnlyDays ?? 0,
  };
}

function claimLimitations(observations, coverage) {
  const inherited = observations.flatMap(
    (item) => item.confidence.limitations ?? []
  );
  const coverageLimitations =
    coverage.state === "complete"
      ? []
      : coverage.state === "partial"
        ? ["paired_energy_coverage_partial"]
        : ["paired_energy_coverage_missing"];
  return [...new Set([...inherited, ...coverageLimitations])].sort();
}

function claimConfidence(observations, limitations) {
  const participantLevels = observations.map(
    (item) => item.confidence.level
  );
  const weakestIndex = Math.min(
    ...participantLevels.map((level) => CONFIDENCE_ORDER.indexOf(level))
  );
  const adjustedIndex =
    limitations.length > 0 ? Math.max(0, weakestIndex - 1) : weakestIndex;
  return {
    level: CONFIDENCE_ORDER[adjustedIndex],
    score: null,
    reasons: [`weakest_participant_${CONFIDENCE_ORDER[weakestIndex]}`],
    factors: observations.map((item) => ({
      observationId: item.id,
      level: item.confidence.level,
    })),
    limitations,
    method: "weakest_participant_with_limitation_reduction",
  };
}

function neutralMateriality() {
  return {
    level: "unevaluated",
    score: null,
    basis: [],
    method: "ranking_not_implemented",
  };
}

function claimProvenance(observations) {
  return {
    producer: "pi_cross_domain_claim_service",
    producerVersion: PI_CLAIM_SYNTHESIZER_VERSION,
    calculationMethod: "weight_energy_observation_relationship",
    sourceObservationIds: observations.map((item) => item.id),
    producerChain: observations.map((item) => ({
      observationId: item.id,
      producer: item.provenance.producer,
      producerVersion: item.provenance.producerVersion,
    })),
  };
}

function semanticHorizon(observation) {
  const scope = observation.id.split("|").at(-1);
  return scope?.split(".")[0] ?? "unknown_horizon";
}

function sharedEvidenceWindow(left, right) {
  const startDate = [left.evidenceWindow.startDate, right.evidenceWindow.startDate]
    .filter(Boolean)
    .sort()
    .at(-1);
  const endDate = [left.evidenceWindow.endDate, right.evidenceWindow.endDate]
    .filter(Boolean)
    .sort()[0];
  if (!startDate || !endDate || startDate > endDate) return null;
  return {
    startDate,
    endDate,
    comparisonStartDate: latestDate(
      left.evidenceWindow.comparisonStartDate,
      right.evidenceWindow.comparisonStartDate
    ),
    comparisonEndDate: earliestDate(
      left.evidenceWindow.comparisonEndDate,
      right.evidenceWindow.comparisonEndDate
    ),
  };
}

function preferWeightObservation(left, right) {
  const priority = {
    weight_daily_rolling_average_change: -1,
    weight_average_change: 0,
    weight_short_window_change: 1,
  };
  return (
    (priority[left.kind] ?? 9) - (priority[right.kind] ?? 9) ||
    left.id.localeCompare(right.id)
  );
}

function validateDomainObservations(observations, domain) {
  if (!Array.isArray(observations)) {
    throw new Error(`${domain}Observations must be an array.`);
  }
  return deduplicateObservations(observations).map((observation) => {
    if (observation.domain !== domain) {
      throw new Error(`Expected ${domain} observation, received ${observation.domain}.`);
    }
    return observation;
  });
}

function deduplicateObservations(observations) {
  const byId = new Map();
  observations.forEach((observation) => {
    validatePIObservation(observation);
    const existing = byId.get(observation.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(observation)) {
      throw new Error(`Conflicting duplicate PI observation: ${observation.id}.`);
    }
    byId.set(observation.id, observation);
  });
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function deduplicateClaims(claims) {
  const byId = new Map();
  claims.forEach((claim) => {
    const existing = byId.get(claim.id);
    if (!existing) byId.set(claim.id, claim);
  });
  return [...byId.values()];
}

function normalizeEvidenceWindow(value) {
  assertPlainObject(value, "evidenceWindow");
  const startDate = optionalDate(value.startDate, "evidenceWindow.startDate");
  const endDate = optionalDate(value.endDate, "evidenceWindow.endDate");
  if (Boolean(startDate) !== Boolean(endDate) || (startDate && startDate > endDate)) {
    throw new Error("claim evidenceWindow requires an ordered startDate and endDate.");
  }
  return {
    startDate,
    endDate,
    comparisonStartDate: optionalDate(
      value.comparisonStartDate,
      "evidenceWindow.comparisonStartDate"
    ),
    comparisonEndDate: optionalDate(
      value.comparisonEndDate,
      "evidenceWindow.comparisonEndDate"
    ),
  };
}

function normalizeConfidence(value = {}) {
  assertPlainObject(value, "confidence");
  return {
    level: requiredEnum(
      value.level ?? "unevaluated",
      "confidence.level",
      PI_CONFIDENCE_LEVELS
    ),
    score: value.score == null ? null : finiteNumber(value.score, "confidence.score"),
    reasons: normalizeStrings(value.reasons, "confidence.reasons"),
    factors: normalizeJsonArray(value.factors, "confidence.factors"),
    limitations: normalizeStrings(
      value.limitations,
      "confidence.limitations"
    ),
    method: requiredMachineKey(value.method, "confidence.method"),
  };
}

function normalizeMateriality(value = {}) {
  assertPlainObject(value, "materiality");
  return {
    level: requiredEnum(
      value.level ?? "unevaluated",
      "materiality.level",
      PI_MATERIALITY_LEVELS
    ),
    score: value.score == null ? null : finiteNumber(value.score, "materiality.score"),
    basis: normalizeStrings(value.basis, "materiality.basis"),
    method: requiredMachineKey(value.method, "materiality.method"),
  };
}

function normalizeClaimProvenance(value = {}) {
  assertPlainObject(value, "provenance");
  const normalized = {
    producer: requiredMachineKey(value.producer, "provenance.producer"),
    producerVersion: requiredMachineKey(
      value.producerVersion,
      "provenance.producerVersion"
    ),
    calculationMethod: requiredMachineKey(
      value.calculationMethod,
      "provenance.calculationMethod"
    ),
    sourceObservationIds: normalizeStrings(
      value.sourceObservationIds,
      "provenance.sourceObservationIds"
    ),
    producerChain: normalizeJsonArray(
      value.producerChain,
      "provenance.producerChain"
    ),
  };
  if (value.sourceEvidenceIds != null) {
    normalized.sourceEvidenceIds = normalizeStrings(
      value.sourceEvidenceIds,
      "provenance.sourceEvidenceIds"
    );
  }
  if (value.synthesisDiagnostics != null) {
    normalized.synthesisDiagnostics = normalizeJsonObject(
      value.synthesisDiagnostics,
      "provenance.synthesisDiagnostics"
    );
  }
  return normalized;
}

function normalizeDomains(values = []) {
  const domains = normalizeStrings(values, "participatingDomains");
  domains.forEach((domain) => {
    if (!["weight", "energy", "training", "dexa", "photos", "nutrition", "recovery"].includes(domain)) {
      throw new Error(`Unsupported participating domain: ${domain}.`);
    }
  });
  return domains;
}

function normalizeStrings(values = [], field) {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array.`);
  return [...new Set(values.map((value, index) =>
    requiredString(value, `${field}[${index}]`)
  ))].sort();
}

function normalizeJsonArray(values = [], field) {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array.`);
  assertJsonSafe(values, field);
  return structuredClone(values);
}

function normalizeJsonObject(value = {}, field) {
  assertPlainObject(value, field);
  assertJsonSafe(value, field);
  return structuredClone(value);
}

function assertJsonSafe(value, field, seen = new Set()) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field} must be JSON-safe.`);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) {
    throw new Error(`${field} must be JSON-safe.`);
  }
  seen.add(value);
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, child] of entries) {
    assertJsonSafe(child, `${field}.${key}`, seen);
  }
  seen.delete(value);
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requiredMachineKey(value, field) {
  const normalized = requiredString(value, field);
  if (!MACHINE_KEY_PATTERN.test(normalized)) {
    throw new Error(`${field} must be a machine-readable key.`);
  }
  return normalized;
}

function requiredEnum(value, field, allowed) {
  const normalized = requiredString(value, field);
  if (!allowed.includes(normalized)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return normalized;
}

function optionalDate(value, field) {
  if (value == null) return null;
  const normalized = requiredString(value, field);
  if (!DATE_PATTERN.test(normalized)) {
    throw new Error(`${field} must use YYYY-MM-DD.`);
  }
  return normalized;
}

function finiteNumber(value, field) {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite.`);
  return value;
}

function assertPlainObject(value, field) {
  if (
    value == null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${field} must be a plain object.`);
  }
}

function isObserved(observation) {
  return observation.status === "observed";
}

function latestDate(left, right) {
  return [left, right].filter(Boolean).sort().at(-1) ?? null;
}

function earliestDate(left, right) {
  return [left, right].filter(Boolean).sort()[0] ?? null;
}

function daysInclusive(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return 0;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}
