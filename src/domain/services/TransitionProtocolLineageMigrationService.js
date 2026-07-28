import { createHash } from "node:crypto";
import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork.js";
import { createFounderRuntimeSemanticDigest } from "./FounderRuntimeSemanticDigest.js";
import {
  ActiveProtocolLineageClassification as C,
  classifyActiveProtocolLineage,
} from "./ActiveProtocolLineageInvariantService.js";

export const TRANSITION_LINEAGE_MIGRATION_ID =
  "active_protocol_transition_lineage_repair_v1";

export function createTransitionProtocolLineageMigrationService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Transition lineage migration requires a bound Founder store.");
  }
  return {
    audit(rootIds) {
      return audit(liveStore, rootIds);
    },
    prepare(command) {
      return prepare(liveStore, command);
    },
    async execute(command) {
      const prepared = prepare(liveStore, command);
      if (!prepared.ok) return prepared;
      if (prepared.outcome === "already_migrated") {
        return Object.freeze({ ...prepared, committed: false });
      }
      if (command.acceptRuntimeMutation !== true || command.confirmPeptidesExcluded !== true) {
        return failure("authorization_required",
          "Execution requires explicit runtime acceptance and peptide exclusion.");
      }
      const unit = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        now,
        stageFrom: liveStore,
        validatePersistedBaseline(current) {
          return getFounderStoreRevision(current) === command.expectedRevision
            && createFounderRuntimeSemanticDigest(current) === command.expectedSemanticDigest;
        },
      });
      const transaction = unit.begin();
      try {
        await transaction.mutate((store) => applyPreparedTransitionLineageMigration(
          store, prepared, now().toISOString()));
        const committed = await transaction.commit({
          validateFinalized(candidate) {
            return prepared.candidates.every((item) =>
              classifyActiveProtocolLineage(candidate, item.rootId)?.classification === C.VALID);
          },
        });
        return Object.freeze({
          outcome: "success",
          committed: true,
          revision: committed.revision,
          commitId: committed.commitId,
          candidates: prepared.candidates,
        });
      } catch (error) {
        return failure(
          error?.committed ? "publication_failure"
            : error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
              ? "concurrency_conflict" : "persistence_failure",
          error?.message ?? "The migration did not commit.",
          error?.committed === true,
        );
      }
    },
  };
}

export function prepareTransitionProtocolLineageMigration(store, command) {
  return prepare(store, command);
}

export function applyPreparedTransitionLineageMigration(store, prepared, migratedAt) {
  if ((store.protocolLineageMigrations ?? []).some((item) =>
    item.id === TRANSITION_LINEAGE_MIGRATION_ID
    && item.fingerprint === prepared.fingerprint)) return { status: "already_migrated" };
  for (const item of prepared.candidates) {
    const root = store.protocols.find((entry) => entry.id === item.rootId);
    const version = store.protocolVersions.find((entry) => entry.id === item.versionId);
    root.currentVersionId = version.id;
    version.status = "active";
    version.activatedAt = item.activationAt;
  }
  store.protocolLineageMigrations = [
    ...(store.protocolLineageMigrations ?? []),
    {
      id: TRANSITION_LINEAGE_MIGRATION_ID,
      fingerprint: prepared.fingerprint,
      migratedAt,
      reason: prepared.reason,
      candidateIds: prepared.candidates.map((item) => item.candidateId),
    },
  ];
  return { status: "applied" };
}

