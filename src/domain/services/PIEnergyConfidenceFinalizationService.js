import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  createFounderStoreUnitOfWork,
  FounderStoreUnitOfWorkErrorCode,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  createFounderRuntimeSemanticDigest,
} from "./FounderRuntimeSemanticDigest";
import {
  createCadenceEnergyAssessment,
  CADENCE_RMR_STRATEGIES,
} from "./CadenceEnergyAssessmentService";
import {
  resolvePICalibrationEnergyState,
} from "./PICalibrationEnergyStateResolver";
import {
  createPIDomainConsumptionIdentity,
  createPILowerLevelTriggerCandidate,
  createPISemanticFingerprint,
  PILowerLevelTriggerType,
} from "./PILowerLevelConfidenceContracts";
import {
  detectPILowerLevelConfidenceSemanticChange,
  explainPILowerLevelSemanticChange,
} from "./PILowerLevelConfidenceSemanticChangeService";
import {
  createPIGoalConfidenceAssessment,
  resolvePIGoalConfidenceScoreBand,
} from "./PIGoalConfidenceAssessmentModel";
import {
  finalizePreparedPIGoalConfidencePublication,
  preparePIGoalConfidencePublication,
  stagePreparedPIGoalConfidencePublication,
  validatePreparedPIGoalConfidencePublication,
} from "./PIGoalConfidencePersistenceService";

export const PI_ENERGY_FINALIZATION_VERSION =
  "pi_energy_confidence_finalization_v1";
export const PI_ENERGY_WORK_VERSION = "pi_energy_confidence_work_v1";
export const PI_ENERGY_RECEIPT_VERSION = "pi_energy_finalization_receipt_v1";
export const PI_ENERGY_MAX_ATTEMPTS = 5;
export const PI_ENERGY_STALE_CLAIM_MS = 15 * 60 * 1000;
export const PI_ENERGY_TRANSIENT_RETENTION_DAYS = 90;

export const PIEnergyFinalizationOutcome = Object.freeze({
  PUBLISHED_SUCCESSOR: "published_successor",
  MATCHED: "matched",
  NOT_MATERIAL: "not_material",
  AWAITING_PAIR: "awaiting_pair",
  ALREADY_CONSUMED: "already_consumed",
  CADENCE_OWNED: "cadence_owned",
  EVENT_OWNED: "event_owned",
  CONTEXT_PRECEDENCE_BLOCKED: "context_precedence_blocked",
  BASELINE_CONFLICT: "baseline_conflict",
  SNAPSHOT_CONFLICT: "snapshot_conflict",
  SEMANTIC_CONFLICT: "semantic_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  COMMITTED_PUBLICATION_FAILURE: "committed_publication_failure",
  ATTEMPT_LIMIT_REACHED: "attempt_limit_reached",
  WORK_NOT_FOUND: "work_not_found",
});

export function createPIEnergyConfidenceWork(input = {}) {
  const source = normalizeWorkSource(input);
  const identity = {
    version: PI_ENERGY_WORK_VERSION,
    triggerType: PILowerLevelTriggerType.ENERGY,
    goalId: required(input.goalId, "goalId"),
    phaseId: required(input.phaseId, "phaseId"),
    operatingState: required(input.operatingState, "operatingState"),
    changedLocalDate: dateKey(input.changedLocalDate),
    rollingWindowId: required(input.rollingWindowId, "rollingWindowId"),
  };
  return deepFreeze({
    schemaVersion: PI_ENERGY_WORK_VERSION,
    id: `pi_energy_work|${digest(stable(identity))}`,
    ...identity,
    sourceNutritionId: source.sourceNutritionId,
    sourceActivityId: source.sourceActivityId,
    reason: source.reason,
    evidenceCutoff: timestamp(input.evidenceCutoff),
    expectedSourceFingerprint: createPISemanticFingerprint({
      sourceNutritionId: source.sourceNutritionId,
      sourceActivityId: source.sourceActivityId,
      changedLocalDate: identity.changedLocalDate,
    }),
    status: "pending",
    attemptCount: 0,
    lastError: null,
    completionReceiptId: null,
    receiptIds: [],
    createdAt: timestamp(input.createdAt),
    updatedAt: timestamp(input.createdAt),
    processingStartedAt: null,
    completedAt: null,
  });
}

export function mergePIEnergyConfidenceWork(existing, incoming) {
  if (!existing) return incoming;
  if (existing.id !== incoming.id) {
    throw new Error("Energy work identities do not match.");
  }
  const sourceNutritionId =
    incoming.sourceNutritionId ?? existing.sourceNutritionId;
  const sourceActivityId =
    incoming.sourceActivityId ?? existing.sourceActivityId;
  const expectedSourceFingerprint = createPISemanticFingerprint({
    sourceNutritionId,
    sourceActivityId,
    changedLocalDate: existing.changedLocalDate,
  });
  if (
    expectedSourceFingerprint === existing.expectedSourceFingerprint &&
    !["failed", "awaiting_pair"].includes(existing.status)
  ) return existing;
  return deepFreeze({
    ...existing,
    sourceNutritionId,
    sourceActivityId,
    reason: incoming.reason,
    evidenceCutoff:
      Date.parse(incoming.evidenceCutoff) > Date.parse(existing.evidenceCutoff)
        ? incoming.evidenceCutoff
        : existing.evidenceCutoff,
    expectedSourceFingerprint,
    status: "pending",
    lastError: null,
    completionReceiptId: null,
    processingStartedAt: null,
    completedAt: null,
    updatedAt: incoming.updatedAt,
  });
}

