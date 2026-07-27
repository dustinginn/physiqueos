import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  createFounderStoreUnitOfWork,
  FounderStoreUnitOfWorkErrorCode,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork";
import { createGoalConfidenceRepository } from "../../data/repositories/GoalConfidenceRepository";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../../data/repositories/founderRuntimeStore";
import {
  createFounderRuntimeFileHash,
  createFounderRuntimeSemanticDigest,
} from "./FounderRuntimeSemanticDigest";
import {
  validatePIGoalConfidenceAssessment,
  PI_GOAL_CONFIDENCE_ASSESSMENT_VERSION,
} from "./PIGoalConfidenceAssessmentModel";

export const PI_GOAL_CONFIDENCE_PERSISTENCE_VERSION =
  "pi_goal_confidence_persistence_v1";

export const PIGoalConfidencePublicationOutcome = Object.freeze({
  PUBLISHED: "published",
  MATCHED: "matched",
  REVISION_CONFLICT: "revision_conflict",
  RUNTIME_DIGEST_CONFLICT: "runtime_digest_conflict",
  SNAPSHOT_STATE_CONFLICT: "snapshot_state_conflict",
  ASSESSMENT_IDENTITY_CONFLICT: "assessment_identity_conflict",
  HISTORICAL_REPLAY_CONFLICT: "historical_replay_conflict",
  PREDECESSOR_CONFLICT: "predecessor_conflict",
  SEMANTIC_CONFLICT: "semantic_conflict",
  INVALID_LEGACY_SEED_REFERENCE: "invalid_legacy_seed_reference",
  DUPLICATE_SEED: "duplicate_seed",
  PHASE_MISMATCH: "phase_mismatch",
  OPERATING_STATE_MISMATCH: "operating_state_mismatch",
  PERSISTENCE_FAILURE: "persistence_failure",
  COMMITTED_PUBLICATION_FAILURE: "committed_publication_failure",
  VALIDATION_FAILURE: "validation_failure",
});

const OPERATIONS = [
  "publish_initial", "publish_successor", "publish_reconciliation",
];
const LEGACY_SOURCE_MODEL = "overall_goal_confidence_v1";
const LEGACY_SEMANTIC_MEANING =
  "legacy evidence-presence presentation score";

