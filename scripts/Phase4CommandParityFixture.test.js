import { describe, expect, it, vi } from "vitest";
import { createPayloadHash } from "../src/contracts/v1/canonicalJson.js";
import { createCanonicalPersistenceCommandPorts } from "../src/application/commands/CanonicalPersistenceCommandPorts.js";
import { createPhase3CommandService, Phase3Command } from "../src/application/commands/Phase3CommandService.js";
import {
  MORNING_CHECK_IN_BOUNDED_READ_COLLECTIONS,
} from "../src/domain/services/MorningCheckInPersistenceService.js";
import { createInMemoryCanonicalRecordStore } from "../src/platform/database/Phase4CanonicalRecordStore.js";
import { createInMemoryFoundationTransactionStore } from "../src/platform/commands/InMemoryFoundationTransactionStore.js";
import { FOUNDATION_SOURCE_COLLECTIONS } from "../src/platform/migration/foundationSourceCollections.js";
import {
  PHASE5_SYNTHETIC_OWNER_ID,
  createPhase5SyntheticRuntime,
} from "../src/platform/migration/phase5SyntheticPackage.js";
import {
  applyPhase4CommandParityFixtureOverlays,
  createPhase4CommandParityFixtureCollections,
  createPhase4CommandParityMemoryCollections,
} from "./phase4CommandParityFixture.mjs";

const now = () => new Date("2026-08-12T04:00:00.000Z");

describe("Phase 4 command-parity starting state", () => {
  it("seeds every canonical collection from the complete synthetic package", () => {
    const runtime = createPhase5SyntheticRuntime({ recordsPerCollection: 2 });
    const memoryCollections = createMemoryCollections(runtime);

    expect(runtime.user.id).toBe(PHASE5_SYNTHETIC_OWNER_ID);
    expect(Object.keys(memoryCollections).sort()).toEqual([...FOUNDATION_SOURCE_COLLECTIONS].sort());
    for (const collection of FOUNDATION_SOURCE_COLLECTIONS) {
      expect(memoryCollections[collection]).toEqual(asRecords(runtime[collection]));
    }
    for (const collection of MORNING_CHECK_IN_BOUNDED_READ_COLLECTIONS) {
      expect(memoryCollections).toHaveProperty(collection);
      expect(memoryCollections[collection]).toEqual(asRecords(runtime[collection]));
    }
    expect(memoryCollections.user).toEqual([runtime.user]);
    expect(memoryCollections.user[0]).not.toBe(runtime.user);
    expect(memoryCollections.weightEntries).toEqual(runtime.weightEntries);
    expect(memoryCollections.dailyCheckIns).toEqual(runtime.dailyCheckIns);
  });

  it("adds identical overlays without replacing or duplicating package records", async () => {
    const runtime = createPhase5SyntheticRuntime({ recordsPerCollection: 2 });
    const fixtureCollections = createPhase4CommandParityFixtureCollections(runtime.user.id);
    const left = createInMemoryCanonicalRecordStore(createMemoryCollections(runtime));
    const right = createInMemoryCanonicalRecordStore(createMemoryCollections(runtime));

    const [leftApplied, rightApplied] = await Promise.all([
      applyPhase4CommandParityFixtureOverlays({ records: left, ownerUserId: runtime.user.id, fixtureCollections }),
      applyPhase4CommandParityFixtureOverlays({ records: right, ownerUserId: runtime.user.id, fixtureCollections }),
    ]);

    expect(leftApplied).toEqual(rightApplied);
    expect(left.snapshot()).toEqual(right.snapshot());
    expect(left.snapshot().weightEntries).toEqual(runtime.weightEntries);
    expect(left.snapshot().dailyCheckIns).toEqual(runtime.dailyCheckIns);
    expect(left.snapshot().goals).toEqual([...runtime.goals, ...fixtureCollections.goals]);
    expect(new Set(left.snapshot().goals.map((record) => record.id)).size)
      .toBe(left.snapshot().goals.length);
  });

  it("preserves overlay source identity through the generic record-store boundary", async () => {
    const records = { put: vi.fn(async ({ payload }) => payload) };
    await applyPhase4CommandParityFixtureOverlays({
      records,
      ownerUserId: PHASE5_SYNTHETIC_OWNER_ID,
      fixtureCollections: {
        evidencePackages: [{
          id: "synthetic-source-overlay",
          userId: PHASE5_SYNTHETIC_OWNER_ID,
          version: 4,
          sourceIdentity: "synthetic-source-identity",
        }],
      },
    });

    expect(records.put).toHaveBeenCalledWith(expect.objectContaining({
      collection: "evidencePackages",
      recordId: "synthetic-source-overlay",
      sourceIdentity: "synthetic-source-identity",
    }));
  });

  it("returns the same complete unchanged Weight result and hash from equivalent package state", async () => {
    const runtime = createPhase5SyntheticRuntime({ recordsPerCollection: 3 });
    const [left, right] = await createEquivalentParityStores(runtime);

    const [leftResult, rightResult] = await Promise.all([
      executeWeight(left, "full-package-left"),
      executeWeight(right, "full-package-right"),
    ]);

    const expected = {
      status: "unchanged",
      weightId: null,
      weightRevision: null,
      checkInId: null,
      checkInRevision: null,
      analysisId: null,
      intendedDate: "2026-08-11",
      goalIds: [],
      continuationWorkItemIds: [],
    };
    expect(leftResult).toEqual(expected);
    expect(rightResult).toEqual(expected);
    expect(leftResult).toEqual(rightResult);
    expect(createPayloadHash(leftResult)).toBe(createPayloadHash(rightResult));
    expect(createPayloadHash(leftResult)).toBe("f910f9a52efad34e179c5a3995aa8c62a19501947edc13817dd311690c060b7a");
  });

  it("returns the same saved Weight result from equivalent package state with no prior Weight or check-in", async () => {
    const runtime = structuredClone(createPhase5SyntheticRuntime({ recordsPerCollection: 1 }));
    runtime.weightEntries = [];
    runtime.dailyCheckIns = [];
    const [left, right] = await createEquivalentParityStores(runtime);

    const [leftResult, rightResult] = await Promise.all([
      executeWeight(left, "empty-package-left"),
      executeWeight(right, "empty-package-right"),
    ]);

    expect(leftResult.status).toBe("saved");
    expect(leftResult.weightId).toBe("weight_2026_08_11");
    expect(leftResult.checkInId).toBe("daily_check_in_2026_08_11");
    expect(leftResult).toEqual(rightResult);
    expect(createPayloadHash(leftResult)).toBe(createPayloadHash(rightResult));
  });

  it("preserves RESOURCE_NOT_FOUND when the canonical owner is genuinely absent", async () => {
    const records = createInMemoryCanonicalRecordStore(
      createPhase4CommandParityFixtureCollections(PHASE5_SYNTHETIC_OWNER_ID)
    );

    await expect(createCanonicalPersistenceCommandPorts({ records, now }).submitWeight(
      commandContext(PHASE5_SYNTHETIC_OWNER_ID)
    )).rejects.toMatchObject({ status: 404, code: "RESOURCE_NOT_FOUND" });
  });

  it("rejects a package owner whose identity differs from the parity principal", () => {
    expect(() => createPhase4CommandParityMemoryCollections({
      packageCollections: createPhase5SyntheticRuntime({ recordsPerCollection: 1 }),
      expectedOwnerUserId: "different-synthetic-owner",
    })).toThrow("owner identity does not match");
  });
});

