import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  captureGoalPlanningBaseline,
  reconcileGoalPlanningBaseline,
} from "./GoalEditCriticalStateFingerprintService.js";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork.js";
import {
  ActiveProtocolLineageClassification,
  classifyActiveProtocolLineage,
} from "./ActiveProtocolLineageInvariantService.js";

export const PROTOCOL_RECONCILIATION_MIGRATION_ID =
  "visible_abs_to_build_lean_mass_protocol_reconciliation_v1";

const TERMINAL = new Set(["archived", "paused", "retired", "superseded", "cancelled"]);
const VIRTUAL_SOURCES = new Set([
  "virtual_energy",
  "virtual_recovery",
  "virtual_weight",
  "virtual_photos",
  "virtual_dexa",
  "virtual_briefings",
]);

export class ProtocolReconciliationMigrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProtocolReconciliationMigrationError";
    this.code = code;
    this.details = details;
  }
}

export function buildProtocolReconciliationPlan(store, { migrationId = PROTOCOL_RECONCILIATION_MIGRATION_ID } = {}) {
  const appliedDrafts = (store.goalProtocolTransitionDrafts ?? []).filter(
    (draft) => draft.status === "applied" && draft.activationConsumption?.consumed
  );
  if (appliedDrafts.length !== 1) {
    fail("UNEXPECTED_TRANSITION_TOPOLOGY", "Exactly one consumed protocol transition is required.", {
      count: appliedDrafts.length,
    });
  }
  const draft = appliedDrafts[0];
  const targetGoalId = draft.pendingGoalDraftId;
  const sourceGoalId = draft.sourceGoalId;
  requireGoal(store, sourceGoalId, "completed");
  const targetGoal = requireGoal(store, targetGoalId, "active");
  if (targetGoal.primary !== true || !Array.isArray(targetGoal.phases) || targetGoal.phases.length === 0) {
    fail("MISSING_PROTECTED_REFERENCE", "The active target goal or its protected phases are unavailable.");
  }

  const reviews = draft.protocolReviews ?? [];
  const planned = (store.protocols ?? []).filter(
    (protocol) => protocol.status === "planned"
      && protocol.activationIdentity?.transitionId === draft.goalTransitionDraftId
  );
  if (planned.length !== reviews.length || planned.length !== 15) {
    fail("UNEXPECTED_PROTOCOL_TOPOLOGY", "Expected one planned record for each of 15 reviews.", {
      reviews: reviews.length,
      planned: planned.length,
    });
  }

  const pairs = reviews.map((review) => {
    const matches = planned.filter(
      (protocol) =>
        protocol.sourceProtocolId === review.sourceProtocolId
        && protocol.reviewId === review.id
        && protocol.activationProvenance?.sourceProtocolId === review.sourceProtocolId
    );
    if (matches.length !== 1) {
      fail("AMBIGUOUS_SEMANTIC_MATCH", "A review must pair to exactly one provenance-linked planned record.", {
        reviewId: review.id,
        sourceProtocolId: review.sourceProtocolId,
        matches: matches.map((item) => item.id),
      });
    }
    const successor = matches[0];
    const legacy = VIRTUAL_SOURCES.has(review.sourceProtocolId)
      ? null
      : (store.protocols ?? []).find((protocol) => protocol.id === review.sourceProtocolId);
    if (!VIRTUAL_SOURCES.has(review.sourceProtocolId) && (!legacy || legacy.status !== "active")) {
      fail("UNEXPECTED_PROTOCOL_TOPOLOGY", "A non-virtual review must reference one active legacy protocol.", {
        sourceProtocolId: review.sourceProtocolId,
      });
    }
    if (review.intendedDisposition !== successor.disposition) {
      fail("DISPOSITION_CONTRADICTION", "Saved review and planned record dispositions differ.", {
        reviewId: review.id,
      });
    }
    const action = actionFor(review.intendedDisposition, Boolean(legacy));
    const authoritativeId = action === "retain" ? legacy.id : successor.id;
    return Object.freeze({
      semanticIdentityKey: [
        successor.category,
        successor.protocolType,
        review.sourceProtocolId,
        successor.reviewId,
        successor.activationIdentity?.transitionId,
      ].join("|"),
      category: successor.category,
      subtype: successor.protocolType,
      legacyProtocolId: legacy?.id ?? null,
      plannedProtocolId: successor.id,
      disposition: review.intendedDisposition,
      action,
      legacyGoalIds: legacy?.relatedGoalIds ?? [],
      plannedGoalIds: successor.relatedGoalIds ?? [],
      legacyPhaseIds: phaseIds(legacy),
      plannedPhaseIds: phaseIds(successor),
      legacyStatus: legacy?.status ?? null,
      plannedStatus: successor.status,
      authoritativeProtocolId: authoritativeId,
      historicalProtocolId: action === "promote" ? legacy?.id ?? null : null,
      expectedActiveCount: 1,
      expectedPlannedCount: 0,
      recurringCommitmentEffect: commitmentEffect(successor.protocolType),
      schedulerEffect: "future_occurrences_use_authoritative_active_record_only",
      priorityEffect: "future_priorities_use_authoritative_active_record_only",
      operatingPlanEffect: "select_authoritative_active_record",
    });
  });

  const duplicateLegacyIds = duplicates(pairs.map((pair) => pair.legacyProtocolId).filter(Boolean));
  const duplicatePlannedIds = duplicates(pairs.map((pair) => pair.plannedProtocolId));
  if (duplicateLegacyIds.length || duplicatePlannedIds.length) {
    fail("AMBIGUOUS_SEMANTIC_MATCH", "A protocol record matched more than one semantic branch.", {
      duplicateLegacyIds,
      duplicatePlannedIds,
    });
  }
  const foam = resolveFoamRolling(store);
  return Object.freeze({
    migrationId,
    sourceGoalId,
    targetGoalId,
    transitionDraftId: draft.id,
    transitionId: draft.goalTransitionDraftId,
    activationPlanFingerprint: draft.activationConsumption.activationPlanFingerprint,
    draftFingerprint: draft.activationConsumption.draftFingerprintAtConsumption,
    pairs,
    foamRolling: foam,
    expected: {
      totalProtocols: (store.protocols ?? []).length,
      activeProtocols: 15,
      plannedProtocols: 0,
      activeCommitments: 11,
      activeReminders: 10,
    },
  });
}

