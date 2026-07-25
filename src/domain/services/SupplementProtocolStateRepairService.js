import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork.js";
import { validateProtocolVersion } from "../models/protocolVersion.js";

export const SupplementProtocolRepairOutcome = Object.freeze({
  SUCCESS: "success",
  ALREADY_REPAIRED: "already_repaired",
  PROTOCOL_NOT_FOUND: "protocol_not_found",
  PROTOCOL_NOT_ACTIVE: "protocol_not_active",
  INVALID_PROTOCOL_CATEGORY: "invalid_protocol_category",
  UNEXPECTED_CURRENT_VERSION: "unexpected_current_version",
  UNEXPECTED_EXISTING_VERSIONS: "unexpected_existing_versions",
  INVALID_GOAL: "invalid_goal",
  INVALID_PROVENANCE: "invalid_provenance",
  INVALID_STRATEGY: "invalid_strategy",
  CONCURRENCY_CONFLICT: "concurrency_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  VERIFICATION_FAILURE: "verification_failure",
  ROLLBACK_FAILURE: "rollback_failure",
});

export function createSupplementProtocolStateRepairService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  faults = {},
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Supplement protocol repair requires a bound Founder store.");
  }
  return {
    async repair({ protocolId, expectedGoalId } = {}) {
      if (!protocolId) return failure(SupplementProtocolRepairOutcome.PROTOCOL_NOT_FOUND, "Protocol ID is required.");
      const unit = createUnitOfWork({ filePath: runtimeStorePath, liveStore, now, stageFrom: liveStore });
      const transaction = unit.begin();
      const initial = inspectState(transaction.inspect(), { protocolId, expectedGoalId });
      if (initial.outcome === SupplementProtocolRepairOutcome.ALREADY_REPAIRED) {
        transaction.abort();
        return result(initial.outcome, false, protocolId, initial.version.id);
      }
      if (!initial.ok) {
        transaction.abort();
        return failure(initial.outcome, initial.reason);
      }
      try {
        const staged = await transaction.mutate((store) => {
          const state = inspectState(store, { protocolId, expectedGoalId });
          if (!state.ok) throw new RepairFailure(state.outcome, state.reason);
          const version = createInitialVersion(state.protocol, state.goalId, now());
          const validation = validateProtocolVersion(version);
          if (!validation.valid) {
            throw new RepairFailure(SupplementProtocolRepairOutcome.INVALID_STRATEGY, validation.errors.join(" "));
          }
          store.protocolVersions.push(version);
          faults.afterVersionAppend?.(store, state, version);
          state.protocol.currentVersionId = version.id;
          faults.afterRootUpdate?.(store, state, version);
          return { protocolId, versionId: version.id };
        });
        faults.beforeCommit?.();
        const committed = await transaction.commit({
          validateFinalized(candidate) {
            try {
              faults.beforeFinalVerification?.(candidate);
            } catch {
              throw new RepairFailure(SupplementProtocolRepairOutcome.VERIFICATION_FAILURE, "Final verification failed.");
            }
            if (!verifyRepairedState(candidate, staged, expectedGoalId)) {
              throw new RepairFailure(SupplementProtocolRepairOutcome.VERIFICATION_FAILURE, "Final verification failed.");
            }
            return true;
          },
        });
        return Object.freeze({
          ...result(SupplementProtocolRepairOutcome.SUCCESS, true, staged.protocolId, staged.versionId),
          revision: committed.revision,
        });
      } catch (error) {
        const typed = findFailure(error);
        if (typed) return failure(typed.outcome, typed.message);
        if (error?.committed === true) {
          return failure(SupplementProtocolRepairOutcome.ROLLBACK_FAILURE, "Commit publication failed.");
        }
        return failure(
          error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
            ? SupplementProtocolRepairOutcome.CONCURRENCY_CONFLICT
            : SupplementProtocolRepairOutcome.PERSISTENCE_FAILURE,
          "Supplement protocol repair did not commit.",
        );
      }
    },
  };
}

function inspectState(store, { protocolId, expectedGoalId }) {
  const protocol = store.protocols?.find((item) => item.id === protocolId);
  if (!protocol) return rejected(SupplementProtocolRepairOutcome.PROTOCOL_NOT_FOUND, "Supplement protocol was not found.");
  if (protocol.category !== "supplement") {
    return rejected(SupplementProtocolRepairOutcome.INVALID_PROTOCOL_CATEGORY, "Protocol is not a supplement.");
  }
  if (protocol.status !== "active") {
    return rejected(SupplementProtocolRepairOutcome.PROTOCOL_NOT_ACTIVE, "Supplement protocol is not active.");
  }
  const versions = store.protocolVersions?.filter((item) => item.protocolId === protocol.id) ?? [];
  if (protocol.currentVersionId) {
    const current = versions.find((item) => item.id === protocol.currentVersionId);
    const active = versions.filter((item) => item.status === "active" && !item.endedAt);
    if (versions.length === 1 && current && active.length === 1 && active[0].id === current.id) {
      const validity = validateExistingVersion(protocol, current, expectedGoalId);
      return validity ?? {
        ok: true,
        outcome: SupplementProtocolRepairOutcome.ALREADY_REPAIRED,
        protocol,
        version: current,
      };
    }
    return rejected(SupplementProtocolRepairOutcome.UNEXPECTED_CURRENT_VERSION, "Current-version state is unexpected.");
  }
  if (versions.length) {
    return rejected(SupplementProtocolRepairOutcome.UNEXPECTED_EXISTING_VERSIONS, "Unexpected supplement versions already exist.");
  }
  const rootValidation = validateRoot(store, protocol, expectedGoalId);
  return rootValidation ?? { ok: true, protocol, goalId: expectedGoalId };
}