export function createPIEnergyFinalizationReceipt(input = {}) {
  const identity = {
    version: PI_ENERGY_RECEIPT_VERSION,
    workId: required(input.workId, "workId"),
    triggerId: required(input.triggerId, "triggerId"),
    interpretationFingerprint: required(
      input.energyInterpretationFingerprint,
      "energyInterpretationFingerprint"
    ),
    consumptionId: required(input.energyConsumptionId, "energyConsumptionId"),
  };
  return deepFreeze({
    schemaVersion: PI_ENERGY_RECEIPT_VERSION,
    id: `pi_energy_receipt|${digest(stable(identity))}`,
    ...identity,
    goalId: required(input.goalId, "goalId"),
    phaseId: required(input.phaseId, "phaseId"),
    operatingState: required(input.operatingState, "operatingState"),
    energyInterpretationId: required(
      input.energyInterpretationId,
      "energyInterpretationId"
    ),
    energyConsumptionId: identity.consumptionId,
    rollingWindowId: required(input.rollingWindowId, "rollingWindowId"),
    sourceEvidenceIds: strings(input.sourceEvidenceIds),
    priorEnergyState: input.priorEnergyState ?? null,
    currentEnergyState: required(input.currentEnergyState, "currentEnergyState"),
    reliability: required(input.reliability, "reliability"),
    semanticChangeOutcome: required(
      input.semanticChangeOutcome,
      "semanticChangeOutcome"
    ),
    publicationEligibility: Boolean(input.publicationEligibility),
    confidencePublicationOutcome: required(
      input.confidencePublicationOutcome,
      "confidencePublicationOutcome"
    ),
    publishedAssessmentId: input.publishedAssessmentId ?? null,
    firstConsumedAssessmentId: input.firstConsumedAssessmentId ?? null,
    priorReceiptId: input.priorReceiptId ?? null,
    completedAt: timestamp(input.completedAt),
    confidenceModelVersion:
      input.confidenceModelVersion ?? "pi_goal_confidence_assessment_v1",
    energyInterpretationVersion: required(
      input.energyInterpretationVersion,
      "energyInterpretationVersion"
    ),
  });
}

