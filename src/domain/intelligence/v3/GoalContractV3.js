import {
  V3_SCHEMA,
  assertOneOf,
  capabilityId,
  deepFreeze,
  requiredText,
  semanticFingerprint,
} from "./V3Runtime.js";
import {
  EvidenceParticipationV3,
  inferEvidenceParticipationV3,
} from "../EvidenceDomainClassificationV3.js";

const VALUE_KINDS = ["scalar", "duration", "ratio", "percentage", "count", "ordinal", "boolean", "time_series"];
const OBJECTIVE_MODES = ["increase", "decrease", "minimum", "maximum", "target_value", "target_range", "maintain_range", "stability", "custom_declarative"];
const GUARDRAIL_MODES = ["minimum", "maximum", "allowed_range", "maximum_change", "minimum_change", "custom_declarative"];
const AUTHORITY_ROLES = ["decisive", "material", "supporting", "contextual"];
const QUESTION_KINDS = ["feasibility", "persistence", "contradiction", "guardrail", "attribution", "data_quality", "phase_readiness"];
const EVIDENCE_PURPOSES = ["establish_feasibility", "confirm_persistence", "resolve_contradiction", "assess_guardrail", "improve_measurement_quality", "improve_attribution", "update_forecast", "establish_phase_readiness"];

export function createGoalContractV3(input = {}) {
  const objectives = (input.objectives ?? []).map(normalizeObjective);
  if (objectives.length === 0) throw new Error("Goal Contract V3 requires at least one objective.");
  const objectiveIds = new Set(objectives.map((item) => item.objectiveId));
  if (objectiveIds.size !== objectives.length) throw new Error("Objective IDs must be unique.");

  const guardrails = (input.guardrails ?? []).map(normalizeGuardrail);
  const guardrailIds = new Set(guardrails.map((item) => item.guardrailId));
  if (guardrailIds.size !== guardrails.length) throw new Error("Guardrail IDs must be unique.");

  const strategicQuestions = (input.strategicQuestions ?? []).map(normalizeQuestion);
  const evidencePolicies = (input.evidencePolicies ?? []).map(normalizeEvidencePolicy);
  const semantic = {
    schemaVersion: V3_SCHEMA.goalContract,
    goalId: requiredText(input.goalId, "goalId"),
    contractVersion: requiredText(input.contractVersion, "contractVersion"),
    goalLabel: requiredText(input.goalLabel, "goalLabel"),
    phase: normalizePhase(input.phase),
    strategy: normalizeStrategy(input.strategy),
    objectives,
    guardrails,
    strategicQuestions,
    evidencePolicies,
    evidenceRequests: (input.evidenceRequests ?? []).map((request) => ({
      schemaVersion: "evidence_request_v3",
      requestId: request.requestId ?? null,
      questionId: request.questionId ?? null,
      strategyRevisionId: request.strategyRevisionId ?? null,
      evidencePurpose: assertOneOf(request.evidencePurpose, EVIDENCE_PURPOSES, "evidence request purpose"),
      timing: { cadenceDays: request.timing?.cadenceDays > 0 ? Number(request.timing.cadenceDays) : null, scheduledAt: request.timing?.scheduledAt ?? null },
      alternatives: (request.alternatives ?? []).map((alternative) => ({
        capabilityIds: (alternative.capabilityIds ?? []).map(capabilityId),
        vocabularyKey: alternative.vocabularyKey ?? null,
      })),
    })),
    objectiveDecisionPolicy: normalizeDecisionPolicy(input.objectiveDecisionPolicy),
    achievementPolicy: normalizeAchievementPolicy(input.achievementPolicy),
    narrativePolicy: {
      recentEventHours: Math.max(0, finiteOr(input.narrativePolicy?.recentEventHours, 24)),
    },
    vocabulary: structuredClone(input.vocabulary ?? {}),
  };
  return deepFreeze({
    ...semantic,
    id: `goal_contract_v3|${semanticFingerprint(semantic).slice(7)}`,
    semanticFingerprint: semanticFingerprint(semantic),
  });
}

