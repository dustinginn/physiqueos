import {
  FounderStoreUnitOfWorkErrorCode,
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork.js";

export const NutritionProtocolRepairOutcome = Object.freeze({
  SUCCESS: "success",
  ALREADY_REPAIRED: "already_repaired",
  PROTOCOL_NOT_FOUND: "protocol_not_found",
  PROTOCOL_NOT_ACTIVE: "protocol_not_active",
  UNEXPECTED_CURRENT_VERSION_POINTER: "unexpected_current_version_pointer",
  ELIGIBLE_VERSION_MISSING: "eligible_version_missing",
  AMBIGUOUS_ELIGIBLE_VERSIONS: "ambiguous_eligible_versions",
  INVALID_VERSION_LIFECYCLE: "invalid_version_lifecycle",
  INVALID_GOAL_ASSOCIATION: "invalid_goal_association",
  INVALID_PROVENANCE: "invalid_provenance",
  INVALID_NUTRITION_STRATEGY: "invalid_nutrition_strategy",
  CONCURRENCY_CONFLICT: "concurrency_conflict",
  PERSISTENCE_FAILURE: "persistence_failure",
  ROLLBACK_FAILURE: "rollback_failure",
});

export function createNutritionProtocolStateRepairService({
  runtimeStorePath,
  liveStore,
  now = () => new Date(),
  createUnitOfWork = (options) => createFounderStoreUnitOfWork(options),
  faults = {},
} = {}) {
  if (!runtimeStorePath || !liveStore) {
    throw new Error("Nutrition protocol repair requires a bound Founder store.");
  }
  return {
    async repair({ protocolId, expectedGoalId } = {}) {
      if (!protocolId) return failure(NutritionProtocolRepairOutcome.PROTOCOL_NOT_FOUND, "Protocol ID is required.");
      const unit = createUnitOfWork({
        filePath: runtimeStorePath,
        liveStore,
        now,
        stageFrom: liveStore,
      });
      const transaction = unit.begin();
      const initial = inspectState(transaction.inspect(), { protocolId, expectedGoalId });
      if (initial.outcome === NutritionProtocolRepairOutcome.ALREADY_REPAIRED) {
        transaction.abort();
        return Object.freeze({ outcome: initial.outcome, committed: false, protocolId, versionId: initial.version.id });
      }
      if (!initial.ok) {
        transaction.abort();
        return failure(initial.outcome, initial.reason);
      }
      try {
        const staged = await transaction.mutate((store) => {
          const state = inspectState(store, { protocolId, expectedGoalId });
          if (!state.ok) throw new RepairFailure(state.outcome, state.reason);
          state.version.status = "active";
          faults.afterPromotion?.(store, state);
          state.protocol.currentVersionId = state.version.id;
          faults.afterRootUpdate?.(store, state);
          return { protocolId, versionId: state.version.id };
        });
        faults.beforeCommit?.();
        const committed = await transaction.commit({
          validateFinalized(candidate) {
            faults.beforeFinalVerification?.(candidate);
            return verifyRepairedState(candidate, staged.protocolId, staged.versionId, expectedGoalId);
          },
        });
        return Object.freeze({
          outcome: NutritionProtocolRepairOutcome.SUCCESS,
          committed: true,
          protocolId: staged.protocolId,
          versionId: staged.versionId,
          revision: committed.revision,
        });
      } catch (error) {
        const typed = findRepairFailure(error);
        if (typed) return failure(typed.outcome, typed.message);
        if (error?.committed === true) {
          return failure(NutritionProtocolRepairOutcome.ROLLBACK_FAILURE, "Persistence committed before publication failed.");
        }
        return failure(
          error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT
            ? NutritionProtocolRepairOutcome.CONCURRENCY_CONFLICT
            : NutritionProtocolRepairOutcome.PERSISTENCE_FAILURE,
          "Nutrition protocol repair did not commit.",
        );
      }
    },
  };
}

function inspectState(store, { protocolId, expectedGoalId }) {
  const protocol = store.protocols?.find((item) => item.id === protocolId);
  if (!protocol || !["nutrition"].includes(protocol.protocolType ?? protocol.category)) {
    return rejected(NutritionProtocolRepairOutcome.PROTOCOL_NOT_FOUND, "The characterized Nutrition protocol was not found.");
  }
  if (protocol.status !== "active") {
    return rejected(NutritionProtocolRepairOutcome.PROTOCOL_NOT_ACTIVE, "The Nutrition protocol root is not active.");
  }
  const versions = store.protocolVersions?.filter((item) => item.protocolId === protocol.id) ?? [];
  if (protocol.currentVersionId) {
    const current = versions.find((item) => item.id === protocol.currentVersionId);
    const active = versions.filter((item) => item.status === "active" && !item.endedAt);
    if (current && current.status === "active" && !current.endedAt && active.length === 1) {
      const validity = validateCandidate(protocol, current, expectedGoalId);
      return validity ?? { ok: true, outcome: NutritionProtocolRepairOutcome.ALREADY_REPAIRED, protocol, version: current };
    }
    return rejected(NutritionProtocolRepairOutcome.UNEXPECTED_CURRENT_VERSION_POINTER, "The current-version pointer is inconsistent.");
  }
  if (versions.some((item) => item.status === "active" && !item.endedAt)) {
    return rejected(NutritionProtocolRepairOutcome.INVALID_VERSION_LIFECYCLE, "An unpointed active version already exists.");
  }
  const planned = versions.filter((item) => item.status === "planned" && !item.endedAt);
  if (planned.length === 0) {
    return rejected(NutritionProtocolRepairOutcome.ELIGIBLE_VERSION_MISSING, "No eligible planned Nutrition version exists.");
  }
  if (planned.length > 1) {
    return rejected(NutritionProtocolRepairOutcome.AMBIGUOUS_ELIGIBLE_VERSIONS, "More than one planned Nutrition version is eligible.");
  }
  const version = planned[0];
  const validity = validateCandidate(protocol, version, expectedGoalId);
  return validity ?? { ok: true, protocol, version };
}

function validateCandidate(protocol, version, expectedGoalId) {
  if (version.protocolId !== protocol.id || version.status === "superseded" || version.endedAt) {
    return rejected(NutritionProtocolRepairOutcome.INVALID_VERSION_LIFECYCLE, "The planned version lifecycle is invalid.");
  }
  const currentGoals = [...new Set(protocol.currentGoalIds ?? [])];
  const versionGoals = [...new Set((version.goalLinks ?? []).map((item) => item.goalId).filter(Boolean))];
  if (currentGoals.length !== 1 || versionGoals.length !== 1 ||
      currentGoals[0] !== versionGoals[0] ||
      (expectedGoalId && currentGoals[0] !== expectedGoalId)) {
    return rejected(NutritionProtocolRepairOutcome.INVALID_GOAL_ASSOCIATION, "Nutrition Goal ownership is ambiguous or inconsistent.");
  }
  const provenance = protocol.activationProvenance;
  const identity = protocol.activationIdentity;
  if (!provenance?.sourceProtocolId || !provenance.sourceVersionId ||
      !provenance.provenanceSourceType || !identity?.transitionId ||
      !identity.reviewId || version.confirmation?.authority !== "accepted_goal_transition" ||
      !version.change?.previousVersionId) {
    return rejected(NutritionProtocolRepairOutcome.INVALID_PROVENANCE, "Nutrition activation provenance is incomplete.");
  }
  const strategy = protocol.effectiveStrategy ?? {};
  const reviewed = version.change?.reviewedChanges ?? {};
  const preservedFields = [
    "proteinBasis", "proteinRatio", "proteinTarget", "fixedProtein",
    "calorieStrategy", "carbohydrateStrategy", "fatStrategy",
  ];
  if (strategy.proteinBasis !== "body_weight" || Number(strategy.proteinRatio) !== 1 ||
      preservedFields.some((field) => JSON.stringify(strategy[field]) !== JSON.stringify(reviewed[field]))) {
    return rejected(NutritionProtocolRepairOutcome.INVALID_NUTRITION_STRATEGY, "The planned version does not preserve the canonical 1 g/lb strategy.");
  }
  return null;
}

function verifyRepairedState(store, protocolId, versionId, expectedGoalId) {
  const protocol = store.protocols.find((item) => item.id === protocolId);
  const versions = store.protocolVersions.filter((item) => item.protocolId === protocolId);
  const version = versions.find((item) => item.id === versionId);
  return Boolean(
    protocol?.status === "active" &&
    protocol.currentVersionId === versionId &&
    version?.status === "active" &&
    !version.endedAt &&
    versions.filter((item) => item.status === "active" && !item.endedAt).length === 1 &&
    !validateCandidate(protocol, version, expectedGoalId),
  );
}

function findRepairFailure(error) {
  let current = error;
  while (current) {
    if (current instanceof RepairFailure) return current;
    current = current.cause;
  }
  return null;
}
function failure(outcome, reason) { return Object.freeze({ outcome, committed: false, reason }); }
function rejected(outcome, reason) { return { ok: false, outcome, reason }; }

class RepairFailure extends Error {
  constructor(outcome, message) {
    super(message);
    this.name = "NutritionProtocolRepairFailure";
    this.outcome = outcome;
  }
}
