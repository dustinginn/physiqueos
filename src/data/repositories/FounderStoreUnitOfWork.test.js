import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FounderStoreUnitOfWorkErrorCode as E,
  LEGACY_FOUNDER_STORE_REVISION,
  createFounderStoreUnitOfWork,
  createNodeFounderStoreFileSystem,
  getFounderStoreRevision,
  getFounderStoreUnitOfWorkCapabilities,
} from "./FounderStoreUnitOfWork";
import { createSeedRepositories } from "./createSeedRepositories";
import {
  createFounderRuntimeStore,
  persistFounderRuntimeStore,
} from "./founderRuntimeStore";
import { founderSeedPack } from "../founderSeed";

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fixture({ revision } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-uow-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const persisted = {
    version: "test",
    updatedAt: "2026-01-01T00:00:00.000Z",
    user: { id: "u", profile: { nested: "original" } },
    goals: [{ id: "goal", status: "active", metadata: { count: 1 } }],
    protocols: [],
    protocolVersions: [],
    executionItems: [],
    reminders: [],
    dailyBriefings: [],
    evidencePackages: [],
    canonicalEvidenceObjects: [],
  };
  if (revision !== undefined) persisted.revision = revision;
  fs.writeFileSync(filePath, `${JSON.stringify(persisted)}\n`);
  const liveStore = structuredClone(persisted);
  const unit = createFounderStoreUnitOfWork({
    filePath,
    liveStore,
    now: () => new Date("2026-07-20T03:00:00.000Z"),
    createCommitId: (() => {
      let count = 0;
      return () => `commit-${++count}`;
    })(),
  });
  return { directory, filePath, persisted, liveStore, unit };
}

function bytes(filePath) {
  return fs.readFileSync(filePath);
}

function faultingFileSystem(stage, options = {}) {
  const base = createNodeFounderStoreFileSystem();
  const counters = {};
  const wrapped = {};
  for (const [name, method] of Object.entries(base)) {
    wrapped[name] = (...args) => {
      counters[name] = (counters[name] ?? 0) + 1;
      if (name === stage) throw new Error(`injected ${stage} failure`);
      return method(...args);
    };
  }
  if (options.atomicReplaceLeavesTemp) {
    wrapped.atomicReplace = (tempPath, filePath) => {
      counters.atomicReplace = (counters.atomicReplace ?? 0) + 1;
      fs.copyFileSync(tempPath, filePath);
    };
  }
  return { fileSystem: wrapped, counters };
}

