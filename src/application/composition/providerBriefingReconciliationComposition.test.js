import { afterEach, describe, expect, it, vi } from "vitest";
import { createInterpretationV2Fixture } from
  "../../fixtures/interpretationV2Fixtures";
import { createBriefingForecastFinalizer } from
  "../../domain/confidence/BriefingForecastFinalizer";
import {
  BRIEFING_RECONCILIATION_WORK_ITEM_VERSION,
} from "../../domain/services/BriefingReconciliationWorkItemService";
import {
  createFounderBriefingReconciliationService,
} from "../../domain/services/FounderBriefingReconciliationService";
import {
  createProviderBriefingReconciliationDependencies,
  createProviderBriefingReconciliationService,
} from "./providerBriefingReconciliationComposition";

const USER = "user-one";
const ROOT = "weekly-one";
const NOW = "2026-08-30T20:00:00.000Z";

afterEach(() => {
  delete process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
});

describe("provider-native current-briefing reconciliation composition", () => {
  it("fails closed instead of constructing legacy persistence in provider full runtime", () => {
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    expect(() => createFounderBriefingReconciliationService({
      repositories: repositoriesFor({ dailyBriefings: [],
        briefingReconciliationWorkItems: [] }),
    })).toThrow(expect.objectContaining({
      code: "PROVIDER_BRIEFING_PERSISTENCE_REQUIRED",
    }));
  });

  it("constructs the production cadence executor from hydrated provider bindings", () => {
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    const store = providerStore();
    const bindings = providerBindings(store);
    expect(createProviderBriefingReconciliationService({
      repositories: repositoriesFor(store),
      runtimeBindings: bindings,
      now: () => new Date(NOW),
    })).toEqual(expect.objectContaining({ finalizePending: expect.any(Function) }));
    expect(bindings.createUnitOfWork).not.toHaveBeenCalled();
  });

  it("persists, publishes, and completes exact current work without touching historical work", async () => {
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    const store = providerStore();
    const bindings = providerBindings(store);
    const dependencies = createProviderBriefingReconciliationDependencies({
      runtimeBindings: bindings,
      now: sequenceClock(NOW),
    });
    const finalizer = createBriefingForecastFinalizer({
      publicationService: dependencies.publicationService,
      now: sequenceClock(NOW),
    });
    const cadence = providerCadenceService({ finalizer, store });
    const service = createFounderBriefingReconciliationService({
      repositories: repositoriesFor(store),
      persistence: dependencies.workItemPersistence,
      cadenceServices: { weekly: cadence },
      now: sequenceClock(NOW),
    });
    const currentWork = store.briefingReconciliationWorkItems[0];
    const historicalBefore = structuredClone(
      store.briefingReconciliationWorkItems[1]
    );

    const result = await service.finalizePending({
      userId: USER,
      workItemIds: [currentWork.id],
    });
    expect(result).toMatchObject({
      attempted: 1,
      completed: 1,
      failed: 0,
      status: "completed",
    });

    expect(cadence.prepareRegeneration).toHaveBeenCalledOnce();
    expect(cadence.executePreparedRegeneration).toHaveBeenCalledOnce();
    expect(store.briefingReconciliationWorkItems.find((item) =>
      item.id === currentWork.id)).toMatchObject({
        status: "current_after_revision",
        result: { publicationArtifactId: ROOT, noOp: false },
      });
    expect(store.briefingReconciliationWorkItems.find((item) =>
      item.id === historicalBefore.id)).toEqual(historicalBefore);
    expect(store.dailyBriefings).toHaveLength(1);
    expect(store.dailyBriefings[0]).toMatchObject({
      id: ROOT,
      revisionProvenance: {
        workItemId: currentWork.id,
        inputFingerprint: currentWork.inputFingerprint,
      },
    });
    expect(store.dailyBriefings[0].replacedBriefingHistory).toHaveLength(1);
    expect(store.goalConfidenceHistory).toHaveLength(2);
    expect(store.goalConfidenceSnapshots).toHaveLength(1);
    expect(store.goalConfidenceSnapshots[0].currentAssessmentId)
      .not.toBe("prior-assessment");
    expect(bindings.mutations.map((item) => item.operation)).toEqual([
      "briefing_reconciliation_state",
      "current_briefing_revision_publication",
      "briefing_reconciliation_state",
    ]);

    await expect(service.finalizePending({
      userId: USER,
      workItemIds: [currentWork.id],
    })).resolves.toMatchObject({ attempted: 0, completed: 0, failed: 0 });
    expect(store.dailyBriefings).toHaveLength(1);
    expect(store.dailyBriefings[0].replacedBriefingHistory).toHaveLength(1);
    expect(store.goalConfidenceHistory).toHaveLength(2);
    expect(bindings.mutations).toHaveLength(3);
  });
});

