import { createHash } from "node:crypto";
import {
  CanonicalGoalPhaseStatus,
  PhaseReviewState,
  createCanonicalGoalPhase,
  isActivePhaseStatus,
  normalizeCanonicalGoalPhases,
  resolveCanonicalPhaseReviewState,
} from "../models/canonicalGoalPhase";
import { createPhaseReviewMilestone, isPhaseReviewMilestone } from
  "../models/phaseReviewMilestone";

export const FOUNDER_PHASE_CORRECTION_VERSION = "founder_build_lean_mass_phase_repair_v1";
export const FOUNDER_PHASE_1_STARTED_AT = "2026-07-19";
export const FOUNDER_PHASE_1_PLANNED_REVIEW_AT = "2026-08-15";
export const FOUNDER_PHASE_2_PROJECTED_START = "2026-08-16";

export function isFounderBuildLeanMassGoal(goal) {
  return Boolean(String(goal?.userId ?? "").trim()) && goal?.type === "build_lean_mass" &&
    goal?.status === "active" && /^goal_transition_live_goal_visible_abs_at_rest_/.test(goal?.id ?? "") &&
    goal?.phases?.some((phase) => phase.name === "Establish Maintenance") &&
    goal?.phases?.some((phase) => phase.name === "Lean Mass Build");
}

export function projectFounderBuildLeanMassPhaseCorrection(goal) {
  if (!isFounderBuildLeanMassGoal(goal)) return structuredClone(goal);
  const persistedFirst = goal.phases.find((phase) => phase.name === "Establish Maintenance");
  const persistedSecond = goal.phases.find((phase) => phase.name === "Lean Mass Build");
  if (!isRepairableFounderPhaseState(persistedFirst, persistedSecond)) {
    return structuredClone(goal);
  }
  const projected = structuredClone(goal);
  projected.timeline = { ...projected.timeline, startDate: FOUNDER_PHASE_1_STARTED_AT };
  projected.phases = projected.phases.map((phase) => {
    if (phase.name === "Establish Maintenance") return {
      ...phase,
      status: CanonicalGoalPhaseStatus.ACTIVE,
      startDate: FOUNDER_PHASE_1_STARTED_AT,
      startedAt: FOUNDER_PHASE_1_STARTED_AT,
      plannedReviewAt: FOUNDER_PHASE_1_PLANNED_REVIEW_AT,
      completedAt: null,
      completionDecisionRequired: true,
      reviewState: phase.reviewState ?? PhaseReviewState.SCHEDULED,
      reviewMilestone: isPhaseReviewMilestone(phase.reviewMilestone)
        ? phase.reviewMilestone : founderPhaseOneReviewMilestone(goal.id, phase.id),
      timingMode: "completion_criteria",
      duration: null,
      extensionCount: phase.extensionCount ?? 0,
      revision: phase.revision ?? 0,
    };
    if (phase.name === "Lean Mass Build") return {
      ...phase,
      status: CanonicalGoalPhaseStatus.PLANNED,
      startDate: null,
      startedAt: null,
      projectedNextPhaseStart: FOUNDER_PHASE_2_PROJECTED_START,
      completedAt: null,
      completionDecisionRequired: true,
      reviewState: phase.reviewState ?? PhaseReviewState.NOT_REQUIRED,
      revision: phase.revision ?? 0,
    };
    return phase;
  });
  projected.currentPhaseId = projected.phases.find((phase) => phase.name === "Establish Maintenance")?.id ?? null;
  projected.projectedNextPhaseId = projected.phases.find((phase) => phase.name === "Lean Mass Build")?.id ?? null;
  return projected;
}

function founderPhaseOneReviewMilestone(goalId, phaseId) {
  return createPhaseReviewMilestone({
    milestoneId: `phase_review_milestone|${goalId}|${phaseId}|2026-08-15`,
    goalId, phaseId, milestoneType: "planned_phase_review",
    reviewType: "phase_completion_review", requiredEvidence: [],
    eligibleArtifactTypes: ["dexa_event"],
    designatedArtifactIdentity: null, designatedEvidenceIdentity: null,
    earliestEligibleDate: FOUNDER_PHASE_1_PLANNED_REVIEW_AT,
    latestEligibleDate: null, earlyReviewPolicy: "prohibited",
    reviewRequired: true,
    unresolvedReviewId: `phase_review|${goalId}|${phaseId}|2026-08-15`,
    resolvedReviewId: null, decisionRequired: true,
    recommendationRequired: true, consumed: false,
    lineage: [{ type: "founder_phase_plan", id: FOUNDER_PHASE_CORRECTION_VERSION }],
    revision: 0,
  });
}