export function applyProtocolReconciliationPlan(store, plan, { migratedAt = new Date().toISOString() } = {}) {
  const candidate = structuredClone(store);
  if (candidate.protocolReconciliationMigrations?.some((item) => item.id === plan.migrationId)) {
    return { status: "already_reconciled", candidate, report: existingReport(candidate, plan) };
  }
  const retained = [];
  const activated = [];
  const superseded = [];
  const cancelled = [];
  for (const pair of plan.pairs) {
    const legacy = pair.legacyProtocolId
      ? candidate.protocols.find((item) => item.id === pair.legacyProtocolId)
      : null;
    const planned = candidate.protocols.find((item) => item.id === pair.plannedProtocolId);
    if (!planned) fail("STALE_PLAN", "A planned protocol disappeared before mutation.", pair);
    if (pair.action === "retain") {
      retainProtocol(legacy, planned, plan, migratedAt);
      retained.push(legacy.id);
      cancelled.push(planned.id);
    } else {
      promoteProtocol(candidate, planned, legacy, plan, migratedAt);
      activated.push(planned.id);
      if (legacy) superseded.push(legacy.id);
    }
  }
  canonicalizeFoamRolling(candidate, plan, migratedAt);
  reconcileCommitments(candidate, plan, migratedAt);
  reconcileReminders(candidate, plan, migratedAt);
  reconcileEnergyAndNutrition(candidate, plan, migratedAt);
  candidate.protocolReconciliationMigrations = [
    ...(candidate.protocolReconciliationMigrations ?? []),
    {
      id: plan.migrationId,
      status: "applied",
      appliedAt: migratedAt,
      transitionDraftId: plan.transitionDraftId,
      activationPlanFingerprint: plan.activationPlanFingerprint,
      reconciledProtocolIds: plan.pairs.map((pair) => pair.authoritativeProtocolId),
    },
  ];
  const report = {
    status: "reconciled",
    migrationId: plan.migrationId,
    reconciledProtocolIds: plan.pairs.map((pair) => pair.authoritativeProtocolId),
    activatedProtocolIds: activated,
    supersededProtocolIds: superseded,
    retainedProtocolIds: retained,
    pausedProtocolIds: [],
    historicalOnlyProtocolIds: superseded,
    cancelledPlannedProtocolIds: cancelled,
    canonicalRecoveryProtocolIds: [plan.foamRolling.canonicalProtocolId],
    rebuiltCommitmentIds: active(candidate.executionItems).map((item) => item.id),
    rebuiltPriorityIds: active(candidate.reminders).map((item) => item.id),
  };
  validateProtocolReconciliationPostState(store, candidate, plan);
  return { status: "reconciled", candidate, report };
}

