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

  it("looks the policy up every time outside a run, so a long-lived worker never sees a stale policy", async () => {
    const { records, spy } = tracked({ healthKitConfiguration: [policy()], healthKitCanonicalDays: [day("activity")] });
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    await reader.overlay(ordinary());
    await reader.overlay(ordinary());
    expect(spy.get).toHaveBeenCalledTimes(2);
    // The policy is switched off between two uses of the same reader instance.
    await records.put({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: HEALTHKIT_GRADUATION_POLICY_RECORD_ID, payload: policy({ projection: { enabled: false } }), expectedVersion: 1 });
    const objects = ordinary();
    expect(await reader.overlay(objects)).toBe(objects);
  });

  it("asks for the policy once per run and again after beginRun", async () => {
    const { records, spy } = tracked({ healthKitConfiguration: [policy()], healthKitCanonicalDays: [day("activity"), day("nutrition")] });
    const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
    reader.beginRun();
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

  describe("readSettlementCoverage (Briefing Evidence Settlement gate)", () => {
    it("returns no active domains, no coverage read, when evidence-eligibility is off", async () => {
      const { records, spy } = tracked({ healthKitConfiguration: [policy()], healthKitCanonicalDays: [day("activity"), day("nutrition")] });
      const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
      const result = await reader.readSettlementCoverage({ localDate: DATE });
      expect(result).toEqual({ activeDomains: [], domainStates: {} });
      expect(spy.list).not.toHaveBeenCalled();
    });

    it("returns coverage/identity/revision only, never an observed value, for each active domain", async () => {
      const { records } = tracked({
        healthKitConfiguration: [policy({ evidenceEligibility: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATE, endLocalDate: null } })],
        healthKitCanonicalDays: [day("activity"), day("nutrition")],
      });
      const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
      const result = await reader.readSettlementCoverage({ localDate: DATE });
      expect(result.activeDomains).toEqual(["activity", "nutrition"]);
      expect(result.domainStates.activity).toMatchObject({ present: true, coverage: "complete_day", revision: 1 });
      expect(result.domainStates.nutrition).toMatchObject({ present: true, coverage: "complete_day", revision: 1 });
      expect(JSON.stringify(result)).not.toMatch(/move_calories|dailyTotals|calories/);
    });

    it("restricts to only the domains actually in evidence-eligibility scope", async () => {
      const { records } = tracked({
        healthKitConfiguration: [policy({ evidenceEligibility: { enabled: true, domains: ["activity"], startLocalDate: DATE, endLocalDate: null } })],
        healthKitCanonicalDays: [day("activity"), day("nutrition")],
      });
      const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
      const result = await reader.readSettlementCoverage({ localDate: DATE, domains: ["activity", "nutrition"] });
      expect(result.activeDomains).toEqual(["activity"]);
      expect(result.domainStates).not.toHaveProperty("nutrition");
    });

    it("treats a date before the evidence-eligibility scope's startLocalDate as not applicable, not as unsettled", async () => {
      const { records } = tracked({
        healthKitConfiguration: [policy({ evidenceEligibility: { enabled: true, domains: ["activity"], startLocalDate: "2026-09-22", endLocalDate: null } })],
        healthKitCanonicalDays: [],
      });
      const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
      // The domain is graduated in general, but this specific date is before
      // graduation started — it must never sit waiting for evidence that was
      // never going to canonicalize.
      const result = await reader.readSettlementCoverage({ localDate: "2026-09-15", domains: ["activity"] });
      expect(result).toEqual({ activeDomains: [], domainStates: {} });
    });

    it("treats a date after the evidence-eligibility scope's endLocalDate as not applicable", async () => {
      const { records } = tracked({
        healthKitConfiguration: [policy({ evidenceEligibility: { enabled: true, domains: ["activity"], startLocalDate: "2026-01-01", endLocalDate: "2026-09-01" } })],
        healthKitCanonicalDays: [],
      });
      const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
      const result = await reader.readSettlementCoverage({ localDate: DATE, domains: ["activity"] });
      expect(result).toEqual({ activeDomains: [], domainStates: {} });
    });

    it("reports a missing domain as present:false rather than throwing", async () => {
      const { records } = tracked({
        healthKitConfiguration: [policy({ evidenceEligibility: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATE, endLocalDate: null } })],
        healthKitCanonicalDays: [day("activity")],
      });
      const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
      const result = await reader.readSettlementCoverage({ localDate: DATE });
      expect(result.domainStates.nutrition).toEqual({ present: false, coverage: "missing" });
    });

    it("only reads days for the requested local date, not the whole collection's dates", async () => {
      const { records } = tracked({
        healthKitConfiguration: [policy({ evidenceEligibility: { enabled: true, domains: ["activity"], startLocalDate: "2026-09-01", endLocalDate: null } })],
        healthKitCanonicalDays: [day("activity", "2026-09-20"), day("activity", DATE)],
      });
      const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
      const result = await reader.readSettlementCoverage({ localDate: DATE, domains: ["activity"] });
      expect(result.domainStates.activity.canonicalRecordId).toBe(`healthkit_canonical_day_activity_${DATE}`);
    });

    // Blocker 3: a failed read is NOT "nothing is HealthKit-backed". It returns an
    // explicit `readError` (class name/code only, never the driver's message) so the
    // gate can fail CLOSED before the hard deadline instead of generating.
    it("reports a read failure as an explicit readError, distinct from a legitimate 'no active domains'", async () => {
      const onError = vi.fn();
      const records = { get: async () => { throw Object.assign(new Error("connection refused host=db.internal password=x"), { code: "ECONNREFUSED" }); }, list: async () => [] };
      const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER, onError });
      const result = await reader.readSettlementCoverage({ localDate: DATE });
      expect(result).toEqual({ activeDomains: [], domainStates: {},
        readError: { stage: "settlement_coverage", name: "Error", code: "ECONNREFUSED" } });
      // The message (which may carry hosts/credentials/SQL) is never propagated.
      expect(JSON.stringify(result)).not.toMatch(/password|db\.internal|connection refused/iu);
      expect(onError).toHaveBeenCalledOnce();
    });

    it("a legitimate 'not applicable' result carries NO readError", async () => {
      const { records } = tracked({ healthKitConfiguration: [], healthKitCanonicalDays: [] });
      const reader = createHealthKitGraduationReader({ records, ownerUserId: OWNER });
      const result = await reader.readSettlementCoverage({ localDate: DATE });
      expect(result).toEqual({ activeDomains: [], domainStates: {} });
      expect(result).not.toHaveProperty("readError");
    });

    it("a failed canonical-day list (after a successful policy read) is also a readError", async () => {
      const { records } = tracked({
        healthKitConfiguration: [policy({ evidenceEligibility: { enabled: true, domains: ["activity"], startLocalDate: DATE, endLocalDate: null } })],
        healthKitCanonicalDays: [],
      });
      const failing = { ...records, list: async () => { throw new Error("timeout"); } };
      const reader = createHealthKitGraduationReader({ records: failing, ownerUserId: OWNER });
      const result = await reader.readSettlementCoverage({ localDate: DATE, domains: ["activity"] });
      expect(result.readError).toMatchObject({ stage: "settlement_coverage" });
    });

    it("an EVIDENCE overlay that silently degraded to ordinary evidence poisons settlement coverage until a later overlay reads successfully", async () => {
      const { records } = tracked({
        healthKitConfiguration: [policy({ evidenceEligibility: { enabled: true, domains: ["activity"], startLocalDate: DATE, endLocalDate: null } })],
        healthKitCanonicalDays: [day("activity")],
      });
      let failing = true;
      const flaky = { ...records, list: async (...args) => { if (failing) throw new Error("blip"); return records.list(...args); } };
      const reader = createHealthKitGraduationReader({ records: flaky, ownerUserId: OWNER });
      const ordinary = [];
      reader.beginRun();
      // The overlay itself stays fail-open to ordinary evidence (unchanged contract) ...
      expect(await reader.overlay(ordinary, { purpose: Purpose.EVIDENCE })).toBe(ordinary);
      // ... but the gate's own beginRun does not hide that this tick's evidence is degraded.
      reader.beginRun();
      const degraded = await reader.readSettlementCoverage({ localDate: DATE, domains: ["activity"] });
      expect(degraded.readError).toMatchObject({ stage: "evidence_overlay" });
      // A PROJECTION overlay failure never poisons it.
      // The next tick's successful evidence overlay clears it.
      failing = false;
      reader.beginRun();
      await reader.overlay(ordinary, { purpose: Purpose.EVIDENCE });
      const recovered = await reader.readSettlementCoverage({ localDate: DATE, domains: ["activity"] });
      expect(recovered).not.toHaveProperty("readError");
      expect(recovered.activeDomains).toEqual(["activity"]);
    });

    it("a failing PROJECTION overlay does not affect settlement coverage", async () => {
      const { records } = tracked({
        healthKitConfiguration: [policy({ projection: { enabled: true, domains: ["activity"], startLocalDate: DATE, endLocalDate: null },
          evidenceEligibility: { enabled: true, domains: ["activity"], startLocalDate: DATE, endLocalDate: null } })],
        healthKitCanonicalDays: [day("activity")],
      });
      let failing = false;
      const flaky = { ...records, list: async (...args) => { if (failing) throw new Error("blip"); return records.list(...args); } };
      const reader = createHealthKitGraduationReader({ records: flaky, ownerUserId: OWNER });
      failing = true;
      await reader.overlay([], { purpose: Purpose.PROJECTION });
      failing = false;
      expect(await reader.readSettlementCoverage({ localDate: DATE, domains: ["activity"] })).not.toHaveProperty("readError");
    });

    it("never writes anything", async () => {
      const memory = createInMemoryCanonicalRecordStore({
        healthKitConfiguration: [policy({ evidenceEligibility: { enabled: true, domains: ["activity"], startLocalDate: DATE, endLocalDate: null } })],
        healthKitCanonicalDays: [day("activity")],
      });
      const reader = createHealthKitGraduationReader({ records: memory, ownerUserId: OWNER });
      await reader.readSettlementCoverage({ localDate: DATE });
      expect(memory.getMutationCount()).toBe(0);
    });
  });
});
