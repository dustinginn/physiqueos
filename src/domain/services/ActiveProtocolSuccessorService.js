import { createProtocolVersion, validateProtocolVersion } from "../models/protocolVersion";
import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork";

export const ActiveProtocolSuccessorOutcome = Object.freeze({
  SUCCESS: "success",
  PROTOCOL_NOT_FOUND: "protocol_not_found",
  PROTOCOL_NOT_ACTIVE: "protocol_not_active",
  CURRENT_VERSION_MISSING: "current_version_missing",
  CURRENT_VERSION_NOT_ACTIVE: "current_version_not_active",
  EXPECTED_VERSION_CONFLICT: "expected_version_conflict",
  INVALID_SUCCESSOR: "invalid_successor",
  UNCHANGED_SUCCESSOR: "unchanged_successor",
  DUPLICATE_SUCCESSOR: "duplicate_successor",
  GOAL_OR_PROVENANCE_INVALID: "goal_or_provenance_invalid",
  PERSISTENCE_FAILURE: "persistence_failure",
  ROLLBACK_FAILURE: "rollback_failure",
});

export function createActiveProtocolSuccessorService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  faults = {},
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Active protocol successor service requires an isolated or production store binding.");
  }

  return {
    async createSuccessor(command = {}) {
      const validation = validateCommand(command);
      if (validation) return failure(ActiveProtocolSuccessorOutcome.INVALID_SUCCESSOR, validation);
      const unit = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        now,
        stageFrom: liveStore,
      });
      const transaction = unit.begin();
      let successorId = null;
      try {
        const stagedResult = await transaction.mutate((store) => {
          const prepared = prepareActiveProtocolSuccessorTransition(store, command, now());
          if (!prepared.ok) throw new SuccessorFailure(prepared.outcome, prepared.reason);
          successorId = prepared.successor.id;
          applyPreparedActiveProtocolSuccessor(store, prepared);
          faults.afterAppend?.(store, prepared);
          faults.afterSupersede?.(store, prepared);
          faults.afterRootUpdate?.(store, prepared);
          return {
            previousVersionId: prepared.current.id,
            protocolId: prepared.protocol.id,
            successorVersionId: prepared.successor.id,
          };
        });
        const committed = await transaction.commit({
          validateFinalized(candidate) {
            faults.beforeFinalVerification?.(candidate, successorId);
            return verifyActiveProtocolSuccessorState(candidate, command.protocolId, successorId);
          },
        });
        return Object.freeze({
          outcome: ActiveProtocolSuccessorOutcome.SUCCESS,
          committed: true,
          protocolId: stagedResult.protocolId,
          previousVersionId: stagedResult.previousVersionId,
          successorVersionId: stagedResult.successorVersionId,
          revision: committed.revision,
        });
      } catch (error) {
        const typed = findSuccessorFailure(error);
        if (typed) return failure(typed.outcome, typed.message);
        const committed = error?.committed === true;
        return failure(
          committed
            ? ActiveProtocolSuccessorOutcome.ROLLBACK_FAILURE
            : mapPersistenceOutcome(error),
          committed
            ? "The transaction committed before publication failed."
            : "The successor transaction did not commit.",
        );
      }
    },
  };
}

export function resolveProtocolVersionAtDate(versions = [], date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null;
  return versions
    .filter((version) =>
      version.effectiveAt <= date &&
      (!version.endedAt || date < String(version.endedAt).slice(0, 10)))
    .sort((left, right) => left.versionNumber - right.versionNumber)
    .at(-1) ?? null;
}