export function validateProtocolReconciliationPostState(before, after, plan) {
  const activeProtocols = active(after.protocols);
  const plannedProtocols = (after.protocols ?? []).filter((item) => item.status === "planned");
  const failures = [];
  if (activeProtocols.length !== plan.expected.activeProtocols) failures.push("ACTIVE_PROTOCOL_COUNT");
  if (plannedProtocols.length !== plan.expected.plannedProtocols) failures.push("PLANNED_PROTOCOL_COUNT");
  if (active(after.executionItems).length !== plan.expected.activeCommitments) failures.push("ACTIVE_COMMITMENT_COUNT");
  if (active(after.reminders).length !== plan.expected.activeReminders) failures.push("ACTIVE_REMINDER_COUNT");
  for (const pair of plan.pairs) {
    const authoritative = after.protocols.find((item) => item.id === pair.authoritativeProtocolId);
    if (authoritative?.status !== "active") failures.push(`NOT_ACTIVE:${pair.authoritativeProtocolId}`);
    if (!authoritative?.currentGoalIds?.includes(plan.targetGoalId)) failures.push(`TARGET_GOAL_MISSING:${pair.authoritativeProtocolId}`);
    if (pair.legacyProtocolId && !authoritative?.historicalGoalIds?.includes(plan.sourceGoalId)) {
      failures.push(`HISTORY_MISSING:${pair.authoritativeProtocolId}`);
    }
    if (pair.action === "promote"
        && classifyActiveProtocolLineage(after, pair.authoritativeProtocolId)?.classification
          !== ActiveProtocolLineageClassification.VALID) {
      failures.push(`ACTIVE_LINEAGE_INVALID:${pair.authoritativeProtocolId}`);
    }
  }
  const semanticKeys = activeProtocols.map(activeSemanticKey);
  if (duplicates(semanticKeys).length) failures.push("DUPLICATE_ACTIVE_SEMANTIC_BRANCH");
  const foam = after.protocols.find((item) => item.id === plan.foamRolling.canonicalProtocolId);
  if (!foam || foam.status !== "active" || foam.schedule?.timeOfDay !== plan.foamRolling.timeOfDay) {
    failures.push("FOAM_ROLLING_INVALID");
  }
  if (after.energyStrategyLinks?.selectedPace !== "maintenance_calibration") failures.push("CUT_ENERGY_ACTIVE");
  if (after.nutritionContext?.estimatedDailyCaloricIntake != null) failures.push("CUT_NUTRITION_CONTEXT_ACTIVE");
  if (!sameProtected(before.goals, after.goals)) failures.push("GOALS_CHANGED");
  for (const key of protectedCollections()) {
    if (!same(before[key], after[key])) failures.push(`PROTECTED_COLLECTION_CHANGED:${key}`);
  }
  if (failures.length) {
    fail("POST_STATE_INVARIANT_FAILED", "The reconciled candidate failed post-state validation.", { failures });
  }
  return Object.freeze({ valid: true, results: ["one_active_per_branch", "goals_unchanged", "history_preserved", "protected_collections_unchanged"] });
}