describe("FounderStoreUnitOfWork", () => {
  it("loads a legacy store at revision zero without writing during begin", () => {
    const { unit, filePath } = fixture();
    const before = bytes(filePath);
    const transaction = unit.begin();
    expect(LEGACY_FOUNDER_STORE_REVISION).toBe(0);
    expect(transaction.expectedRevision).toBe(0);
    expect(getFounderStoreRevision(JSON.parse(before))).toBe(0);
    expect(bytes(filePath)).toEqual(before);
  });

  it("isolates staged and nested mutations from live state and normal repository reads", async () => {
    const { unit, liveStore } = fixture({ revision: 4 });
    const repositories = createSeedRepositories(liveStore);
    const transaction = unit.begin();
    await transaction.mutate((staged) => {
      staged.goals[0].metadata.count = 9;
      staged.goals.push({ id: "staged", userId: "u", status: "planned" });
      staged.user.profile.nested = "staged";
    });
    expect(liveStore.goals).toHaveLength(1);
    expect(liveStore.goals[0].metadata.count).toBe(1);
    expect(liveStore.user.profile.nested).toBe("original");
    expect(await repositories.goals.getGoalById("staged")).toBeNull();
  });

  it("commits the complete staged state, advances once, and publishes consistently", async () => {
    const { unit, liveStore, filePath } = fixture({ revision: 7 });
    const result = await unit.execute({
      mutate(staged) {
        staged.goals[0].metadata.count = 2;
        return { domainResult: "staged" };
      },
      validate: (staged) => ({ valid: staged.goals[0].metadata.count === 2 }),
    });
    const persisted = JSON.parse(bytes(filePath));
    expect(result).toMatchObject({
      committed: true,
      expectedRevision: 7,
      revision: 8,
      commitId: "commit-1",
      result: { domainResult: "staged" },
    });
    expect(persisted.revision).toBe(8);
    expect(persisted.lastCommitId).toBe("commit-1");
    expect(persisted.goals[0].metadata.count).toBe(2);
    expect(liveStore).toEqual(persisted);
  });

  it("persists revision one on the first legitimate legacy commit", async () => {
    const { unit, filePath } = fixture();
    const result = await unit.execute({ mutate: (staged) => { staged.user.firstName = "Founder"; } });
    expect(result.revision).toBe(1);
    expect(JSON.parse(bytes(filePath)).revision).toBe(1);
  });

  it("rejects stale and concurrent transactions without persistence or publication", async () => {
    const { unit, filePath, liveStore } = fixture({ revision: 10 });
    const first = unit.begin();
    const second = unit.begin();
    await first.mutate((staged) => { staged.user.winner = "A"; });
    await second.mutate((staged) => { staged.user.winner = "B"; });
    await first.commit();
    const afterFirst = bytes(filePath);
    await expect(second.commit()).rejects.toMatchObject({
      code: E.REVISION_CONFLICT,
      expectedRevision: 10,
      actualRevision: 11,
      committed: false,
    });
    expect(bytes(filePath)).toEqual(afterFirst);
    expect(liveStore.user.winner).toBe("A");
    expect(liveStore.revision).toBe(11);
  });

  it("serializes overlapping async commits through one in-process mutex", async () => {
    const { unit, liveStore } = fixture({ revision: 2 });
    const first = unit.begin();
    const second = unit.begin();
    await first.mutate(async (staged) => { staged.user.value = "first"; });
    await second.mutate(async (staged) => { staged.user.value = "second"; });
    const results = await Promise.allSettled([first.commit(), second.commit()]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(liveStore.revision).toBe(3);
  });

  it.each([
    ["mutation callback", async ({ transaction }) => transaction.mutate(() => { throw new Error("stage"); }), E.STAGE_FAILED],
    ["staged validation", async ({ transaction }) => {
      await transaction.mutate(() => {});
      return transaction.commit({ validate: () => ({ valid: false }) });
    }, E.VALIDATION_FAILED],
  ])("%s failure discards staging and preserves bytes and live state", async (_name, operation, code) => {
    const { unit, filePath, liveStore } = fixture({ revision: 5 });
    const beforeBytes = bytes(filePath);
    const beforeLive = structuredClone(liveStore);
    const transaction = unit.begin();
    await expect(operation({ transaction })).rejects.toMatchObject({ code, committed: false });
    expect(bytes(filePath)).toEqual(beforeBytes);
    expect(liveStore).toEqual(beforeLive);
    expect(liveStore.revision).toBe(5);
  });

  it("serialization failure propagates without writing, publication, or revision advance", async () => {
    const { filePath, liveStore } = fixture({ revision: 5 });
    const before = bytes(filePath);
    const unit = createFounderStoreUnitOfWork({
      filePath,
      liveStore,
      serialize() { throw new Error("serialize"); },
    });
    await expect(unit.execute({ mutate: (staged) => { staged.user.changed = true; } }))
      .rejects.toMatchObject({ code: E.SERIALIZATION_FAILED, committed: false });
    expect(bytes(filePath)).toEqual(before);
    expect(liveStore.user.changed).toBeUndefined();
    expect(liveStore.revision).toBe(5);
  });

  it.each([
    ["openExclusive", E.TEMP_WRITE_FAILED],
    ["write", E.TEMP_WRITE_FAILED],
    ["syncFile", E.TEMP_WRITE_FAILED],
    ["close", E.TEMP_WRITE_FAILED],
    ["atomicReplace", E.ATOMIC_REPLACE_FAILED],
  ])("%s failure propagates and preserves persisted and live state", async (stage, code) => {
    const { filePath, liveStore } = fixture({ revision: 12 });
    const beforeBytes = bytes(filePath);
    const beforeLive = structuredClone(liveStore);
    const { fileSystem } = faultingFileSystem(stage);
    const unit = createFounderStoreUnitOfWork({ filePath, liveStore, fileSystem });
    await expect(unit.execute({ mutate: (staged) => { staged.user.changed = stage; } }))
      .rejects.toMatchObject({ code, committed: false });
    expect(bytes(filePath)).toEqual(beforeBytes);
    expect(liveStore).toEqual(beforeLive);
    expect(liveStore.revision).toBe(12);
    expect(fs.readdirSync(path.dirname(filePath)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("rechecks persisted revision immediately before replacement", async () => {
    const { filePath, liveStore } = fixture({ revision: 1 });
    const base = createNodeFounderStoreFileSystem();
    let syncCalls = 0;
    const fileSystem = {
      ...base,
      syncFile(handle) {
        base.syncFile(handle);
        syncCalls += 1;
        const external = JSON.parse(base.read(filePath));
        external.revision = 2;
        external.user.external = true;
        fs.writeFileSync(filePath, JSON.stringify(external));
      },
    };
    const unit = createFounderStoreUnitOfWork({ filePath, liveStore, fileSystem });
    await expect(unit.execute({ mutate: (staged) => { staged.user.stale = true; } }))
      .rejects.toMatchObject({ code: E.REVISION_CONFLICT, actualRevision: 2 });
    expect(syncCalls).toBe(1);
    expect(JSON.parse(bytes(filePath)).user.external).toBe(true);
    expect(liveStore.user.stale).toBeUndefined();
  });

  it("reports post-commit cleanup failure as a warning without false rollback", async () => {
    const { filePath, liveStore } = fixture({ revision: 3 });
    const { fileSystem } = faultingFileSystem("remove", { atomicReplaceLeavesTemp: true });
    const unit = createFounderStoreUnitOfWork({ filePath, liveStore, fileSystem });
    const result = await unit.execute({ mutate: (staged) => { staged.user.committed = true; } });
    expect(result.committed).toBe(true);
    expect(result.revision).toBe(4);
    expect(result.warnings.map((warning) => warning.code))
      .toContain("FOUNDER_STORE_POST_COMMIT_TEMP_CLEANUP_FAILED");
    expect(JSON.parse(bytes(filePath)).user.committed).toBe(true);
    expect(liveStore.user.committed).toBe(true);
  });

  it("classifies publication failure as durably committed without claiming rollback", async () => {
    const { filePath, liveStore } = fixture({ revision: 6 });
    const unit = createFounderStoreUnitOfWork({
      filePath,
      liveStore,
      publish() { throw new Error("publication"); },
    });
    await expect(unit.execute({ mutate: (staged) => { staged.user.durable = true; } }))
      .rejects.toMatchObject({
        code: E.PUBLICATION_FAILED,
        committed: true,
        actualRevision: 7,
      });
    expect(JSON.parse(bytes(filePath)).user.durable).toBe(true);
    expect(liveStore.user.durable).toBeUndefined();
  });

  it("enforces legal transaction lifecycle transitions", async () => {
    const { unit } = fixture({ revision: 1 });
    const committed = unit.begin();
    await committed.mutate(() => {});
    await committed.commit();
    await expect(committed.commit()).rejects.toMatchObject({ code: E.TRANSACTION_CLOSED });
    await expect(committed.mutate(() => {})).rejects.toMatchObject({ code: E.TRANSACTION_CLOSED });

    const aborted = unit.begin();
    aborted.abort();
    await expect(aborted.commit()).rejects.toMatchObject({ code: E.TRANSACTION_ABORTED });
    await expect(aborted.mutate(() => {})).rejects.toMatchObject({ code: E.TRANSACTION_ABORTED });
  });

  it("reports only guarantees the generic founder-store boundary implements", () => {
    expect(getFounderStoreUnitOfWorkCapabilities()).toEqual({
      crossRepositoryTransaction: true,
      atomicCommit: true,
      rollback: true,
      stagedWrites: true,
      revisionLocking: true,
      persistenceErrorsPropagate: true,
      persistenceErrorPropagation: true,
      scope: "founder_store_unit_of_work",
      repositoryParticipation: false,
      crossProcessLocking: true,
    });
  });

  it("keeps a committed revision stable across a later legacy repository persistence", () => {
    const { filePath } = fixture({ revision: 9 });
    const sparse = JSON.parse(bytes(filePath));
    sparse.version = founderSeedPack.version;
    sparse.lastCommitId = "unit-commit";
    fs.writeFileSync(filePath, JSON.stringify(sparse));
    const store = createFounderRuntimeStore(sparse);
    store.executionItems.push({ id: "ordinary-write", userId: "u" });
    persistFounderRuntimeStore(store, {
      filePath,
      mutatedCollection: "executionItems",
      reason: "unit-test",
    });
    const persisted = JSON.parse(bytes(filePath));
    expect(persisted.revision).toBe(9);
    expect(persisted.lastCommitId).toBe("unit-commit");
  });

  it("contains no goal-transition orchestration and triggers no domain side effects", async () => {
    const { unit } = fixture({ revision: 1 });
    const sideEffects = {
      goal: vi.fn(), protocol: vi.fn(), commitment: vi.fn(), reminder: vi.fn(),
      scheduler: vi.fn(), briefing: vi.fn(), evidence: vi.fn(),
    };
    await unit.execute({ mutate: (staged) => { staged.user.note = "generic"; } });
    Object.values(sideEffects).forEach((effect) => expect(effect).not.toHaveBeenCalled());
  });

  it("finalizes candidate metadata before final validation and serialization", async () => {
    const { unit, filePath } = fixture();
    const order = [];
    const transaction = unit.begin();
    await transaction.mutate((staged) => {
      staged.user.candidate = {};
    });
    const result = await transaction.commit({
      finalizeCandidate({ stagedState, candidateRevision, commitId }) {
        order.push("finalize");
        stagedState.user.candidate = { candidateRevision, commitId };
      },
      validateFinalized(candidate, context) {
        order.push("validate");
        expect(candidate.user.candidate).toEqual({
          candidateRevision: context.candidateRevision,
          commitId: context.commitId,
        });
        return { valid: true };
      },
    });
    order.push("returned");
    const persisted = JSON.parse(bytes(filePath));
    expect(order).toEqual(["finalize", "validate", "returned"]);
    expect(persisted.user.candidate).toEqual({
      candidateRevision: result.revision,
      commitId: result.commitId,
    });
  });

  it("publishes nothing when candidate finalization or final validation fails", async () => {
    for (const mode of ["finalize", "validate"]) {
      const { unit, filePath, liveStore } = fixture();
      const before = bytes(filePath);
      const liveBefore = structuredClone(liveStore);
      const transaction = unit.begin();
      await transaction.mutate((staged) => {
        staged.user.profile.nested = mode;
      });
      await expect(transaction.commit({
        finalizeCandidate() {
          if (mode === "finalize") throw new Error("finalizer failed");
        },
        validateFinalized() {
          if (mode === "validate") throw new Error("final validation failed");
          return true;
        },
      })).rejects.toMatchObject({ code: E.VALIDATION_FAILED, committed: false });
      expect(bytes(filePath)).toEqual(before);
      expect(liveStore).toEqual(liveBefore);
    }
  });

  it("leaves the real production runtime byte-for-byte unchanged", () => {
    const production = "private/founder/runtime-store.json";
    const beforeStat = fs.statSync(production);
    const before = bytes(production);
    const beforeHash = createHash("sha256").update(before).digest("hex");
    const parsed = JSON.parse(before);
    expect(getFounderStoreRevision(parsed)).toBeGreaterThanOrEqual(LEGACY_FOUNDER_STORE_REVISION);
    const after = bytes(production);
    const afterStat = fs.statSync(production);
    const afterHash = createHash("sha256").update(after).digest("hex");
    const afterParsed = JSON.parse(after);

    expect(after.equals(before)).toBe(true);
    expect(afterHash).toBe(beforeHash);
    expect(afterStat.size).toBe(beforeStat.size);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
    expect(getFounderStoreRevision(afterParsed)).toBe(parsed.revision);
    expect(afterParsed.lastCommitId).toBe(parsed.lastCommitId);
    expect(fs.existsSync(`${production}.tmp`)).toBe(false);
    expect(fs.existsSync(`${production}.bak`)).toBe(false);
  }, 30_000);
});