export function createPIEnergyConfidenceFinalizationService(options = {}) {
  const {
    filePath,
    liveStore,
    now = () => new Date(),
    createUnitOfWork = createFounderStoreUnitOfWork,
    readText = (target) => fs.readFileSync(target, "utf8"),
  } = options;
  if (!filePath || !liveStore) {
    throw new Error("Energy finalization requires an explicitly bound store.");
  }

  return Object.freeze({
    captureBaseline: () => capture(filePath, readText),

    async enqueue(input = {}) {
      const incoming = createPIEnergyConfidenceWork({
        ...input,
        createdAt: input.createdAt ?? now().toISOString(),
      });
      const baseline = capture(filePath, readText);
      const existing = (baseline.store.piEnergyConfidenceWorkItems ?? [])
        .find((item) => item.id === incoming.id);
      const merged = mergePIEnergyConfidenceWork(existing, incoming);
      if (existing && stable(existing) === stable(merged)) {
        return result(PIEnergyFinalizationOutcome.MATCHED, {
          committed: false,
          work: existing,
        });
      }
      return commitMutation({
        baseline,
        createUnitOfWork,
        filePath,
        liveStore,
        now,
        mutate: (candidate) => {
          ensureCollections(candidate);
          const index = candidate.piEnergyConfidenceWorkItems
            .findIndex((item) => item.id === incoming.id);
          if (index >= 0) candidate.piEnergyConfidenceWorkItems[index] = merged;
          else candidate.piEnergyConfidenceWorkItems.push(merged);
        },
        validate: (candidate) =>
          candidate.piEnergyConfidenceWorkItems
            .filter((item) => item.id === incoming.id).length === 1,
        success: (commit) => result("pending", {
          committed: true,
          work: merged,
          ...commit,
        }),
      });
    },

    listRecoverableWork({ at = now(), maximumAttempts = PI_ENERGY_MAX_ATTEMPTS } = {}) {
      const store = capture(filePath, readText).store;
      const cutoff = at.getTime() - PI_ENERGY_STALE_CLAIM_MS;
      return deepFreeze((store.piEnergyConfidenceWorkItems ?? [])
        .filter((item) =>
          item.attemptCount < maximumAttempts &&
          (
            ["pending", "awaiting_pair"].includes(item.status) ||
            (
              item.status === "processing" &&
              Date.parse(item.processingStartedAt) <= cutoff
            )
          )
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
    },

    async claim(workId, { at = now() } = {}) {
      const baseline = capture(filePath, readText);
      const work = (baseline.store.piEnergyConfidenceWorkItems ?? [])
        .find((item) => item.id === workId);
      if (!work) return result(PIEnergyFinalizationOutcome.WORK_NOT_FOUND);
      if (isTerminal(work.status)) {
        return result(PIEnergyFinalizationOutcome.MATCHED, {
          committed: false,
          work,
        });
      }
      if (work.attemptCount >= PI_ENERGY_MAX_ATTEMPTS) {
        return result(PIEnergyFinalizationOutcome.ATTEMPT_LIMIT_REACHED);
      }
      const staleBefore = at.getTime() - PI_ENERGY_STALE_CLAIM_MS;
      if (
        work.status === "processing" &&
        Date.parse(work.processingStartedAt) > staleBefore
      ) {
        return result(PIEnergyFinalizationOutcome.MATCHED, {
          committed: false,
          work,
        });
      }
      const claimedAt = at.toISOString();
      return commitMutation({
        baseline, createUnitOfWork, filePath, liveStore, now,
        mutate: (candidate) => {
          const target = candidate.piEnergyConfidenceWorkItems
            .find((item) => item.id === workId);
          target.status = "processing";
          target.processingStartedAt = claimedAt;
          target.updatedAt = claimedAt;
        },
        validate: (candidate) => {
          const target = candidate.piEnergyConfidenceWorkItems
            .find((item) => item.id === workId);
          return target?.status === "processing" &&
            target.processingStartedAt === claimedAt;
        },
        success: (commit) => result("processing", {
          committed: true,
          workId,
          ...commit,
        }),
      });
    },

    preview(workId, expectations = {}) {
      const baseline = capture(filePath, readText);
      if (
        expectations.expectedRevision != null &&
        expectations.expectedRevision !== baseline.revision ||
        expectations.expectedSemanticDigest != null &&
        expectations.expectedSemanticDigest !== baseline.semanticDigest
      ) return result(PIEnergyFinalizationOutcome.BASELINE_CONFLICT);
      const work = (baseline.store.piEnergyConfidenceWorkItems ?? [])
        .find((item) => item.id === workId);
      if (!work) return result(PIEnergyFinalizationOutcome.WORK_NOT_FOUND);
      try {
        const prepared = prepareFinalization(
          baseline.store, work, baseline, now()
        );
        const priorScore = latestScore(baseline.store);
        const nextScore =
          prepared.publicationPrepared?.assessment?.score?.current ?? priorScore;
        return result(
          prepared.matchedReceipt
            ? PIEnergyFinalizationOutcome.MATCHED
            : prepared.outcome,
          {
            workId,
            expectedScoreMovement: nextScore - priorScore,
            ownership: prepared.outcome,
            wouldPublish: Boolean(prepared.publicationPrepared),
          }
        );
      } catch (error) {
        return result(
          String(error?.message).includes("stale_goal_phase_context")
            ? PIEnergyFinalizationOutcome.CONTEXT_PRECEDENCE_BLOCKED
            : PIEnergyFinalizationOutcome.PERSISTENCE_FAILURE,
          { error: String(error?.message ?? error) }
        );
      }
    },

    async finalize(workId, expectations = {}) {
      const baseline = capture(filePath, readText);
      if (
        expectations.expectedRevision != null &&
        expectations.expectedRevision !== baseline.revision
      ) return result(PIEnergyFinalizationOutcome.BASELINE_CONFLICT);
      if (
        expectations.expectedSemanticDigest != null &&
        expectations.expectedSemanticDigest !== baseline.semanticDigest
      ) return result(PIEnergyFinalizationOutcome.BASELINE_CONFLICT);
      const work = (baseline.store.piEnergyConfidenceWorkItems ?? [])
        .find((item) => item.id === workId);
      if (!work) return result(PIEnergyFinalizationOutcome.WORK_NOT_FOUND);
      const existingReceipt = (baseline.store.piEnergyFinalizationReceipts ?? [])
        .find((item) => item.id === work.completionReceiptId);
      if (existingReceipt && isTerminal(work.status)) {
        return result(PIEnergyFinalizationOutcome.MATCHED, {
          committed: false,
          work,
          receipt: existingReceipt,
          persistedOutcome: work.status,
        });
      }
      if (work.attemptCount >= PI_ENERGY_MAX_ATTEMPTS) {
        return result(PIEnergyFinalizationOutcome.ATTEMPT_LIMIT_REACHED);
      }

      let prepared;
      try {
        prepared = prepareFinalization(baseline.store, work, baseline, now());
      } catch (error) {
        return persistFailure({
          baseline, work, error, createUnitOfWork, filePath, liveStore, now,
        });
      }
      if (prepared.matchedReceipt) {
        return result(PIEnergyFinalizationOutcome.MATCHED, {
          committed: false,
          work,
          receipt: prepared.matchedReceipt,
          persistedOutcome: prepared.matchedReceipt.confidencePublicationOutcome,
        });
      }

      return commitMutation({
        baseline,
        createUnitOfWork,
        filePath,
        liveStore,
        now,
        mutate: (candidate) => {
          ensureCollections(candidate);
          const target = candidate.piEnergyConfidenceWorkItems
            .find((item) => item.id === work.id);
          if (!target) throw new Error("Energy work disappeared before finalization.");
          if (prepared.publicationPrepared) {
            stagePreparedPIGoalConfidencePublication(
              candidate,
              prepared.publicationPrepared
            );
          }
          candidate.piEnergyFinalizationReceipts.push(prepared.receipt);
          Object.assign(target, {
            status: prepared.terminalStatus,
            attemptCount: work.attemptCount + 1,
            completionReceiptId: prepared.receipt.id,
            receiptIds: strings([...(work.receiptIds ?? []), prepared.receipt.id]),
            lastError: null,
            processingStartedAt: null,
            completedAt: prepared.receipt.completedAt,
            updatedAt: prepared.receipt.completedAt,
          });
        },
        finalizeCandidate: ({ stagedState, commitId }) => {
          if (prepared.publicationPrepared) {
            finalizePreparedPIGoalConfidencePublication(
              stagedState,
              prepared.publicationPrepared,
              commitId
            );
          }
          const receipt = stagedState.piEnergyFinalizationReceipts
            .find((item) => item.id === prepared.receipt.id);
          if (
            prepared.publicationPrepared &&
            receipt.publishedAssessmentId !==
              prepared.publicationPrepared.assessment.id
          ) throw new Error("Energy receipt does not link the staged assessment.");
        },
        validate: (candidate) => {
          const receiptCount = candidate.piEnergyFinalizationReceipts
            .filter((item) => item.id === prepared.receipt.id).length;
          const target = candidate.piEnergyConfidenceWorkItems
            .find((item) => item.id === work.id);
          return receiptCount === 1 &&
            target?.completionReceiptId === prepared.receipt.id &&
            (
              !prepared.publicationPrepared ||
              validatePreparedPIGoalConfidencePublication(
                candidate,
                prepared.publicationPrepared
              ).valid
            );
        },
        validateFinalized: (candidate, commitContext) =>
          !prepared.publicationPrepared ||
          validatePreparedPIGoalConfidencePublication(
            candidate,
            prepared.publicationPrepared,
            commitContext
          ).valid,
        success: (commit) => result(prepared.outcome, {
          committed: true,
          workId: work.id,
          receipt: prepared.receipt,
          assessmentId: prepared.receipt.publishedAssessmentId,
          ...commit,
        }),
      });
    },

    pruneTransient({ at = now() } = {}) {
      const baseline = capture(filePath, readText);
      const cutoff =
        at.getTime() - PI_ENERGY_TRANSIENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const retained = (baseline.store.piEnergyConfidenceWorkItems ?? [])
        .filter((item) =>
          ["pending", "processing", "awaiting_pair"].includes(item.status) ||
          Date.parse(item.completedAt ?? item.updatedAt) >= cutoff ||
          (item.receiptIds ?? []).some((id) => {
            const receipt = (baseline.store.piEnergyFinalizationReceipts ?? [])
              .find((candidate) => candidate.id === id);
            return receipt?.publishedAssessmentId;
          })
        );
      if (
        retained.length ===
        (baseline.store.piEnergyConfidenceWorkItems ?? []).length
      ) return result(PIEnergyFinalizationOutcome.MATCHED, { committed: false });
      return commitMutation({
        baseline, createUnitOfWork, filePath, liveStore, now,
        mutate: (candidate) => {
          candidate.piEnergyConfidenceWorkItems = retained;
        },
        validate: (candidate) =>
          candidate.piEnergyConfidenceWorkItems.every((item) =>
            !["pending", "processing", "awaiting_pair"].includes(item.status) ||
            retained.some((retainedItem) => retainedItem.id === item.id)
          ),
        success: (commit) => result("pruned", { committed: true, ...commit }),
      });
    },
  });
}

function prepareFinalization(store, work, baseline, completedAt) {
  const goal = (store.goals ?? []).find((item) => item.id === work.goalId);
  const phase = goal?.phases?.find((item) => item.id === work.phaseId);
  const operatingState =
    goal?.openingApproach?.value ?? goal?.operatingState?.value ??
    goal?.operatingState;
  if (!goal || !phase || phase.status !== "active" ||
      operatingState !== work.operatingState) {
    throw new Error("stale_goal_phase_context");
  }
  const window = parseWindow(work.rollingWindowId, work.changedLocalDate);
  const canonical = (store.canonicalEvidenceObjects ?? [])
    .filter((item) => item.quality?.status !== "superseded");
  const assessment = createCadenceEnergyAssessment({
    cadence: "rolling_energy_confidence",
    window,
    nutritionDays: canonical.filter((item) => item.evidence_type === "nutrition"),
    activityDays: canonical.filter((item) => item.evidence_type === "activity_day"),
    dexaScans: [
      ...(store.dexaScans ?? []),
      ...canonical.filter((item) => item.evidence_type === "dexa_scan")
        .map((item) => item.payload ?? item),
    ],
    rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
  });
  const interpretation = resolvePICalibrationEnergyState({
    goalId: goal.id,
    phaseId: phase.id,
    semanticGoalType: "build_lean_mass",
    semanticPhaseType: "establish_maintenance",
    operatingState,
    rollingWindowId: window.id,
    dailyRecords: assessment.dailyRecords,
    eligibleDayCount: assessment.coverage.eligibleDayCount,
    evidenceCutoff: work.evidenceCutoff,
  });
  const priorReceipt = latestReceipt(store, work);
  const currentHistory = currentConfidenceHistory(store, goal.id, phase.id);
  const represented = isRepresentedByCurrentAssessment(
    currentHistory?.assessment,
    interpretation
  );
  const priorState = priorReceipt
    ? receiptAsState(priorReceipt)
    : represented
      ? interpretation
      : contributorAsState(currentHistory?.assessment);
  const consumption = createPIDomainConsumptionIdentity({
    domain: "energy",
    sourceInterpretationId: interpretation.id,
    interpretationFingerprint: interpretation.interpretationFingerprint,
    goalId: goal.id,
    phaseId: phase.id,
    operatingState,
    evidenceCutoff: interpretation.evidenceCutoff,
    sourceEvidenceIds: [
      ...interpretation.canonicalNutritionIds,
      ...interpretation.canonicalActivityIds,
    ],
    transitionFromState: priorState?.state ?? null,
    transitionToState: interpretation.state,
    domainIdentity: {
      pairedLocalDates: assessment.dailyRecords
        .filter((item) => item.energyBalance != null).map((item) => item.date),
      nutritionIds: interpretation.canonicalNutritionIds,
      activityIds: interpretation.canonicalActivityIds,
      rollingWindowId: interpretation.rollingWindowId,
      interpretationVersion: interpretation.interpretationVersion,
    },
  });
  const contextType = currentHistory?.assessment?.context?.type ?? null;
  const ownership = represented
    ? ownershipForContext(contextType)
    : "lower_level";
  const change = detectPILowerLevelConfidenceSemanticChange({
    domain: "energy",
    priorState,
    nextState: interpretation,
    consumptionId: consumption.id,
    priorConsumedTransitionIds:
      currentHistory?.assessment?.contributors?.flatMap(
        (item) => item.consumedTransitionIds ?? []
      ) ?? [],
    ownership,
  });
  const terminal = represented
    ? representedOutcome(contextType)
    : change.outcome === "already_represented" && priorReceipt
      ? PIEnergyFinalizationOutcome.NOT_MATERIAL
      : outcomeFor(change, represented);
  const trigger = createPILowerLevelTriggerCandidate({
    triggerType: PILowerLevelTriggerType.ENERGY,
    goalId: goal.id,
    phaseId: phase.id,
    operatingState,
    sourceEvidenceIds: consumption.sourceEvidenceIds,
    finalizedInterpretationId: interpretation.id,
    interpretationFingerprint: interpretation.interpretationFingerprint,
    evidenceCutoff: interpretation.evidenceCutoff,
    semanticChangeType:
      change.semanticChangeType ?? change.outcome,
    publicationEligibility: change.material,
    expectedCurrentSnapshotId:
      currentHistory?.snapshot?.id ?? null,
    expectedRevision: baseline.revision,
    expectedSemanticDigest: baseline.semanticDigest,
    consumption,
    priorConsumedTransitionIdentity: priorReceipt?.energyConsumptionId ?? null,
    ownership,
  });
  const receiptId = `pi_energy_receipt|${digest(stable({
    version: PI_ENERGY_RECEIPT_VERSION,
    workId: work.id,
    triggerId: trigger.id,
    interpretationFingerprint: interpretation.interpretationFingerprint,
    consumptionId: consumption.id,
  }))}`;
  const matchedReceipt = (store.piEnergyFinalizationReceipts ?? [])
    .find((item) => item.id === receiptId);
  if (matchedReceipt) return { matchedReceipt };

  let publicationPrepared = null;
  let publishedAssessmentId = null;
  if (terminal === PIEnergyFinalizationOutcome.PUBLISHED_SUCCESSOR) {
    if (!currentHistory?.snapshot || !currentHistory?.assessment) {
      throw new Error("canonical_confidence_predecessor_missing");
    }
    const successor = createEnergySuccessorAssessment({
      prior: currentHistory.assessment,
      interpretation,
      consumption,
      completedAt: completedAt.toISOString(),
    });
    const command = {
      operation: "publish_successor",
      assessment: successor,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      expectedCurrentSnapshot: currentHistory.snapshot,
      publicationReason:
        `lower-level Energy interpretation ${trigger.id} [${consumption.id}]`,
      replacementAuthorized: true,
    };
    publicationPrepared = preparePIGoalConfidencePublication(store, command);
    if (publicationPrepared.result) {
      throw Object.assign(
        new Error(publicationPrepared.result.status),
        { publicationOutcome: publicationPrepared.result.status }
      );
    }
    publishedAssessmentId = successor.id;
  }
  const receipt = createPIEnergyFinalizationReceipt({
    workId: work.id,
    triggerId: trigger.id,
    goalId: goal.id,
    phaseId: phase.id,
    operatingState,
    energyInterpretationId: interpretation.id,
    energyInterpretationFingerprint: interpretation.interpretationFingerprint,
    energyConsumptionId: consumption.id,
    rollingWindowId: interpretation.rollingWindowId,
    sourceEvidenceIds: consumption.sourceEvidenceIds,
    priorEnergyState: priorState?.state ?? null,
    currentEnergyState: interpretation.state,
    reliability: interpretation.reliabilityStatus,
    semanticChangeOutcome: change.outcome,
    publicationEligibility: change.material,
    confidencePublicationOutcome: terminal,
    publishedAssessmentId,
    firstConsumedAssessmentId: publishedAssessmentId,
    priorReceiptId: priorReceipt?.id ?? null,
    completedAt: completedAt.toISOString(),
    energyInterpretationVersion: interpretation.interpretationVersion,
  });
  return {
    outcome: terminal,
    terminalStatus: terminal === PIEnergyFinalizationOutcome.ALREADY_CONSUMED
      ? "cadence_owned"
      : terminal,
    interpretation,
    trigger,
    consumption,
    receipt,
    publicationPrepared,
  };
}

function createEnergySuccessorAssessment({
  prior, interpretation, consumption, completedAt,
}) {
  const energy = energyContributor(interpretation, consumption);
  const contributors = prior.contributors
    .filter((item) => item.domain !== "energy")
    .map((item) => ({
      ...item,
      consumptionRole: item.consumptionRole ?? "prior_context",
    }));
  contributors.push(energy);
  const direction = interpretation.state === "near_maintenance" ? 1 : -1;
  const current = Math.max(0, Math.min(100, prior.score.current + direction * 2));
  const movementDirection = current > prior.score.current
    ? "increased"
    : current < prior.score.current
      ? "decreased"
      : "held";
  const assessmentInput = {
    piVersion: prior.piVersion,
    goalId: prior.goalId,
    phaseId: prior.phaseId,
    operatingState: prior.operatingState,
    context: {
      type: "energy_interpretation",
      cadence: null,
      evidenceWindowId: null,
      eventId: null,
    },
    evidenceCutoff: interpretation.evidenceCutoff,
    score: {
      current,
      prior: prior.score.current,
      band: resolvePIGoalConfidenceScoreBand(current),
      movement: { direction: movementDirection, magnitude: "small" },
      priorScoreProvenance: {
        source: "canonical_pi_assessment",
        assessmentId: prior.id,
        modelVersion: prior.modelVersion,
      },
    },
    primaryReason: explainPILowerLevelSemanticChange({
      domain: "energy",
      outcome: "material_change",
      nextState: interpretation,
    }),
    contributors,
    unresolvedUncertainty: interpretation.limitingReasons,
    evidenceCompleteness: prior.evidenceCompleteness,
    phaseAwareInterpretation: prior.phaseAwareInterpretation,
    coachingImplication: interpretation.state === "near_maintenance"
      ? "Continue calibration while confirming that the Energy direction persists."
      : "Review the Energy direction before changing the active plan.",
    reasoning: {
      ...prior.reasoning,
      domainInterpretations: [
        ...(prior.reasoning?.domainInterpretations ?? [])
          .filter((item) => item.domain !== "energy"),
        {
          id: interpretation.id,
          domain: "energy",
          status: interpretation.state,
          direction: interpretation.direction,
          confidenceLevel: interpretation.reliabilityStatus,
        },
      ],
    },
    provenance: {
      sourceObservationIds: prior.provenance.sourceObservationIds,
      sourceClaimIds: prior.provenance.sourceClaimIds,
      canonicalEvidenceReferences: [
        ...prior.provenance.canonicalEvidenceReferences,
        ...consumption.sourceEvidenceIds.map((id) => ({
          id,
          type: id.startsWith("activity") ? "activity_day" : "nutrition",
        })),
      ],
      piDecisionResultId: consumption.id,
      generatedAt: completedAt,
    },
  };
  const provisional = createPIGoalConfidenceAssessment(assessmentInput);
  assessmentInput.contributors = assessmentInput.contributors.map((item) =>
    item.domain === "energy"
      ? { ...item, firstConsumedAssessmentId: provisional.id }
      : item
  );
  return createPIGoalConfidenceAssessment(assessmentInput);
}

function energyContributor(interpretation, consumption) {
  const table = {
    near_maintenance: ["supporting", "high"],
    persistent_deficit: ["conflicting", "high"],
    large_surplus: ["conflicting", "high"],
    insufficient_or_incomplete: ["limiting", "moderate"],
  };
  const [direction, strength] = table[interpretation.state];
  return {
    id: `pi_confidence_contributor|energy|${digest(
      `${interpretation.state}|${consumption.id}`
    ).slice(0, 16)}`,
    domain: "energy",
    label: "Energy evidence",
    direction,
    strength,
    confidence: {
      level: strength,
      method: "pi_v3_reasoning",
    },
    evidenceCompleteness:
      interpretation.reliabilityStatus === "reliable" ? "complete" : "partial",
    reason: explainPILowerLevelSemanticChange({
      domain: "energy",
      outcome: "material_change",
      nextState: interpretation,
    }),
    sourceObservationIds: [],
    sourceClaimIds: [],
    canonicalEvidenceReferences: consumption.sourceEvidenceIds.map((id) => ({
      id,
      type: id.startsWith("activity") ? "activity_day" : "nutrition",
    })),
    affectedScoreMovement: true,
    userFacing: true,
    consumedTransitionIds: [consumption.id],
    contributorSemanticFingerprint: interpretation.interpretationFingerprint,
    firstConsumedAssessmentId: null,
    sourceInterpretationId: interpretation.id,
    consumptionRole: "new_effect",
  };
}

function parseWindow(id, endDate) {
  const match = String(id).match(
    /^rolling_energy:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2}):(.+)$/
  );
  if (match) return {
    id, startDate: match[1], endDate: match[2], timeZone: match[3],
  };
  const end = dateKey(endDate);
  const startValue = new Date(`${end}T12:00:00.000Z`);
  startValue.setUTCDate(startValue.getUTCDate() - 6);
  const start = startValue.toISOString().slice(0, 10);
  return {
    id: `rolling_energy:${start}:${end}:America/Los_Angeles`,
    startDate: start,
    endDate: end,
    timeZone: "America/Los_Angeles",
  };
}

