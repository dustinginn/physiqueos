import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork.js";

export const CoachingUpdatesProtocolRepairOutcome = Object.freeze({
  SUCCESS: "success",
  ALREADY_REPAIRED: "already_repaired",
  PROTOCOL_NOT_FOUND: "protocol_not_found",
  PROTOCOL_NOT_ACTIVE: "protocol_not_active",
  UNEXPECTED_CURRENT_VERSION: "unexpected_current_version",
  ELIGIBLE_VERSION_MISSING: "eligible_version_missing",
  AMBIGUOUS_VERSIONS: "ambiguous_versions",
  INVALID_LIFECYCLE: "invalid_lifecycle",
  INVALID_GOAL: "invalid_goal",
  INVALID_PROVENANCE: "invalid_provenance",
  INVALID_CADENCE: "invalid_cadence",
  CONCURRENCY_CONFLICT: "concurrency_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  ROLLBACK_FAILURE: "rollback_failure",
});

export function createCoachingUpdatesProtocolStateRepairService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  faults = {},
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Coaching Updates protocol repair requires a bound Founder store.");
  }

  return {
    async repair(command = {}) {
      const scope = normalizeScope(command);
      if (!scope.protocolId) {
        return failure(CoachingUpdatesProtocolRepairOutcome.PROTOCOL_NOT_FOUND, "Protocol ID is required.");
      }
      if (!scope.expectedVersionId) {
        return failure(CoachingUpdatesProtocolRepairOutcome.ELIGIBLE_VERSION_MISSING, "Expected version ID is required.");
      }

      const unit = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        now,
        stageFrom: liveStore,
      });
      const transaction = unit.begin();
      const initial = inspectState(transaction.inspect(), scope);
      if (initial.outcome === CoachingUpdatesProtocolRepairOutcome.ALREADY_REPAIRED) {
        transaction.abort();
        return result(initial.outcome, false, scope.protocolId, initial.version.id);
      }
      if (!initial.ok) {
        transaction.abort();
        return failure(initial.outcome, initial.reason);
      }

      try {
        const staged = await transaction.mutate((store) => {
          const state = inspectState(store, scope);
          if (!state.ok) throw new RepairFailure(state.outcome, state.reason);
          state.version.status = "active";
          faults.afterPromotion?.(store, state);
          state.protocol.currentVersionId = state.version.id;
          faults.afterRootUpdate?.(store, state);
          return { protocolId: state.protocol.id, versionId: state.version.id };
        });
        faults.beforeCommit?.();
        const committed = await transaction.commit({
          validateFinalized(candidate) {
            faults.beforeFinalVerification?.(candidate);
            return verifyRepairedState(candidate, scope);
          },
        });
        return Object.freeze({
          ...result(
            CoachingUpdatesProtocolRepairOutcome.SUCCESS,
            true,
            staged.protocolId,
            staged.versionId,
          ),
          revision: committed.revision,
        });
      } catch (error) {
        const typed = findRepairFailure(error);
        if (typed) return failure(typed.outcome, typed.message);
        if (error?.committed === true) {
          return failure(
            CoachingUpdatesProtocolRepairOutcome.ROLLBACK_FAILURE,
            "Persistence committed before live publication failed.",
          );
        }
        return failure(
          error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
            ? CoachingUpdatesProtocolRepairOutcome.CONCURRENCY_CONFLICT
            : CoachingUpdatesProtocolRepairOutcome.PERSISTENCE_FAILURE,
          "Coaching Updates protocol repair did not commit.",
        );
      }
    },
  };
}

function normalizeScope(command) {
  return {
    protocolId: command.protocolId ?? null,
    expectedVersionId: command.expectedVersionId ?? null,
    expectedGoalId: command.expectedGoalId ?? null,
  };
}

function inspectState(store, scope) {
  const protocol = store.protocols?.find((item) => item.id === scope.protocolId);
  if (!protocol || (protocol.protocolType ?? protocol.category) !== "briefings") {
    return rejected(
      CoachingUpdatesProtocolRepairOutcome.PROTOCOL_NOT_FOUND,
      "The characterized Coaching Updates protocol was not found.",
    );
  }
  if (protocol.status !== "active") {
    return rejected(
      CoachingUpdatesProtocolRepairOutcome.PROTOCOL_NOT_ACTIVE,
      "The Coaching Updates protocol root is not active.",
    );
  }

  const versions = store.protocolVersions?.filter((item) => item.protocolId === protocol.id) ?? [];
  if (protocol.currentVersionId) {
    if (protocol.currentVersionId !== scope.expectedVersionId) {
      return rejected(
        CoachingUpdatesProtocolRepairOutcome.UNEXPECTED_CURRENT_VERSION,
        "The current-version pointer differs from the characterized version.",
      );
    }
    const current = versions.find((item) => item.id === protocol.currentVersionId);
    const active = activeVersions(versions);
    if (current?.status !== "active" || current.endedAt || active.length !== 1) {
      return rejected(
        CoachingUpdatesProtocolRepairOutcome.UNEXPECTED_CURRENT_VERSION,
        "The current-version pointer is inconsistent.",
      );
    }
    const validity = validateCandidate(store, protocol, current, scope);
    return validity ?? {
      ok: true,
      outcome: CoachingUpdatesProtocolRepairOutcome.ALREADY_REPAIRED,
      protocol,
      version: current,
    };
  }

  if (activeVersions(versions).length) {
    return rejected(
      CoachingUpdatesProtocolRepairOutcome.INVALID_LIFECYCLE,
      "An unpointed active Coaching Updates version already exists.",
    );
  }
  const planned = versions.filter((item) => item.status === "planned" && !item.endedAt);
  if (!planned.length) {
    return rejected(
      CoachingUpdatesProtocolRepairOutcome.ELIGIBLE_VERSION_MISSING,
      "No eligible planned Coaching Updates version exists.",
    );
  }
  if (planned.length > 1) {
    return rejected(
      CoachingUpdatesProtocolRepairOutcome.AMBIGUOUS_VERSIONS,
      "More than one planned Coaching Updates version is eligible.",
    );
  }
  if (planned[0].id !== scope.expectedVersionId) {
    return rejected(
      CoachingUpdatesProtocolRepairOutcome.ELIGIBLE_VERSION_MISSING,
      "The eligible planned version differs from the characterized version.",
    );
  }
  const validity = validateCandidate(store, protocol, planned[0], scope);
  return validity ?? { ok: true, protocol, version: planned[0] };
}

