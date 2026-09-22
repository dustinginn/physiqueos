import { describe, expect, it, vi } from "vitest";

const captured = {};
vi.mock("../../domain/services/BriefingCadenceExecutorService", () => ({
  createBriefingCadenceExecutor: (options) => ({
    async execute() {
      captured.repositories = options.repositories;
      captured.generators = options.generators;
      return { ok: true };
    },
  }),
}));
vi.mock("../../domain/services/WeeklyNarrativeService", () => ({
  createWeeklyNarrativeService: (options) => { captured.weekly = options; return {}; },
}));
vi.mock("../../domain/services/MidweekBriefingService", () => ({
  createMidweekBriefingService: (options) => { captured.midweek = options; return {}; },
}));
vi.mock("../../domain/services/MonthlyBriefingService", () => ({
  createFounderMonthlyBriefingService: (options) => { captured.monthly = options; return {}; },
}));
vi.mock("../../domain/services/CanonicalBriefingConfidencePublicationService", () => ({
  createCanonicalBriefingConfidencePublicationService: (options) => { captured.publication = options; return {}; },
}));
vi.mock("../../domain/services/PICadenceBriefingLifecycleService", () => ({
  createPICadenceBriefingLifecycleService: () => ({}),
}));
vi.mock("../../platform/database/PostgresBriefingCadenceExecution", () => ({
  createPostgresBriefingCadenceExecutionLock: () => ({}),
  createPostgresBriefingCadenceExecutionStore: () => ({}),
}));

import { createProviderBriefingCadenceRunner } from "./providerBriefingCadenceComposition.js";
import {
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID as POLICY_ID,
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION as SCHEMA,
} from "../../domain/services/HealthKitGraduation.js";

const OWNER = "user_founder_001";
const DATE = "2026-09-21";
const policy = (evidenceEligibility, projection = { enabled: false }) => ({
  id: POLICY_ID, schemaVersion: SCHEMA, version: 1, historicalBriefingRegeneration: false, projection, evidenceEligibility,
});
const on = { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATE, endLocalDate: null };
const day = (domain, coverage = "complete_day") => ({
  id: `healthkit_canonical_day_${domain}_${DATE}`, domain, localDate: DATE, userId: OWNER, revision: 1, version: 1, semanticFingerprint: "s",
  createdAt: `${DATE}T15:00:00.000Z`, updatedAt: `${DATE}T22:00:00.000Z`,
  current: domain === "activity"
    ? { coverage, sourceRevision: 1, deliveryDeviceId: "d", basis: "b", values: { dailyActivity: { move_calories: 612, exercise_minutes: 41, stand_hours: 11 } } }
    : { coverage, sourceRevision: 1, deliveryDeviceId: "d", basis: "b", values: { dailyTotals: { calories: 2140 }, dailyTotalsScope: coverage === "complete_day" ? "full_day_summary" : "partial_meal_subtotal", mealObjects: 0 } },
  provenance: { sourceObservationIds: ["healthkit_observation_x"] },
});

async function run({ policyRecord = null, days = [] } = {}) {
  const runtime = { user: { id: OWNER, timeZone: "America/Los_Angeles" }, canonicalEvidenceObjects: [] };
  const pool = { query: vi.fn(async (text, values = []) => {
    if (/record_id=\$3/.test(text)) return { rows: policyRecord ? [{ payload: policyRecord, version: 1 }] : [] };
    if (values[1] === "healthKitCanonicalDays") return { rows: days.map((payload) => ({ payload, version: 1 })) };
    return { rows: [] };
  }) };
  const authorityStore = { read: async () => ({ state: {
    authority: "provider-authoritative", workerAuthority: "provider", publicRuntimeAuthority: "provider", canonicalStoreEpoch: "postgres-canonical",
    firstProviderCanonicalWriteAt: "2026-09-01T00:00:00.000Z", firstProviderCommandId: "cmd",
  } }) };
  const runner = createProviderBriefingCadenceRunner({
    pool, ownerUserId: OWNER, authorityStore,
    loadCanonicalRuntime: async () => runtime,
    loadCanonicalCommitBindings: async () => ({ mutateCanonicalRuntime: async () => ({}) }),
  });
  await runner.execute({ asOf: new Date("2026-09-22T10:00:00.000Z") });
  const seen = await captured.repositories.canonicalEvidence.listCanonicalEvidenceObjects(OWNER);
  return { runtime, seen };
}

describe("provider briefing cadence: graduated HealthKit evidence", () => {
  it("is unchanged when graduation is absent", async () => {
    const { seen } = await run({ days: [day("activity")] });
    expect(seen).toEqual([]);
  });

  it("gives generators complete graduated days as ordinary evidence only under the eligibility scope", async () => {
    const { seen, runtime } = await run({ policyRecord: policy(on), days: [day("activity"), day("nutrition")] });
    expect(seen.map((object) => object.payload.evidence_type).sort()).toEqual(["activity_day", "nutrition"]);
    expect(seen.every((object) => object.payload.evidenceEligibility.state === "eligible")).toBe(true);
    // The publication and Confidence stores keep the raw runtime.
    expect(runtime.canonicalEvidenceObjects).toEqual([]);
    expect(captured.publication.liveStore).toBe(runtime);
    expect(await captured.weekly.confidenceStoreResolver()).toBe(runtime);
    expect(await captured.midweek.confidenceStoreResolver()).toBe(runtime);
  });

  it("does not let projection alone reach generation (independence)", async () => {
    const { seen } = await run({ policyRecord: policy({ enabled: false }, on), days: [day("activity"), day("nutrition")] });
    expect(seen).toEqual([]);
  });

  it("never lets a partial day reach generation", async () => {
    const { seen } = await run({ policyRecord: policy(on), days: [day("activity", "partial_day"), day("nutrition", "partial_day")] });
    expect(seen).toEqual([]);
  });

  it("keeps the generation snapshot read-only", async () => {
    await run({ policyRecord: policy(on), days: [day("activity")] });
    await expect(Promise.resolve().then(() => captured.repositories.canonicalEvidence.upsertCanonicalEvidenceObjects([{ canonicalId: "x" }])))
      .rejects.toMatchObject({ code: "PROVIDER_CADENCE_SNAPSHOT_WRITE_FORBIDDEN" });
  });
});
