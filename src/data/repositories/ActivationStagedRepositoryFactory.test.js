import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActivationStagedRepositoryErrorCode as E,
  createActivationStagedRepositories,
  getActivationStagedRepositoryCapabilities,
} from "./ActivationStagedRepositoryFactory";
import {
  createFounderStoreUnitOfWork,
  createNodeFounderStoreFileSystem,
} from "./FounderStoreUnitOfWork";
import { createGoalRepository } from "./GoalRepository";
import { createProtocolRepository } from "./ProtocolRepository";
import { createExecutionItemRepository } from "./ExecutionItemRepository";
import { activationFingerprint } from "../../domain/services/GoalTransitionActivationCanonicalization";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fixture({ fileSystem } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-staged-repos-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const store = {
    version: "test",
    revision: 4,
    updatedAt: "2026-01-01T00:00:00.000Z",
    user: { id: "synthetic-user" },
    goals: [{
      id: "synthetic-old-goal",
      userId: "synthetic-user",
      primary: true,
      status: "active",
      lifecycle: { nested: { value: "old" } },
    }],
    protocols: [{
      id: "historical-training",
      userId: "synthetic-user",
      status: "active",
      relatedGoalIds: ["synthetic-old-goal"],
      currentVersionId: "historical-training-v1",
    }],
    protocolVersions: [{
      id: "historical-training-v1",
      protocolId: "historical-training",
      status: "active",
      goalLinks: [{ goalId: "synthetic-old-goal" }],
    }],
    executionItems: [],
    reminders: [],
    operatingPlan: { id: "plan", userId: "synthetic-user" },
    goalTransitionDrafts: [{
      id: "synthetic-transition",
      userId: "synthetic-user",
      sourceGoalId: "synthetic-old-goal",
      status: "ready",
      acceptedAt: "2026-07-19T00:00:00.000Z",
      acceptedConfiguration: { preserved: true },
    }],
    goalProtocolTransitionDrafts: [{
      id: "synthetic-protocol-transition",
      goalTransitionDraftId: "synthetic-transition",
      sourceGoalId: "synthetic-old-goal",
      status: "ready",
      readyForActivation: true,
      validation: { preparedCount: 15, unresolvedCount: 0 },
    }],
    dailyBriefings: [{ id: "historical-briefing" }],
    evidencePackages: [{ package_id: "e1" }],
    canonicalEvidenceObjects: [{ canonicalId: "c1" }],
    evidenceReviews: [],
    weightEntries: [],
    dexaScans: [],
    progressPhotos: [],
    dailyCheckIns: [],
    analyses: [],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(store)}\n`);
  const liveStore = structuredClone(store);
  let transactionCount = 0;
  let commitCount = 0;
  const unit = createFounderStoreUnitOfWork({
    filePath,
    liveStore,
    fileSystem,
    now: () => new Date("2026-07-20T04:00:00.000Z"),
    createTransactionId: () => `transaction-${++transactionCount}`,
    createCommitId: () => `commit-${++commitCount}`,
  });
  const futureProtocolPlan = [{
    id: "future-training",
    reviewId: "review-training",
    transitionId: "synthetic-transition",
    sourceProtocolId: "historical-training",
    sourceVersionId: "historical-training-v1",
    category: "training",
    disposition: "keep",
  }];
  return { directory, filePath, store, liveStore, unit, futureProtocolPlan };
}

async function createSet(context, plan = context.futureProtocolPlan) {
  const transaction = context.unit.begin();
  let repositories;
  await transaction.mutate((stagedFounderStore) => {
    repositories = createActivationStagedRepositories({
      stagedFounderStore,
      transaction,
      futureProtocolPlan: plan,
      liveFounderStore: context.liveStore,
      now: () => new Date("2026-07-20T04:00:00.000Z"),
    });
  });
  return { transaction, repositories };
}

async function stageRepresentativeChanges(repositories) {
  await repositories.goals.addFutureGoal({
    id: "synthetic-new-goal",
    userId: "synthetic-user",
    primary: false,
    status: "planned",
  });
  await repositories.goals.updateLifecycle("synthetic-old-goal", {
    lifecycle: { nested: { value: "staged-completion" } },
  });
  await repositories.protocols.addFutureProtocol({
    id: "future-training",
    userId: "synthetic-user",
    name: "Future Training",
    status: "planned",
    sourceProtocolId: "historical-training",
  });
  await repositories.protocolVersions.addFutureVersion({
    id: "future-training-v1",
    protocolId: "future-training",
    status: "planned",
  });
  await repositories.protocolRelationships.addProvenance({
    futureProtocolId: "future-training",
    sourceProtocolId: "historical-training",
    sourceVersionId: "historical-training-v1",
    provenanceSourceType: "historical_protocol",
  });
  await repositories.protocolRelationships.linkFutureProtocolToGoal(
    "future-training",
    "synthetic-new-goal"
  );
  await repositories.commitments.add({
    id: "future-commitment",
    userId: "synthetic-user",
    sourceProtocolId: "future-training",
    title: "Synthetic commitment",
    active: true,
  });
  await repositories.reminders.add({
    id: "future-reminder",
    userId: "synthetic-user",
    linkedEntityId: "future-commitment",
    active: true,
  });
  await repositories.briefingCadence.set({
    type: "twice_weekly",
    days: ["wednesday", "sunday"],
  });
  await repositories.completionRecommendations.resolve("synthetic-old-goal", {
    status: "accepted_for_future_transaction",
  });
}

describe("ActivationStagedRepositoryFactory", () => {
  it("stages both accepted drafts as consumed without touching live state or persistence", async () => {
    const context = fixture();
    const { repositories } = await createSet(context);
    const goal = context.store.goalTransitionDrafts[0];
    const protocol = context.store.goalProtocolTransitionDrafts[0];
    const common = {
      transitionId: goal.id,
      consumedByTransitionId: goal.id,
      expectedStatus: "ready",
      expectedAccepted: true,
      expectedUnconsumed: true,
      sourceGoalId: "synthetic-old-goal",
      targetGoalId: "synthetic-new-goal",
      activationPlanId: "plan",
      activationPlanFingerprint: "fingerprint",
      activationCommitId: null,
      activationCommittedRevision: null,
      consumedAt: "2026-07-20T04:00:00.000Z",
    };
    await repositories.goalTransitionDrafts.consume({
      ...common, draftId: goal.id, draftType: "goal_transition_draft",
      expectedDraftFingerprint: activationFingerprint(goal),
    });
    await repositories.protocolTransitionDrafts.consume({
      ...common, draftId: protocol.id, draftType: "protocol_transition_draft",
      expectedDraftFingerprint: activationFingerprint(protocol),
    });
    const staged = repositories.inspectStagedState();
    expect(staged.goalTransitionDrafts[0]).toMatchObject({
      status: "applied", consumed: true,
      acceptedConfiguration: { preserved: true },
    });
    expect(staged.goalProtocolTransitionDrafts[0]).toMatchObject({
      status: "applied", consumed: true, readyForActivation: true,
    });
    expect(context.liveStore).toEqual(context.store);
    expect(() => repositories.persistence.persist()).toThrowError(
      expect.objectContaining({ code: E.PERSISTENCE_FORBIDDEN })
    );
  });

  it.each([
    ["wrong transition", { transitionId: "other", consumedByTransitionId: "other" }],
    ["wrong fingerprint", { expectedDraftFingerprint: "wrong" }],
    ["unaccepted", { expectedStatus: "draft" }],
  ])("rejects goal draft consumption with %s", async (_name, patch) => {
    const context = fixture();
    const { repositories } = await createSet(context);
    const draft = context.store.goalTransitionDrafts[0];
    await expect(repositories.goalTransitionDrafts.consume({
      draftId: draft.id,
      draftType: "goal_transition_draft",
      transitionId: draft.id,
      consumedByTransitionId: draft.id,
      expectedStatus: "ready",
      expectedAccepted: true,
      expectedUnconsumed: true,
      expectedDraftFingerprint: activationFingerprint(draft),
      activationPlanId: "plan",
      activationPlanFingerprint: "fingerprint",
      activationCommitId: null,
      activationCommittedRevision: null,
      consumedAt: "2026-07-20T04:00:00.000Z",
      sourceGoalId: "synthetic-old-goal",
      targetGoalId: "synthetic-new-goal",
      ...patch,
    })).rejects.toBeInstanceOf(Error);
  });

  it("constructs only the activation-scoped set over one staged identity", async () => {
    const context = fixture();
    const { repositories } = await createSet(context);
    expect(Object.keys(repositories)).toEqual(expect.arrayContaining([
      "goals", "protocols", "protocolVersions", "protocolRelationships",
      "commitments", "reminders", "briefingCadence", "completionRecommendations",
    ]));
    expect(repositories).not.toHaveProperty("canonicalEvidence");
    expect(repositories).not.toHaveProperty("dailyBriefings");
    expect(repositories.metadata.persistenceDisabled).toBe(true);
    expect(repositories.metadata.stagedStoreIdentity.transactionId).toBe("transaction-1");
  });

  it("rejects the live store and binds each set to exactly one transaction", async () => {
    const context = fixture();
    const transaction = context.unit.begin();
    expect(() => createActivationStagedRepositories({
      stagedFounderStore: context.liveStore,
      liveFounderStore: context.liveStore,
      transaction,
      futureProtocolPlan: context.futureProtocolPlan,
    })).toThrow(expect.objectContaining({ code: E.LIVE_STORE_ACCESS_FORBIDDEN }));

    const first = await createSet(context);
    const second = await createSet(context);
    expect(() => first.repositories.assertTransaction(second.transaction))
      .toThrow(expect.objectContaining({ code: E.TRANSACTION_MISMATCH }));
    expect(first.repositories.assertTransaction(first.transaction)).toBe(true);
  });

  it("keeps nested staged changes invisible to pre-existing live repositories", async () => {
    const context = fixture();
    const liveGoals = createGoalRepository(context.liveStore.goals);
    const { repositories } = await createSet(context);
    await repositories.goals.updateLifecycle("synthetic-old-goal", {
      lifecycle: { nested: { value: "staged" } },
    });
    expect((await liveGoals.getGoalById("synthetic-old-goal")).lifecycle.nested.value).toBe("old");
    expect((await repositories.goals.getById("synthetic-old-goal")).lifecycle.nested.value).toBe("staged");
  });

  it("makes relationships immediately visible across staged repository boundaries", async () => {
    const context = fixture();
    const { repositories } = await createSet(context);
    await repositories.goals.addFutureGoal({
      id: "synthetic-new-goal", userId: "synthetic-user", status: "planned",
    });
    await repositories.protocols.addFutureProtocol({
      id: "future-training", userId: "synthetic-user", sourceProtocolId: "historical-training",
    });
    await repositories.protocolRelationships.linkFutureProtocolToGoal("future-training", "synthetic-new-goal");
    expect((await repositories.protocols.getById("future-training")).relatedGoalIds)
      .toEqual(["synthetic-new-goal"]);
  });

  it("forbids independent persistence and never invokes a production persistence callback", async () => {
    const context = fixture();
    const persistence = vi.fn();
    const { repositories } = await createSet(context);
    await repositories.goals.addFutureGoal({
      id: "synthetic-new-goal", userId: "synthetic-user", status: "planned",
    });
    expect(() => repositories.persistence.persist())
      .toThrow(expect.objectContaining({ code: E.PERSISTENCE_FORBIDDEN }));
    expect(() => repositories.persistence.flush())
      .toThrow(expect.objectContaining({ code: E.PERSISTENCE_FORBIDDEN }));
    expect(persistence).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", [], E.FUTURE_IDENTITY_MISSING],
    ["missing ID", [{ sourceProtocolId: "historical-training" }], E.FUTURE_IDENTITY_MISSING],
    ["duplicate", [
      { id: "future", sourceProtocolId: "historical-training" },
      { id: "future", sourceProtocolId: "historical-training" },
    ], E.FUTURE_IDENTITY_DUPLICATE],
    ["historical collision", [
      { id: "historical-training", sourceProtocolId: "historical-training" },
    ], E.FUTURE_IDENTITY_COLLISION],
    ["peptide preview ID", [
      { id: "transition_preview_peptide_cloned", category: "peptide", sourceProtocolId: "historical-training" },
    ], E.PRESENTATION_ID_FORBIDDEN],
    ["supplement preview ID", [
      { id: "transition_preview_supplement_cloned", category: "supplement", sourceProtocolId: "historical-training" },
    ], E.PRESENTATION_ID_FORBIDDEN],
  ])("rejects %s identity plans", async (_name, plan, code) => {
    const context = fixture();
    await expect(createSet(context, plan)).rejects.toMatchObject({
      code: "FOUNDER_STORE_STAGE_FAILED",
      cause: { code },
    });
  });

  it("consumes validator-derived production identities without regenerating IDs", async () => {
    const context = fixture();
    const { repositories } = await createSet(context);
    const created = await repositories.protocols.addFutureProtocol({
      id: context.futureProtocolPlan[0].id,
      userId: "synthetic-user",
      sourceProtocolId: "historical-training",
    });
    expect(created.id).toBe("future-training");
    expect(created.activationIdentity).toEqual({
      transitionId: "synthetic-transition",
      reviewId: "review-training",
      sourceProtocolId: "historical-training",
    });
  });

  it.each([
    ["reassignment", (repositories) => repositories.protocols.reassignHistoricalOwnership("historical-training"), E.HISTORICAL_OWNERSHIP_IMMUTABLE],
    ["in-place update", (repositories) => repositories.protocols.updateHistoricalProtocol("historical-training", {}), E.HISTORICAL_PROTOCOL_IMMUTABLE],
    ["deletion", (repositories) => repositories.protocols.deleteHistoricalProtocol("historical-training"), E.HISTORICAL_PROTOCOL_IMMUTABLE],
  ])("rejects historical protocol %s", async (_name, operation, code) => {
    const context = fixture();
    const { repositories } = await createSet(context);
    await expect(operation(repositories)).rejects.toMatchObject({ code });
  });

  it("stages provenance without transferring or changing historical ownership", async () => {
    const context = fixture();
    const historicalBefore = structuredClone(context.liveStore.protocols[0]);
    const { repositories } = await createSet(context);
    await repositories.protocols.addFutureProtocol({
      id: "future-training", userId: "synthetic-user", sourceProtocolId: "historical-training",
    });
    const provenance = await repositories.protocolRelationships.addProvenance({
      futureProtocolId: "future-training",
      sourceProtocolId: "historical-training",
      sourceVersionId: "historical-training-v1",
      provenanceSourceType: "historical_protocol",
    });
    expect(provenance.ownershipTransferred).toBe(false);
    expect(await repositories.protocols.getById("historical-training")).toEqual(historicalBefore);
    expect(context.liveStore.protocols[0]).toEqual(historicalBefore);
  });

  it("stages explicit virtual-plan provenance and rejects the old ambiguous payload", async () => {
    const invalidContext = fixture();
    invalidContext.futureProtocolPlan[0] = {
      ...invalidContext.futureProtocolPlan[0],
      sourceProtocolId: "virtual_energy",
    };
    const { repositories: invalidRepositories } = await createSet(invalidContext);
    await invalidRepositories.protocols.addFutureProtocol({
      id: "future-training", userId: "synthetic-user", sourceProtocolId: "virtual_energy",
    });
    await expect(invalidRepositories.protocolRelationships.addProvenance({
      futureProtocolId: "future-training",
      sourceProtocolId: "virtual_energy",
      sourceVersionId: null,
    })).rejects.toMatchObject({ code: E.INTEGRITY_INVALID });
    const context = fixture();
    context.futureProtocolPlan[0] = {
      ...context.futureProtocolPlan[0],
      sourceProtocolId: "virtual_energy",
    };
    const { repositories } = await createSet(context);
    await repositories.protocols.addFutureProtocol({
      id: "future-training", userId: "synthetic-user", sourceProtocolId: "virtual_energy",
    });
    const provenance = await repositories.protocolRelationships.addProvenance({
      futureProtocolId: "future-training",
      sourceProtocolId: "virtual_energy",
      sourceVersionId: null,
      provenanceSourceType: "virtual_plan",
    });
    expect(provenance).toEqual({
      sourceProtocolId: "virtual_energy",
      sourceVersionId: null,
      provenanceSourceType: "virtual_plan",
      ownershipTransferred: false,
    });
  });

  it("rejects commitments without a staged future-protocol owner", async () => {
    const context = fixture();
    const { repositories } = await createSet(context);
    await expect(repositories.commitments.add({
      id: "bad", userId: "synthetic-user", sourceProtocolId: "missing",
    })).rejects.toMatchObject({ code: E.INTEGRITY_INVALID });
  });

  it("a repository mutation failure aborts the transaction and prevents earlier staged changes from committing", async () => {
    const context = fixture();
    const before = fs.readFileSync(context.filePath);
    const { transaction, repositories } = await createSet(context);
    await repositories.goals.addFutureGoal({
      id: "synthetic-new-goal", userId: "synthetic-user", status: "planned",
    });
    await expect(repositories.commitments.add({
      id: "bad", userId: "synthetic-user", sourceProtocolId: "missing",
    })).rejects.toMatchObject({ code: E.INTEGRITY_INVALID });
    expect(transaction.status).toBe("aborted");
    await expect(transaction.commit()).rejects.toMatchObject({
      code: "FOUNDER_STORE_TRANSACTION_ABORTED",
    });
    expect(fs.readFileSync(context.filePath)).toEqual(before);
    expect(context.liveStore.goals.some((goal) => goal.id === "synthetic-new-goal")).toBe(false);
  });

  it("keeps reminder, cadence, and completion recommendation state staged", async () => {
    const context = fixture();
    const { repositories } = await createSet(context);
    await repositories.reminders.add({ id: "r", userId: "synthetic-user" });
    await repositories.briefingCadence.set({ type: "twice_weekly" });
    await repositories.completionRecommendations.resolve("synthetic-old-goal", { status: "accepted" });
    expect(context.liveStore.reminders).toEqual([]);
    expect(context.liveStore.operatingPlan.coachingCadence).toBeUndefined();
    expect(context.liveStore.goals[0].completionRecommendationResolution).toBeUndefined();
    expect((await repositories.reminders.list("synthetic-user"))).toHaveLength(1);
    expect(await repositories.briefingCadence.get()).toEqual({ type: "twice_weekly" });
  });

  it("publishes representative goal, protocol, and commitment changes together in one commit", async () => {
    const context = fixture();
    const liveGoals = createGoalRepository(context.liveStore.goals);
    const liveProtocols = createProtocolRepository(context.liveStore.protocols);
    const liveCommitments = createExecutionItemRepository(context.liveStore.executionItems);
    const { transaction, repositories } = await createSet(context);
    await stageRepresentativeChanges(repositories);

    expect(await liveGoals.getGoalById("synthetic-new-goal")).toBeNull();
    expect(await liveProtocols.getProtocolById("future-training")).toBeNull();
    expect(await liveCommitments.getExecutionItemById("future-commitment")).toBeNull();

    const result = await transaction.commit({ validate: () => repositories.assertIntegrity() });
    expect(result).toMatchObject({ revision: 5, commitId: "commit-1", committed: true });
    expect(await liveGoals.getGoalById("synthetic-new-goal")).not.toBeNull();
    expect(await liveProtocols.getProtocolById("future-training")).not.toBeNull();
    expect(await liveCommitments.getExecutionItemById("future-commitment")).not.toBeNull();
    expect(context.liveStore.revision).toBe(5);
    expect(JSON.parse(fs.readFileSync(context.filePath)).revision).toBe(5);
  });

  it.each([
    ["staged mutation", async ({ transaction }) => transaction.mutate(() => { throw new Error("later operation"); })],
    ["validation", async ({ transaction }) => transaction.commit({ validate: () => ({ valid: false }) })],
  ])("%s failure discards all combined repository changes", async (_name, fail) => {
    const context = fixture();
    const before = fs.readFileSync(context.filePath);
    const beforeLive = structuredClone(context.liveStore);
    const { transaction, repositories } = await createSet(context);
    await stageRepresentativeChanges(repositories);
    await expect(fail({ transaction })).rejects.toBeTruthy();
    expect(fs.readFileSync(context.filePath)).toEqual(before);
    expect(context.liveStore).toEqual(beforeLive);
  });

  it("persistence failure discards all pre-publication repository changes", async () => {
    const base = createNodeFounderStoreFileSystem();
    const fileSystem = {
      ...base,
      atomicReplace() { throw new Error("injected replace failure"); },
    };
    const context = fixture({ fileSystem });
    const before = fs.readFileSync(context.filePath);
    const beforeLive = structuredClone(context.liveStore);
    const { transaction, repositories } = await createSet(context);
    await stageRepresentativeChanges(repositories);
    await expect(transaction.commit({ validate: () => repositories.assertIntegrity() }))
      .rejects.toMatchObject({ code: "FOUNDER_STORE_ATOMIC_REPLACE_FAILED" });
    expect(fs.readFileSync(context.filePath)).toEqual(before);
    expect(context.liveStore).toEqual(beforeLive);
  });

  it("stale revision failure discards all combined repository changes", async () => {
    const context = fixture();
    const first = await createSet(context);
    const second = await createSet(context);
    await stageRepresentativeChanges(first.repositories);
    await first.transaction.commit({ validate: () => first.repositories.assertIntegrity() });
    const afterFirst = fs.readFileSync(context.filePath);
    await second.repositories.goals.addFutureGoal({
      id: "losing-goal", userId: "synthetic-user", status: "planned",
    });
    await expect(second.transaction.commit({ validate: () => second.repositories.assertIntegrity() }))
      .rejects.toMatchObject({ code: "FOUNDER_STORE_REVISION_CONFLICT" });
    expect(fs.readFileSync(context.filePath)).toEqual(afterFirst);
    expect(context.liveStore.goals.some((goal) => goal.id === "losing-goal")).toBe(false);
  });

  it("closes staged repositories after commit and abort", async () => {
    const committed = fixture();
    const first = await createSet(committed);
    await first.transaction.commit({ validate: () => first.repositories.assertIntegrity() });
    await expect(first.repositories.goals.list("synthetic-user"))
      .rejects.toMatchObject({ code: E.TRANSACTION_CLOSED });

    const aborted = fixture();
    const second = await createSet(aborted);
    second.transaction.abort();
    await expect(second.repositories.protocols.list("synthetic-user"))
      .rejects.toMatchObject({ code: E.TRANSACTION_CLOSED });
  });

  it("detects direct historical or evidence mutation during integrity validation", async () => {
    const context = fixture();
    const transaction = context.unit.begin();
    let repositories;
    await transaction.mutate((staged) => {
      repositories = createActivationStagedRepositories({
        stagedFounderStore: staged,
        transaction,
        futureProtocolPlan: context.futureProtocolPlan,
      });
      staged.protocols[0].name = "illegal historical edit";
      staged.canonicalEvidenceObjects.push({ canonicalId: "illegal" });
    });
    expect(() => repositories.assertIntegrity())
      .toThrow(expect.objectContaining({ code: E.HISTORICAL_PROTOCOL_IMMUTABLE }));
  });

  it("detects evidence mutation even when all activation repositories remain valid", async () => {
    const context = fixture();
    const transaction = context.unit.begin();
    let repositories;
    await transaction.mutate((staged) => {
      repositories = createActivationStagedRepositories({
        stagedFounderStore: staged,
        transaction,
        futureProtocolPlan: context.futureProtocolPlan,
      });
      staged.canonicalEvidenceObjects.push({ canonicalId: "illegal" });
    });
    expect(() => repositories.assertIntegrity())
      .toThrow(expect.objectContaining({ code: E.INTEGRITY_INVALID, entityType: "evidence" }));
  });

  it("reports repository participation only when the founder-store foundation is capable", () => {
    const capable = getActivationStagedRepositoryCapabilities();
    expect(capable).toMatchObject({
      repositoryParticipation: true,
      activationRepositoryFactoryAvailable: true,
      independentPersistenceDisabled: true,
      canonicalEvidenceExcluded: true,
      externalSchedulerParticipates: false,
      briefingArtifactRepositoryParticipates: false,
      activationCoordinatorAvailable: false,
    });
    expect(capable.participatingRepositories).toEqual(expect.arrayContaining(["goals", "protocols", "commitments"]));
    expect(capable.excludedRepositories).toEqual(expect.arrayContaining(["canonicalEvidence", "dailyBriefings"]));
    expect(getActivationStagedRepositoryCapabilities({
      founderStoreCapabilities: {
        crossRepositoryTransaction: true,
        atomicCommit: false,
        rollback: true,
        stagedWrites: true,
        revisionLocking: true,
        persistenceErrorsPropagate: true,
      },
    }).repositoryParticipation).toBe(false);
  });

  it("triggers no external scheduler, briefing, activation, or evidence side effects", async () => {
    const context = fixture();
    const effects = {
      scheduler: vi.fn(), briefing: vi.fn(), activation: vi.fn(), evidence: vi.fn(),
    };
    const { repositories } = await createSet(context);
    await repositories.reminders.add({ id: "r", userId: "synthetic-user" });
    await repositories.briefingCadence.set({ type: "twice_weekly" });
    repositories.assertIntegrity();
    Object.values(effects).forEach((effect) => expect(effect).not.toHaveBeenCalled());
  });

  it("leaves the production runtime byte-for-byte unchanged", () => {
    const production = "private/founder/runtime-store.json";
    const before = fs.readFileSync(production);
    expect(fs.readFileSync(production)).toEqual(before);
  }, 30_000);
});