function prepare(store, command = {}) {
  if (!Array.isArray(command.rootIds) || !command.rootIds.length) {
    return failure("allowlist_required", "An exact root-ID allowlist is required.");
  }
  if (new Set(command.rootIds).size !== command.rootIds.length) {
    return failure("allowlist_invalid", "The root-ID allowlist contains duplicates.");
  }
  if (!Array.isArray(command.expectedVersionIds)
      || command.expectedVersionIds.length !== command.rootIds.length) {
    return failure("version_allowlist_required", "An exact version-ID allowlist is required.");
  }
  if (!Number.isSafeInteger(command.expectedRevision)
      || !command.expectedSemanticDigest || !command.reason) {
    return failure("baseline_required",
      "Expected revision, semantic digest, and migration reason are required.");
  }
  if (getFounderStoreRevision(store) !== command.expectedRevision
      || createFounderRuntimeSemanticDigest(store) !== command.expectedSemanticDigest) {
    return failure("baseline_conflict", "Founder baseline differs from the reviewed command.");
  }
  const priorMigration = (store.protocolLineageMigrations ?? []).find((item) =>
    item.id === TRANSITION_LINEAGE_MIGRATION_ID);
  if (priorMigration) {
    const priorRoots = (priorMigration.candidateIds ?? [])
      .map((id) => id.slice(`${TRANSITION_LINEAGE_MIGRATION_ID}:`.length)).sort();
    const requestedRoots = [...command.rootIds].sort();
    const allValid = requestedRoots.every((id) =>
      classifyActiveProtocolLineage(store, id)?.classification === C.VALID);
    if (stable(priorRoots) === stable(requestedRoots) && allValid) {
      return Object.freeze({
        ok: true,
        outcome: "already_migrated",
        migrationId: TRANSITION_LINEAGE_MIGRATION_ID,
        fingerprint: priorMigration.fingerprint,
        candidates: [],
      });
    }
    return failure("migration_state_conflict",
      "A prior migration record does not match the requested scope.");
  }
  const discoveredIds = (store.protocols ?? [])
    .filter((root) => classifyActiveProtocolLineage(store, root)?.classification === C.TRANSITION_CANDIDATE)
    .map((root) => root.id).sort();
  const authorizedIds = [...command.rootIds].sort();
  const excluded = command.rootIds
    .map((id) => classifyActiveProtocolLineage(store, id))
    .find((report) => report?.classification === C.VERSIONLESS_LEGACY_ROOT);
  if (excluded) {
    return failure("peptide_root_excluded",
      `Versionless legacy root is excluded: ${excluded.rootId}`);
  }
  if (stable(discoveredIds) !== stable(authorizedIds)) {
    return failure("allowlist_scope_mismatch",
      "The allowlist must exactly match the reviewed transition-candidate set.");
  }
  const candidates = [];
  for (let index = 0; index < command.rootIds.length; index += 1) {
    const rootId = command.rootIds[index];
    const report = classifyActiveProtocolLineage(store, rootId);
    if (!report) return failure("unknown_root", `Unknown or inactive root: ${rootId}`);
    if (report.classification === C.VERSIONLESS_LEGACY_ROOT) {
      return failure("peptide_root_excluded", `Versionless legacy root is excluded: ${rootId}`);
    }
    if (report.classification !== C.TRANSITION_CANDIDATE) {
      return failure("candidate_ineligible", `${rootId}: ${report.classification}`);
    }
    if (report.candidateVersionId !== command.expectedVersionIds[index]) {
      return failure("version_conflict", `Expected version differs for ${rootId}.`);
    }
    const root = store.protocols.find((item) => item.id === rootId);
    const version = store.protocolVersions.find((item) => item.id === report.candidateVersionId);
    const activationAt = root.activatedAt ?? root.reconciliation?.reconciledAt ?? null;
    candidates.push(Object.freeze({
      candidateId: `${TRANSITION_LINEAGE_MIGRATION_ID}:${rootId}`,
      rootId,
      versionId: version.id,
      beforeClassification: report.classification,
      afterClassification: C.VALID,
      priorRootStatus: root.status,
      priorCurrentVersionId: root.currentVersionId ?? null,
      priorVersionStatus: version.status,
      resultingRootStatus: "active",
      resultingCurrentVersionId: version.id,
      resultingVersionStatus: "active",
      goalId: report.goalIds[0] ?? null,
      protocolType: report.protocolType,
      executionProjectionIds: (store.executionItems ?? [])
        .filter((item) => item.linkedProtocolId === rootId).map((item) => item.id),
      reminderIds: reminderIds(store, rootId),
      activationAt,
    }));
  }
  const fingerprint = hash({
    migrationId: TRANSITION_LINEAGE_MIGRATION_ID,
    expectedRevision: command.expectedRevision,
    expectedSemanticDigest: command.expectedSemanticDigest,
    reason: command.reason,
    candidates,
  });
  return Object.freeze({
    ok: true,
    outcome: "ready",
    migrationId: TRANSITION_LINEAGE_MIGRATION_ID,
    reason: command.reason,
    expectedRevision: command.expectedRevision,
    expectedSemanticDigest: command.expectedSemanticDigest,
    fingerprint,
    candidates,
  });
}

function audit(store, rootIds) {
  return (rootIds ?? store.protocols?.filter((item) => item.status === "active")
    .map((item) => item.id) ?? []).map((id) => classifyActiveProtocolLineage(store, id));
}
function reminderIds(store, rootId) {
  const executionIds = new Set((store.executionItems ?? [])
    .filter((item) => item.linkedProtocolId === rootId).map((item) => item.id));
  return (store.reminders ?? []).filter((item) =>
    item.linkedProtocolId === rootId || item.protocolId === rootId
    || item.linkedEntityId === rootId || item.sourceProtocolId === rootId
    || executionIds.has(item.linkedEntityId)).map((item) => item.id);
}
function hash(value) {
  return createHash("sha256").update(stable(value)).digest("hex").toUpperCase();
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function failure(outcome, reason, committed = false) {
  return Object.freeze({ ok: false, outcome, reason, committed });
}