export function createPIGoalConfidencePersistenceService(options = {}) {
  const filePath = options.filePath ?? resolveFounderRuntimeStorePath();
  const liveStore = options.liveStore ?? getFounderRuntimeStore();
  const readText = options.readText ?? ((target) => fs.readFileSync(target, "utf8"));
  const createUnitOfWork = options.createUnitOfWork ??
    ((unitOptions) => createFounderStoreUnitOfWork(unitOptions));
  const now = options.now ?? (() => new Date());

  return Object.freeze({
    captureBaseline() {
      return captureBaseline(filePath, readText);
    },

    async publish(command = {}) {
      const contract = validatePublicationCommand(command);
      if (contract) return failure(contract.status, contract.message);

      let baseline;
      try {
        baseline = captureBaseline(filePath, readText);
      } catch (error) {
        return failure(PIGoalConfidencePublicationOutcome.PERSISTENCE_FAILURE, error);
      }
      if (baseline.revision !== command.expectedRevision) {
        return failure(PIGoalConfidencePublicationOutcome.REVISION_CONFLICT,
          "Founder revision differs from the prepared publication baseline.");
      }
      if (baseline.semanticDigest !== command.expectedSemanticDigest) {
        return failure(PIGoalConfidencePublicationOutcome.RUNTIME_DIGEST_CONFLICT,
          "Founder semantic runtime digest differs from the prepared baseline.");
      }

      const preflight = inspectPublication(baseline.store, command);
      if (preflight.result) return preflight.result;

      const unit = createUnitOfWork({
        filePath,
        liveStore,
        stageFrom: baseline.store,
        now,
        validatePersistedBaseline: (current) => ({
          valid:
            getFounderStoreRevision(current) === command.expectedRevision &&
            createFounderRuntimeSemanticDigest(current) ===
              command.expectedSemanticDigest,
        }),
        ...(options.unitOfWorkOptions ?? {}),
      });
      const transaction = unit.begin();
      try {
        await transaction.mutate((candidate) => {
          ensureCollections(candidate);
          const staged = inspectPublication(candidate, command);
          if (staged.result) {
            const error = new Error(staged.result.error?.message ?? staged.result.status);
            error.code = `PI_GOAL_CONFIDENCE_${staged.result.status.toUpperCase()}`;
            error.outcome = staged.result.status;
            throw error;
          }
          const repository = stagedRepository(candidate);
          if (staged.seedToCreate) {
            repository.stageCreateContinuitySeed(staged.seedToCreate);
          }
          repository.stageAppendHistory(staged.historyRecord);
          repository.stageReplaceSnapshot(staged.snapshot);
        });
        const committed = await transaction.commit({
          validate: (candidate) => validateCandidate(candidate, preflight),
          finalizeCandidate: ({ stagedState, commitId }) => {
            finalizeCandidate(stagedState, preflight, commitId);
          },
          validateFinalized: (candidate, context) =>
            validateFinalizedCandidate(candidate, preflight, context),
        });
        return Object.freeze({
          status: PIGoalConfidencePublicationOutcome.PUBLISHED,
          operation: command.operation,
          committed: true,
          revision: committed.revision,
          commitId: committed.commitId,
          updatedAt: liveStore.updatedAt,
          assessmentId: command.assessment.id,
          snapshotId: preflight.snapshot.id,
          historyRecordId: preflight.historyRecord.id,
          continuitySeedId: preflight.seed?.id ?? null,
        });
      } catch (error) {
        if (error?.outcome) return failure(error.outcome, error);
        if (error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT) {
          return failure(PIGoalConfidencePublicationOutcome.REVISION_CONFLICT, error);
        }
        if (error?.code === FounderStoreUnitOfWorkErrorCode.VALIDATION_FAILED) {
          const current = safeCapture(filePath, readText);
          if (current && current.revision !== command.expectedRevision) {
            return failure(PIGoalConfidencePublicationOutcome.REVISION_CONFLICT, error);
          }
          if (current && current.semanticDigest !== command.expectedSemanticDigest) {
            return failure(
              PIGoalConfidencePublicationOutcome.RUNTIME_DIGEST_CONFLICT,
              error
            );
          }
          return failure(PIGoalConfidencePublicationOutcome.SEMANTIC_CONFLICT, error);
        }
        if (
          error?.code === FounderStoreUnitOfWorkErrorCode.PUBLICATION_FAILED &&
          error.committed === true
        ) {
          return failure(
            PIGoalConfidencePublicationOutcome.COMMITTED_PUBLICATION_FAILURE,
            error,
            { committed: true, commitId: error.commitId }
          );
        }
        return failure(PIGoalConfidencePublicationOutcome.PERSISTENCE_FAILURE, error);
      }
    },
  });
}

export function createPIGoalConfidenceContinuitySeed(input = {}) {
  const goalId = requiredRef(input.goalId, "goalId");
  const phaseId = requiredRef(input.phaseId, "phaseId");
  const operatingState = requiredMachine(input.operatingState, "operatingState");
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 100) {
    throw new Error("Continuity seed score must be an integer from 0 through 100.");
  }
  const sourceModel = input.sourceModel ?? LEGACY_SOURCE_MODEL;
  if (sourceModel !== LEGACY_SOURCE_MODEL) {
    throw new Error("Unsupported continuity-seed source model.");
  }
  const identity = { goalId, phaseId, operatingState, sourceModel };
  return deepFreeze({
    schemaVersion: "pi_goal_confidence_continuity_seed_v1",
    id: `pi_goal_confidence_seed|${digest(stableSerialize(identity))}`,
    goalId,
    phaseId,
    operatingState,
    score: input.score,
    sourceModel,
    sourceType: "controlled_reconciliation_seed",
    provenance: "controlled_reconciliation_seed",
    originalSemanticMeaning: LEGACY_SEMANTIC_MEANING,
    piDerived: false,
    canonicalAssessment: false,
    eligibleAsPriorScore: true,
    semanticDisclaimer:
      "This legacy presentation value is continuity context only and is not a PI V3 assessment.",
    sourceTimestamp: timestamp(input.sourceTimestamp, "sourceTimestamp"),
    reconciliationTimestamp: timestamp(
      input.reconciliationTimestamp, "reconciliationTimestamp"
    ),
    sourceFingerprint: input.sourceFingerprint == null ? null :
      requiredRef(input.sourceFingerprint, "sourceFingerprint"),
    createdAt: timestamp(input.createdAt, "createdAt"),
  });
}

