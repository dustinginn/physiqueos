import { createHash } from "node:crypto";
import { createFounderBuildLeanMassPhaseRepairPlan,
  projectFounderBuildLeanMassPhaseCorrection } from "./FounderPhaseCorrectionService";
import { createFounderPhase2ActivationPackageDrafts } from
  "./FounderPhase2ActivationPackageService";
import { createPhaseActivationPackageAcceptanceService } from
  "./PhaseActivationPackageAcceptanceService";

export const FOUNDER_PRODUCTION_CUTOVER_VERSION = "founder_production_cutover_v1";
export const FOUNDER_CUTOVER_GOAL_ID =
  "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass";
export const FOUNDER_CUTOVER_PHASE_1_ID = "goal_phase_7ab0d230-ea5b-485b-8368-0e695224de08";
export const FOUNDER_CUTOVER_PHASE_2_ID = "goal_phase_8d7d4fae-084d-44e7-832a-994d5b735f78";
export const FOUNDER_CUTOVER_STRATEGY_ID = `phase_strategy|${FOUNDER_CUTOVER_GOAL_ID}|${FOUNDER_CUTOVER_PHASE_2_ID}|v1`;
export const FOUNDER_CUTOVER_TRAJECTORY_ID = `phase_expected_trajectory|${FOUNDER_CUTOVER_GOAL_ID}|${FOUNDER_CUTOVER_PHASE_2_ID}|v1`;
export const FOUNDER_CUTOVER_STRATEGY_FINGERPRINT =
  "sha256_188a8b174942b56addd4bbe2af04f47d1c1655931228f3008416196c2699c60c";
export const FOUNDER_CUTOVER_TRAJECTORY_FINGERPRINT =
  "sha256_d9b661c29d7863ce01a1e0925cbc0c3f2eb5e51535772fa53a3c69041e3cbbb6";
export const FOUNDER_CUTOVER_PACKAGE_CREATED_AT = "2026-08-02T12:00:00.000Z";

export const FounderCutoverStage = Object.freeze({
  REPAIR: "repair_phase_dates",
  SEED_STRATEGY: "seed_strategy_draft",
  REVIEW_STRATEGY: "review_strategy",
  ACCEPT_STRATEGY: "accept_strategy",
  SEED_TRAJECTORY: "seed_trajectory_draft",
  REVIEW_TRAJECTORY: "review_trajectory",
  ACCEPT_TRAJECTORY: "accept_trajectory",
});

export const FOUNDER_CUTOVER_STAGE_ORDER = Object.freeze(Object.values(FounderCutoverStage));

export function createFounderProductionCutoverPackage({ store,
  createdAt = FOUNDER_CUTOVER_PACKAGE_CREATED_AT } = {}) {
  const baseline = structuredClone(requiredStore(store));
  const goal = canonicalGoal(baseline);
  const repair = createFounderBuildLeanMassPhaseRepairPlan(goal);
  const repaired = structuredClone(baseline);
  replaceGoal(repaired, repair.candidate);
  repaired.phaseReviewDecisions ??= [];
  repaired.phaseLifecycleReadModels ??= [];
  const phase2 = repair.candidate.phases.find((item) => item.id === FOUNDER_CUTOVER_PHASE_2_ID);
  const drafts = createFounderPhase2ActivationPackageDrafts({ store: repaired,
    goal: repair.candidate, phase: phase2, createdAt });
  assertActivationFingerprints(drafts);
  const startingRevision = Number(baseline.revision ?? 0);
  return deepFreeze({
    version: FOUNDER_PRODUCTION_CUTOVER_VERSION,
    baseline: {
      storeRevision: startingRevision,
      storeCommitId: baseline.lastCommitId ?? null,
      goalFingerprint: fingerprintCutoverValue(goal),
      currentPhaseFingerprint: fingerprintCutoverValue(goal.phases.find((item) =>
        item.id === FOUNDER_CUTOVER_PHASE_1_ID)),
      confidence: inspectConfidenceCutoverState(baseline),
    },
    repair: {
      ...repair,
      initializesOnlyIfAbsent: ["phaseReviewDecisions", "phaseLifecycleReadModels"],
      expectedUnchangedCollections: protectedCollections(),
    },
    activation: {
      strategy: drafts.strategy,
      trajectory: drafts.trajectory,
      strategyExpectedAcceptedRevision: 2,
      trajectoryExpectedAcceptedRevision: 2,
      strategyAcceptanceIdempotencyKey: "accept-founder-phase-2-strategy-v1",
      trajectoryAcceptanceIdempotencyKey: "accept-founder-phase-2-trajectory-v1",
      actorId: "user_founder_001",
    },
    revisionPlan: FOUNDER_CUTOVER_STAGE_ORDER.map((stage, index) => ({
      stage, expectedStoreRevision: startingRevision + index,
      candidateStoreRevision: startingRevision + index + 1,
    })),
    expectedFinalStoreRevision: startingRevision + FOUNDER_CUTOVER_STAGE_ORDER.length,
  });
}

