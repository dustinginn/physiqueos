import { classifyObservationParticipationV3, EvidenceParticipationV3 } from "../EvidenceDomainClassificationV3.js";
import { resolveGoalRelativeAuthority } from "./GoalRelativeAuthorityResolver.js";
import { deepFreeze, requiredTimestamp } from "./V3Runtime.js";

export function selectStrategicallyEligibleEvidenceV3({
  goalContract,
  observations = [],
  evidenceCutoff,
} = {}) {
  const cutoff = requiredTimestamp(evidenceCutoff, "evidenceCutoff");
  const excluded = [];
  const candidates = [];
  for (const observation of observations) {
    const reason = exclusionReason(goalContract, observation, cutoff);
    if (reason) {
      excluded.push({ observationId: observation?.observationId ?? null, reason });
      continue;
    }
    const participation = classifyObservationParticipationV3({ goalContract, observation });
    if (participation.every((item) =>
      item.participation === EvidenceParticipationV3.NOT_CURRENTLY_STRATEGICALLY_ELIGIBLE)) {
      excluded.push({ observationId: observation.observationId, reason: "no_goal_relative_policy" });
      continue;
    }
    candidates.push(withStrategyScope(goalContract, observation));
  }

  const eligibleObservations = deduplicate(candidates);
  const authorityBindings = resolveGoalRelativeAuthority({ goalContract, observations: eligibleObservations });
  const freshness = eligibleObservations.map((observation) =>
    freshnessFor(goalContract, observation, cutoff));
  const requiredSubjects = (goalContract.evidencePolicies ?? [])
    .filter((policy) => [
      EvidenceParticipationV3.DIRECT_CONFIDENCE_INPUT,
      EvidenceParticipationV3.GUARDRAIL,
    ].includes(policy.participation))
    .map((policy) => `${policy.subjectType}|${policy.subjectId ?? "*" }`);
  const satisfiedSubjects = new Set(authorityBindings.map((binding) =>
    `${binding.subjectType}|${binding.subjectId ?? "*" }`));
  const missingSubjects = [...new Set(requiredSubjects)].filter((key) => !satisfiedSubjects.has(key));
  const contradictionGroups = new Map();
  for (const binding of authorityBindings) {
    if (!["supports", "contradicts"].includes(binding.signalDirection)) continue;
    const key = `${binding.subjectType}|${binding.subjectId ?? "*"}|${binding.capabilityId}`;
    const directions = contradictionGroups.get(key) ?? new Set();
    directions.add(binding.signalDirection);
    contradictionGroups.set(key, directions);
  }
  const contradictions = [...contradictionGroups.entries()]
    .filter(([, directions]) => directions.size > 1)
    .map(([key]) => ({ key, state: "contradictory_eligible_evidence" }));
  const completeness = requiredSubjects.length === 0 ? "not_required" :
    missingSubjects.length === 0 ? "complete" :
      missingSubjects.length === new Set(requiredSubjects).size ? "missing" : "partial";

  return deepFreeze({
    schemaVersion: "strategic_evidence_eligibility_v3",
    evidenceCutoff: cutoff,
    eligibleObservations,
    eligibleObservationIds: eligibleObservations.map((item) => item.observationId).sort(),
    excluded,
    freshness,
    completeness,
    missingSubjects,
    contradictions,
    participation: eligibleObservations.flatMap((observation) =>
      classifyObservationParticipationV3({ goalContract, observation })),
  });
}

function exclusionReason(goalContract, observation, cutoff) {
  if (!observation?.observationId) return "invalid_observation";
  if (["superseded", "retracted"].includes(observation.status)) return observation.status;
  if (Date.parse(observation.observedAt) > Date.parse(cutoff)) return "after_evidence_cutoff";
  if (observation.relatedGoalIds?.length && !observation.relatedGoalIds.includes(goalContract.goalId)) {
    return "different_goal";
  }
  if (observation.phaseId && goalContract.phase.phaseId &&
      observation.phaseId !== goalContract.phase.phaseId) {
    return "different_phase";
  }
  return null;
}

function withStrategyScope(goalContract, observation) {
  const scoped = observation.strategyRevisionId == null ||
    observation.strategyRevisionId === goalContract.strategy.strategyRevisionId;
  return deepFreeze({ ...structuredClone(observation), strategyScopeEligible: scoped });
}

function deduplicate(observations) {
  const byCanonicalRecord = new Map();
  for (const observation of observations) {
    const key = observation.canonicalRecordId ?? observation.observationId;
    const existing = byCanonicalRecord.get(key);
    if (!existing || Date.parse(observation.observedAt) >= Date.parse(existing.observedAt)) {
      byCanonicalRecord.set(key, observation);
    }
  }
  return [...byCanonicalRecord.values()].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt) ||
    left.observationId.localeCompare(right.observationId));
}

function freshnessFor(goalContract, observation, cutoff) {
  const matchingRequests = (goalContract.evidenceRequests ?? []).filter((request) =>
    request.alternatives.some((alternative) =>
      alternative.capabilityIds.some((id) =>
        observation.capabilities.some((measurement) => measurement.capabilityId === id))));
  const cadenceDays = Math.min(...matchingRequests
    .map((request) => request.timing.cadenceDays)
    .filter((value) => value > 0));
  const ageDays = Math.max(0, Math.floor((Date.parse(cutoff) -
    Date.parse(observation.observedAt)) / 86_400_000));
  const state = !Number.isFinite(cadenceDays) ? "cadence_not_configured" :
    ageDays <= cadenceDays ? "current" :
      ageDays <= cadenceDays * 1.5 ? "aging" : "stale";
  return {
    observationId: observation.observationId,
    observedAt: observation.observedAt,
    ageDays,
    expectedCadenceDays: Number.isFinite(cadenceDays) ? cadenceDays : null,
    state,
  };
}