function normalizeCapability(input, field) {
  const id = capabilityId(input);
  const [namespace, ...keyParts] = id.split(".");
  return {
    id,
    namespace,
    key: keyParts.join("."),
    version: input?.version ?? "v1",
    valueKind: assertOneOf(input?.valueKind ?? "scalar", VALUE_KINDS, `${field}.valueKind`),
    canonicalUnit: input?.canonicalUnit ?? null,
    displayName: input?.displayName ?? keyParts.join(" ").replaceAll("_", " "),
  };
}

function normalizeObjective(input, index) {
  const field = `objectives[${index}]`;
  const evaluation = input?.evaluation ?? {};
  const mode = assertOneOf(evaluation.mode, OBJECTIVE_MODES, `${field}.evaluation.mode`);
  validateCustomDeclarative(mode, evaluation.predicate, field);
  return {
    objectiveId: requiredText(input.objectiveId, `${field}.objectiveId`),
    priority: assertOneOf(input.priority ?? "primary", ["primary", "secondary"], `${field}.priority`),
    importance: finiteOr(input.importance, 1),
    metricCapability: normalizeCapability(input.metricCapability, `${field}.metricCapability`),
    evaluation: {
      mode,
      baselineValue: finiteOrNull(evaluation.baselineValue),
      targetValue: finiteOrNull(evaluation.targetValue),
      targetRange: normalizeRange(evaluation.targetRange),
      desiredDirection: evaluation.desiredDirection ?? null,
      meaningfulChangeThreshold: Math.max(0, finiteOr(evaluation.meaningfulChangeThreshold, 0)),
      significanceBands: (evaluation.significanceBands ?? []).map((band) => ({
        significance: assertOneOf(band.significance, ["minor", "meaningful", "major"], `${field}.significance`),
        minimumAbsoluteChange: Math.max(0, finiteOr(band.minimumAbsoluteChange, 0)),
      })).sort((a, b) => b.minimumAbsoluteChange - a.minimumAbsoluteChange),
      successCriteria: (evaluation.successCriteria ?? []).map(normalizePredicate),
      exceededCriteria: (evaluation.exceededCriteria ?? []).map(normalizePredicate),
      predicate: evaluation.predicate ? normalizePredicate(evaluation.predicate) : null,
    },
    vocabularyKey: input.vocabularyKey ?? input.objectiveId,
    forecast: normalizeForecast(input.forecast, field),
  };
}

function normalizeGuardrail(input, index) {
  const field = `guardrails[${index}]`;
  const evaluation = input?.evaluation ?? {};
  const mode = assertOneOf(evaluation.mode, GUARDRAIL_MODES, `${field}.evaluation.mode`);
  validateCustomDeclarative(mode, evaluation.predicate, field);
  return {
    guardrailId: requiredText(input.guardrailId, `${field}.guardrailId`),
    metricCapability: normalizeCapability(input.metricCapability, `${field}.metricCapability`),
    evaluation: {
      mode,
      threshold: finiteOrNull(evaluation.threshold),
      allowedRange: normalizeRange(evaluation.allowedRange),
      predicate: evaluation.predicate ? normalizePredicate(evaluation.predicate) : null,
    },
    severityBands: (input.severityBands ?? []).map((band) => ({
      status: assertOneOf(band.status, ["watch", "pressured", "breached"], `${field}.severityBand.status`),
      minimumDeviation: Math.max(0, finiteOr(band.minimumDeviation, 0)),
    })).sort((a, b) => b.minimumDeviation - a.minimumDeviation),
    consequencePolicy: {
      confidenceImpact: finiteOr(input.consequencePolicy?.confidenceImpact, 0),
      recommendationConstraint: input.consequencePolicy?.recommendationConstraint ?? null,
      celebrationCeiling: input.consequencePolicy?.celebrationCeiling ?? null,
      escalationLevel: input.consequencePolicy?.escalationLevel ?? "routine",
    },
    vocabularyKey: input.vocabularyKey ?? input.guardrailId,
  };
}