export function applyFounderProductionCutoverStage({ store, stage,
  expectedStoreRevision, expectedGoalFingerprint = null, authorization,
  now = () => new Date() } = {}) {
  const source = requiredStore(store);
  if (!FOUNDER_CUTOVER_STAGE_ORDER.includes(stage)) throw cutoverError("STAGE_INVALID", "Unknown cutover stage.");
  if (Number(source.revision ?? 0) !== Number(expectedStoreRevision)) {
    throw cutoverError("REVISION_MISMATCH", "Cutover store revision changed.");
  }
  assertAuthorization({ authorization, stage });
  const candidate = structuredClone(source);
  const beforeProtected = captureProtected(source);
  let changed = true;
  let record = null;
  if (stage === FounderCutoverStage.REPAIR) {
    const goal = canonicalGoal(candidate);
    const projected = projectFounderBuildLeanMassPhaseCorrection(goal);
    const alreadyCorrected = fingerprintCutoverValue(goal) === fingerprintCutoverValue(projected);
    if (!alreadyCorrected && fingerprintCutoverValue(goal) !== expectedGoalFingerprint) {
      throw cutoverError("REPAIR_PRECONDITION_MISMATCH", "Founder repair Goal fingerprint changed.");
    }
    replaceGoal(candidate, projected);
    candidate.phaseReviewDecisions ??= [];
    candidate.phaseLifecycleReadModels ??= [];
    changed = !sameDomain(source, candidate);
    record = projected;
  } else {
    assertCorrectedGoal(candidate);
    const packageDrafts = createFounderPhase2ActivationPackageDrafts({ store: candidate,
      goal: canonicalGoal(candidate), phase: canonicalGoal(candidate).phases.find((item) =>
        item.id === FOUNDER_CUTOVER_PHASE_2_ID), createdAt: FOUNDER_CUTOVER_PACKAGE_CREATED_AT });
    assertActivationFingerprints(packageDrafts);
    const acceptance = createPhaseActivationPackageAcceptanceService({ now });
    if (stage === FounderCutoverStage.SEED_STRATEGY) {
      ({ changed, record } = appendExact(candidate, "phaseStrategies", packageDrafts.strategy));
    } else if (stage === FounderCutoverStage.REVIEW_STRATEGY) {
      ({ changed, record } = replaceLifecycle(candidate, "phaseStrategies",
        FOUNDER_CUTOVER_STRATEGY_ID, (current) =>
          acceptance.submitStrategyForReview(current, { expectedRevision: 0 }), "draft"));
    } else if (stage === FounderCutoverStage.ACCEPT_STRATEGY) {
      ({ changed, record } = replaceLifecycle(candidate, "phaseStrategies",
        FOUNDER_CUTOVER_STRATEGY_ID, (current) => acceptance.acceptStrategy(current,
          acceptanceCommand(current, authorization,
            "accept-founder-phase-2-strategy-v1")).record, "ready_for_review", true));
    } else if (stage === FounderCutoverStage.SEED_TRAJECTORY) {
      ({ changed, record } = appendExact(candidate, "phaseExpectedTrajectories", packageDrafts.trajectory));
    } else if (stage === FounderCutoverStage.REVIEW_TRAJECTORY) {
      ({ changed, record } = replaceLifecycle(candidate, "phaseExpectedTrajectories",
        FOUNDER_CUTOVER_TRAJECTORY_ID, (current) =>
          acceptance.submitTrajectoryForReview(current, { expectedRevision: 0 }), "draft"));
    } else if (stage === FounderCutoverStage.ACCEPT_TRAJECTORY) {
      ({ changed, record } = replaceLifecycle(candidate, "phaseExpectedTrajectories",
        FOUNDER_CUTOVER_TRAJECTORY_ID, (current) => acceptance.acceptTrajectory(current,
          acceptanceCommand(current, authorization,
            "accept-founder-phase-2-trajectory-v1")).record, "ready_for_review", true));
    }
  }
  assertProtectedUnchanged(beforeProtected, captureProtected(candidate));
  assertNoPhaseDecisionOrPublication(source, candidate);
  return Object.freeze({ version: FOUNDER_PRODUCTION_CUTOVER_VERSION, stage,
    changed, candidate, record, expectedStoreRevision: Number(expectedStoreRevision),
    idempotencyKey: stageIdempotencyKey(stage),
    candidateFingerprint: fingerprintCutoverValue(candidate) });
}