export function createProtocolReconciliationMigrationService({
  filePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = createFounderStoreUnitOfWork,
} = {}) {
  if (!filePath) throw new Error("A founder runtime-store path is required.");
  const read = () => JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Object.freeze({
    preview() {
      const persisted = read();
      if (persisted.protocolReconciliationMigrations?.some((item) => item.id === PROTOCOL_RECONCILIATION_MIGRATION_ID)) {
        return Object.freeze({
          status: "already_reconciled",
          plan: null,
          baseline: captureGoalPlanningBaseline(persisted, fileMetadata(filePath)),
          beforeFingerprint: fileHash(filePath),
          candidateFingerprint: fileHash(filePath),
          report: persisted.protocolReconciliationMigrations.find((item) => item.id === PROTOCOL_RECONCILIATION_MIGRATION_ID),
        });
      }
      const baseline = captureGoalPlanningBaseline(persisted, fileMetadata(filePath));
      const plan = buildProtocolReconciliationPlan(persisted);
      const applied = applyProtocolReconciliationPlan(persisted, plan, { migratedAt: now().toISOString() });
      return Object.freeze({
        status: applied.status === "already_reconciled" ? "already_reconciled" : "ready",
        plan,
        baseline,
        beforeFingerprint: fileHash(filePath),
        candidateFingerprint: hash(applied.candidate),
        candidate: applied.candidate,
        report: applied.report,
      });
    },
    async execute({ expectedRuntimeHash, expectedPlanFingerprint } = {}) {
      const before = read();
      const beforeFingerprint = fileHash(filePath);
      if (expectedRuntimeHash && beforeFingerprint !== expectedRuntimeHash) {
        fail("STALE_WRITE_CONFLICT", "The runtime store changed after review.");
      }
      if (before.protocolReconciliationMigrations?.some((item) => item.id === PROTOCOL_RECONCILIATION_MIGRATION_ID)) {
        return Object.freeze({
          status: "already_reconciled",
          migrationId: PROTOCOL_RECONCILIATION_MIGRATION_ID,
          beforeFingerprint,
          afterFingerprint: beforeFingerprint,
        });
      }
      const baseline = captureGoalPlanningBaseline(before, fileMetadata(filePath));
      const plan = buildProtocolReconciliationPlan(before);
      if (expectedPlanFingerprint && hash(plan) !== expectedPlanFingerprint) {
        fail("STALE_PLAN", "The reconciliation plan changed after review.");
      }
      const candidateResult = applyProtocolReconciliationPlan(before, plan, { migratedAt: now().toISOString() });
      const immediatelyCurrent = read();
      const drift = reconcileGoalPlanningBaseline(baseline, immediatelyCurrent, {
        currentFullRuntimeHash: hash(immediatelyCurrent),
      });
      if (!drift.mayContinue || !["unchanged", "normal_runtime_drift"].includes(drift.classification)) {
        fail("CRITICAL_DRIFT", "Runtime drift blocked protocol reconciliation.", { drift });
      }
      if (drift.classification === "normal_runtime_drift") {
        fail("NORMAL_RUNTIME_DRIFT_REQUIRES_REPLAN", "Normal runtime drift requires a fresh bounded plan.");
      }
      const transaction = createUnitOfWork({
        filePath,
        liveStore: liveStore ?? structuredClone(before),
        stageFrom: before,
        now,
        binding: { storeIdentity: "founder_runtime_store", storeKind: "production", productionAllowed: true },
      }).begin();
      await transaction.mutate((staged) => replaceObject(staged, candidateResult.candidate));
      const commit = await transaction.commit({
        validate: (staged) => validateProtocolReconciliationPostState(before, staged, plan),
      });
      const persisted = read();
      validateProtocolReconciliationPostState(before, persisted, plan);
      return Object.freeze({
        ...candidateResult.report,
        status: "reconciled",
        baselineClassification: drift.classification,
        beforeFingerprint,
        afterFingerprint: fileHash(filePath),
        beforeRevision: before.revision ?? 0,
        afterRevision: persisted.revision,
        commitId: commit.commitId,
        invariantResults: validateProtocolReconciliationPostState(before, persisted, plan).results,
      });
    },
  });
}

export function fingerprintProtocolReconciliationPlan(plan) {
  return hash(plan);
}

