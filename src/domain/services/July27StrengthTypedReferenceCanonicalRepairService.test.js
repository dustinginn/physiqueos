import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFounderStoreUnitOfWork,
  createNodeFounderStoreFileSystem,
} from "../../data/repositories/FounderStoreUnitOfWork";
import {
  createJuly27StrengthTypedReferenceCanonicalRepairService,
  JULY_27_CORRECTED_CANONICAL_ID,
  JULY_27_MALFORMED_CANONICAL_ID,
  JULY_27_REPAIR_MARKER_ID,
  JULY_27_STRENGTH_REPAIR_BASELINE,
  JULY_27_STRENGTH_REPAIR_REASON,
  JULY_27_STRENGTH_RESTORE_IDS,
  July27StrengthRepairState,
} from "./July27StrengthTypedReferenceCanonicalRepairService";

const runtimePath = "private/founder/runtime-store.json";
const backupPath =
  "private/founder/backups/PhysiqueOS_Backup_2026-07-25_19-27-05/optional-safe-runtime-export/runtime-store.json";
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fixture({ unitOfWork } = {}) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "july-27-strength-repair-")
  );
  directories.push(directory);
  const file = path.join(directory, "runtime-store.json");
  fs.copyFileSync(runtimePath, file);
  fs.utimesSync(file, new Date(), new Date(JULY_27_STRENGTH_REPAIR_BASELINE.modifiedAt));
  const liveStore = JSON.parse(fs.readFileSync(file, "utf8"));
  const backupBytes = fs.readFileSync(backupPath);
  const backupStore = JSON.parse(backupBytes);
  const service = createJuly27StrengthTypedReferenceCanonicalRepairService({
    runtimeStorePath: file,
    liveStore,
    backupStore,
    backupIdentity: {
      path: backupPath,
      fileHash: sha(backupBytes),
      revision: backupStore.revision,
    },
    now: () => new Date("2026-07-28T01:00:00.000Z"),
    createUnitOfWork:
      unitOfWork ??
      ((options) =>
        createFounderStoreUnitOfWork({
          ...options,
          createCommitId: () => "july-27-strength-repair-test-commit",
          createTransactionId: () => "july-27-strength-repair-test-transaction",
        })),
  });
  return { file, liveStore, backupStore, service };
}

function command(prepared) {
  return {
    expectedFileHash: prepared.baseline.fileHash,
    expectedSemanticDigest: prepared.baseline.semanticDigest,
    expectedRevision: prepared.baseline.revision,
    expectedLastCommitId: prepared.baseline.lastCommitId,
    malformedAggregateId: JULY_27_MALFORMED_CANONICAL_ID,
    restoreIds: [...JULY_27_STRENGTH_RESTORE_IDS],
    correctedCanonicalId: JULY_27_CORRECTED_CANONICAL_ID,
    eventIds: [...prepared.eventIds],
    repairReason: JULY_27_STRENGTH_REPAIR_REASON,
    preparationFingerprint: prepared.fingerprint,
    acceptRecord22Reconstruction: true,
    acceptProductionMutation: true,
    stopOnConflict: true,
    preparedAt: "2026-07-28T00:00:00.000Z",
  };
}

