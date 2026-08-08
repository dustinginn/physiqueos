import {
  PhaseActivationRecordStatus,
  activationRecordFingerprint,
  assertNoExecutionOwnedFields,
  deepFreeze,
  immutablePhaseRecordContent,
  normalizePhaseSourceLineage,
  required,
  validatePhaseRecordEnvelope,
} from "./phaseActivationRecord";

export const PHASE_STRATEGY_SCHEMA_VERSION = "phase_strategy_v1";
export const PHASE_STRATEGY_REQUIRED_DOMAINS = Object.freeze([
  "energy", "nutrition", "training", "activity", "recovery", "coaching",
  "peptides", "supplements", "guardrailResponse",
]);

export function createPhaseStrategy(input = {}) {
  const strategyId = required(input.strategyId ?? input.id, "strategyId");
  const record = {
    schemaVersion: PHASE_STRATEGY_SCHEMA_VERSION,
    id: strategyId,
    strategyId,
    goalId: required(input.goalId ?? input.GoalId, "goalId"),
    phaseId: required(input.phaseId, "phaseId"),
    revision: Number(input.revision ?? 0),
    status: input.status ?? PhaseActivationRecordStatus.DRAFT,
    createdAt: new Date(input.createdAt).toISOString(),
    acceptedAt: input.acceptedAt ?? null,
    acceptedBy: input.acceptedBy ?? null,
    acceptanceId: input.acceptanceId ?? null,
    acceptanceIdempotencyKey: input.acceptanceIdempotencyKey ?? null,
    acceptedRevision: input.acceptedRevision ?? null,
    rejectedAt: input.rejectedAt ?? null,
    rejectedBy: input.rejectedBy ?? null,
    supersededAt: input.supersededAt ?? null,
    supersededBy: input.supersededBy ?? null,
    supersedesId: input.supersedesId ?? null,
    sourceLineage: normalizePhaseSourceLineage(input.sourceLineage),
    purpose: structuredClone(input.purpose),
    domains: structuredClone(input.domains),
    strategyHypothesis: structuredClone(input.strategyHypothesis),
  };
  record.contentFingerprint = activationRecordFingerprint(immutablePhaseRecordContent(record));
  validatePhaseStrategy(record);
  return deepFreeze(record);
}

export function validatePhaseStrategy(record, options = {}) {
  validatePhaseRecordEnvelope(record, {
    idField: "strategyId", schemaVersion: PHASE_STRATEGY_SCHEMA_VERSION,
    expectedGoalId: options.expectedGoalId, expectedPhaseId: options.expectedPhaseId,
  });
  if (!record.purpose || typeof record.purpose !== "object") throw new TypeError("Strategy purpose is required.");
  for (const key of ["supportLeanMassGain", "protectBodyFatGuardrail",
    "avoidUnnecessarilyAggressiveSurplus", "preserveGoalRunway"]) {
    if (record.purpose[key] !== true) throw new TypeError(`Strategy purpose.${key} must be true.`);
  }
  if (!record.domains || typeof record.domains !== "object") throw new TypeError("Strategy domains are required.");
  for (const domain of PHASE_STRATEGY_REQUIRED_DOMAINS) {
    if (!record.domains[domain] || typeof record.domains[domain] !== "object") {
      throw new TypeError(`Strategy domain ${domain} is required.`);
    }
  }
  assertNoExecutionOwnedFields(record.domains);
  const hypothesis = record.strategyHypothesis;
  if (!hypothesis?.hypothesisId || !hypothesis?.statement ||
      !Array.isArray(hypothesis.expectedResponses) || hypothesis.expectedResponses.length === 0 ||
      !Array.isArray(hypothesis.validationConditions) ||
      !Array.isArray(hypothesis.falsificationConditions)) {
    throw new TypeError("A complete canonical strategyHypothesis is required.");
  }
  return true;
}