function retainProtocol(legacy, planned, plan, at) {
  if (!legacy) fail("STALE_PLAN", "A retained legacy protocol is missing.");
  legacy.relatedGoalIds = unique([plan.targetGoalId, ...(legacy.relatedGoalIds ?? []), plan.sourceGoalId]);
  legacy.historicalGoalIds = unique([...(legacy.historicalGoalIds ?? []), plan.sourceGoalId]);
  legacy.currentGoalIds = [plan.targetGoalId];
  legacy.reconciliation = { migrationId: plan.migrationId, action: "retained", reconciledAt: at, cancelledPlannedProtocolId: planned.id };
  legacy.updatedAt = at;
  planned.status = "archived";
  planned.lifecycle = { status: "cancelled", cancelledAt: at, reason: "redundant_keep_copy", authoritativeProtocolId: legacy.id };
  planned.reconciliation = { migrationId: plan.migrationId, action: "cancelled_planned_copy", reconciledAt: at };
}

function promoteProtocol(store, planned, legacy, plan, at) {
  const versions = (store.protocolVersions ?? [])
    .filter((item) => item.protocolId === planned.id);
  const eligible = versions.filter((item) =>
    item.status === "planned" && !item.endedAt
    && item.confirmation?.authority === "accepted_goal_transition");
  const activeVersions = versions.filter((item) =>
    item.status === "active" && !item.endedAt);
  if (eligible.length !== 1 || activeVersions.length !== 0) {
    fail("INVALID_INITIAL_VERSION_LINEAGE",
      "A promoted transition protocol requires exactly one planned initial version.", {
        protocolId: planned.id,
        eligibleVersionIds: eligible.map((item) => item.id),
        activeVersionIds: activeVersions.map((item) => item.id),
      });
  }
  const initialVersion = eligible[0];
  initialVersion.status = "active";
  initialVersion.activatedAt = at;
  planned.currentVersionId = initialVersion.id;
  planned.status = "active";
  planned.currentGoalIds = [plan.targetGoalId];
  planned.historicalGoalIds = legacy ? unique([...(legacy.relatedGoalIds ?? []), plan.sourceGoalId]) : [];
  planned.relatedGoalIds = unique([...(planned.relatedGoalIds ?? []), plan.targetGoalId]);
  planned.predecessorProtocolId = legacy?.id ?? null;
  planned.reconciliation = { migrationId: plan.migrationId, action: "promoted", reconciledAt: at };
  planned.activatedAt = at;
  planned.updatedAt = at;
  if (legacy) {
    legacy.status = "archived";
    legacy.currentGoalIds = [];
    legacy.historicalGoalIds = unique([...(legacy.relatedGoalIds ?? []), plan.sourceGoalId]);
    legacy.supersededByProtocolId = planned.id;
    legacy.lifecycle = { status: "superseded", supersededAt: at, supersededBy: planned.id };
    legacy.reconciliation = { migrationId: plan.migrationId, action: "superseded", reconciledAt: at };
    legacy.updatedAt = at;
  }
}

function canonicalizeFoamRolling(candidate, plan, at) {
  const protocol = candidate.protocols.find((item) => item.id === plan.foamRolling.canonicalProtocolId);
  protocol.name = "Foam Rolling";
  protocol.category = "recovery";
  protocol.protocolType = "recovery";
  protocol.owner = { type: "user", id: plan.foamRolling.userId };
  protocol.ownership = "user_created";
  protocol.schedule = { type: "daily", cadence: "daily", interval: 1, unit: "day", daysOfWeek: [], timeOfDay: plan.foamRolling.timeOfDay };
  protocol.priorityGeneration = { enabled: true };
  protocol.manualCompletion = true;
  protocol.provenance = {
    executionItemId: plan.foamRolling.executionItemId,
    reminderId: plan.foamRolling.reminderId,
  };
  protocol.updatedAt = at;
}

