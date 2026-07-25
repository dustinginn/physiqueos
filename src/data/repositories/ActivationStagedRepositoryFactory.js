import { createHash } from "node:crypto";
import { getFounderStoreUnitOfWorkCapabilities } from "./FounderStoreUnitOfWork";

export const ActivationStagedRepositoryErrorCode = Object.freeze({
  PERSISTENCE_FORBIDDEN: "STAGED_REPOSITORY_PERSISTENCE_FORBIDDEN",
  LIVE_STORE_ACCESS_FORBIDDEN: "STAGED_REPOSITORY_LIVE_STORE_ACCESS_FORBIDDEN",
  TRANSACTION_MISMATCH: "STAGED_REPOSITORY_TRANSACTION_MISMATCH",
  TRANSACTION_CLOSED: "STAGED_REPOSITORY_TRANSACTION_CLOSED",
  FUTURE_IDENTITY_MISSING: "STAGED_REPOSITORY_FUTURE_IDENTITY_MISSING",
  FUTURE_IDENTITY_DUPLICATE: "STAGED_REPOSITORY_FUTURE_IDENTITY_DUPLICATE",
  FUTURE_IDENTITY_COLLISION: "STAGED_REPOSITORY_FUTURE_IDENTITY_COLLISION",
  PRESENTATION_ID_FORBIDDEN: "STAGED_REPOSITORY_PRESENTATION_ID_FORBIDDEN",
  HISTORICAL_PROTOCOL_IMMUTABLE: "STAGED_REPOSITORY_HISTORICAL_PROTOCOL_IMMUTABLE",
  HISTORICAL_OWNERSHIP_IMMUTABLE: "STAGED_REPOSITORY_HISTORICAL_OWNERSHIP_IMMUTABLE",
  INTEGRITY_INVALID: "STAGED_REPOSITORY_INTEGRITY_INVALID",
});

export class ActivationStagedRepositoryError extends Error {
  constructor(code, message, context = {}) {
    super(message);
    this.name = "ActivationStagedRepositoryError";
    this.code = code;
    this.entityType = context.entityType ?? null;
    this.entityId = context.entityId ?? null;
    this.transactionId = context.transactionId ?? null;
  }
}

const PARTICIPATING_REPOSITORIES = Object.freeze([
  "goals",
  "protocols",
  "protocolVersions",
  "protocolRelationships",
  "commitments",
  "reminders",
  "briefingCadence",
  "completionRecommendations",
  "goalTransitionDrafts",
  "protocolTransitionDrafts",
]);

const EXCLUDED_REPOSITORIES = Object.freeze([
  "canonicalEvidence",
  "evidencePackages",
  "evidenceReviews",
  "weights",
  "dexaScans",
  "progressPhotos",
  "dailyCheckIns",
  "dailyBriefings",
  "analyses",
  "nutritionContext",
]);

export const ActivationStagedRepositoryContract = deepFreezeContract({
  version: "activation_staged_repository_contract_v1",
  persistenceDisabled: true,
  transactionBound: true,
  closesAfterTransaction: true,
  externalSchedulerSideEffects: false,
  evidenceWritesSupported: false,
  repositories: {
    goals: { methods: ["list", "getById", "addFutureGoal", "updateLifecycle"] },
    protocols: {
      methods: [
        "list",
        "getById",
        "addFutureProtocol",
        "updateHistoricalProtocol",
        "deleteHistoricalProtocol",
        "reassignHistoricalOwnership",
      ],
      rejectingMethods: [
        "updateHistoricalProtocol",
        "deleteHistoricalProtocol",
        "reassignHistoricalOwnership",
      ],
    },
    protocolVersions: { methods: ["list", "addFutureVersion"] },
    protocolRelationships: { methods: ["addProvenance", "linkFutureProtocolToGoal"] },
    commitments: { methods: ["list", "add"] },
    reminders: { methods: ["list", "add"], externalSchedulerSideEffects: false },
    briefingCadence: { methods: ["get", "set"], briefingGenerationSideEffects: false },
    completionRecommendations: { methods: ["get", "resolve"], historicalBriefingMutation: false },
    goalTransitionDrafts: { methods: ["getById", "consume"] },
    protocolTransitionDrafts: { methods: ["getById", "consume"] },
    integrity: { methods: ["assertIntegrity"], mutation: false },
  },
});