function normalizePhase(input = {}) {
  return {
    phaseId: input.phaseId ?? null,
    label: input.label ?? null,
    startedAt: input.startedAt ?? null,
    nextPhaseLabel: input.nextPhaseLabel ?? null,
    transitionCriteria: (input.transitionCriteria ?? []).map(normalizePredicate),
  };
}

function normalizeStrategy(input = {}) {
  return {
    strategyRevisionId: requiredText(input.strategyRevisionId, "strategy.strategyRevisionId"),
    label: input.label ?? "current strategy",
    adequateExposure: {
      minimumDays: Math.max(0, finiteOr(input.adequateExposure?.minimumDays, 0)),
    },
    coachingActions: (input.coachingActions ?? []).map((item) => ({
      actionId: requiredText(item.actionId, "strategy.coachingActions.actionId"),
      text: requiredText(item.text, "strategy.coachingActions.text"),
      recommendationActions: [...(item.recommendationActions ?? ["continue_current_strategy"])],
      requires: (item.requires ?? []).map((requirement) => ({
        subjectType: assertOneOf(requirement.subjectType, ["objective", "guardrail"], "coaching action requirement subjectType"),
        subjectId: requiredText(requirement.subjectId, "coaching action requirement subjectId"),
        acceptedStates: [...(requirement.acceptedStates ?? [])],
      })),
    })),
    feasibilityCriteria: (input.feasibilityCriteria ?? []).map((criterion) => ({
      source: assertOneOf(criterion.source, ["objective", "guardrail", "achievement"], "feasibility criterion source"),
      subjectId: criterion.subjectId ?? null,
      acceptedStates: [...(criterion.acceptedStates ?? [])],
      minimumAuthority: criterion.minimumAuthority ?? "supporting",
      minimumSignificance: criterion.minimumSignificance ?? "none",
    })),
  };
}

function normalizeQuestion(input, index) {
  return {
    questionId: requiredText(input.questionId, `strategicQuestions[${index}].questionId`),
    kind: assertOneOf(input.kind, QUESTION_KINDS, `strategicQuestions[${index}].kind`),
    priority: Number.isFinite(input.priority) ? input.priority : 0,
    text: requiredText(input.text, `strategicQuestions[${index}].text`),
    strategyRevisionId: input.strategyRevisionId ?? null,
    evidencePurpose: assertOneOf(input.evidencePurpose, EVIDENCE_PURPOSES, `strategicQuestions[${index}].evidencePurpose`),
    answerWhen: input.answerWhen ? normalizePredicate(input.answerWhen) : null,
    raiseWhen: input.raiseWhen ? normalizePredicate(input.raiseWhen) : null,
    supersedeWhen: input.supersedeWhen ? normalizePredicate(input.supersedeWhen) : null,
    answerCode: input.answerCode ?? "answered",
    nextQuestionOnAnswer: input.nextQuestionOnAnswer ? normalizeQuestion(input.nextQuestionOnAnswer, `${index}.next`) : null,
  };
}

function normalizeEvidencePolicy(input, index) {
  const usableFor = [...(input.usableFor ?? [])];
  return {
    policyId: requiredText(input.policyId, `evidencePolicies[${index}].policyId`),
    subjectType: assertOneOf(input.subjectType, ["objective", "guardrail", "strategy", "achievement", "attribution", "execution"], "evidence policy subjectType"),
    subjectId: input.subjectId ?? null,
    capabilityPattern: requiredText(input.capabilityPattern, "evidence policy capabilityPattern"),
    role: assertOneOf(input.role, AUTHORITY_ROLES, "evidence policy role"),
    minimumQuality: input.minimumQuality ?? "limited",
    participation: assertOneOf(
      input.participation ?? inferEvidenceParticipationV3({
        usableFor,
        subjectType: input.subjectType,
      }),
      Object.values(EvidenceParticipationV3),
      "evidence policy participation",
    ),
    usableFor,
    signalRules: input.signalRules ? {
      supportsWhen: input.signalRules.supportsWhen ? normalizePredicate(input.signalRules.supportsWhen) : null,
      contradictsWhen: input.signalRules.contradictsWhen ? normalizePredicate(input.signalRules.contradictsWhen) : null,
      significance: assertOneOf(input.signalRules.significance ?? "minor", ["none", "minor", "meaningful", "major"], "evidence policy signal significance"),
    } : null,
  };
}