function reconcileCommitments(candidate, plan, at) {
  const protocolByType = new Map(active(candidate.protocols).map((item) => [item.protocolType, item]));
  const protocolById = new Map(active(candidate.protocols).map((item) => [item.id, item]));
  const activeReminders = new Map(
    active(candidate.reminders).map((reminder) => [reminder.id, reminder])
  );
  const duplicateTypes = new Map([
    ["weight", "execution_morning_weigh_in"],
    ["photos", "execution_progress_photos"],
    ["dexa", "execution_dexa"],
    ["recovery", "execution_foam_roll"],
  ]);
  for (const item of candidate.executionItems ?? []) {
    const transitionType = transitionCommitmentType(item);
    if (transitionType && duplicateTypes.has(transitionType)) {
      item.active = false;
      item.lifecycle = { status: "superseded", supersededAt: at, supersededBy: duplicateTypes.get(transitionType) };
      item.updatedAt = at;
      continue;
    }
    const type = transitionType ?? normalizeExecutionType(item);
    const legacyProtocolReminder = item.id?.startsWith("execution_")
      ? activeReminders.get(`reminder_${item.id.slice("execution_".length)}`)
      : null;
    const protocol =
      protocolById.get(item.protocolRootId ?? item.linkedProtocolId) ??
      protocolById.get(legacyProtocolReminder?.linkedEntityId) ??
      protocolByType.get(type);
    if (!protocol) continue;
    item.linkedProtocolId = protocol.id;
    item.linkedGoalIds = unique([plan.targetGoalId, ...(item.linkedGoalIds ?? [])]);
    item.currentGoalIds = [plan.targetGoalId];
    item.historicalGoalIds = item.id.startsWith("execution_")
      ? unique([...(item.linkedGoalIds ?? []), plan.sourceGoalId])
      : [];
    item.updatedAt = at;
  }
}

function reconcileReminders(candidate, plan, at) {
  const protocolByType = new Map(active(candidate.protocols).map((item) => [item.protocolType, item]));
  const supersededCommitments = new Set(
    (candidate.executionItems ?? []).filter((item) => item.active === false && item.lifecycle?.supersededAt === at).map((item) => item.id)
  );
  for (const reminder of candidate.reminders ?? []) {
    const commitmentId = reminder.id.replace(/_reminder(?:_intent)?$/, "");
    if (supersededCommitments.has(commitmentId)) {
      reminder.active = false;
      reminder.lifecycle = { status: "superseded", supersededAt: at };
      reminder.updatedAt = at;
      continue;
    }
    const type = normalizeReminderType(reminder);
    const linked = candidate.protocols.find(
      (item) => item.id === reminder.linkedEntityId && item.status === "active"
    );
    const protocol = linked ?? protocolByType.get(type);
    if (!protocol) continue;
    reminder.linkedEntityType = "protocol";
    reminder.linkedEntityId = protocol.id;
    reminder.relatedGoalIds = unique([plan.targetGoalId, ...(reminder.relatedGoalIds ?? [])]);
    reminder.currentGoalIds = [plan.targetGoalId];
    reminder.historicalGoalIds = unique([...(reminder.relatedGoalIds ?? []), plan.sourceGoalId]);
    reminder.updatedAt = at;
  }
}

function reconcileEnergyAndNutrition(candidate, plan, at) {
  const activeByType = new Map(active(candidate.protocols).map((item) => [item.protocolType, item]));
  const energy = activeByType.get("energy");
  const activity = activeByType.get("activity");
  const nutrition = activeByType.get("nutrition");
  candidate.energyStrategyLinks = {
    ...candidate.energyStrategyLinks,
    goalId: plan.targetGoalId,
    historicalGoalIds: unique([...(candidate.energyStrategyLinks?.historicalGoalIds ?? []), plan.sourceGoalId]),
    phaseContext: null,
    energyProtocolId: energy.id,
    activityProtocolId: activity.id,
    nutritionProtocolId: nutrition.id,
    status: "active",
    selectedPace: "maintenance_calibration",
    strategyMode: energy.effectiveStrategy?.mode,
    updatedAt: at,
  };
  candidate.nutritionContext = {
    ...candidate.nutritionContext,
    estimatedDailyCaloricIntake: null,
    activeProtocolId: nutrition.id,
    goalId: plan.targetGoalId,
    historicalGoalIds: unique([...(candidate.nutritionContext?.historicalGoalIds ?? []), plan.sourceGoalId]),
    calibrationStrategy: structuredClone(nutrition.effectiveStrategy),
    updatedAt: at,
  };
}