export function getActivationStagedRepositoryCapabilities({
  founderStoreCapabilities = getFounderStoreUnitOfWorkCapabilities(),
} = {}) {
  const foundationReady = [
    "crossRepositoryTransaction",
    "atomicCommit",
    "rollback",
    "stagedWrites",
    "revisionLocking",
    "persistenceErrorsPropagate",
  ].every((capability) => founderStoreCapabilities[capability] === true);
  return Object.freeze({
    repositoryParticipation: foundationReady,
    activationRepositoryFactoryAvailable: true,
    independentPersistenceDisabled: true,
    canonicalEvidenceExcluded: true,
    participatingRepositories: PARTICIPATING_REPOSITORIES,
    excludedRepositories: EXCLUDED_REPOSITORIES,
    externalSchedulerParticipates: false,
    briefingArtifactRepositoryParticipates: false,
    activationCoordinatorAvailable: false,
  });
}

export function createActivationStagedRepositories({
  stagedFounderStore,
  transaction,
  futureProtocolPlan = [],
  liveFounderStore = null,
  now = () => new Date(),
} = {}) {
  if (!stagedFounderStore || typeof stagedFounderStore !== "object") {
    throw stagedError("LIVE_STORE_ACCESS_FORBIDDEN", "A staged founder-store snapshot is required.");
  }
  if (liveFounderStore && stagedFounderStore === liveFounderStore) {
    throw stagedError("LIVE_STORE_ACCESS_FORBIDDEN", "The live founder store cannot back staged repositories.");
  }
  if (!transaction?.transactionId || transaction.status !== "open") {
    throw stagedError("TRANSACTION_CLOSED", "An open founder-store transaction is required.");
  }

  const transactionId = transaction.transactionId;
  const historicalProtocols = structuredClone(stagedFounderStore.protocols ?? []);
  const historicalVersions = structuredClone(stagedFounderStore.protocolVersions ?? []);
  const historicalProtocolIds = new Set(historicalProtocols.map((protocol) => protocol.id));
  const historicalVersionIds = new Set(historicalVersions.map((version) => version.id));
  const evidenceSnapshot = snapshotEvidence(stagedFounderStore);
  const historicalGoalTransitionDrafts = structuredClone(
    stagedFounderStore.goalTransitionDrafts ?? []
  );
  const historicalProtocolTransitionDrafts = structuredClone(
    stagedFounderStore.goalProtocolTransitionDrafts ?? []
  );
  const planById = validateIdentityPlan(futureProtocolPlan, historicalProtocolIds, transactionId);
  const createdFutureProtocolIds = new Set();
  const stagedIdentity = Object.freeze({ transactionId, token: Symbol(transactionId) });

  const assertOpen = () => {
    if (transaction.status !== "open") {
      throw stagedError("TRANSACTION_CLOSED", "The staged repository transaction is closed.", {
        transactionId,
      });
    }
  };
  const assertTransaction = (candidate) => {
    if (candidate && candidate.transactionId !== transactionId) {
      throw stagedError("TRANSACTION_MISMATCH", "The staged repository belongs to another transaction.", {
        transactionId,
      });
    }
    assertOpen();
    return true;
  };
  const read = (value) => structuredClone(value);
  const findFutureProtocol = (protocolId) => {
    const protocol = (stagedFounderStore.protocols ?? []).find((item) => item.id === protocolId);
    if (!protocol || !createdFutureProtocolIds.has(protocolId)) {
      throw stagedError("INTEGRITY_INVALID", "The staged future protocol does not exist.", {
        transactionId, entityType: "protocol", entityId: protocolId,
      });
    }
    return protocol;
  };

  const repositories = {
    goals: Object.freeze({
      async list(userId) {
        assertOpen();
        return read((stagedFounderStore.goals ?? []).filter((goal) => goal.userId === userId));
      },
      async getById(goalId) {
        assertOpen();
        return read((stagedFounderStore.goals ?? []).find((goal) => goal.id === goalId) ?? null);
      },
      async addFutureGoal(goal) {
        assertOpen();
        if (!goal?.id || (stagedFounderStore.goals ?? []).some((item) => item.id === goal.id)) {
          throw stagedError("INTEGRITY_INVALID", "Future goal identity is missing or already exists.", {
            transactionId, entityType: "goal", entityId: goal?.id,
          });
        }
        stagedFounderStore.goals ??= [];
        stagedFounderStore.goals.push(structuredClone(goal));
        return read(goal);
      },
      async updateLifecycle(goalId, patch) {
        assertOpen();
        const index = (stagedFounderStore.goals ?? []).findIndex((goal) => goal.id === goalId);
        if (index < 0) return null;
        stagedFounderStore.goals[index] = {
          ...stagedFounderStore.goals[index],
          ...structuredClone(patch),
          updatedAt: now().toISOString(),
        };
        return read(stagedFounderStore.goals[index]);
      },
    }),

    protocols: Object.freeze({
      async list(userId) {
        assertOpen();
        return read((stagedFounderStore.protocols ?? []).filter((protocol) => protocol.userId === userId));
      },
      async getById(protocolId) {
        assertOpen();
        return read((stagedFounderStore.protocols ?? []).find((protocol) => protocol.id === protocolId) ?? null);
      },
      async addFutureProtocol(protocol) {
        assertOpen();
        const plan = planById.get(protocol?.id);
        if (!protocol?.id || !plan) {
          throw stagedError("FUTURE_IDENTITY_MISSING", "Protocol identity is not in the validated future plan.", {
            transactionId, entityType: "protocol", entityId: protocol?.id,
          });
        }
        if (createdFutureProtocolIds.has(protocol.id)
          || (stagedFounderStore.protocols ?? []).some((item) => item.id === protocol.id)) {
          throw stagedError("FUTURE_IDENTITY_DUPLICATE", "Future protocol identity is already staged.", {
            transactionId, entityType: "protocol", entityId: protocol.id,
          });
        }
        if (protocol.sourceProtocolId && protocol.sourceProtocolId !== plan.sourceProtocolId) {
          throw stagedError("INTEGRITY_INVALID", "Future protocol source does not match the identity plan.", {
            transactionId, entityType: "protocol", entityId: protocol.id,
          });
        }
        stagedFounderStore.protocols ??= [];
        stagedFounderStore.protocols.push(structuredClone({
          ...protocol,
          relatedGoalIds: [...(protocol.relatedGoalIds ?? [])],
          activationIdentity: {
            transitionId: plan.transitionId ?? null,
            reviewId: plan.reviewId,
            sourceProtocolId: plan.sourceProtocolId,
          },
        }));
        createdFutureProtocolIds.add(protocol.id);
        return read(findFutureProtocol(protocol.id));
      },
      async updateHistoricalProtocol(protocolId) {
        assertOpen();
        throw stagedError("HISTORICAL_PROTOCOL_IMMUTABLE", "Historical protocols cannot be edited in place.", {
          transactionId, entityType: "protocol", entityId: protocolId,
        });
      },
      async deleteHistoricalProtocol(protocolId) {
        assertOpen();
        throw stagedError("HISTORICAL_PROTOCOL_IMMUTABLE", "Historical protocols cannot be deleted.", {
          transactionId, entityType: "protocol", entityId: protocolId,
        });
      },
      async reassignHistoricalOwnership(protocolId) {
        assertOpen();
        throw stagedError("HISTORICAL_OWNERSHIP_IMMUTABLE", "Historical protocol ownership cannot be reassigned.", {
          transactionId, entityType: "protocol", entityId: protocolId,
        });
      },
    }),

    protocolVersions: Object.freeze({
      async list(protocolId) {
        assertOpen();
        return read((stagedFounderStore.protocolVersions ?? []).filter((version) => version.protocolId === protocolId));
      },
      async addFutureVersion(version) {
        assertOpen();
        if (!createdFutureProtocolIds.has(version?.protocolId)) {
          throw stagedError("INTEGRITY_INVALID", "A future version requires a staged future protocol.", {
            transactionId, entityType: "protocol_version", entityId: version?.id,
          });
        }
        if (!version?.id || (stagedFounderStore.protocolVersions ?? []).some((item) => item.id === version.id)) {
          throw stagedError("INTEGRITY_INVALID", "Future protocol version identity is missing or duplicated.", {
            transactionId, entityType: "protocol_version", entityId: version?.id,
          });
        }
        stagedFounderStore.protocolVersions ??= [];
        stagedFounderStore.protocolVersions.push(structuredClone(version));
        return read(version);
      },
    }),

    protocolRelationships: Object.freeze({
      async addProvenance({
        futureProtocolId,
        sourceProtocolId,
        sourceVersionId = null,
        provenanceSourceType,
      }) {
        assertOpen();
        const protocol = findFutureProtocol(futureProtocolId);
        const historicalSource = provenanceSourceType === "historical_protocol"
          && historicalProtocolIds.has(sourceProtocolId)
          && (!sourceVersionId || historicalVersionIds.has(sourceVersionId));
        const virtualSource = provenanceSourceType === "virtual_plan"
          && /^virtual_[a-z0-9_]+$/.test(sourceProtocolId ?? "")
          && sourceVersionId == null
          && protocol.sourceProtocolId === sourceProtocolId;
        if (!historicalSource && !virtualSource) {
          throw stagedError("INTEGRITY_INVALID", "Protocol provenance target is missing.", {
            transactionId, entityType: "protocol", entityId: sourceProtocolId,
          });
        }
        protocol.activationProvenance = {
          sourceProtocolId,
          sourceVersionId,
          provenanceSourceType,
          ownershipTransferred: false,
        };
        return read(protocol.activationProvenance);
      },
      async linkFutureProtocolToGoal(protocolId, goalId) {
        assertOpen();
        const protocol = findFutureProtocol(protocolId);
        if (!(stagedFounderStore.goals ?? []).some((goal) => goal.id === goalId)) {
          throw stagedError("INTEGRITY_INVALID", "Protocol goal relationship target is missing.", {
            transactionId, entityType: "goal", entityId: goalId,
          });
        }
        protocol.relatedGoalIds = [...new Set([...(protocol.relatedGoalIds ?? []), goalId])];
        return read(protocol);
      },
    }),

    commitments: Object.freeze({
      async list(userId) {
        assertOpen();
        return read((stagedFounderStore.executionItems ?? []).filter((item) => item.userId === userId));
      },
      async add(commitment) {
        assertOpen();
        if (!commitment?.id || (stagedFounderStore.executionItems ?? []).some((item) => item.id === commitment.id)) {
          throw stagedError("INTEGRITY_INVALID", "Commitment identity is missing or duplicated.", {
            transactionId, entityType: "commitment", entityId: commitment?.id,
          });
        }
        if (!createdFutureProtocolIds.has(commitment.sourceProtocolId)) {
          throw stagedError("INTEGRITY_INVALID", "Commitment owner must be a staged future protocol.", {
            transactionId, entityType: "commitment", entityId: commitment.id,
          });
        }
        stagedFounderStore.executionItems ??= [];
        stagedFounderStore.executionItems.push(structuredClone(commitment));
        return read(commitment);
      },
    }),

    reminders: Object.freeze({
      async list(userId) {
        assertOpen();
        return read((stagedFounderStore.reminders ?? []).filter((item) => item.userId === userId));
      },
      async add(reminder) {
        assertOpen();
        if (!reminder?.id || (stagedFounderStore.reminders ?? []).some((item) => item.id === reminder.id)) {
          throw stagedError("INTEGRITY_INVALID", "Reminder identity is missing or duplicated.", {
            transactionId, entityType: "reminder", entityId: reminder?.id,
          });
        }
        stagedFounderStore.reminders ??= [];
        stagedFounderStore.reminders.push(structuredClone(reminder));
        return read(reminder);
      },
    }),

    briefingCadence: Object.freeze({
      async get() {
        assertOpen();
        return read(stagedFounderStore.operatingPlan?.coachingCadence ?? null);
      },
      async set(cadence) {
        assertOpen();
        stagedFounderStore.operatingPlan ??= {};
        stagedFounderStore.operatingPlan.coachingCadence = structuredClone(cadence);
        return read(cadence);
      },
    }),

    completionRecommendations: Object.freeze({
      async get(goalId) {
        assertOpen();
        const goal = (stagedFounderStore.goals ?? []).find((item) => item.id === goalId);
        return read(goal?.completionRecommendationResolution ?? null);
      },
      async resolve(goalId, resolution) {
        assertOpen();
        const goal = (stagedFounderStore.goals ?? []).find((item) => item.id === goalId);
        if (!goal) {
          throw stagedError("INTEGRITY_INVALID", "Completion recommendation goal is missing.", {
            transactionId, entityType: "goal", entityId: goalId,
          });
        }
        goal.completionRecommendationResolution = structuredClone(resolution);
        return read(goal.completionRecommendationResolution);
      },
    }),

    goalTransitionDrafts: createStagedDraftRepository({
      assertOpen,
      collection: stagedFounderStore.goalTransitionDrafts ??= [],
      draftType: "goal_transition_draft",
      getTransitionId: (draft) => draft.id,
      transactionId,
    }),

    protocolTransitionDrafts: createStagedDraftRepository({
      assertOpen,
      collection: stagedFounderStore.goalProtocolTransitionDrafts ??= [],
      draftType: "protocol_transition_draft",
      getTransitionId: (draft) => draft.goalTransitionDraftId,
      transactionId,
    }),
  };

  const boundRepositories = Object.fromEntries(
    Object.entries(repositories).map(([name, repository]) => [
      name,
      bindRepositoryToTransaction(repository, transaction),
    ])
  );
  const repositorySet = {
    ...boundRepositories,
    metadata: Object.freeze({
      transactionId,
      expectedRevision: transaction.expectedRevision,
      stagedStoreIdentity: stagedIdentity,
      repositoryParticipation: true,
      persistenceDisabled: true,
      participatingRepositories: PARTICIPATING_REPOSITORIES,
      excludedRepositories: EXCLUDED_REPOSITORIES,
    }),
    persistence: Object.freeze({
      persist() {
        throw stagedError("PERSISTENCE_FORBIDDEN", "Staged repositories cannot persist independently.", {
          transactionId,
        });
      },
      flush() {
        throw stagedError("PERSISTENCE_FORBIDDEN", "Staged repositories cannot flush independently.", {
          transactionId,
        });
      },
    }),
    assertTransaction,
    inspectStagedState() {
      if (!["open", "committing"].includes(transaction.status)) {
        throw stagedError("TRANSACTION_CLOSED", "The staged repository transaction is closed.", {
          transactionId,
        });
      }
      return structuredClone(stagedFounderStore);
    },
    assertIntegrity() {
      if (!["open", "committing"].includes(transaction.status)) {
        throw stagedError("TRANSACTION_CLOSED", "The staged repository transaction is closed.", {
          transactionId,
        });
      }
      assertHistoricalRecordsUnchanged({
        stagedFounderStore,
        historicalProtocols,
        historicalVersions,
        transactionId,
      });
      assertDraftCollectionsPreserved({
        stagedFounderStore,
        historicalGoalTransitionDrafts,
        historicalProtocolTransitionDrafts,
        transactionId,
      });
      assertRelationships({
        stagedFounderStore,
        createdFutureProtocolIds,
        evidenceSnapshot,
        transactionId,
      });
      return Object.freeze({
        valid: true,
        transactionId,
        stagedRevision: stagedFounderStore.revision,
        futureProtocolCount: createdFutureProtocolIds.size,
        evidenceWrites: 0,
      });
    },
  };
  return Object.freeze(repositorySet);
}