export function createProductionPhaseReviewDryRunRequest({ store, selectedOutcome,
  originatingArtifactId, approvalId, approvalToken, decisionId, idempotencyKey } = {}) {
  const source = requiredStore(store); const goal = canonicalGoal(source);
  const phase = goal.phases.find((item) => item.id === goal.currentPhaseId) ??
    goal.phases.find((item) => item.status === "active");
  if (!phase) throw cutoverError("ACTIVE_PHASE_REQUIRED", "Active Phase 1 is required.");
  return deepFreeze({ goalId: goal.id, currentPhaseId: phase.id,
    decisionId: required(decisionId, "decisionId"), selectedOutcome,
    selectedDuration: selectedOutcome === "extend_current_phase" ? "2_weeks" : null,
    selectedReviewAt: null, expectedPhaseRevision: Number(phase.revision ?? 0),
    expectedStoreRevision: Number(source.revision ?? 0),
    idempotencyKey: required(idempotencyKey, "idempotencyKey"),
    originatingArtifactId: required(originatingArtifactId, "originatingArtifactId"),
    approvalId: required(approvalId, "approvalId"), approvalToken: required(approvalToken, "approvalToken") });
}

export function inspectConfidenceCutoverState(store) {
  const goal = canonicalGoal(store);
  const snapshot = (store.goalConfidenceSnapshots ?? []).find((item) => item.goalId === goal.id) ?? null;
  const assessmentId = snapshot?.currentAssessmentId ?? snapshot?.assessmentId ?? null;
  const history = (store.goalConfidenceHistory ?? []).find((item) => item.assessmentId === assessmentId) ?? null;
  const isV2 = /^confidence_assessment_v2\|/.test(assessmentId ?? "") ||
    /_v2$/.test(history?.schemaVersion ?? "");
  return deepFreeze({ state: isV2 ? "v2_already_canonical" : "v1_compatibility_before_v2",
    assessmentId, schemaVersion: history?.schemaVersion ?? snapshot?.schemaVersion ?? null,
    publisherType: history?.publisherType ?? snapshot?.publisherType ?? null,
    originatingArtifactId: history?.originatingArtifactId ?? snapshot?.originatingArtifactId ?? null,
    historyCount: (store.goalConfidenceHistory ?? []).filter((item) => item.goalId === goal.id).length });
}