function normalizeDecisionPolicy(input = {}) {
  return {
    mode: assertOneOf(input.mode ?? "all_required", ["all_required", "primary_required", "threshold_count", "weighted"], "objectiveDecisionPolicy.mode"),
    thresholdCount: input.thresholdCount ?? null,
    achievementThreshold: finiteOr(input.achievementThreshold, 1),
  };
}

function normalizeAchievementPolicy(input = {}) {
  return {
    onAchieved: assertOneOf(input.onAchieved ?? "transition_goal", ["continue", "transition_goal"], "achievementPolicy.onAchieved"),
  };
}

function normalizeForecast(input, field) {
  if (!input) return null;
  if (input.version !== "goal_outlook_v1") throw new Error(`${field}.forecast requires goal_outlook_v1.`);
  const kind = assertOneOf(input.kind, ["scalar_target", "range_duration", "state"], `${field}.forecast.kind`);
  const result = {
    version: input.version,
    kind,
    baselineValue: finiteOrNull(input.baselineValue),
    targetValue: finiteOrNull(input.targetValue),
    direction: input.direction ?? null,
    startedAt: input.startedAt ?? null,
    deadlineAt: input.deadlineAt ?? null,
    requiredDurationDays: finiteOrNull(input.requiredDurationDays),
    durationCapabilityId: input.durationCapabilityId ?? null,
  };
  for (const key of ["startedAt", "deadlineAt"]) {
    if (result[key] && !Number.isFinite(Date.parse(result[key]))) throw new Error(`${field}.forecast.${key} is invalid.`);
  }
  if (kind === "scalar_target") {
    assertOneOf(result.direction, ["increase", "decrease"], `${field}.forecast.direction`);
    if (result.baselineValue == null || result.targetValue == null ||
      (result.targetValue - result.baselineValue) * (result.direction === "increase" ? 1 : -1) <= 0) {
      throw new Error(`${field}.forecast requires a target beyond its baseline in the declared direction.`);
    }
  }
  if (kind === "range_duration" && (!(result.requiredDurationDays > 0) || !result.durationCapabilityId)) {
    throw new Error(`${field}.forecast requires duration and its evidence capability.`);
  }
  return result;
}

function normalizePredicate(predicate) {
  return {
    version: "declarative_predicate_v1",
    path: requiredText(predicate.path, "predicate.path"),
    operator: assertOneOf(predicate.operator, ["eq", "neq", "in", "not_in", "gte", "lte", "between", "exists"], "predicate.operator"),
    value: predicate.value,
    values: predicate.values ? [...predicate.values] : undefined,
    min: predicate.min,
    max: predicate.max,
  };
}

function validateCustomDeclarative(mode, predicate, field) {
  if (mode === "custom_declarative" && !predicate) {
    throw new Error(`${field} custom_declarative requires a versioned predicate.`);
  }
  if (predicate && predicate.version !== "declarative_predicate_v1") {
    throw new Error(`${field} only supports declarative_predicate_v1; executable handlers are forbidden.`);
  }
}

function normalizeRange(value) {
  if (!value) return null;
  const min = Number(value.min);
  const max = Number(value.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    throw new Error("Range must contain finite min and max values in ascending order.");
  }
  return { min, max, approximate: Boolean(value.approximate) };
}

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function finiteOrNull(value) {
  return value == null ? null : finiteOr(value, null);
}