function createStagedDraftRepository({
  assertOpen,
  collection,
  draftType,
  getTransitionId,
  transactionId,
}) {
  return Object.freeze({
    async getById(draftId) {
      assertOpen();
      return structuredClone(collection.find((draft) => draft.id === draftId) ?? null);
    },
    async consume(payload = {}) {
      assertOpen();
      const index = collection.findIndex((draft) => draft.id === payload.draftId);
      const draft = collection[index];
      if (!draft || payload.draftType !== draftType) {
        throw stagedError("INTEGRITY_INVALID", "Transition draft identity or type is invalid.", {
          transactionId, entityType: draftType, entityId: payload.draftId,
        });
      }
      if (getTransitionId(draft) !== payload.transitionId
        || payload.consumedByTransitionId !== payload.transitionId) {
        throw stagedError("TRANSACTION_MISMATCH", "Transition draft belongs to another transition.", {
          transactionId, entityType: draftType, entityId: payload.draftId,
        });
      }
      if (payload.expectedStatus !== "ready" || draft.status !== "ready"
        || payload.expectedAccepted !== true
        || payload.expectedUnconsumed !== true) {
        throw stagedError("INTEGRITY_INVALID", "Transition draft is not accepted and ready.", {
          transactionId, entityType: draftType, entityId: payload.draftId,
        });
      }
      if (draft.superseded === true || draft.supersededAt
        || draft.consumed === true || draft.appliedAt || draft.activationConsumption) {
        throw stagedError("INTEGRITY_INVALID", "Transition draft is consumed or superseded.", {
          transactionId, entityType: draftType, entityId: payload.draftId,
        });
      }
      if (draftFingerprint(draft) !== payload.expectedDraftFingerprint) {
        throw stagedError("INTEGRITY_INVALID", "Transition draft fingerprint changed.", {
          transactionId, entityType: draftType, entityId: payload.draftId,
        });
      }
      if (!payload.activationPlanId || !payload.activationPlanFingerprint
        || payload.activationCommitId !== null
        || payload.activationCommittedRevision !== null) {
        throw stagedError("INTEGRITY_INVALID", "Consumption metadata template is invalid.", {
          transactionId, entityType: draftType, entityId: payload.draftId,
        });
      }
      const consumedAt = payload.consumedAt;
      collection[index] = {
        ...draft,
        status: "applied",
        consumed: true,
        consumedAt,
        appliedAt: consumedAt,
        activationConsumption: {
          consumed: true,
          consumedAt,
          consumedByTransitionId: payload.transitionId,
          activationPlanId: payload.activationPlanId,
          activationPlanFingerprint: payload.activationPlanFingerprint,
          sourceGoalId: payload.sourceGoalId,
          targetGoalId: payload.targetGoalId,
          draftFingerprintAtConsumption: payload.expectedDraftFingerprint,
          activationCommitId: null,
          activationCommittedRevision: null,
          pendingCommitMetadata: true,
        },
      };
      return structuredClone(collection[index]);
    },
  });
}