export function createPIGoalConfidenceSnapshotId({
  goalId, phaseId, operatingState,
} = {}) {
  return `pi_goal_confidence_snapshot|${digest(stableSerialize({
    goalId: requiredRef(goalId, "goalId"),
    phaseId: requiredRef(phaseId, "phaseId"),
    operatingState: requiredMachine(operatingState, "operatingState"),
  }))}`;
}

export function createPIGoalConfidenceHistoryRecordId(assessmentId) {
  return `pi_goal_confidence_history|${digest(requiredRef(
    assessmentId, "assessmentId"
  ))}`;
}

function validatePublicationCommand(command) {
  if (!OPERATIONS.includes(command.operation)) {
    return typed(PIGoalConfidencePublicationOutcome.VALIDATION_FAILURE,
      "Unsupported goal-confidence publication operation.");
  }
  try {
    validatePIGoalConfidenceAssessment(command.assessment);
  } catch (error) {
    return typed(PIGoalConfidencePublicationOutcome.VALIDATION_FAILURE, error.message);
  }
  if (!Number.isSafeInteger(command.expectedRevision) ||
      typeof command.expectedSemanticDigest !== "string") {
    return typed(PIGoalConfidencePublicationOutcome.VALIDATION_FAILURE,
      "Expected Founder revision and semantic digest are required.");
  }
  if (!Object.prototype.hasOwnProperty.call(command, "expectedCurrentSnapshot")) {
    return typed(PIGoalConfidencePublicationOutcome.VALIDATION_FAILURE,
      "Expected current snapshot state is required.");
  }
  if (typeof command.publicationReason !== "string" ||
      !command.publicationReason.trim()) {
    return typed(PIGoalConfidencePublicationOutcome.VALIDATION_FAILURE,
      "Publication reason is required.");
  }
  if (command.operation !== "publish_initial" &&
      command.replacementAuthorized !== true) {
    return typed(PIGoalConfidencePublicationOutcome.VALIDATION_FAILURE,
      "Replacing a current snapshot requires explicit authorization.");
  }
  return null;
}

