import { describe, expect, it, vi } from "vitest";
import { createInMemoryCanonicalRecordStore } from "./Phase4CanonicalRecordStore.js";
import { createHealthKitGraduationReader } from "./HealthKitGraduationReader.js";
import {
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  HealthKitGraduationPurpose as Purpose,
} from "../../domain/services/HealthKitGraduation.js";

const OWNER = "user_founder_001";
const DATE = "2026-09-21";

const policy = (overrides = {}) => ({
  id: HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  projection: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATE, endLocalDate: null },
  evidenceEligibility: { enabled: false },
  historicalBriefingRegeneration: false,
  ...overrides,
});

const day = (domain, date = DATE) => ({
  id: `healthkit_canonical_day_${domain}_${date}`,
  domain,
  localDate: date,
  userId: OWNER,
  revision: 1,
  semanticFingerprint: "sha256_x",
  createdAt: `${date}T15:00:00.000Z`,
  updatedAt: `${date}T15:00:00.000Z`,
  current: domain === "activity"
    ? { coverage: "complete_day", sourceRevision: 1, deliveryDeviceId: "d", basis: "b", values: { dailyActivity: { move_calories: 500 } } }
    : { coverage: "complete_day", sourceRevision: 1, deliveryDeviceId: "d", basis: "b", values: { dailyTotals: { calories: 2000 }, dailyTotalsScope: "full_day_summary", mealObjects: 0 } },
  provenance: { sourceObservationIds: ["healthkit_observation_x"] },
});

function tracked(collections) {
  const records = createInMemoryCanonicalRecordStore(collections);
  const spy = { get: vi.fn(records.get), list: vi.fn(records.list) };
  return { records: { ...records, get: spy.get, list: spy.list }, spy };
}

const ordinary = () => [{ canonicalId: "activity_day|2026-09-20", payload: { evidence_type: "activity_day", observed_at: "2026-09-20", daily_activity: { move_calories: 1 } }, quality: { status: "active" } }];

describe("HealthKit graduation reader", () => {
  it("returns the same array and never loads canonical days when the policy is absent", async () => {
    const { records, spy } = tracked({ healthKitConfiguration: [], healthKitCanonicalDays: [day("activity")] });
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    const objects = ordinary();
    expect(await reader.overlay(objects)).toBe(objects);
    expect(spy.get).toHaveBeenCalledTimes(1);
    expect(spy.list).not.toHaveBeenCalled();
  });

  it("overlays only the requested purpose and domains", async () => {
    const { records } = tracked({ healthKitConfiguration: [policy()], healthKitCanonicalDays: [day("activity"), day("nutrition")] });
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    const projected = await reader.overlay(ordinary(), { domains: ["nutrition"] });
    expect(projected.map((object) => object.payload.evidence_type)).toEqual(["activity_day", "nutrition"]);
    // Eligibility is off, so the strategic purpose sees nothing.
    const objects = ordinary();
    expect(await reader.overlay(objects, { purpose: Purpose.EVIDENCE })).toBe(objects);
  });

  it("asks for the policy once per run and again after beginRun", async () => {
    const { records, spy } = tracked({ healthKitConfiguration: [policy()], healthKitCanonicalDays: [day("activity"), day("nutrition")] });
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    await reader.overlay(ordinary(), { domains: ["nutrition"] });
    await reader.overlay(ordinary(), { domains: ["activity"] });
    expect(spy.get).toHaveBeenCalledTimes(1);
    reader.beginRun();
    await reader.overlay(ordinary());
    expect(spy.get).toHaveBeenCalledTimes(2);
  });

  it("uses a policy record the caller already loaded and skips the lookup", async () => {
    const { records, spy } = tracked({ healthKitConfiguration: [], healthKitCanonicalDays: [day("activity")] });
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    const withPolicy = await reader.overlay(ordinary(), { policyRecord: policy() });
    expect(withPolicy).toHaveLength(2);
    const objects = ordinary();
    expect(await reader.overlay(objects, { policyRecord: null })).toBe(objects);
    expect(spy.get).not.toHaveBeenCalled();
  });

  it("keeps a date-ordered read date-ordered without reordering existing rows", async () => {
    const { records } = tracked({ healthKitConfiguration: [policy()], healthKitCanonicalDays: [day("activity", "2026-09-21")] });
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    const original = [
      { canonicalId: "a1", payload: { evidence_type: "activity_day", observed_at: "2026-09-19" }, quality: { status: "active" } },
      { canonicalId: "a2", payload: { evidence_type: "activity_day", observed_at: "2026-09-22" }, quality: { status: "active" } },
    ];
    const result = await reader.overlay(original, { keepDateOrder: true, domains: ["activity"] });
    expect(result.map((object) => object.payload.observed_at)).toEqual(["2026-09-19", "2026-09-21", "2026-09-22"]);
    expect(result[0]).toBe(original[0]);
    expect(result[2]).toBe(original[1]);
  });

  it("fails closed to the ordinary evidence when reading graduation state fails", async () => {
    const onError = vi.fn();
    const records = { get: async () => { throw new Error("database unavailable"); }, list: async () => [] };
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER, onError });
    const objects = ordinary();
    expect(await reader.overlay(objects)).toBe(objects);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("never writes anything", async () => {
    const memory = createInMemoryCanonicalRecordStore({ healthKitConfiguration: [policy()], healthKitCanonicalDays: [day("activity")] });
    const reader = createHealthKitGraduationReader({ records: memory, ownerUserId: OWNER });
    await reader.overlay(ordinary());
    expect(memory.getMutationCount()).toBe(0);
  });
});