export function finalizeActivationDraftConsumptionCandidate({
  candidate,
  plan,
  commitId,
  candidateRevision,
} = {}) {
  if (!candidate || !plan || !commitId || !Number.isSafeInteger(candidateRevision)) {
    throw stagedError("INTEGRITY_INVALID", "Authoritative candidate commit metadata is required.");
  }
  const identities = [
    ["goalTransitionDrafts", plan.transitionIdentity.goalTransitionDraftId],
    ["goalProtocolTransitionDrafts", plan.transitionIdentity.protocolTransitionDraftId],
  ];
  for (const [collectionName, draftId] of identities) {
    const draft = (candidate[collectionName] ?? []).find((item) => item.id === draftId);
    if (!draft?.activationConsumption?.pendingCommitMetadata) {
      throw stagedError("INTEGRITY_INVALID", "Draft consumption intent is missing from candidate.", {
        entityType: collectionName, entityId: draftId,
      });
    }
    draft.activationConsumption = {
      ...draft.activationConsumption,
      activationCommitId: commitId,
      activationCommittedRevision: candidateRevision,
      pendingCommitMetadata: false,
    };
  }
  return candidate;
}

export function assertFinalizedActivationDraftConsumption({
  candidate,
  plan,
  commitId,
  candidateRevision,
  sourceSnapshot,
} = {}) {
  const goalDraft = (candidate?.goalTransitionDrafts ?? []).find(
    (draft) => draft.id === plan?.transitionIdentity?.goalTransitionDraftId
  );
  const protocolDraft = (candidate?.goalProtocolTransitionDrafts ?? []).find(
    (draft) => draft.id === plan?.transitionIdentity?.protocolTransitionDraftId
  );
  const drafts = [goalDraft, protocolDraft];
  const transitionId = plan?.transitionIdentity?.goalTransitionDraftId;
  const valid = drafts.every((draft) => {
    const consumption = draft?.activationConsumption;
    return draft?.status === "applied"
      && draft.consumed === true
      && Boolean(draft.consumedAt)
      && !draft.superseded && !draft.supersededAt
      && consumption?.consumed === true
      && consumption.pendingCommitMetadata === false
      && consumption.consumedByTransitionId === transitionId
      && consumption.activationPlanId === plan.planId
      && consumption.activationPlanFingerprint === plan.planFingerprint
      && consumption.sourceGoalId === plan.transitionIdentity.sourceGoalId
      && consumption.targetGoalId === plan.transitionIdentity.targetGoalDraftId
      && consumption.activationCommitId === commitId
      && consumption.activationCommittedRevision === candidateRevision;
  });
  const sourceGoalDraft = sourceSnapshot?.sourceState?.goalDraft;
  const sourceProtocolDraft = sourceSnapshot?.sourceState?.protocolDraft;
  const contentPreserved = goalDraft && protocolDraft
    && sameDraftContent(goalDraft, sourceGoalDraft)
    && sameDraftContent(protocolDraft, sourceProtocolDraft)
    && goalDraft.activationConsumption.draftFingerprintAtConsumption
      === draftFingerprint(sourceGoalDraft)
    && protocolDraft.activationConsumption.draftFingerprintAtConsumption
      === draftFingerprint(sourceProtocolDraft);
  if (!valid || !contentPreserved
    || (candidate.goalTransitionDrafts ?? []).filter((draft) => draft.id === goalDraft?.id).length !== 1
    || (candidate.goalProtocolTransitionDrafts ?? []).filter(
      (draft) => draft.id === protocolDraft?.id
    ).length !== 1) {
    throw stagedError("INTEGRITY_INVALID", "Finalized transition draft consumption is invalid.");
  }
  return { valid: true };
}