function inspectPublication(store, command) {
  const assessment = command.assessment;
  const goal = (store.goals ?? []).find((item) => item.id === assessment.goalId);
  if (!goal) return rejected(PIGoalConfidencePublicationOutcome.SEMANTIC_CONFLICT,
    "Assessment Goal does not exist.");
  const phases = goal.phases ?? [];
  const phase = phases.find((item) => item.id === assessment.phaseId);
  if (!phase || phase.goalId && phase.goalId !== goal.id) {
    return rejected(PIGoalConfidencePublicationOutcome.PHASE_MISMATCH,
      "Assessment phase does not belong to its Goal.");
  }
  const operatingState = goal.openingApproach?.value ??
    goal.operatingState?.value ?? goal.operatingState ?? null;
  if (operatingState !== assessment.operatingState) {
    return rejected(PIGoalConfidencePublicationOutcome.OPERATING_STATE_MISMATCH,
      "Assessment operating state differs from the canonical Goal.");
  }
  const repository = readRepository(store);
  const boundarySnapshots = (store.goalConfidenceSnapshots ?? []).filter((item) =>
    item.goalId === assessment.goalId && item.phaseId === assessment.phaseId);
  if (boundarySnapshots.length > 1) {
    return rejected(PIGoalConfidencePublicationOutcome.SEMANTIC_CONFLICT,
      "Multiple current snapshots exist for the Goal and phase.");
  }
  const current = boundarySnapshots[0] ?? null;
  const boundaryHistory = repository.listHistory(
    assessment.goalId, assessment.phaseId
  );
  if (current) {
    const currentHistory = repository.getHistoryRecord(current.historyRecordId);
    if (
      !currentHistory ||
      currentHistory.assessmentId !== current.currentAssessmentId
    ) {
      return rejected(PIGoalConfidencePublicationOutcome.SEMANTIC_CONFLICT,
        "Current snapshot is not backed by canonical history.");
    }
  } else if (boundaryHistory.length > 0) {
    return rejected(PIGoalConfidencePublicationOutcome.SEMANTIC_CONFLICT,
      "Canonical history exists without a current snapshot.");
  }
  if (current?.currentAssessmentId === assessment.id) {
    const currentHistory = repository.getHistoryByAssessmentId(assessment.id);
    if (
      current.deterministicInputFingerprint ===
        assessment.provenance.inputFingerprint &&
      current.currentScore === assessment.score.current &&
      stableSerialize(currentHistory?.assessment) === stableSerialize(assessment)
    ) {
      return {
        result: {
          status: PIGoalConfidencePublicationOutcome.MATCHED,
          committed: false,
          assessmentId: assessment.id,
          snapshot: structuredClone(current),
        },
      };
    }
    return rejected(
      PIGoalConfidencePublicationOutcome.ASSESSMENT_IDENTITY_CONFLICT,
      "Current assessment identity collides with different semantics."
    );
  }
  const historical = repository.getHistoryByAssessmentId(assessment.id);
  if (historical) {
    if (stableSerialize(historical.assessment) !== stableSerialize(assessment)) {
      return rejected(
        PIGoalConfidencePublicationOutcome.ASSESSMENT_IDENTITY_CONFLICT,
        "Historical assessment identity collides with different semantics."
      );
    }
    return rejected(PIGoalConfidencePublicationOutcome.HISTORICAL_REPLAY_CONFLICT,
      "A historical non-current assessment cannot replace the current snapshot.");
  }
  if (!matchesExpectedSnapshot(current, command.expectedCurrentSnapshot)) {
    return rejected(PIGoalConfidencePublicationOutcome.SNAPSHOT_STATE_CONFLICT,
      "Current snapshot differs from the expected publication state.");
  }
  const operationCheck = validateOperationState(current, command);
  if (operationCheck) return { result: operationCheck };

  let seed = null;
  let seedToCreate = null;
  if (command.continuitySeed) {
    try {
      seedToCreate = createPIGoalConfidenceContinuitySeed(command.continuitySeed);
    } catch (error) {
      return rejected(
        PIGoalConfidencePublicationOutcome.INVALID_LEGACY_SEED_REFERENCE,
        error
      );
    }
    const existingBoundarySeed = repository.getContinuitySeed(
      assessment.goalId, assessment.phaseId
    );
    if (existingBoundarySeed) {
      if (stableSerialize(existingBoundarySeed) === stableSerialize(seedToCreate)) {
        seed = existingBoundarySeed;
        seedToCreate = null;
      } else {
        return rejected(PIGoalConfidencePublicationOutcome.DUPLICATE_SEED,
          "A different continuity seed already exists for the Goal and phase.");
      }
    } else {
      seed = seedToCreate;
    }
  } else if (command.continuitySeedId) {
    seed = repository.getContinuitySeedById(command.continuitySeedId);
  }
  const seedCheck = validateSeedRelationship(seed, command);
  if (seedCheck) return { result: seedCheck };

  const historyRecord = buildHistoryRecord(command, current);
  const snapshot = buildSnapshot(command, current, historyRecord, seed);
  return {
    result: null,
    assessment,
    current,
    seed,
    seedToCreate,
    historyRecord,
    snapshot,
  };
}

export function preparePIGoalConfidencePublication(store, command) {
  const contract = validatePublicationCommand(command);
  if (contract) return { result: failure(contract.status, contract.message) };
  return inspectPublication(store, command);
}

export function stagePreparedPIGoalConfidencePublication(candidate, prepared) {
  ensureCollections(candidate);
  const repository = stagedRepository(candidate);
  if (prepared.seedToCreate) repository.stageCreateContinuitySeed(prepared.seedToCreate);
  repository.stageAppendHistory(prepared.historyRecord);
  repository.stageReplaceSnapshot(prepared.snapshot);
}

export function finalizePreparedPIGoalConfidencePublication(
  candidate, prepared, commitId
) {
  finalizeCandidate(candidate, prepared, commitId);
}

export function validatePreparedPIGoalConfidencePublication(
  candidate, prepared, context = null
) {
  return context
    ? validateFinalizedCandidate(candidate, prepared, context)
    : validateCandidate(candidate, prepared);
}