export function createPIEnergyRollingWindow({
  changedLocalDate,
  timeZone = "America/Los_Angeles",
} = {}) {
  const endDate = dateKey(changedLocalDate);
  const date = new Date(`${endDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 6);
  const startDate = date.toISOString().slice(0, 10);
  return deepFreeze({
    id: `rolling_energy:${startDate}:${endDate}:${timeZone}`,
    startDate,
    endDate,
    timeZone,
    currentPartialDayIncluded: true,
    evidenceCutoff: `${endDate}T23:59:59.999Z`,
  });
}

function currentConfidenceHistory(store, goalId, phaseId) {
  const snapshot = (store.goalConfidenceSnapshots ?? [])
    .find((item) => item.goalId === goalId && item.phaseId === phaseId);
  const history = (store.goalConfidenceHistory ?? [])
    .find((item) => item.id === snapshot?.historyRecordId);
  return snapshot && history
    ? { snapshot, history, assessment: history.assessment }
    : null;
}
function isRepresentedByCurrentAssessment(assessment, interpretation) {
  if (!assessment || Date.parse(assessment.evidenceCutoff) <
      Date.parse(interpretation.evidenceCutoff)) return false;
  if (assessment.context?.type === "energy_interpretation") return false;
  const energy = assessment.contributors?.find((item) => item.domain === "energy");
  return Boolean(energy);
}
function contributorAsState(assessment) {
  const energy = assessment?.contributors?.find((item) => item.domain === "energy");
  if (!energy) return null;
  const text = `${energy.reason ?? ""}`.toLowerCase();
  const state = text.includes("deficit")
    ? "persistent_deficit"
    : text.includes("surplus")
      ? "large_surplus"
      : text.includes("maintenance energy is")
        ? "near_maintenance"
        : "insufficient_or_incomplete";
  return {
    state,
    direction: energy.direction === "supporting" ? "positive" :
      energy.direction === "conflicting" ? "negative" : "not_applicable",
    strength: energy.strength,
    reliabilityStatus: energy.evidenceCompleteness === "complete"
      ? "reliable" : "directional",
  };
}
function receiptAsState(receipt) {
  return {
    state: receipt.currentEnergyState,
    direction: receipt.currentEnergyState === "near_maintenance"
      ? "neutral" : "negative",
    strength: receipt.reliability === "reliable" ? "high" : "moderate",
    reliabilityStatus: receipt.reliability,
    interpretationFingerprint: receipt.interpretationFingerprint,
  };
}
function latestReceipt(store, work) {
  return (store.piEnergyFinalizationReceipts ?? [])
    .filter((item) => item.goalId === work.goalId && item.phaseId === work.phaseId)
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
    .at(-1) ?? null;
}
function outcomeFor(change, represented) {
  if (represented) return PIEnergyFinalizationOutcome.ALREADY_CONSUMED;
  return ({
    material_change: PIEnergyFinalizationOutcome.PUBLISHED_SUCCESSOR,
    non_material_change: PIEnergyFinalizationOutcome.NOT_MATERIAL,
    already_represented: PIEnergyFinalizationOutcome.ALREADY_CONSUMED,
    insufficient_interpretation: PIEnergyFinalizationOutcome.AWAITING_PAIR,
    awaiting_pair_completion: PIEnergyFinalizationOutcome.AWAITING_PAIR,
    higher_level_event_owned: PIEnergyFinalizationOutcome.EVENT_OWNED,
  })[change.outcome] ?? PIEnergyFinalizationOutcome.CONTEXT_PRECEDENCE_BLOCKED;
}
function ownershipForContext(contextType) {
  if (["photo_event", "dexa_event"].includes(contextType)) return "event";
  if (contextType === "phase_transition") return "event";
  return "cadence";
}
function representedOutcome(contextType) {
  if (["midweek_partial_window", "weekly_closed_window"].includes(contextType)) {
    return PIEnergyFinalizationOutcome.CADENCE_OWNED;
  }
  if (["photo_event", "dexa_event"].includes(contextType)) {
    return PIEnergyFinalizationOutcome.EVENT_OWNED;
  }
  if (contextType === "phase_transition") {
    return PIEnergyFinalizationOutcome.CONTEXT_PRECEDENCE_BLOCKED;
  }
  return PIEnergyFinalizationOutcome.ALREADY_CONSUMED;
}

async function persistFailure({
  baseline, work, error, createUnitOfWork, filePath, liveStore, now,
}) {
  const status = work.attemptCount + 1 >= PI_ENERGY_MAX_ATTEMPTS
    ? "failed" : "pending";
  return commitMutation({
    baseline, createUnitOfWork, filePath, liveStore, now,
    mutate: (candidate) => {
      const target = candidate.piEnergyConfidenceWorkItems
        .find((item) => item.id === work.id);
      target.status = status;
      target.attemptCount = work.attemptCount + 1;
      target.lastError = String(error?.message ?? error);
      target.updatedAt = now().toISOString();
    },
    validate: (candidate) =>
      candidate.piEnergyConfidenceWorkItems
        .find((item) => item.id === work.id)?.attemptCount ===
          work.attemptCount + 1,
    success: (commit) => result(
      status === "failed"
        ? PIEnergyFinalizationOutcome.ATTEMPT_LIMIT_REACHED
        : PIEnergyFinalizationOutcome.PERSISTENCE_FAILURE,
      { committed: true, error: String(error?.message ?? error), ...commit }
    ),
  });
}

async function commitMutation({
  baseline, createUnitOfWork, filePath, liveStore, now, mutate, validate,
  finalizeCandidate, validateFinalized, success,
}) {
  const unit = createUnitOfWork({
    filePath,
    liveStore,
    stageFrom: baseline.store,
    now,
    validatePersistedBaseline: (current) => ({
      valid:
        current.revision === baseline.revision &&
        createFounderRuntimeSemanticDigest(current) === baseline.semanticDigest,
    }),
  });
  const transaction = unit.begin();
  try {
    await transaction.mutate(mutate);
    const committed = await transaction.commit({
      validate: (candidate) => ({ valid: validate(candidate) }),
      finalizeCandidate,
      validateFinalized,
    });
    return success({
      revision: committed.revision,
      commitId: committed.commitId,
    });
  } catch (error) {
    if (
      error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT ||
      error?.code === FounderStoreUnitOfWorkErrorCode.VALIDATION_FAILED
    ) return result(PIEnergyFinalizationOutcome.BASELINE_CONFLICT);
    if (
      error?.code === FounderStoreUnitOfWorkErrorCode.PUBLICATION_FAILED &&
      error.committed
    ) return result(PIEnergyFinalizationOutcome.COMMITTED_PUBLICATION_FAILURE, {
      committed: true,
      commitId: error.commitId,
    });
    return result(PIEnergyFinalizationOutcome.PERSISTENCE_FAILURE, {
      committed: false,
      error: String(error?.message ?? error),
    });
  }
}

function capture(filePath, readText) {
  const raw = readText(filePath);
  const store = JSON.parse(raw);
  return deepFreeze({
    store,
    revision: store.revision ?? 0,
    semanticDigest: createFounderRuntimeSemanticDigest(store),
  });
}
function ensureCollections(store) {
  store.piEnergyConfidenceWorkItems ??= [];
  store.piEnergyFinalizationReceipts ??= [];
  store.goalConfidenceSnapshots ??= [];
  store.goalConfidenceHistory ??= [];
  store.goalConfidenceContinuitySeeds ??= [];
}
function latestScore(store) {
  return store.goalConfidenceHistory?.at(-1)?.assessment?.score?.current ?? 0;
}
function normalizeWorkSource(input) {
  const reason = input.reason;
  if (!["nutrition_committed", "activity_committed", "energy_correction_committed",
    "rmr_correction_committed"].includes(reason)) {
    throw new Error("Unsupported Energy work reason.");
  }
  return {
    reason,
    sourceNutritionId: input.sourceNutritionId ?? null,
    sourceActivityId: input.sourceActivityId ?? null,
  };
}
function isTerminal(status) {
  return ["published_successor", "matched", "not_material", "cadence_owned",
    "event_owned", "context_precedence_blocked"].includes(status);
}
function required(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}
function dateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new Error("changedLocalDate must use YYYY-MM-DD.");
  }
  return String(value);
}
function timestamp(value) {
  if (!Number.isFinite(Date.parse(value))) throw new Error("A valid timestamp is required.");
  return new Date(value).toISOString();
}
function strings(values = []) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort();
}
function result(outcome, extra = {}) {
  return deepFreeze({ outcome, committed: false, ...extra });
}
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
