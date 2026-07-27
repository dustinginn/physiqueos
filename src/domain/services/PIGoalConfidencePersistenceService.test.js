import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFounderStoreUnitOfWork,
  createNodeFounderStoreFileSystem,
} from "../../data/repositories/FounderStoreUnitOfWork";
import { createFounderRuntimeStore } from "../../data/repositories/founderRuntimeStore";
import { createGoalConfidenceRepository } from "../../data/repositories/GoalConfidenceRepository";
import { createPIGoalConfidenceAssessment } from "./PIGoalConfidenceAssessmentModel";
import {
  createPIGoalConfidenceContractFixture,
} from "../../fixtures/piGoalConfidenceAssessmentFixtures";
import {
  createPIGoalConfidenceContinuitySeed,
  createPIGoalConfidencePersistenceService,
  PIGoalConfidencePublicationOutcome,
} from "./PIGoalConfidencePersistenceService";
import { createPIGoalConfidenceReadService } from "./PIGoalConfidenceReadService";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("PI goal-confidence persistence", () => {
  it("hydrates missing confidence collections without fabricating records", () => {
    const source = store();
    delete source.goalConfidenceSnapshots;
    delete source.goalConfidenceHistory;
    delete source.goalConfidenceContinuitySeeds;
    const hydrated = createFounderRuntimeStore(source);
    expect(hydrated.goalConfidenceSnapshots).toEqual([]);
    expect(hydrated.goalConfidenceHistory).toEqual([]);
    expect(hydrated.goalConfidenceContinuitySeeds).toEqual([]);
    expect(source).not.toHaveProperty("goalConfidenceSnapshots");
  });

  it("publishes an initial assessment atomically and advances commit metadata once", async () => {
    const fixture = setup();
    const before = snapshot(fixture);
    const result = await fixture.service.publish(command(fixture));
    const saved = read(fixture);
    expect(result).toMatchObject({
      status: "published", committed: true, revision: 8, commitId: "commit-1",
    });
    expect(saved.goalConfidenceSnapshots).toHaveLength(1);
    expect(saved.goalConfidenceHistory).toHaveLength(1);
    expect(saved.goalConfidenceHistory[0].assessment)
      .toEqual(fixture.assessment);
    expect(saved.goalConfidenceSnapshots[0].historyRecordId)
      .toBe(saved.goalConfidenceHistory[0].id);
    expect(saved.revision).toBe(before.revision + 1);
    expect(saved.lastCommitId).not.toBe(before.lastCommitId);
    expect(saved.updatedAt).not.toBe(before.updatedAt);
    expect(fixture.liveStore).toEqual(saved);
  });

  it("supports an initial controlled legacy continuity seed without counting it as history", async () => {
    const fixture = setup({ seeded: true });
    const result = await fixture.service.publish(command(fixture, {
      continuitySeed: fixture.seed,
    }));
    const saved = read(fixture);
    expect(result.status).toBe("published");
    expect(saved.goalConfidenceContinuitySeeds).toHaveLength(1);
    expect(saved.goalConfidenceHistory).toHaveLength(1);
    expect(saved.goalConfidenceContinuitySeeds[0]).toMatchObject({
      sourceType: "controlled_reconciliation_seed",
      sourceModel: "overall_goal_confidence_v1",
      piDerived: false,
      canonicalAssessment: false,
      eligibleAsPriorScore: true,
    });
    expect(saved.goalConfidenceSnapshots[0].legacyContinuitySeedId)
      .toBe(fixture.seed.id);
    expect(saved.goalConfidenceHistory[0].assessment.score.prior).toBe(44);
    expect(saved.goalConfidenceHistory[0].assessment.score.priorScoreProvenance.source)
      .toBe("controlled_reconciliation_seed");
  });

  it("matches a duplicate seed deterministically and rejects a different duplicate", async () => {
    const fixture = setup({ seeded: true });
    await fixture.service.publish(command(fixture, {
      continuitySeed: fixture.seed,
    }));
    const matched = await fixture.service.publish(command(fixture, {
      expectedRevision: 8,
      expectedSemanticDigest: fixture.service.captureBaseline().semanticDigest,
      expectedCurrentSnapshot: read(fixture).goalConfidenceSnapshots[0],
      continuitySeed: fixture.seed,
    }));
    expect(matched.status).toBe("matched");

    const second = setup({
      persistedSeeds: [fixture.seed],
      assessment: fixture.assessment,
    });
    const different = { ...fixture.seed, score: 43 };
    const rejected = await second.service.publish(command(second, {
      continuitySeed: different,
    }));
    expect(rejected.status).toBe("duplicate_seed");
    expect(read(second).goalConfidenceHistory).toHaveLength(0);
  });

  it("publishes a successor, preserves history, and links the predecessor", async () => {
    const fixture = setup();
    await fixture.service.publish(command(fixture));
    const initialSaved = read(fixture);
    const predecessor = initialSaved.goalConfidenceSnapshots[0];
    const successor = successorAssessment(fixture.assessment, predecessor);
    const baseline = fixture.service.captureBaseline();
    const result = await fixture.service.publish(command(fixture, {
      operation: "publish_successor",
      assessment: successor,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      expectedCurrentSnapshot: predecessor,
      replacementAuthorized: true,
      publicationReason: "New prepared PI assessment.",
    }));
    const saved = read(fixture);
    expect(result).toMatchObject({ status: "published", revision: 9 });
    expect(saved.goalConfidenceHistory).toHaveLength(2);
    expect(saved.goalConfidenceSnapshots).toHaveLength(1);
    expect(saved.goalConfidenceSnapshots[0]).toMatchObject({
      currentAssessmentId: successor.id,
      previousCanonicalAssessmentId: fixture.assessment.id,
      currentScore: successor.score.current,
    });
    expect(saved.goalConfidenceHistory[1]).toMatchObject({
      predecessorAssessmentId: fixture.assessment.id,
      supersedesHistoryRecordId: saved.goalConfidenceHistory[0].id,
    });
    expect(saved.goalConfidenceHistory[0]).toEqual(initialSaved.goalConfidenceHistory[0]);
  });

  it("matches the current assessment without changing one byte or commit field", async () => {
    const fixture = setup();
    await fixture.service.publish(command(fixture));
    const before = fs.readFileSync(fixture.filePath);
    const baseline = fixture.service.captureBaseline();
    const result = await fixture.service.publish(command(fixture, {
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      expectedCurrentSnapshot: read(fixture).goalConfidenceSnapshots[0],
    }));
    const after = fs.readFileSync(fixture.filePath);
    expect(result).toMatchObject({ status: "matched", committed: false });
    expect(after.equals(before)).toBe(true);
    expect(read(fixture)).toMatchObject({
      revision: baseline.revision,
      lastCommitId: baseline.lastCommitId,
      updatedAt: baseline.updatedAt,
    });
  });

  it("rejects a historical replay without replacing the current snapshot", async () => {
    const fixture = setup();
    await fixture.service.publish(command(fixture));
    const first = read(fixture).goalConfidenceSnapshots[0];
    const secondAssessment = successorAssessment(fixture.assessment, first);
    let baseline = fixture.service.captureBaseline();
    await fixture.service.publish(command(fixture, {
      operation: "publish_successor",
      assessment: secondAssessment,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      expectedCurrentSnapshot: first,
      replacementAuthorized: true,
    }));
    baseline = fixture.service.captureBaseline();
    const before = fs.readFileSync(fixture.filePath);
    const replay = await fixture.service.publish(command(fixture, {
      assessment: fixture.assessment,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      expectedCurrentSnapshot: read(fixture).goalConfidenceSnapshots[0],
    }));
    expect(replay.status).toBe("historical_replay_conflict");
    expect(fs.readFileSync(fixture.filePath).equals(before)).toBe(true);
  });

  it.each([
    ["revision_conflict", { expectedRevision: 99 }],
    ["runtime_digest_conflict", { expectedSemanticDigest: "WRONG" }],
    ["snapshot_state_conflict", {
      expectedCurrentSnapshot: {
        id: "stale", currentAssessmentId: "stale",
        deterministicInputFingerprint: "stale",
      },
    }],
  ])("rejects %s without writes", async (status, override) => {
    const fixture = setup();
    const before = fs.readFileSync(fixture.filePath);
    const result = await fixture.service.publish(command(fixture, override));
    expect(result.status).toBe(status);
    expect(fs.readFileSync(fixture.filePath).equals(before)).toBe(true);
    expect(fixture.liveStore.goalConfidenceHistory).toHaveLength(0);
  });

  it.each([
    ["phase_mismatch", { phaseId: "another_phase" }],
    ["operating_state_mismatch", { operatingState: "active" }],
  ])("rejects %s without writes", async (status, assessmentOverride) => {
    const fixture = setup({
      assessment: createPIGoalConfidenceAssessment(
        createPIGoalConfidenceContractFixture("initial_no_prior",
          assessmentOverride)
      ),
    });
    const before = fs.readFileSync(fixture.filePath);
    const result = await fixture.service.publish(command(fixture));
    expect(result.status).toBe(status);
    expect(fs.readFileSync(fixture.filePath).equals(before)).toBe(true);
  });

  it("rejects invalid seed and predecessor relationships without writes", async () => {
    const seeded = setup({ seeded: true });
    const invalidSeed = await seeded.service.publish(command(seeded, {
      continuitySeedId: "missing",
    }));
    expect(invalidSeed.status).toBe("invalid_legacy_seed_reference");
    expect(read(seeded).goalConfidenceHistory).toHaveLength(0);

    const successor = setup();
    const invalidPredecessor = await successor.service.publish(command(successor, {
      operation: "publish_successor",
      replacementAuthorized: true,
    }));
    expect(invalidPredecessor.status).toBe("predecessor_conflict");
    expect(read(successor).goalConfidenceHistory).toHaveLength(0);
  });

  it("allows only one concurrent publication to commit", async () => {
    const fixture = setup();
    const prepared = command(fixture);
    const [left, right] = await Promise.all([
      fixture.service.publish(prepared),
      fixture.service.publish(prepared),
    ]);
    expect([left.status, right.status].filter((item) => item === "published"))
      .toHaveLength(1);
    expect([left.status, right.status].some((item) =>
      ["revision_conflict", "runtime_digest_conflict", "matched"].includes(item)))
      .toBe(true);
    const saved = read(fixture);
    expect(saved.goalConfidenceHistory).toHaveLength(1);
    expect(saved.goalConfidenceSnapshots).toHaveLength(1);
    expect(saved.revision).toBe(8);
  });

  it("rejects equal-revision semantic drift before commit", async () => {
    const fixture = setup({
      createUnitOfWork(options) {
        const unit = createFounderStoreUnitOfWork(options);
        return {
          ...unit,
          begin() {
            const tx = unit.begin();
            const commit = tx.commit.bind(tx);
            tx.commit = (options) => {
              const current = read(fixture);
              current.unrelatedSemanticDrift = true;
              fs.writeFileSync(fixture.filePath, `${JSON.stringify(current)}\n`);
              return commit(options);
            };
            return tx;
          },
        };
      },
    });
    const result = await fixture.service.publish(command(fixture));
    expect(result.status).toBe("runtime_digest_conflict");
    expect(read(fixture).goalConfidenceHistory ?? []).toHaveLength(0);
    expect(fixture.liveStore.goalConfidenceHistory).toHaveLength(0);
  });

  it.each([
    ["temporary-write failure", "write", "persistence_failure"],
    ["atomic-replacement failure", "atomicReplace", "persistence_failure"],
  ])("rolls back exactly on %s", async (_label, method, status) => {
    const node = createNodeFounderStoreFileSystem();
    const fileSystem = {
      ...node,
      [method]() {
        throw new Error(`forced ${method}`);
      },
    };
    const fixture = setup({
      unitOfWorkOptions: { fileSystem },
    });
    const before = fs.readFileSync(fixture.filePath);
    const liveBefore = structuredClone(fixture.liveStore);
    const result = await fixture.service.publish(command(fixture));
    expect(result.status).toBe(status);
    expect(fs.readFileSync(fixture.filePath).equals(before)).toBe(true);
    expect(fixture.liveStore).toEqual(liveBefore);
  });

  it("reports a committed publication failure without pretending rollback", async () => {
    const fixture = setup({
      unitOfWorkOptions: {
        publish() {
          throw new Error("forced live publication failure");
        },
      },
    });
    const result = await fixture.service.publish(command(fixture));
    expect(result).toMatchObject({
      status: "committed_publication_failure",
      committed: true,
    });
    expect(read(fixture).goalConfidenceHistory).toHaveLength(1);
    expect(fixture.liveStore.goalConfidenceHistory).toHaveLength(0);
  });

  it("prevents direct repository mutations outside a transaction", () => {
    const repository = createGoalConfidenceRepository();
    expect(() => repository.stageAppendHistory({ id: "history" }))
      .toThrow(/unit of work/);
    expect(() => repository.stageReplaceSnapshot({ id: "snapshot" }))
      .toThrow(/unit of work/);
    expect(() => repository.stageCreateContinuitySeed({ id: "seed" }))
      .toThrow(/unit of work/);
  });

  it("reads current, bounded history, prior assessment, and seed without Home fallback", async () => {
    const fixture = setup({ seeded: true });
    await fixture.service.publish(command(fixture, {
      continuitySeed: fixture.seed,
    }));
    const first = read(fixture).goalConfidenceSnapshots[0];
    const successor = successorAssessment(fixture.assessment, first);
    const baseline = fixture.service.captureBaseline();
    await fixture.service.publish(command(fixture, {
      operation: "publish_successor",
      assessment: successor,
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      expectedCurrentSnapshot: first,
      replacementAuthorized: true,
    }));
    const series = createPIGoalConfidenceReadService({
      store: read(fixture),
    }).getGoalConfidenceSeries({
      goalId: fixture.assessment.goalId,
      phaseId: fixture.assessment.phaseId,
      historyLimit: 2,
    });
    expect(series).toMatchObject({
      canonicalSeriesExists: true,
      legacySeedOnly: false,
      latestCanonicalAssessment: { id: successor.id },
      priorCanonicalAssessment: { id: fixture.assessment.id },
      continuitySeed: { id: fixture.seed.id },
    });
    expect(series.history).toHaveLength(2);

    const seedOnly = createPIGoalConfidenceReadService({
      store: {
        goalConfidenceContinuitySeeds: [fixture.seed],
      },
    }).getGoalConfidenceSeries({
      goalId: fixture.assessment.goalId,
      phaseId: fixture.assessment.phaseId,
    });
    expect(seedOnly).toMatchObject({
      canonicalSeriesExists: false,
      legacySeedOnly: true,
      currentSnapshot: null,
      latestCanonicalAssessment: null,
    });
    expect(seedOnly).not.toHaveProperty("legacyHomeConfidence");
  });

  it("never invokes scoring, raw evidence, or legacy onChange paths", async () => {
    const scoring = vi.fn(() => {
      throw new Error("scoring forbidden");
    });
    const rawEvidence = vi.fn(() => {
      throw new Error("raw evidence forbidden");
    });
    const onChange = vi.fn();
    const fixture = setup();
    const result = await fixture.service.publish(command(fixture, {
      scoring, rawEvidence, onChange,
    }));
    expect(result.status).toBe("published");
    expect(scoring).not.toHaveBeenCalled();
    expect(rawEvidence).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

function setup({
  seeded = false,
  persistedSeeds = [],
  assessment: suppliedAssessment,
  createUnitOfWork,
  unitOfWorkOptions = {},
} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-confidence-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const seedInput = {
    goalId: "goal_build_lean_mass",
    phaseId: "phase_establish_maintenance",
    operatingState: "calibration",
    score: 44,
    sourceTimestamp: "2026-07-25T21:13:27.000Z",
    reconciliationTimestamp: "2026-07-26T17:00:00.000Z",
    sourceFingerprint: "overall_goal_confidence_v1_fixture",
    createdAt: "2026-07-26T17:00:00.000Z",
  };
  const seed = createPIGoalConfidenceContinuitySeed(seedInput);
  const assessment = suppliedAssessment ??
    createPIGoalConfidenceAssessment(
      seeded
        ? createPIGoalConfidenceContractFixture("legacy_44_prior_provenance", {
          score: {
            current: 44,
            prior: 44,
            movementDirection: "held",
            movementMagnitude: "none",
            priorScoreProvenance: {
              source: "controlled_reconciliation_seed",
              assessmentId: seed.id,
              modelVersion: "overall_goal_confidence_v1",
            },
          },
        })
        : createPIGoalConfidenceContractFixture()
    );
  const liveStore = store({
    goalConfidenceContinuitySeeds: structuredClone(persistedSeeds),
  });
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  let commit = 0;
  const defaultFactory = (options) => createFounderStoreUnitOfWork({
    ...options,
    ...unitOfWorkOptions,
    createCommitId: () => `commit-${++commit}`,
    createTransactionId: () => `transaction-${commit + 1}`,
  });
  const fixture = {
    directory,
    filePath,
    liveStore,
    assessment,
    seed,
    service: null,
  };
  fixture.service = createPIGoalConfidencePersistenceService({
    filePath,
    liveStore,
    now: () => new Date(`2026-07-26T17:00:0${commit}.000Z`),
    createUnitOfWork: createUnitOfWork
      ? (options) => createUnitOfWork(options, fixture)
      : defaultFactory,
  });
  return fixture;
}

function store(overrides = {}) {
  return {
    version: "test",
    revision: 7,
    lastCommitId: "before",
    updatedAt: "2026-07-26T16:00:00.000Z",
    user: { id: "user" },
    goals: [{
      id: "goal_build_lean_mass",
      status: "active",
      type: "build_lean_mass",
      openingApproach: { value: "calibration" },
      phases: [{
        id: "phase_establish_maintenance",
        goalId: "goal_build_lean_mass",
        status: "active",
      }],
    }],
    goalConfidenceSnapshots: [],
    goalConfidenceHistory: [],
    goalConfidenceContinuitySeeds: [],
    ...overrides,
  };
}

function command(fixture, overrides = {}) {
  const baseline = fixture.service.captureBaseline();
  return {
    operation: "publish_initial",
    assessment: fixture.assessment,
    expectedRevision: baseline.revision,
    expectedSemanticDigest: baseline.semanticDigest,
    expectedCurrentSnapshot: null,
    publicationReason: "Isolated contract test.",
    replacementAuthorized: false,
    ...overrides,
  };
}

function successorAssessment(priorAssessment, snapshot) {
  return createPIGoalConfidenceAssessment(
    createPIGoalConfidenceContractFixture("increased", {
      score: {
        current: priorAssessment.score.current + 1,
        prior: priorAssessment.score.current,
        movementDirection: "increased",
        movementMagnitude: "small",
        priorScoreProvenance: {
          source: "canonical_pi_assessment",
          assessmentId: priorAssessment.id,
          modelVersion: "pi_goal_confidence_assessment_v1",
        },
      },
      evidenceCutoff: "2026-07-27T06:59:59.999Z",
      reasoning: {
        observations: [{
          id: "observation_training_successor",
          domain: "training",
          direction: "positive",
        }],
      },
      provenance: {
        sourceObservationIds: ["observation_training_successor"],
        sourceClaimIds: ["claim_training_constructive"],
        canonicalEvidenceReferences: [
          { id: "training_session_2", type: "training" },
        ],
        piDecisionResultId: "pi_decision_weekly_successor",
      },
    })
  );
}

function read(fixture) {
  return JSON.parse(fs.readFileSync(fixture.filePath, "utf8"));
}

function snapshot(fixture) {
  return structuredClone(read(fixture));
}