function validateOperationState(current, command) {
  const { assessment, operation } = command;
  if (operation === "publish_initial") {
    if (current) return failure(
      PIGoalConfidencePublicationOutcome.SNAPSHOT_STATE_CONFLICT,
      "Initial publication requires an empty current snapshot."
    );
    if (assessment.score.prior == null) {
      if (assessment.score.movement.direction !== "initial") {
        return failure(PIGoalConfidencePublicationOutcome.PREDECESSOR_CONFLICT,
          "An unseeded initial assessment must use initial movement.");
      }
    } else if (
      assessment.score.priorScoreProvenance?.source !==
        "controlled_reconciliation_seed"
    ) {
      return failure(PIGoalConfidencePublicationOutcome.PREDECESSOR_CONFLICT,
        "An initial prior score must come from a controlled continuity seed.");
    }
    return null;
  }
  if (!current) return failure(
    PIGoalConfidencePublicationOutcome.PREDECESSOR_CONFLICT,
    "Successor publication requires a current canonical predecessor."
  );
  if (
    assessment.score.priorScoreProvenance?.source !==
      "canonical_pi_assessment" ||
    assessment.score.priorScoreProvenance?.assessmentId !==
      current.currentAssessmentId ||
    assessment.score.prior !== current.currentScore
  ) {
    return failure(PIGoalConfidencePublicationOutcome.PREDECESSOR_CONFLICT,
      "Successor prior-score provenance does not match the current assessment.");
  }
  if (
    Date.parse(assessment.evidenceCutoff) <
      Date.parse(current.evidenceCutoff) &&
    operation !== "publish_reconciliation"
  ) {
    return failure(PIGoalConfidencePublicationOutcome.SEMANTIC_CONFLICT,
      "Successor evidence cutoff cannot move backward.");
  }
  return null;
}

function validateSeedRelationship(seed, command) {
  const provenance = command.assessment.score.priorScoreProvenance;
  if (provenance?.source === "controlled_reconciliation_seed") {
    if (
      !seed ||
      provenance.assessmentId !== seed.id ||
      command.assessment.score.prior !== seed.score ||
      seed.piDerived !== false ||
      seed.canonicalAssessment !== false ||
      seed.eligibleAsPriorScore !== true
    ) {
      return failure(
        PIGoalConfidencePublicationOutcome.INVALID_LEGACY_SEED_REFERENCE,
        "Legacy prior-score provenance does not resolve to the controlled seed."
      );
    }
  } else if (seed) {
    return failure(
      PIGoalConfidencePublicationOutcome.INVALID_LEGACY_SEED_REFERENCE,
      "A continuity seed was supplied but the assessment does not reference it."
    );
  }
  return null;
}

function buildHistoryRecord(command, current) {
  const assessment = structuredClone(command.assessment);
  return {
    schemaVersion: "pi_goal_confidence_history_v1",
    id: createPIGoalConfidenceHistoryRecordId(assessment.id),
    goalId: assessment.goalId,
    phaseId: assessment.phaseId,
    operatingState: assessment.operatingState,
    assessmentId: assessment.id,
    assessment,
    persistedAt: null,
    commitId: null,
    predecessorAssessmentId: current?.currentAssessmentId ?? null,
    priorScoreProvenance: structuredClone(
      assessment.score.priorScoreProvenance
    ),
    publicationReason: command.publicationReason.trim(),
    publicationOperation: command.operation,
    supersedesHistoryRecordId: current?.historyRecordId ?? null,
  };
}

function buildSnapshot(command, current, historyRecord, seed) {
  const assessment = command.assessment;
  return {
    schemaVersion: "pi_goal_confidence_snapshot_v1",
    id: createPIGoalConfidenceSnapshotId(assessment),
    goalId: assessment.goalId,
    phaseId: assessment.phaseId,
    operatingState: assessment.operatingState,
    currentAssessmentId: assessment.id,
    currentScore: assessment.score.current,
    scoreBand: assessment.score.band,
    assessmentContext: structuredClone(assessment.context),
    evidenceCutoff: assessment.evidenceCutoff,
    evidenceWindowId: assessment.context.evidenceWindowId,
    modelVersion: assessment.modelVersion,
    piVersion: assessment.piVersion,
    deterministicInputFingerprint: assessment.provenance.inputFingerprint,
    assessmentTimestamp: assessment.provenance.generatedAt,
    historyRecordId: historyRecord.id,
    previousCanonicalAssessmentId: current?.currentAssessmentId ?? null,
    legacyContinuitySeedId: seed?.id ?? null,
    createdAt: current?.createdAt ?? null,
    updatedAt: null,
  };
}