function createMemoryCollections(packageCollections) {
  return createPhase4CommandParityMemoryCollections({
    packageCollections,
    expectedOwnerUserId: packageCollections.user.id,
  });
}

async function createEquivalentParityStores(packageCollections) {
  const ownerUserId = packageCollections.user.id;
  const fixtureCollections = createPhase4CommandParityFixtureCollections(ownerUserId);
  const stores = [
    createInMemoryCanonicalRecordStore(createMemoryCollections(packageCollections)),
    createInMemoryCanonicalRecordStore(createMemoryCollections(packageCollections)),
  ];
  await Promise.all(stores.map((records) => applyPhase4CommandParityFixtureOverlays({
    records,
    ownerUserId,
    fixtureCollections,
  })));
  return stores;
}

async function executeWeight(records, identity) {
  const ownerUserId = PHASE5_SYNTHETIC_OWNER_ID;
  const commands = createPhase3CommandService({
    transactionRunner: createInMemoryFoundationTransactionStore(),
    ports: createCanonicalPersistenceCommandPorts({ records, now }),
  });
  const executed = await commands.execute({
    commandType: Phase3Command.SUBMIT_WEIGHT,
    principal: { userId: ownerUserId, deviceId: "phase4-device", sessionId: "phase4-session" },
    metadata: {
      commandId: "0198f100-0000-7000-8000-000000000001",
      idempotencyKey: `phase4-parity-${identity}`,
    },
    payload: { localDate: "2026-08-11", value: 180 },
  });
  return executed.receipt.result;
}

function commandContext(ownerUserId) {
  return {
    ownerUserId,
    principal: { userId: ownerUserId, deviceId: "phase4-device", sessionId: "phase4-session" },
    metadata: {
      commandId: "0198f100-0000-7000-8000-000000000001",
      idempotencyKey: "phase4-owner-fixture-regression",
      clientOccurredAt: "2026-08-12T04:00:00.000Z",
    },
    payload: { localDate: "2026-08-11", value: 180 },
  };
}

function asRecords(source) {
  if (source == null) return [];
  return Array.isArray(source) ? source : [source];
}
