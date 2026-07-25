import { createFounderStoreUnitOfWork, FounderStoreUnitOfWorkErrorCode } from "../../data/repositories/FounderStoreUnitOfWork";
import { createProtocol } from "../models/protocol";
import { createProtocolVersion, validateProtocolVersion } from "../models/protocolVersion";
import {
  applyPreparedActiveProtocolSuccessor,
  prepareActiveProtocolSuccessorTransition,
  verifyActiveProtocolSuccessorState,
} from "./ActiveProtocolSuccessorService";

export const SupplementManagementOutcome = Object.freeze({
  SUCCESS: "success",
  NO_CHANGES: "no_changes",
  DUPLICATE: "duplicate",
  NOT_FOUND: "not_found",
  NOT_ACTIVE: "not_active",
  NOT_PAUSED: "not_paused",
  VERSION_CONFLICT: "version_conflict",
  INVALID: "invalid",
  PERSISTENCE_FAILURE: "persistence_failure",
  PUBLICATION_FAILURE: "publication_failure",
});

export function createSupplementStrategyManagementService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  faults = {},
} = {}) {
  if (!runtimeStorePath || !liveStore) throw new Error("Supplement management requires a bound Founder store.");

  const transact = async (mutate, verify) => {
    const transaction = createUnitOfWork({ filePath: runtimeStorePath, liveStore, now, stageFrom: liveStore }).begin();
    try {
      const staged = await transaction.mutate((store) => mutate(store, now()));
      const committed = await transaction.commit({
        validateFinalized(candidate) {
          faults.beforeVerification?.(candidate);
          return verify(candidate, staged);
        },
      });
      return { outcome: SupplementManagementOutcome.SUCCESS, committed: true, revision: committed.revision, ...staged };
    } catch (error) {
      const typed = findManagementFailure(error);
      if (typed) return failure(typed.outcome, typed.message);
      if (error?.committed) return failure(SupplementManagementOutcome.PUBLICATION_FAILURE, "The change committed, but the app could not refresh.");
      return failure(
        error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
          ? SupplementManagementOutcome.VERSION_CONFLICT
          : SupplementManagementOutcome.PERSISTENCE_FAILURE,
        "Nothing was changed.",
      );
    }
  };

  return {
    async create(command = {}) {
      const invalid = validateBaseCommand(command);
      if (invalid) return failure(SupplementManagementOutcome.INVALID, invalid);
      return transact((store, timestamp) => {
        assertGoal(store, command.userId, command.goalId);
        assertUniqueName(store, command.userId, command.name);
        const protocolId = command.protocolId;
        if (!protocolId || store.protocols.some((item) => item.id === protocolId)) {
          throw new ManagementFailure(SupplementManagementOutcome.DUPLICATE, "This supplement is already in your plan.");
        }
        const createdAt = timestamp.toISOString();
        const versionId = `${protocolId}_v1`;
        const protocol = createProtocol({
          id: protocolId,
          userId: command.userId,
          protocolType: "supplement",
          category: "supplement",
          name: clean(command.name),
          purpose: clean(command.purpose),
          notes: clean(command.role),
          relatedGoalIds: [command.goalId],
          currentGoalIds: [command.goalId],
          startDate: command.startDate,
          status: "active",
          currentVersionId: versionId,
          source: structuredClone(command.provenance.source),
          fieldProvenance: structuredClone(command.provenance.fieldProvenance ?? {}),
          createdAt,
          updatedAt: createdAt,
        });
        const version = createSupplementVersion({
          command,
          protocol,
          versionId,
          versionNumber: 1,
          status: "active",
          endedAt: null,
          createdAt,
        });
        store.protocols.push(protocol);
        store.protocolVersions ??= [];
        store.protocolVersions.push(version);
        faults.afterCreate?.(store);
        return { protocolId, versionId };
      }, (store, result) => verifyCreated(store, result.protocolId, result.versionId));
    },

    async edit(command = {}) {
      return transact((store, timestamp) => {
        const protocol = getOwnedSupplement(store, command);
        if (protocol.status !== "active") throw new ManagementFailure(SupplementManagementOutcome.NOT_ACTIVE, "This supplement is no longer active.");
        assertGoal(store, command.userId, command.goalId);
        assertUniqueName(store, command.userId, command.name, protocol.id);
        const current = store.protocolVersions.find((item) => item.id === protocol.currentVersionId);
        if (!current) throw new ManagementFailure(SupplementManagementOutcome.VERSION_CONFLICT, "This supplement changed while you were editing it.");
        const successorVersion = {
          ...structuredClone(current),
          intent: { ...current.intent, summary: clean(command.role) },
          supplementStrategy: {
            ...current.supplementStrategy,
            name: clean(command.name),
            purpose: clean(command.purpose),
            role: clean(command.role),
          },
          evidenceBasis: {
            ...current.evidenceBasis,
            rootName: clean(command.name),
            rootStrategyContext: clean(command.role),
          },
        };
        const prepared = prepareActiveProtocolSuccessorTransition(store, {
          protocolId: protocol.id,
          expectedCurrentVersionId: command.expectedCurrentVersionId,
          effectiveDate: command.effectiveDate,
          successorVersion,
          goalAssociation: { goalId: command.goalId, relationship: "supports" },
          provenance: command.provenance,
        }, timestamp);
        if (!prepared.ok) {
          const outcome = ["unchanged_successor", "duplicate_successor"].includes(prepared.outcome)
            ? SupplementManagementOutcome.NO_CHANGES
            : prepared.outcome === "expected_version_conflict"
              ? SupplementManagementOutcome.VERSION_CONFLICT
              : SupplementManagementOutcome.INVALID;
          throw new ManagementFailure(outcome, prepared.reason);
        }
        applyPreparedActiveProtocolSuccessor(store, prepared);
        Object.assign(prepared.protocol, {
          name: clean(command.name),
          purpose: clean(command.purpose),
          notes: clean(command.role),
        });
        faults.afterEdit?.(store);
        return { protocolId: protocol.id, versionId: prepared.successor.id };
      }, (store, result) => verifyActiveProtocolSuccessorState(store, result.protocolId, result.versionId));
    },

    async pause(command = {}) {
      return transact((store, timestamp) => {
        const protocol = getOwnedSupplement(store, command);
        if (protocol.status !== "active") throw new ManagementFailure(SupplementManagementOutcome.NOT_ACTIVE, "This supplement is not active.");
        if (protocol.currentVersionId !== command.expectedCurrentVersionId) throw new ManagementFailure(SupplementManagementOutcome.VERSION_CONFLICT, "This supplement changed while you were viewing it.");
        const current = store.protocolVersions.find((item) => item.id === protocol.currentVersionId);
        if (!current || current.status !== "active" || current.endedAt) throw new ManagementFailure(SupplementManagementOutcome.VERSION_CONFLICT, "This supplement changed while you were viewing it.");
        Object.assign(current, { status: "superseded", endedAt: command.effectiveDate });
        Object.assign(protocol, { status: "paused", updatedAt: timestamp.toISOString() });
        faults.afterPause?.(store);
        return { protocolId: protocol.id, versionId: current.id };
      }, (store, result) => {
        const protocol = store.protocols.find((item) => item.id === result.protocolId);
        const versions = store.protocolVersions.filter((item) => item.protocolId === result.protocolId);
        return protocol?.status === "paused" && versions.every((item) => item.status !== "active" || item.endedAt);
      });
    },

    async restore(command = {}) {
      return transact((store, timestamp) => {
        const protocol = getOwnedSupplement(store, command);
        if (protocol.status !== "paused") throw new ManagementFailure(SupplementManagementOutcome.NOT_PAUSED, "This supplement is not paused.");
        if (protocol.currentVersionId !== command.expectedCurrentVersionId) throw new ManagementFailure(SupplementManagementOutcome.VERSION_CONFLICT, "This supplement changed while you were viewing it.");
        assertUniqueName(store, command.userId, protocol.name, protocol.id);
        const prior = store.protocolVersions.find((item) => item.id === protocol.currentVersionId);
        if (!prior || prior.status !== "superseded" || !prior.endedAt) throw new ManagementFailure(SupplementManagementOutcome.VERSION_CONFLICT, "This supplement cannot be restored from its current state.");
        const versions = store.protocolVersions.filter((item) => item.protocolId === protocol.id);
        const versionNumber = Math.max(...versions.map((item) => item.versionNumber)) + 1;
        const version = createProtocolVersion({
          ...structuredClone(prior),
          id: `${protocol.id}_v${versionNumber}`,
          versionNumber,
          status: "active",
          effectiveAt: command.effectiveDate,
          endedAt: null,
          author: structuredClone(command.provenance.author),
          change: {
            reason: command.provenance.reason,
            previousVersionId: prior.id,
            provenance: structuredClone(command.provenance.details ?? {}),
          },
          confirmation: structuredClone(command.provenance.confirmation),
          createdAt: timestamp.toISOString(),
        });
        const validation = validateProtocolVersion(version);
        if (!validation.valid) throw new ManagementFailure(SupplementManagementOutcome.INVALID, validation.errors.join(" "));
        store.protocolVersions.push(version);
        Object.assign(protocol, { status: "active", currentVersionId: version.id, updatedAt: timestamp.toISOString() });
        faults.afterRestore?.(store);
        return { protocolId: protocol.id, versionId: version.id };
      }, (store, result) => verifyActiveProtocolSuccessorState(store, result.protocolId, result.versionId));
    },
  };
}