function bindRepositoryToTransaction(repository, transaction) {
  return Object.freeze(Object.fromEntries(
    Object.entries(repository).map(([name, operation]) => [
      name,
      async (...args) => {
        try {
          return await operation(...args);
        } catch (error) {
          if (transaction.status === "open") transaction.abort();
          throw error;
        }
      },
    ])
  ));
}

function validateIdentityPlan(plan, historicalIds, transactionId) {
  const byId = new Map();
  if (!Array.isArray(plan) || plan.length === 0) {
    throw stagedError("FUTURE_IDENTITY_MISSING", "At least one validated future protocol identity is required.", {
      transactionId, entityType: "future_protocol_identity",
    });
  }
  for (const identity of plan ?? []) {
    if (!identity?.id) {
      throw stagedError("FUTURE_IDENTITY_MISSING", "Future protocol identity is required.", {
        transactionId, entityType: "future_protocol_identity",
      });
    }
    if (/preview/i.test(identity.id)
      && ["peptide", "supplement"].includes(identity.category)) {
      throw stagedError("PRESENTATION_ID_FORBIDDEN", "Grouped presentation preview IDs cannot be production protocol IDs.", {
        transactionId, entityType: "future_protocol_identity", entityId: identity.id,
      });
    }
    if (historicalIds.has(identity.id)) {
      throw stagedError("FUTURE_IDENTITY_COLLISION", "Future protocol identity collides with historical state.", {
        transactionId, entityType: "future_protocol_identity", entityId: identity.id,
      });
    }
    if (byId.has(identity.id)) {
      throw stagedError("FUTURE_IDENTITY_DUPLICATE", "Future protocol identity is duplicated.", {
        transactionId, entityType: "future_protocol_identity", entityId: identity.id,
      });
    }
    byId.set(identity.id, structuredClone(identity));
  }
  return byId;
}