function providerCadenceService({ finalizer, store }) {
  return {
    prepareRegeneration: vi.fn(async (command) => ({ command })),
    executePreparedRegeneration: vi.fn(async ({ prepared }) => {
      const workItem = store.briefingReconciliationWorkItems.find((item) =>
        item.id === prepared.command.reconciliationContext.workItemId
      );
      const current = store.dailyBriefings.find((item) => item.id === ROOT);
      const artifact = {
        ...structuredClone(current),
        generatedAt: NOW,
        updatedAt: NOW,
        dependencyManifest: {
          fingerprint: "sha256_revised",
          canonicalDependencies: structuredClone(workItem.affectedDependencies),
        },
        publicationReconciliation: {
          state: "current_after_revision",
          replacementReason: "late_evidence_reconciliation",
        },
        revisionProvenance: {
          schemaVersion: "briefing_revision_provenance_v1",
          priorPublicationId: ROOT,
          priorPublicationVersion: "weekly_narrative_v5_2",
          replacementTimestamp: NOW,
          reason: "late_evidence_reconciliation",
          triggeringDependencies: structuredClone(workItem.affectedDependencies),
          workItemId: workItem.id,
          inputFingerprint: workItem.inputFingerprint,
        },
      };
      const baseline = finalizerBaseline(finalizer, store);
      const result = await finalizer.finalize(publicationRequest({
        artifact,
        baseline,
      }));
      const commit = result.commitResult;
      return {
        status: commit.status === "matched" ? "matched" : "regenerated",
        committed: commit.committed,
        artifact: commit.artifact,
      };
    }),
  };
}

function finalizerBaseline(_finalizer, store) {
  return {
    revision: store.revision,
    semanticDigest: undefined,
  };
}

function publicationRequest({ artifact, baseline }) {
  const input = createInterpretationV2Fixture();
  input.goalContract.timeline = {
    startDate: "2026-07-01",
    targetCompletionDate: "2026-12-31",
    currentPhase: { phaseId: "phase-one" },
  };
  return {
    publisherType: "weekly_briefing",
    userId: USER,
    occurrenceId: ROOT,
    artifactId: ROOT,
    cadenceOrEventType: "weekly",
    goalContract: input.goalContract,
    phaseId: "phase-one",
    strategyContext: input.strategyHypothesis,
    executionContext: input.executionState,
    evidenceDescriptors: input.evidenceDescriptors,
    previousCanonicalAssessment: priorAssessment(),
    evidenceWindow: {
      id: "weekly-window",
      start: "2026-08-23T00:00:00.000Z",
      cutoff: "2026-08-29T23:59:59.999Z",
      closed: true,
    },
    publicationCutoff: "2026-08-29T23:59:59.999Z",
    finalizedAt: NOW,
    idempotencyKey: "weekly-one|revision|sha256_revised",
    expectedPriorAssessmentId: "prior-assessment",
    expectedPriorArtifactId: ROOT,
    expectedRevision: baseline.revision,
    expectedSemanticDigest: baseline.semanticDigest,
    trajectorySegmentId: "trajectory_august",
    elapsedTimeAdequacy: "adequate",
    replacementAuthorized: true,
    replacesArtifactId: ROOT,
    replacesAssessmentId: "prior-assessment",
    sourceLineage: { reason: "late_evidence_reconciliation" },
    composeArtifact: () => ({ artifact }),
  };
}

function providerStore() {
  const prior = priorAssessment();
  const publication = {
    id: ROOT,
    userId: USER,
    artifactType: "scheduled",
    cadence: "weekly",
    generatedAt: "2026-08-30T15:00:00.000Z",
    updatedAt: "2026-08-30T15:00:00.000Z",
    evidenceWindow: {
      id: "weekly-window",
      cadence: "weekly",
      startDate: "2026-08-23",
      endDate: "2026-08-29",
      briefingDate: "2026-08-30",
      timeZone: "America/Los_Angeles",
      closed: true,
    },
    briefing: {
      version: "weekly_narrative_v5_2",
      weeklyNarrative: { goalConfidence: { assessmentId: prior.id } },
    },
    confidencePublication: {
      assessmentId: prior.id,
      publisherType: "weekly_briefing",
    },
    dependencyManifest: {
      schemaVersion: "briefing_dependency_manifest_v1",
      fingerprint: "sha256_prior_manifest",
      canonicalDependencies: [{
        logicalIdentity: "nutrition|2026-08-29",
        evidenceType: "nutrition",
        observedDate: "2026-08-29",
        semanticDigest: "sha256_nutrition",
      }],
    },
  };
  return {
    version: "provider-runtime-test",
    revision: 7,
    lastCommitId: "prior-commit",
    updatedAt: "2026-08-30T15:00:00.000Z",
    dailyBriefings: [publication],
    briefingReconciliationWorkItems: [
      pendingWorkItem(),
      { ...pendingWorkItem(), id: "historical-work",
        publicationRootId: "historical-weekly", status: "failed",
        failure: { retryable: true }, attempts: 1 },
    ],
    confidenceInitializationArtifacts: [],
    goalConfidenceHistory: [{
      id: "prior-history",
      assessmentId: prior.id,
      goalId: prior.goalId,
      phaseId: prior.phaseId,
      persistedAt: prior.provenance.generatedAt,
      assessment: prior,
    }],
    goalConfidenceSnapshots: [{
      id: "prior-snapshot",
      goalId: prior.goalId,
      phaseId: prior.phaseId,
      currentAssessmentId: prior.id,
      currentScore: prior.score.current,
      scoreBand: prior.score.band,
      historyRecordId: "prior-history",
      originatingArtifactId: ROOT,
    }],
    goalConfidenceContinuitySeeds: [],
  };
}

