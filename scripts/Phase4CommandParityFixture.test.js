import { describe, expect, it } from "vitest";
import { createCanonicalPersistenceCommandPorts } from "../src/application/commands/CanonicalPersistenceCommandPorts.js";
import { createInMemoryCanonicalRecordStore } from "../src/platform/database/Phase4CanonicalRecordStore.js";
import {
  PHASE5_SYNTHETIC_OWNER_ID,
  createPhase5SyntheticRuntime,
} from "../src/platform/migration/phase5SyntheticPackage.js";
import {
  createPhase4CommandParityFixtureCollections,
  createPhase4CommandParityMemoryCollections,
} from "./phase4CommandParityFixture.mjs";

const now = () => new Date("2026-08-12T04:00:00.000Z");

describe("Phase 4 command-parity owner fixture", () => {
  it("seeds the exact synthetic package owner only into the in-memory parity side", () => {
    const runtime = createPhase5SyntheticRuntime({ recordsPerCollection: 1 });
    const fixtureCollections = createPhase4CommandParityFixtureCollections(runtime.user.id);
    const memoryCollections = createPhase4CommandParityMemoryCollections({
      canonicalOwner: runtime.user,
      expectedOwnerUserId: runtime.user.id,
      fixtureCollections,
    });

    expect(runtime.user.id).toBe(PHASE5_SYNTHETIC_OWNER_ID);
    expect(memoryCollections.user).toEqual([runtime.user]);
    expect(memoryCollections.user[0]).not.toBe(runtime.user);
    expect(fixtureCollections).not.toHaveProperty("user");
    expect(Object.values(fixtureCollections).flat()
      .every((record) => record.userId === runtime.user.id)).toBe(true);
    expect(memoryCollections).not.toHaveProperty("healthKitObservations");
  });

  it("allows the real canonical command path to resolve the package owner", async () => {
    const runtime = createPhase5SyntheticRuntime({ recordsPerCollection: 1 });
    const fixtureCollections = createPhase4CommandParityFixtureCollections(runtime.user.id);
    const records = createInMemoryCanonicalRecordStore(
      createPhase4CommandParityMemoryCollections({
        canonicalOwner: runtime.user,
        expectedOwnerUserId: runtime.user.id,
        fixtureCollections,
      })
    );

    await expect(createCanonicalPersistenceCommandPorts({ records, now }).submitWeight(
      commandContext(runtime.user.id)
    )).resolves.toMatchObject({ status: "committed" });
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
      canonicalOwner: createPhase5SyntheticRuntime({ recordsPerCollection: 1 }).user,
      expectedOwnerUserId: "different-synthetic-owner",
      fixtureCollections: createPhase4CommandParityFixtureCollections("different-synthetic-owner"),
    })).toThrow("owner identity does not match");
  });
});

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