function validateRoot(store, protocol, expectedGoalId) {
  const currentGoals = unique(protocol.currentGoalIds);
  if (!expectedGoalId || currentGoals.length !== 1 || currentGoals[0] !== expectedGoalId ||
      !protocol.relatedGoalIds?.includes(expectedGoalId) ||
      !store.goals?.some((goal) => goal.id === expectedGoalId && goal.status === "active")) {
    return rejected(SupplementProtocolRepairOutcome.INVALID_GOAL, "Supplement Goal ownership is invalid or ambiguous.");
  }
  const source = protocol.source;
  const identity = protocol.reconciliation;
  if (!source?.type || !source.name || source.confidence !== "high" ||
      !protocol.fieldProvenance?.imported?.length ||
      !identity?.migrationId || identity.action !== "retained" ||
      !identity.reconciledAt || !identity.cancelledPlannedProtocolId ||
      !/^\d{4}-\d{2}-\d{2}T/.test(identity.reconciledAt)) {
    return rejected(SupplementProtocolRepairOutcome.INVALID_PROVENANCE, "Supplement provenance or activation identity is incomplete.");
  }
  if (!protocol.name?.trim() || !protocol.notes?.trim()) {
    return rejected(SupplementProtocolRepairOutcome.INVALID_STRATEGY, "Supplement name or strategy context is incomplete.");
  }
  return null;
}

function createInitialVersion(protocol, goalId, timestamp) {
  const effectiveDate = protocol.reconciliation.reconciledAt.slice(0, 10);
  return {
    id: `${protocol.id}_v1`,
    protocolId: protocol.id,
    versionNumber: 1,
    status: "active",
    effectiveAt: effectiveDate,
    endedAt: null,
    author: {
      type: protocol.source.type,
      id: protocol.userId,
      displayName: protocol.source.name,
    },
    change: {
      reason: "Establish the authoritative initial version from the existing active supplement root.",
      changedFields: [],
      previousVersionId: null,
      provenance: {
        source: structuredClone(protocol.source),
        fieldProvenance: structuredClone(protocol.fieldProvenance),
        reconciliation: structuredClone(protocol.reconciliation),
      },
    },
    goalLinks: [{ goalId, relationship: "supports" }],
    phaseContext: null,
    intent: { summary: protocol.notes },
    expectations: [],
    evaluationWindows: [],
    coachingPolicy: {},
    reviewTriggers: [],
    evidenceBasis: {
      rootProtocolId: protocol.id,
      rootName: protocol.name,
      rootStrategyContext: protocol.notes,
      activationEffectiveAt: protocol.reconciliation.reconciledAt,
    },
    supplementStrategy: {
      name: protocol.name,
      purpose: protocol.purpose ?? null,
      role: protocol.notes,
    },
    confirmation: {
      confirmedByUser: true,
      authority: "founder_supplement_protocol_state_repair",
    },
    createdAt: timestamp.toISOString(),
  };
}

function validateExistingVersion(protocol, version, expectedGoalId) {
  if (!validateProtocolVersion(version).valid) {
    return rejected(SupplementProtocolRepairOutcome.UNEXPECTED_CURRENT_VERSION, "Current supplement version does not satisfy the version contract.");
  }
  if (version.id !== `${protocol.id}_v1` || version.protocolId !== protocol.id ||
      version.versionNumber !== 1 || version.status !== "active" || version.endedAt) {
    return rejected(SupplementProtocolRepairOutcome.UNEXPECTED_CURRENT_VERSION, "Current supplement version is invalid.");
  }
  const links = version.goalLinks ?? [];
  if (links.length !== 1 || links[0].goalId !== expectedGoalId || links[0].relationship !== "supports") {
    return rejected(SupplementProtocolRepairOutcome.INVALID_GOAL, "Current supplement version Goal association is invalid.");
  }
  if (version.change?.provenance?.reconciliation?.migrationId !== protocol.reconciliation?.migrationId ||
      version.evidenceBasis?.rootProtocolId !== protocol.id) {
    return rejected(SupplementProtocolRepairOutcome.INVALID_PROVENANCE, "Current supplement version provenance is invalid.");
  }
  if (version.supplementStrategy?.name !== protocol.name ||
      version.supplementStrategy?.role !== protocol.notes ||
      version.intent?.summary !== protocol.notes) {
    return rejected(SupplementProtocolRepairOutcome.INVALID_STRATEGY, "Current supplement version strategy differs from the root.");
  }
  return null;
}

function verifyRepairedState(store, staged, expectedGoalId) {
  const protocol = store.protocols.find((item) => item.id === staged.protocolId);
  const versions = store.protocolVersions.filter((item) => item.protocolId === staged.protocolId);
  const version = versions.find((item) => item.id === staged.versionId);
  return Boolean(
    protocol?.status === "active" &&
    protocol.currentVersionId === staged.versionId &&
    versions.length === 1 &&
    version?.status === "active" &&
    !version.endedAt &&
    !validateExistingVersion(protocol, version, expectedGoalId),
  );
}

function unique(values = []) { return [...new Set(values.filter(Boolean))]; }
function findFailure(error) {
  let current = error;
  while (current) {
    if (current instanceof RepairFailure) return current;
    current = current.cause;
  }
  return null;
}
function result(outcome, committed, protocolId, versionId) {
  return Object.freeze({ outcome, committed, protocolId, versionId });
}
function failure(outcome, reason) { return Object.freeze({ outcome, committed: false, reason }); }
function rejected(outcome, reason) { return { ok: false, outcome, reason }; }
class RepairFailure extends Error {
  constructor(outcome, message) {
    super(message);
    this.name = "SupplementProtocolRepairFailure";
    this.outcome = outcome;
  }
}