function validateCandidate(store, protocol, version, scope) {
  if (
    version.protocolId !== protocol.id ||
    !Number.isInteger(version.versionNumber) ||
    version.versionNumber < 1 ||
    !version.effectiveAt ||
    version.endedAt ||
    !["planned", "active"].includes(version.status)
  ) {
    return rejected(
      CoachingUpdatesProtocolRepairOutcome.INVALID_LIFECYCLE,
      "The Coaching Updates version lifecycle is invalid.",
    );
  }

  const rootGoals = unique(protocol.currentGoalIds);
  const relatedGoals = unique(protocol.relatedGoalIds);
  const versionLinks = version.goalLinks ?? [];
  const versionGoals = unique(versionLinks.map((item) => item.goalId));
  const goal = store.goals?.find((item) => item.id === scope.expectedGoalId);
  if (
    !scope.expectedGoalId ||
    rootGoals.length !== 1 ||
    relatedGoals.length !== 1 ||
    versionGoals.length !== 1 ||
    rootGoals[0] !== scope.expectedGoalId ||
    relatedGoals[0] !== scope.expectedGoalId ||
    versionGoals[0] !== scope.expectedGoalId ||
    versionLinks[0]?.relationship !== "supports" ||
    !goal ||
    goal.status !== "active"
  ) {
    return rejected(
      CoachingUpdatesProtocolRepairOutcome.INVALID_GOAL,
      "Coaching Updates Goal ownership is ambiguous or inconsistent.",
    );
  }

  const identity = protocol.activationIdentity;
  const provenance = protocol.activationProvenance;
  if (
    !identity?.transitionId ||
    !identity.reviewId ||
    !identity.sourceProtocolId ||
    identity.sourceProtocolId !== provenance?.sourceProtocolId ||
    provenance.sourceProtocolId !== protocol.sourceProtocolId ||
    provenance.provenanceSourceType !== "virtual_plan" ||
    provenance.sourceVersionId != null ||
    provenance.ownershipTransferred !== false ||
    version.change?.previousVersionId != null ||
    !version.change?.reason ||
    version.confirmation?.authority !== "accepted_goal_transition"
  ) {
    return rejected(
      CoachingUpdatesProtocolRepairOutcome.INVALID_PROVENANCE,
      "Coaching Updates activation provenance is incomplete or inconsistent.",
    );
  }

  const rootCadence = protocol.effectiveStrategy;
  const reviewedCadence = version.change?.reviewedChanges;
  if (
    !validCadence(rootCadence) ||
    !validCadence(reviewedCadence) ||
    stableStringify(rootCadence) !== stableStringify(reviewedCadence)
  ) {
    return rejected(
      CoachingUpdatesProtocolRepairOutcome.INVALID_CADENCE,
      "The Coaching Updates cadence differs from the characterized payload.",
    );
  }
  return null;
}

function validCadence(value) {
  return Boolean(
    value &&
    value.cadence === "Twice weekly" &&
    sameSet(value.days, ["Wednesday", "Sunday"]) &&
    value.dailyEvidenceCollection === true,
  );
}

function verifyRepairedState(store, scope) {
  const inspected = inspectState(store, scope);
  const protocol = store.protocols?.find((item) => item.id === scope.protocolId);
  const versions = store.protocolVersions?.filter((item) => item.protocolId === scope.protocolId) ?? [];
  return Boolean(
    inspected.outcome === CoachingUpdatesProtocolRepairOutcome.ALREADY_REPAIRED &&
    protocol?.currentVersionId === scope.expectedVersionId &&
    activeVersions(versions).length === 1 &&
    activeVersions(versions)[0].id === scope.expectedVersionId,
  );
}

function activeVersions(versions) {
  return versions.filter((item) => item.status === "active" && !item.endedAt);
}
function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}
function sameSet(left = [], right = []) {
  return left.length === right.length && left.every((item) =>
    right.some((candidate) => candidate.toLowerCase() === String(item).toLowerCase()));
}
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function findRepairFailure(error) {
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
function failure(outcome, reason) {
  return Object.freeze({ outcome, committed: false, reason });
}
function rejected(outcome, reason) {
  return { ok: false, outcome, reason };
}

class RepairFailure extends Error {
  constructor(outcome, message) {
    super(message);
    this.name = "CoachingUpdatesProtocolRepairFailure";
    this.outcome = outcome;
  }
}
