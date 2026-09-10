import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";

const OWNER = "user_founder_001";

describe("Native daily evidence canonical command contracts", () => {
  it("keeps Nutrition same-day identity, exact retry, and correction history canonical", async () => {
    const records = createInMemoryCanonicalRecordStore({ canonicalEvidenceObjects: [], goals: [] });
    const ports = createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-09T18:00:00.000Z") });
    const first = await ports.upsertNutritionDay(context("nutrition-one", {
      localDate: "2026-09-09", dailyTotals: { calories: 2400, protein_g: 180 },
    }));
    const replay = await ports.upsertNutritionDay(context("nutrition-one", {
      localDate: "2026-09-09", dailyTotals: { calories: 2400, protein_g: 180 },
    }));
    const correction = await ports.upsertNutritionDay(context("nutrition-two", {
      localDate: "2026-09-09", dailyTotals: { calories: 2500, protein_g: 185 },
      expectedSemanticFingerprint: first.result.semanticFingerprint,
    }));
    const snapshot = records.snapshot().canonicalEvidenceObjects;
    expect(first.result).toMatchObject({ status: "changed", canonicalId: "nutrition|2026-09-09|nutrition-day", revision: 1 });
    expect(replay.result.status).toBe("unchanged");
    expect(correction.result).toMatchObject({ status: "changed", canonicalId: first.result.canonicalId, revision: 2 });
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].nutritionRevisionHistory).toHaveLength(1);
  });

  it("preserves HealthKit fingerprint, precedence, and replay-safe Activity identity", async () => {
    const records = createInMemoryCanonicalRecordStore({ canonicalEvidenceObjects: [], goals: [] });
    const ports = createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-09T18:00:00.000Z") });
    const payload = {
      localDate: "2026-09-09", sourceIdentity: "healthkit-day-2026-09-09",
      dailyActivity: { exercise_minutes: 45, move_calories: 700 },
      source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
    };
    const first = await ports.syncActivityDay(context("activity-one", payload));
    const replay = await ports.syncActivityDay(context("activity-one", payload));
    const snapshot = records.snapshot().canonicalEvidenceObjects;
    expect(first.result).toMatchObject({ status: "changed", canonicalId: "activity_day|2026-09-09", revision: 1 });
    expect(first.result.semanticFingerprint).toMatch(/^sha256_[a-f0-9]{64}$/);
    expect(replay.result.status).toBe("unchanged");
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].activityRevision.sourceClass).toBe("health_provider");
  });

  it("fails stale Nutrition and Activity corrections closed", async () => {
    const records = createInMemoryCanonicalRecordStore({ canonicalEvidenceObjects: [], goals: [] });
    const ports = createCanonicalPersistenceCommandPorts({ records });
    await ports.upsertNutritionDay(context("nutrition-first", { localDate: "2026-09-09", dailyTotals: { calories: 2400 } }));
    await expect(ports.upsertNutritionDay(context("nutrition-stale", {
      localDate: "2026-09-09", dailyTotals: { calories: 2500 }, expectedSemanticFingerprint: "sha256_stale",
    }))).rejects.toMatchObject({ code: "NUTRITION_REVISION_STALE" });
    await ports.syncActivityDay(context("activity-first", { localDate: "2026-09-09", sourceIdentity: "health-1", dailyActivity: { move_calories: 700 } }));
    await expect(ports.syncActivityDay(context("activity-stale", {
      localDate: "2026-09-09", sourceIdentity: "health-2", dailyActivity: { move_calories: 750 }, expectedSemanticFingerprint: "sha256_stale",
    }))).rejects.toMatchObject({ code: "ACTIVITY_REVISION_STALE" });
  });
});

function context(idempotencyKey, payload) {
  return {
    ownerUserId: OWNER,
    payload,
    principal: { userId: OWNER, deviceId: "native-device", sessionId: "native-session" },
    metadata: { idempotencyKey, clientTimeZone: "America/Los_Angeles" },
  };
}