function resolveFoamRolling(store) {
  const execution = (store.executionItems ?? []).find((item) => item.id === "execution_foam_roll");
  const reminder = (store.reminders ?? []).find((item) => item.id === "reminder_foam_roll_daily");
  const recovery = (store.protocols ?? []).find(
    (item) => item.status === "planned" && item.sourceProtocolId === "virtual_recovery"
  );
  const times = unique([execution?.preferredSchedule?.timeOfDay, reminder?.schedule?.timeOfDay].filter(Boolean));
  if (!execution || !reminder || !recovery || times.length !== 1 || !/^\d{2}:\d{2}$/.test(times[0])) {
    fail("FOAM_ROLLING_TIME_UNRESOLVED", "Foam Rolling requires one deterministic persisted schedule.");
  }
  return Object.freeze({
    canonicalProtocolId: recovery.id,
    executionItemId: execution.id,
    reminderId: reminder.id,
    timeOfDay: times[0],
    userId: execution.userId,
  });
}

function actionFor(disposition, hasLegacy) {
  if (disposition === "keep") return hasLegacy ? "retain" : "promote";
  if (["update", "replace"].includes(disposition)) return "promote";
  if (["pause", "leave_behind"].includes(disposition)) return "deactivate";
  fail("DISPOSITION_UNSUPPORTED", "Unsupported transition disposition.", { disposition });
}

function commitmentEffect(type) {
  return ["weight", "photos", "dexa", "recovery"].includes(type)
    ? "reuse_historical_commitment_and_supersede_transition_duplicate"
    : "link_existing_commitment_to_authoritative_protocol";
}

function normalizeExecutionType(item) {
  if (item.id === "execution_morning_weigh_in") return "weight";
  if (item.id === "execution_progress_photos") return "photos";
  return item.type;
}
function transitionCommitmentType(item) {
  const match = item.id?.match(/_commitment_(weight|nutrition|training|activity|dexa|photos|energy|recovery|briefings)_/);
  return match?.[1] ?? null;
}
function normalizeReminderType(reminder) {
  if (reminder.id === "reminder_morning_weight") return "weight";
  if (reminder.id === "reminder_weekly_progress_photo_set") return "photos";
  if (reminder.id === "reminder_retatrutide") return "peptide";
  if (reminder.id === "reminder_tesamorelin") return "peptide";
  if (reminder.id === "reminder_foam_roll_daily") return "recovery";
  return transitionCommitmentType({ id: reminder.id }) ?? reminder.type?.replace(/_reminder$/, "");
}
function active(items = []) {
  return items.filter((item) => item.status ? item.status === "active" : item.active !== false);
}
function activeSemanticKey(protocol) {
  return `${protocol.category}|${protocol.protocolType}|${protocol.sourceProtocolId ?? protocol.id}`;
}
function phaseIds(protocol) {
  return [protocol?.phaseContext?.id, ...(protocol?.phaseIds ?? [])].filter(Boolean);
}
function requireGoal(store, id, status) {
  const goal = (store.goals ?? []).find((item) => item.id === id);
  if (!goal || goal.status !== status) fail("MISSING_PROTECTED_REFERENCE", `Required ${status} goal is unavailable.`, { id });
  return goal;
}
function protectedCollections() {
  return ["canonicalEvidenceObjects", "evidencePackages", "evidenceReviews", "analyses", "dailyBriefings", "dexaScans", "progressPhotos", "weightEntries", "dailyCheckIns"];
}
function sameProtected(left, right) {
  return same(left, right);
}
function existingReport(store, plan) {
  return store.protocolReconciliationMigrations.find((item) => item.id === plan.migrationId);
}
function fileMetadata(filePath) {
  const stat = fs.statSync(filePath);
  return {
    fullRuntimeHash: hash(JSON.parse(fs.readFileSync(filePath, "utf8"))),
    fileSize: stat.size,
    lastModified: stat.mtime.toISOString(),
  };
}
function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
function replaceObject(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, structuredClone(source));
}
function duplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value);
}
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function hash(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : stable(value));
  return createHash("sha256").update(bytes).digest("hex");
}
function fail(code, message, details = {}) {
  throw new ProtocolReconciliationMigrationError(code, message, details);
}