function assertHistoricalRecordsUnchanged({
  stagedFounderStore,
  historicalProtocols,
  historicalVersions,
  transactionId,
}) {
  for (const historical of historicalProtocols) {
    const current = (stagedFounderStore.protocols ?? []).find((protocol) => protocol.id === historical.id);
    if (!current || stableSerialize(current) !== stableSerialize(historical)) {
      throw stagedError("HISTORICAL_PROTOCOL_IMMUTABLE", "Historical protocol state changed during staging.", {
        transactionId, entityType: "protocol", entityId: historical.id,
      });
    }
  }
  for (const historical of historicalVersions) {
    const current = (stagedFounderStore.protocolVersions ?? []).find((version) => version.id === historical.id);
    if (!current || stableSerialize(current) !== stableSerialize(historical)) {
      throw stagedError("HISTORICAL_PROTOCOL_IMMUTABLE", "Historical protocol version changed during staging.", {
        transactionId, entityType: "protocol_version", entityId: historical.id,
      });
    }
  }
}

const DRAFT_CONSUMPTION_FIELDS = new Set([
  "status",
  "consumed",
  "consumedAt",
  "appliedAt",
  "activationConsumption",
]);

function assertDraftCollectionsPreserved({
  stagedFounderStore,
  historicalGoalTransitionDrafts,
  historicalProtocolTransitionDrafts,
  transactionId,
}) {
  for (const [collectionName, historical] of [
    ["goalTransitionDrafts", historicalGoalTransitionDrafts],
    ["goalProtocolTransitionDrafts", historicalProtocolTransitionDrafts],
  ]) {
    const current = stagedFounderStore[collectionName] ?? [];
    if (current.length !== historical.length) {
      throw stagedError("INTEGRITY_INVALID", "Transition draft count changed during staging.", {
        transactionId, entityType: collectionName,
      });
    }
    for (const source of historical) {
      const draft = current.find((item) => item.id === source.id);
      if (!draft || !sameDraftContent(draft, source)) {
        throw stagedError("INTEGRITY_INVALID", "Accepted transition draft content changed.", {
          transactionId, entityType: collectionName, entityId: source.id,
        });
      }
    }
  }
}