export function classifyFounderCutoverRollback({ checkpoint, laterWriteExists = false } = {}) {
  const known = ["A_before_write", "B_after_repair", "C_after_activation_package",
    "D_after_runtime_start", "E_after_v2_publication"];
  if (!known.includes(checkpoint)) throw cutoverError("CHECKPOINT_INVALID", "Unknown rollback checkpoint.");
  if (checkpoint === "A_before_write") return deepFreeze({ action: "abort", restoreAllowed: false });
  if (laterWriteExists || checkpoint === "E_after_v2_publication") return deepFreeze({
    action: "compensating_transaction", restoreAllowed: false,
    requiresLineageReview: true, requiresExplicitAuthorization: true });
  return deepFreeze({ action: "byte_backup_restore", restoreAllowed: true,
    requiresRevisionEquality: true, requiresRuntimeStopped: true,
    requiresExplicitAuthorization: true });
}

function acceptanceCommand(record, authorization, idempotencyKey) {
  return { actorId: "user_founder_001", expectedRevision: record.revision,
    idempotencyKey, authorization: { authorized: true,
      scope: "phase_activation_package_acceptance", recordId: record.id,
      actorId: "user_founder_001", approvalId: authorization.approvalId } };
}
function assertAuthorization({ authorization, stage }) {
  if (authorization?.authorized !== true || authorization.scope !== "founder_production_cutover_stage" ||
      authorization.stage !== stage || authorization.actorId !== "user_founder_001" ||
      typeof authorization.approvalId !== "string" || !authorization.approvalId) {
    throw cutoverError("AUTHORIZATION_REQUIRED", "Explicit stage-bound Founder authorization is required.");
  }
}
function appendExact(store, collection, record) {
  store[collection] ??= []; const matches = store[collection].filter((item) => item.id === record.id);
  if (matches.length > 1) throw cutoverError("DUPLICATE_RECORD", `Duplicate ${collection} record.`);
  if (matches.length === 1) {
    if (!sameDomain(matches[0], record)) throw cutoverError("IDEMPOTENCY_CONFLICT", `${collection} record conflicts.`);
    return { changed: false, record: matches[0] };
  }
  store[collection].push(structuredClone(record)); return { changed: true, record };
}
function replaceLifecycle(store, collection, id, transition, expectedStatus, acceptedReplay = false) {
  store[collection] ??= []; const matches = store[collection].filter((item) => item.id === id);
  if (matches.length !== 1) throw cutoverError("RECORD_REQUIRED", `Exactly one ${collection} record is required.`);
  const current = matches[0];
  if (acceptedReplay && current.status === "accepted") {
    const replay = transition(current); return { changed: false, record: replay };
  }
  if (current.status !== expectedStatus) throw cutoverError("LIFECYCLE_MISMATCH",
    `${collection} record must be ${expectedStatus}.`);
  const next = transition(current); const index = store[collection].findIndex((item) => item.id === id);
  store[collection].splice(index, 1, structuredClone(next)); return { changed: true, record: next };
}
function assertCorrectedGoal(store) { const goal = canonicalGoal(store);
  const corrected = projectFounderBuildLeanMassPhaseCorrection(goal);
  if (fingerprintCutoverValue(goal) !== fingerprintCutoverValue(corrected))
    throw cutoverError("REPAIR_REQUIRED", "Canonical phase repair must commit first."); }
function assertActivationFingerprints(drafts) {
  if (drafts.strategy.id !== FOUNDER_CUTOVER_STRATEGY_ID ||
      drafts.strategy.contentFingerprint !== FOUNDER_CUTOVER_STRATEGY_FINGERPRINT)
    throw cutoverError("STRATEGY_FINGERPRINT_MISMATCH", "Strategy fingerprint changed.");
  if (drafts.trajectory.id !== FOUNDER_CUTOVER_TRAJECTORY_ID ||
      drafts.trajectory.contentFingerprint !== FOUNDER_CUTOVER_TRAJECTORY_FINGERPRINT)
    throw cutoverError("TRAJECTORY_FINGERPRINT_MISMATCH", "Trajectory fingerprint changed.");
}
function canonicalGoal(store) { const matches = (store.goals ?? []).filter((item) =>
  item.id === FOUNDER_CUTOVER_GOAL_ID && item.userId === "user_founder_001" &&
  item.primary === true && item.status === "active");
  if (matches.length !== 1) throw cutoverError("GOAL_PRECONDITION", "Exact active Founder Goal is required.");
  return matches[0]; }