function isRepairableFounderPhaseState(first, second) {
  return [CanonicalGoalPhaseStatus.ACTIVE, CanonicalGoalPhaseStatus.REVIEW_DUE,
    CanonicalGoalPhaseStatus.REVIEW_PENDING_DECISION].includes(first?.status) &&
    [CanonicalGoalPhaseStatus.PLANNED, "upcoming"].includes(second?.status) &&
    !second?.startedAt && !second?.startDate;
}

export function resolveCommittedPhaseContext(goal, { asOf = new Date() } = {}) {
  const projectedGoal = projectFounderBuildLeanMassPhaseCorrection(goal);
  const phases = normalizeCanonicalGoalPhases(projectedGoal?.phases ?? [], {
    goalId: projectedGoal?.id,
  });
  const activePhase = phases.find((phase) => isActivePhaseStatus(phase.status)) ?? null;
  const plannedPhases = phases.filter((phase) => phase.status === CanonicalGoalPhaseStatus.PLANNED);
  return Object.freeze({
    goal: Object.freeze(projectedGoal),
    phases,
    activePhase: activePhase ? Object.freeze({
      ...activePhase,
      effectiveReviewState: resolveCanonicalPhaseReviewState(activePhase, { asOf }),
    }) : null,
    plannedPhases,
  });
}

export function createFounderBuildLeanMassPhaseRepairPlan(goal) {
  if (!isFounderBuildLeanMassGoal(goal)) throw new TypeError("The canonical Founder Build Lean Mass Goal is required.");
  const candidate = projectFounderBuildLeanMassPhaseCorrection(goal);
  const beforeFingerprint = fingerprint(goal);
  const afterFingerprint = fingerprint(candidate);
  const first = candidate.phases.find((phase) => phase.name === "Establish Maintenance");
  const second = candidate.phases.find((phase) => phase.name === "Lean Mass Build");
  createCanonicalGoalPhase(first);
  createCanonicalGoalPhase(second);
  return deepFreeze({
    version: FOUNDER_PHASE_CORRECTION_VERSION,
    goalId: goal.id,
    preconditions: {
      goalStatus: "active",
      goalPrimary: true,
      currentPhaseId: first.id,
      nextPhaseId: second.id,
      beforeFingerprint,
    },
    candidate,
    afterFingerprint,
    changedPaths: [
      "timeline.startDate",
      `phases.${first.id}.startedAt`,
      `phases.${first.id}.plannedReviewAt`,
      `phases.${first.id}.status`,
      `phases.${first.id}.completionDecisionRequired`,
      `phases.${second.id}.status`,
      `phases.${second.id}.startedAt`,
      `phases.${second.id}.projectedNextPhaseStart`,
      "currentPhaseId",
      "projectedNextPhaseId",
    ],
    idempotencyKey: `${FOUNDER_PHASE_CORRECTION_VERSION}|${goal.id}|${afterFingerprint}`,
    persistenceAuthorized: false,
  });
}

function fingerprint(value) {
  const hash = createHash("sha256");
  updateStableHash(hash, value);
  return `sha256_${hash.digest("hex")}`;
}
function updateStableHash(hash, value) {
  if (Array.isArray(value)) {
    hash.update("[");
    value.forEach((item, index) => {
      if (index) hash.update(",");
      updateStableHash(hash, item);
    });
    hash.update("]");
    return;
  }
  if (value && typeof value === "object") {
    hash.update("{");
    Object.keys(value).sort().forEach((key, index) => {
      if (index) hash.update(",");
      hash.update(`${JSON.stringify(key)}:`);
      updateStableHash(hash, value[key]);
    });
    hash.update("}");
    return;
  }
  hash.update(JSON.stringify(value));
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