export function prepareActiveProtocolSuccessorTransition(store, command, timestampValue) {
  const protocol = store.protocols?.find((item) => item.id === command.protocolId);
  if (!protocol) return rejected(ActiveProtocolSuccessorOutcome.PROTOCOL_NOT_FOUND, "Protocol was not found.");
  if (protocol.status !== "active") return rejected(ActiveProtocolSuccessorOutcome.PROTOCOL_NOT_ACTIVE, "Protocol is not active.");
  if (!protocol.currentVersionId) return rejected(ActiveProtocolSuccessorOutcome.CURRENT_VERSION_MISSING, "Protocol has no authoritative current version.");
  if (!command.expectedCurrentVersionId || protocol.currentVersionId !== command.expectedCurrentVersionId) {
    return rejected(ActiveProtocolSuccessorOutcome.EXPECTED_VERSION_CONFLICT, "The current version changed before save.");
  }
  const versions = store.protocolVersions?.filter((item) => item.protocolId === protocol.id) ?? [];
  const current = versions.find((item) => item.id === protocol.currentVersionId);
  if (!current) return rejected(ActiveProtocolSuccessorOutcome.CURRENT_VERSION_MISSING, "The current version record is missing.");
  if (current.status !== "active" || current.endedAt) {
    return rejected(ActiveProtocolSuccessorOutcome.CURRENT_VERSION_NOT_ACTIVE, "The current version is not active.");
  }
  if (String(current.effectiveAt).slice(0, 10) >= command.effectiveDate) {
    return rejected(ActiveProtocolSuccessorOutcome.INVALID_SUCCESSOR, "Successor effective date must follow the current version.");
  }
  if (versions.filter((item) => item.status === "active" && !item.endedAt).length !== 1) {
    return rejected(ActiveProtocolSuccessorOutcome.CURRENT_VERSION_NOT_ACTIVE, "The protocol does not have exactly one active version.");
  }
  const association = validateGoalAndProvenance(protocol, command);
  if (association) return rejected(ActiveProtocolSuccessorOutcome.GOAL_OR_PROVENANCE_INVALID, association);
  if (sameSemanticContent(current, command.successorVersion)) {
    return rejected(ActiveProtocolSuccessorOutcome.UNCHANGED_SUCCESSOR, "The proposed strategy is unchanged.");
  }
  if (versions.some((item) =>
    String(item.effectiveAt).slice(0, 10) === command.effectiveDate &&
    sameSemanticContent(item, command.successorVersion))) {
    return rejected(ActiveProtocolSuccessorOutcome.DUPLICATE_SUCCESSOR, "An equivalent version already exists for this effective date.");
  }
  const timestamp = timestampValue.toISOString();
  const nextVersionNumber = Math.max(0, ...versions.map((item) => Number(item.versionNumber) || 0)) + 1;
  const successor = createProtocolVersion({
    ...structuredClone(command.successorVersion),
    id: `${protocol.id}_v${nextVersionNumber}`,
    protocolId: protocol.id,
    versionNumber: nextVersionNumber,
    status: "active",
    effectiveAt: command.effectiveDate,
    endedAt: null,
    author: structuredClone(command.provenance.author),
    change: {
      ...(command.successorVersion.change ?? {}),
      reason: command.provenance.reason,
      previousVersionId: current.id,
      provenance: structuredClone(command.provenance.details ?? {}),
    },
    goalLinks: [structuredClone(command.goalAssociation)],
    confirmation: structuredClone(command.provenance.confirmation),
    createdAt: timestamp,
  });
  const versionValidation = validateProtocolVersion(successor);
  if (!versionValidation.valid) {
    return rejected(ActiveProtocolSuccessorOutcome.INVALID_SUCCESSOR, versionValidation.errors.join(" "));
  }
  return { ok: true, current, protocol, successor, timestamp };
}

export function applyPreparedActiveProtocolSuccessor(store, prepared) {
  store.protocolVersions.push(prepared.successor);
  Object.assign(prepared.current, {
    status: "superseded",
    endedAt: prepared.successor.effectiveAt,
  });
  Object.assign(prepared.protocol, {
    currentVersionId: prepared.successor.id,
    status: "active",
    updatedAt: prepared.timestamp,
  });
  return prepared;
}

function validateCommand(command) {
  if (!command.protocolId) return "Protocol ID is required.";
  if (!command.expectedCurrentVersionId) return "Expected current version ID is required.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(command.effectiveDate ?? "")) return "Effective date must use YYYY-MM-DD.";
  if (!command.successorVersion || typeof command.successorVersion !== "object") return "Successor payload is required.";
  return null;
}

function validateGoalAndProvenance(protocol, command) {
  const goal = command.goalAssociation;
  if (!goal?.goalId || !goal.relationship) return "Goal association is required.";
  const ownedGoals = new Set([...(protocol.currentGoalIds ?? []), ...(protocol.relatedGoalIds ?? [])]);
  if (!ownedGoals.has(goal.goalId)) return "Goal association does not belong to the active protocol.";
  const provenance = command.provenance;
  if (!provenance?.author?.id || !provenance.author.displayName) return "Protocol author provenance is required.";
  if (!provenance.reason) return "Change-reason provenance is required.";
  if (!provenance.confirmation?.confirmedByUser) return "Explicit user confirmation is required.";
  return null;
}

function sameSemanticContent(left, right) {
  return stableStringify(semanticContent(left)) === stableStringify(semanticContent(right));
}

function semanticContent(value = {}) {
  const ignored = new Set([
    "id", "protocolId", "versionNumber", "status", "effectiveAt", "endedAt",
    "createdAt", "updatedAt", "author", "change", "confirmation", "goalLinks",
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !ignored.has(key))
      .map(([key, item]) => [key, item]),
  );
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value.trim().replace(/\s+/g, " "));
  return JSON.stringify(value);
}

export function verifyActiveProtocolSuccessorState(store, protocolId, successorId) {
  const protocol = store.protocols.find((item) => item.id === protocolId);
  const versions = store.protocolVersions.filter((item) => item.protocolId === protocolId);
  const successor = versions.find((item) => item.id === successorId);
  const active = versions.filter((item) => item.status === "active" && !item.endedAt);
  return Boolean(
    protocol?.status === "active" &&
    protocol.currentVersionId === successorId &&
    successor &&
    active.length === 1 &&
    active[0].id === successorId,
  );
}

function mapPersistenceOutcome(error) {
  return error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
    ? ActiveProtocolSuccessorOutcome.EXPECTED_VERSION_CONFLICT
    : ActiveProtocolSuccessorOutcome.PERSISTENCE_FAILURE;
}

function findSuccessorFailure(error) {
  let current = error;
  while (current) {
    if (current instanceof SuccessorFailure) return current;
    current = current.cause;
  }
  return null;
}

function failure(outcome, reason) {
  return Object.freeze({ outcome, committed: false, reason });
}
function rejected(outcome, reason) { return { ok: false, outcome, reason }; }

class SuccessorFailure extends Error {
  constructor(outcome, message) {
    super(message);
    this.name = "SuccessorFailure";
    this.outcome = outcome;
  }
}