function replaceGoal(store, goal) { const index = store.goals.findIndex((item) => item.id === goal.id);
  if (index < 0) throw cutoverError("GOAL_PRECONDITION", "Founder Goal is missing.");
  store.goals.splice(index, 1, structuredClone(goal)); }
function assertNoPhaseDecisionOrPublication(before, after) {
  const protectedNames = ["goalConfidenceHistory", "goalConfidenceSnapshots",
    "confidenceInitializationArtifacts", "dailyBriefings", "evidence", "evidencePackages"];
  protectedNames.forEach((name) => { if (!sameDomain(before[name] ?? [], after[name] ?? []))
    throw cutoverError("UNAUTHORIZED_PUBLICATION", `${name} changed during cutover stage.`); });
  if (!sameDomain(before.phaseReviewDecisions ?? [], after.phaseReviewDecisions ?? []))
    throw cutoverError("UNAUTHORIZED_DECISION", "Phase Review decision changed during cutover stage.");
}
function protectedCollections() { return ["protocols", "protocolVersions", "dailyBriefings",
  "evidence", "evidencePackages", "dexaScans", "photoSessions", "goalConfidenceHistory",
  "goalConfidenceSnapshots", "confidenceInitializationArtifacts"]; }
function captureProtected(store) { return Object.fromEntries(protectedCollections().map((name) =>
  [name, fingerprintCutoverValue(store[name] ?? [])])); }
function assertProtectedUnchanged(before, after) { if (!sameDomain(before, after))
  throw cutoverError("PROTECTED_COLLECTION_CHANGED", "Protected Founder collection changed."); }
function stageIdempotencyKey(stage) { return ({
  [FounderCutoverStage.REPAIR]: "founder-build-lean-mass-phase-repair-v1",
  [FounderCutoverStage.SEED_STRATEGY]: "seed-founder-phase-2-strategy-v1",
  [FounderCutoverStage.REVIEW_STRATEGY]: "review-founder-phase-2-strategy-v1",
  [FounderCutoverStage.ACCEPT_STRATEGY]: "accept-founder-phase-2-strategy-v1",
  [FounderCutoverStage.SEED_TRAJECTORY]: "seed-founder-phase-2-trajectory-v1",
  [FounderCutoverStage.REVIEW_TRAJECTORY]: "review-founder-phase-2-trajectory-v1",
  [FounderCutoverStage.ACCEPT_TRAJECTORY]: "accept-founder-phase-2-trajectory-v1",
}[stage]); }
export function fingerprintCutoverValue(value) { const hash = createHash("sha256"); stableHash(hash, value);
  return `sha256_${hash.digest("hex")}`; }
function stableHash(hash, value) { if (Array.isArray(value)) { hash.update("["); value.forEach((item,index) => {
  if (index) hash.update(","); stableHash(hash,item); }); hash.update("]"); return; }
  if (value && typeof value === "object") { hash.update("{"); Object.keys(value).sort().forEach((key,index) => {
    if (index) hash.update(","); hash.update(`${JSON.stringify(key)}:`); stableHash(hash,value[key]); }); hash.update("}"); return; }
  hash.update(JSON.stringify(value)); }
function sameDomain(a,b) { return fingerprintCutoverValue(a) === fingerprintCutoverValue(b); }
function requiredStore(store) { if (!store || typeof store !== "object" || !Array.isArray(store.goals))
  throw new TypeError("Founder store is required."); return store; }
function required(value, field) { if (typeof value !== "string" || !value.trim())
  throw new TypeError(`${field} is required.`); return value.trim(); }
function cutoverError(code,message) { const error = new Error(message); error.code = `FOUNDER_CUTOVER_${code}`; return error; }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