describe("July27StrengthTypedReferenceCanonicalRepairService", () => {
  it("classifies the exact malformed Founder state and prepares deterministically", () => {
    const { service } = fixture();
    const left = service.prepare({ preparedAt: "2026-07-28T00:00:00.000Z" });
    const right = service.prepare({ preparedAt: "2026-07-28T00:00:00.000Z" });

    expect(left.classification.state).toBe(July27StrengthRepairState.ELIGIBLE);
    expect(right.fingerprint).toBe(left.fingerprint);
    expect(left.plan).toMatchObject({
      removeMalformedAggregates: 1,
      restoreHistoricalRecords: 22,
      backupRestoredRecords: 21,
      semanticallyReconstructedRecords: 1,
      createCanonicalSessions: 1,
      createPerformanceEvents: 6,
      correctedExerciseCount: 3,
      correctedSetCount: 12,
    });
    expect(left.correctedSession.payload.exercises.map((exercise) => [
      exercise.canonicalExerciseId,
      exercise.sets.length,
    ])).toEqual([
      ["shoulder_press_machine", 4],
      ["lateral_raise_machine", 4],
      ["cable_machine_front_raise", 4],
    ]);
    expect(left.events).toHaveLength(6);
  });

  it("uses backup proof for records 1-21 and an explicit bounded reconstruction for record 22", () => {
    const { service, backupStore } = fixture();
    const prepared = service.prepare();
    const backupById = new Map(
      backupStore.canonicalEvidenceObjects.map((record) => [
        record.canonicalId,
        record,
      ])
    );

    expect(prepared.restoration.backupProofs).toHaveLength(21);
    for (const record of prepared.restoration.records.slice(0, 21)) {
      expect(record).toEqual(backupById.get(record.canonicalId));
      expect(record.quality.status).toBe("active");
    }
    expect(prepared.restoration.record22Proof).toMatchObject({
      classification: "audited_semantic_reconstruction",
      canonicalId: JULY_27_STRENGTH_RESTORE_IDS[21],
      changedFields: [
        "quality.status",
        "quality.reason",
        "quality.supersededBy",
        "quality.supersededAt",
      ],
    });
    expect(prepared.restoration.records[21].quality).toEqual({
      status: "active",
    });
  });

  it("atomically creates one corrected session, six events, and one durable audit", async () => {
    const { file, service } = fixture();
    const prepared = service.prepare({
      preparedAt: "2026-07-28T00:00:00.000Z",
    });
    const result = await service.execute(command(prepared));
    const persisted = JSON.parse(fs.readFileSync(file, "utf8"));

    expect(result).toMatchObject({
      outcome: "repaired",
      committed: true,
      previousRevision: 33,
      revision: 34,
    });
    expect(
      persisted.canonicalEvidenceObjects.filter(
        (record) => record.canonicalId === JULY_27_MALFORMED_CANONICAL_ID
      )
    ).toHaveLength(0);
    expect(
      persisted.canonicalEvidenceObjects.filter(
        (record) => record.canonicalId === JULY_27_CORRECTED_CANONICAL_ID
      )
    ).toHaveLength(1);
    expect(persisted.trainingPerformanceEvents).toHaveLength(17);
    expect(
      persisted.trainingPerformanceEvents.filter((event) =>
        prepared.eventIds.includes(event.id)
      )
    ).toHaveLength(6);
    expect(
      persisted.migrationMarkers.find(
        (marker) => marker.id === JULY_27_REPAIR_MARKER_ID
      )
    ).toMatchObject({
      fingerprint: prepared.fingerprint,
      executionRevision: 34,
      executionCommitId: "july-27-strength-repair-test-commit",
    });
  });

  it("is byte-stable on replay and does not advance revision twice", async () => {
    const { file, backupStore, service } = fixture();
    const prepared = service.prepare({
      preparedAt: "2026-07-28T00:00:00.000Z",
    });
    await service.execute(command(prepared));
    const beforeReplay = fs.readFileSync(file);
    const reloaded = JSON.parse(beforeReplay);
    const replay = createJuly27StrengthTypedReferenceCanonicalRepairService({
      runtimeStorePath: file,
      liveStore: reloaded,
      backupStore,
    });

    expect(await replay.execute(command(prepared))).toMatchObject({
      outcome: "already_repaired",
      committed: false,
    });
    expect(fs.readFileSync(file)).toEqual(beforeReplay);
  }, 60_000);

  it("rejects drift and incomplete authorization without writing", async () => {
    const { file, service } = fixture();
    const original = fs.readFileSync(file);
    const prepared = service.prepare();
    await expect(
      service.execute({
        ...command(prepared),
        expectedRevision: 32,
      })
    ).rejects.toThrow("execution_argument:expectedRevision");
    expect(fs.readFileSync(file)).toEqual(original);

    const drifted = JSON.parse(original);
    drifted.revision += 1;
    fs.writeFileSync(file, JSON.stringify(drifted));
    expect(service.audit().classification.state).toBe(
      July27StrengthRepairState.PROTECTED_DRIFT
    );
  }, 60_000);

  it("rolls back an atomic persistence failure and reports publication failure after commit", async () => {
    const failingFileSystem = createNodeFounderStoreFileSystem();
    failingFileSystem.atomicReplace = () => {
      throw new Error("simulated atomic replacement failure");
    };
    const persistenceFixture = fixture({
      unitOfWork: (options) =>
        createFounderStoreUnitOfWork({
          ...options,
          fileSystem: failingFileSystem,
        }),
    });
    const persistenceBefore = fs.readFileSync(persistenceFixture.file);
    const persistencePrepared = persistenceFixture.service.prepare();
    expect(
      await persistenceFixture.service.execute(command(persistencePrepared))
    ).toMatchObject({ outcome: "persistence_failure", committed: false });
    expect(fs.readFileSync(persistenceFixture.file)).toEqual(persistenceBefore);

    const publicationFixture = fixture({
      unitOfWork: (options) =>
        createFounderStoreUnitOfWork({
          ...options,
          createCommitId: () => "publication-failure-commit",
          publish: () => {
            throw new Error("simulated publication failure");
          },
        }),
    });
    const publicationPrepared = publicationFixture.service.prepare();
    expect(
      await publicationFixture.service.execute(command(publicationPrepared))
    ).toMatchObject({
      outcome: "publication_failure",
      committed: true,
      commitId: "publication-failure-commit",
    });
    expect(JSON.parse(fs.readFileSync(publicationFixture.file, "utf8")).revision)
      .toBe(34);
  }, 60_000);

  it("never mutates the Founder runtime during isolated validation", () => {
    const before = fs.readFileSync(runtimePath);
    const { service } = fixture();
    service.audit();
    service.prepare();
    expect(fs.readFileSync(runtimePath)).toEqual(before);
  }, 60_000);
});

function sha(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}