function validateCandidate(candidate, prepared) {
  const repository = readRepository(candidate);
  const snapshot = repository.getCurrentSnapshot(
    prepared.assessment.goalId, prepared.assessment.phaseId
  );
  const history = repository.getHistoryByAssessmentId(prepared.assessment.id);
  const boundarySnapshots = (candidate.goalConfidenceSnapshots ?? []).filter(
    (item) => item.goalId === prepared.assessment.goalId &&
      item.phaseId === prepared.assessment.phaseId
  );
  if (
    boundarySnapshots.length !== 1 ||
    !snapshot ||
    !history ||
    snapshot.historyRecordId !== history.id ||
    history.assessmentId !== snapshot.currentAssessmentId ||
    stableSerialize(history.assessment) !==
      stableSerialize(prepared.assessment)
  ) return { valid: false };
  if (prepared.seedToCreate) {
    const seed = repository.getContinuitySeedById(prepared.seedToCreate.id);
    if (!seed || seed.canonicalAssessment !== false || seed.piDerived !== false) {
      return { valid: false };
    }
  }
  return { valid: true };
}

function finalizeCandidate(candidate, prepared, commitId) {
  const stamp = candidate.updatedAt;
  const history = (candidate.goalConfidenceHistory ?? []).find(
    (item) => item.id === prepared.historyRecord.id
  );
  const snapshot = (candidate.goalConfidenceSnapshots ?? []).find(
    (item) => item.id === prepared.snapshot.id
  );
  if (!history || !snapshot || !stamp || !commitId) {
    throw new Error("Goal-confidence publication finalization target is missing.");
  }
  history.persistedAt = stamp;
  history.commitId = commitId;
  snapshot.createdAt ??= stamp;
  snapshot.updatedAt = stamp;
}

function validateFinalizedCandidate(candidate, prepared, context) {
  if (!validateCandidate(candidate, prepared).valid) return { valid: false };
  const history = candidate.goalConfidenceHistory.find(
    (item) => item.id === prepared.historyRecord.id
  );
  const snapshot = candidate.goalConfidenceSnapshots.find(
    (item) => item.id === prepared.snapshot.id
  );
  return {
    valid:
      candidate.revision === context.candidateRevision &&
      history.commitId === context.commitId &&
      history.persistedAt === candidate.updatedAt &&
      snapshot.updatedAt === candidate.updatedAt &&
      Boolean(snapshot.createdAt),
  };
}

function matchesExpectedSnapshot(current, expected) {
  if (expected == null) return current == null;
  if (!current) return false;
  return current.id === expected.id &&
    current.currentAssessmentId === expected.currentAssessmentId &&
    current.deterministicInputFingerprint ===
      expected.deterministicInputFingerprint;
}

function ensureCollections(store) {
  store.goalConfidenceSnapshots ??= [];
  store.goalConfidenceHistory ??= [];
  store.goalConfidenceContinuitySeeds ??= [];
}

function readRepository(store) {
  return createGoalConfidenceRepository({
    snapshots: store.goalConfidenceSnapshots ?? [],
    history: store.goalConfidenceHistory ?? [],
    continuitySeeds: store.goalConfidenceContinuitySeeds ?? [],
  });
}

function stagedRepository(store) {
  return createGoalConfidenceRepository({
    snapshots: store.goalConfidenceSnapshots,
    history: store.goalConfidenceHistory,
    continuitySeeds: store.goalConfidenceContinuitySeeds,
  }, { allowStagedMutations: true });
}

function captureBaseline(filePath, readText) {
  const raw = readText(filePath);
  const store = JSON.parse(raw);
  return deepFreeze({
    revision: getFounderStoreRevision(store),
    lastCommitId: store.lastCommitId ?? null,
    updatedAt: store.updatedAt ?? null,
    fileHash: createFounderRuntimeFileHash(raw),
    semanticDigest: createFounderRuntimeSemanticDigest(store),
    store,
  });
}

function safeCapture(filePath, readText) {
  try {
    return captureBaseline(filePath, readText);
  } catch {
    return null;
  }
}

function rejected(status, error) {
  return { result: failure(status, error) };
}

function typed(status, message) {
  return { status, message };
}

function failure(status, error, extras = {}) {
  const normalized = typeof error === "string" ? new Error(error) : error;
  return {
    status,
    committed: extras.committed ?? false,
    ...extras,
    error: {
      code: normalized?.code ?? status,
      message: String(normalized?.message ?? normalized),
    },
  };
}

function requiredRef(value, field) {
  if (typeof value !== "string" || !value.trim() || /\s/.test(value.trim())) {
    throw new Error(`${field} must be a stable reference.`);
  }
  return value.trim();
}

function requiredMachine(value, field) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`${field} must be a lowercase machine value.`);
  }
  return value;
}

function timestamp(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be a valid timestamp.`);
  }
  return new Date(value).toISOString();
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