function pendingWorkItem() {
  return {
    schemaVersion: BRIEFING_RECONCILIATION_WORK_ITEM_VERSION,
    id: "current-work",
    publicationRootId: ROOT,
    userId: USER,
    occurrenceIdentity: "weekly-window",
    cadence: "weekly",
    reason: "late_evidence_reconciliation",
    status: "revision_pending",
    stableIdentityFingerprint: "sha256_stable",
    inputFingerprint: "sha256_input",
    sourceDependencyFingerprint: "sha256_prior_manifest",
    affectedDependencies: [{
      schemaVersion: "canonical_evidence_dependency_v1",
      canonicalObjectId: "training-session",
      logicalIdentity: "training|2026-08-29",
      evidenceType: "training",
      observedDate: "2026-08-29",
      semanticDigest: "sha256_training",
      semanticRevision: 1,
      semanticChangedAt: "2026-08-30T19:00:00.000Z",
      confirmedAt: "2026-08-30T19:00:00.000Z",
      sourceLinkage: { commitId: "evidence-commit" },
    }],
    sourceCommitLinks: ["evidence-commit"],
    attempts: 0,
    enqueuedAt: "2026-08-30T19:00:00.000Z",
    updatedAt: "2026-08-30T19:00:00.000Z",
    startedAt: null,
    completedAt: null,
    failure: null,
    result: null,
    completionHistory: [],
  };
}

function priorAssessment() {
  return {
    schemaVersion: "pi_goal_confidence_assessment_v1",
    id: "prior-assessment",
    goalId: "goal_build_muscle",
    phaseId: "phase-one",
    operatingState: "calibration",
    evidenceCutoff: "2026-08-29T15:00:00.000Z",
    score: {
      current: 55,
      prior: 50,
      band: "developing",
      movement: { direction: "held", magnitude: "none" },
    },
    contributors: [],
    unresolvedUncertainty: [],
    primaryReason: "Prior context.",
    provenance: { generatedAt: "2026-08-30T15:00:00.000Z" },
  };
}

function repositoriesFor(store) {
  return {
    briefingReconciliationWorkItems: {
      listWorkItems: async () =>
        structuredClone(store.briefingReconciliationWorkItems ?? []),
    },
    dailyBriefings: {
      listDailyBriefings: async () =>
        structuredClone(store.dailyBriefings ?? []),
    },
  };
}

function providerBindings(liveStore) {
  const mutations = [];
  const createUnitOfWork = vi.fn((options = {}) => ({
    begin() {
      const baseline = structuredClone(options.stageFrom ?? liveStore);
      const stagedState = structuredClone(baseline);
      let callbackResult;
      return {
        async mutate(callback) {
          callbackResult = await callback(stagedState);
          return callbackResult;
        },
        async commit({ validate, finalizeCandidate, validateFinalized } = {}) {
          const baselineCheck = options.validatePersistedBaseline?.(
            structuredClone(liveStore)
          );
          assertValid(baselineCheck);
          assertValid(await validate?.(structuredClone(stagedState)));
          const commitId = `provider-commit-${mutations.length + 1}`;
          const candidate = structuredClone(stagedState);
          candidate.revision = Number(baseline.revision ?? 0) + 1;
          candidate.updatedAt = NOW;
          candidate.lastCommitId = commitId;
          await finalizeCandidate?.({
            stagedState: candidate,
            expectedRevision: baseline.revision,
            candidateRevision: candidate.revision,
            commitId,
          });
          assertValid(await validateFinalized?.(structuredClone(candidate), {
            expectedRevision: baseline.revision,
            candidateRevision: candidate.revision,
            commitId,
          }));
          replace(liveStore, candidate);
          mutations.push({
            commitId,
            operation: options.lockContext?.operation ?? "founder-unit-of-work",
          });
          return {
            committed: true,
            commitId,
            revision: candidate.revision,
            result: callbackResult,
          };
        },
      };
    },
  }));
  return {
    runtimeStorePath: "provider://canonical-runtime",
    liveStore,
    createUnitOfWork,
    mutations,
  };
}

function replace(target, source) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, structuredClone(source));
}

function assertValid(result) {
  if (result === false || result?.valid === false) {
    throw new Error("Provider fixture validation failed.");
  }
}

function sequenceClock(start) {
  let offset = 0;
  return () => new Date(Date.parse(start) + offset++ * 1000);
}