function assertRelationships({
  stagedFounderStore,
  createdFutureProtocolIds,
  evidenceSnapshot,
  transactionId,
}) {
  const goals = new Set((stagedFounderStore.goals ?? []).map((goal) => goal.id));
  const protocols = new Set((stagedFounderStore.protocols ?? []).map((protocol) => protocol.id));
  for (const protocolId of createdFutureProtocolIds) {
    const protocol = (stagedFounderStore.protocols ?? []).find((item) => item.id === protocolId);
    if ((protocol.relatedGoalIds ?? []).some((goalId) => !goals.has(goalId))) {
      throw stagedError("INTEGRITY_INVALID", "Future protocol contains a dangling goal relationship.", {
        transactionId, entityType: "protocol", entityId: protocolId,
      });
    }
    if (protocol.activationProvenance
      && protocol.activationProvenance.ownershipTransferred !== false) {
      throw stagedError("HISTORICAL_OWNERSHIP_IMMUTABLE", "Protocol provenance cannot transfer ownership.", {
        transactionId, entityType: "protocol", entityId: protocolId,
      });
    }
  }
  for (const commitment of stagedFounderStore.executionItems ?? []) {
    if (commitment.sourceProtocolId && !protocols.has(commitment.sourceProtocolId)) {
      throw stagedError("INTEGRITY_INVALID", "Commitment contains a dangling protocol relationship.", {
        transactionId, entityType: "commitment", entityId: commitment.id,
      });
    }
  }
  if (stableSerialize(snapshotEvidence(stagedFounderStore)) !== stableSerialize(evidenceSnapshot)) {
    throw stagedError("INTEGRITY_INVALID", "Evidence state cannot participate in activation staging.", {
      transactionId, entityType: "evidence",
    });
  }
}