function createSupplementVersion({ command, protocol, versionId, versionNumber, status, endedAt, createdAt }) {
  const version = createProtocolVersion({
    id: versionId,
    protocolId: protocol.id,
    versionNumber,
    status,
    effectiveAt: command.startDate,
    endedAt,
    author: structuredClone(command.provenance.author),
    change: { reason: command.provenance.reason, previousVersionId: null, provenance: structuredClone(command.provenance.details ?? {}) },
    goalLinks: [{ goalId: command.goalId, relationship: "supports" }],
    intent: { summary: clean(command.role) },
    evidenceBasis: { rootProtocolId: protocol.id, rootName: protocol.name, rootStrategyContext: protocol.notes, activationEffectiveAt: command.startDate },
    supplementStrategy: { name: protocol.name, purpose: protocol.purpose, role: protocol.notes },
    confirmation: structuredClone(command.provenance.confirmation),
    createdAt,
  });
  const validation = validateProtocolVersion(version);
  if (!validation.valid) throw new ManagementFailure(SupplementManagementOutcome.INVALID, validation.errors.join(" "));
  return version;
}

function validateBaseCommand(command) {
  if (!command.userId || !clean(command.name) || !clean(command.purpose) || !clean(command.role)) return "Name, purpose, and current strategy are required.";
  if (!command.goalId || !/^\d{4}-\d{2}-\d{2}$/.test(command.startDate ?? "")) return "Goal and start date are required.";
  if (command.initialStatus && command.initialStatus !== "active") return "New supplement strategies must begin active.";
  if (!command.provenance?.author?.id || !command.provenance?.confirmation?.confirmedByUser) return "Valid provenance is required.";
  return null;
}
function getOwnedSupplement(store, command) {
  const protocol = store.protocols.find((item) => item.id === command.protocolId && item.userId === command.userId && item.category === "supplement");
  if (!protocol) throw new ManagementFailure(SupplementManagementOutcome.NOT_FOUND, "This supplement is unavailable.");
  return protocol;
}
function assertUniqueName(store, userId, name, exceptId = null) {
  const key = semanticName(name);
  if (store.protocols.some((item) => item.id !== exceptId && item.userId === userId && item.category === "supplement" && item.status === "active" && semanticName(item.name) === key)) {
    throw new ManagementFailure(SupplementManagementOutcome.DUPLICATE, "This supplement is already in your plan.");
  }
}
function assertGoal(store, userId, goalId) {
  const goal = store.goals?.find((item) => item.id === goalId && item.userId === userId && item.status === "active");
  if (!goal) throw new ManagementFailure(SupplementManagementOutcome.INVALID, "The selected Goal is unavailable.");
}
function verifyCreated(store, protocolId, versionId) {
  const protocol = store.protocols.find((item) => item.id === protocolId);
  const versions = store.protocolVersions.filter((item) => item.protocolId === protocolId);
  return Boolean(protocol?.status === "active" && protocol.currentVersionId === versionId && versions.length === 1 && versions[0].status === "active");
}
function semanticName(value) { return clean(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, ""); }
function clean(value) { return String(value ?? "").trim().replace(/\s+/g, " "); }
function failure(outcome, reason) { return Object.freeze({ outcome, committed: false, reason }); }
function findManagementFailure(error) { let current = error; while (current) { if (current instanceof ManagementFailure) return current; current = current.cause; } return null; }
class ManagementFailure extends Error { constructor(outcome, message) { super(message); this.outcome = outcome; } }