function snapshotEvidence(store) {
  return {
    evidencePackages: structuredClone(store.evidencePackages ?? []),
    canonicalEvidenceObjects: structuredClone(store.canonicalEvidenceObjects ?? []),
    evidenceReviews: structuredClone(store.evidenceReviews ?? []),
    weightEntries: structuredClone(store.weightEntries ?? []),
    dexaScans: structuredClone(store.dexaScans ?? []),
    progressPhotos: structuredClone(store.progressPhotos ?? []),
    dailyCheckIns: structuredClone(store.dailyCheckIns ?? []),
    dailyBriefings: structuredClone(store.dailyBriefings ?? []),
    analyses: structuredClone(store.analyses ?? []),
    evidenceRelationships: structuredClone(store.evidenceRelationships ?? []),
  };
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function draftFingerprint(draft) {
  return createHash("sha256").update(stableSerialize(draft ?? null)).digest("hex");
}

function sameDraftContent(actual, expected) {
  const omit = (draft) => Object.fromEntries(
    Object.entries(draft ?? {}).filter(([key]) => !DRAFT_CONSUMPTION_FIELDS.has(key))
  );
  return stableSerialize(omit(actual)) === stableSerialize(omit(expected));
}

function stagedError(shortCode, message, context = {}) {
  return new ActivationStagedRepositoryError(
    ActivationStagedRepositoryErrorCode[shortCode] ?? shortCode,
    message,
    context
  );
}

function deepFreezeContract(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreezeContract);
  return value;
}
