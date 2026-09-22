import { describe, expect, it, vi } from "vitest";
import { createPostgresProgressEvidenceReadStore } from "./PostgresProgressEvidenceReadStore.js";
import { createPostgresEvidenceTimelineReadStore } from "./PostgresEvidenceTimelineReadStore.js";
import { createPostgresCoreNavigationReadStore } from "./PostgresCoreNavigationReadStore.js";
import { createPostgresProgressHubReadStore } from "./PostgresProgressHubReadStore.js";
import {
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID as POLICY_ID,
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION as SCHEMA,
} from "../../domain/services/HealthKitGraduation.js";

const OWNER = "owner-one";
const DATE = "2026-09-21";
const policy = (overrides = {}) => ({
  id: POLICY_ID, schemaVersion: SCHEMA, version: 1, historicalBriefingRegeneration: false,
  projection: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATE, endLocalDate: null },
  evidenceEligibility: { enabled: false },
  ...overrides,
});
const hkDay = (domain) => ({
  id: `healthkit_canonical_day_${domain}_${DATE}`, domain, localDate: DATE, userId: OWNER, revision: 1, version: 1, semanticFingerprint: "s",
  createdAt: `${DATE}T15:00:00.000Z`, updatedAt: `${DATE}T22:00:00.000Z`,
  current: domain === "activity"
    ? { coverage: "complete_day", sourceRevision: 1, deliveryDeviceId: "d", basis: "b", values: { dailyActivity: { move_calories: 612, exercise_minutes: 41, stand_hours: 11 } } }
    : { coverage: "complete_day", sourceRevision: 1, deliveryDeviceId: "d", basis: "b", values: { dailyTotals: { calories: 2140, protein_g: 182, carbs_g: 205, fat_g: 68 }, dailyTotalsScope: "full_day_summary", mealObjects: 0 } },
  provenance: { sourceObservationIds: ["healthkit_observation_x"] },
});

// A SQL-aware fake pool: routes by the collection each statement names.
function pool({ policyRecord = null, days = [], evidence = [] } = {}) {
  const query = vi.fn(async (text, values = []) => {
    if (/record_id=\$3/.test(text) && values[1] === "healthKitConfiguration") return { rows: policyRecord ? [{ payload: policyRecord, version: 1 }] : [] };
    if (values[1] === "healthKitCanonicalDays") return { rows: days.map((payload) => ({ payload, version: 1 })) };
    if (/UNION ALL|collection_name=ANY/.test(text)) {
      const wanted = values.filter(Array.isArray).flat();
      const rows = [];
      if (wanted.includes("canonicalEvidenceObjects")) rows.push(...evidence.map((payload) => ({ collection_name: "canonicalEvidenceObjects", source_ordinal: 0, record_id: payload.canonicalId, payload })));
      if (wanted.includes("healthKitConfiguration") && policyRecord) rows.push({ collection_name: "healthKitConfiguration", source_ordinal: 0, record_id: POLICY_ID, payload: policyRecord });
      return { rows };
    }
    if (/evidence_type'\)='nutrition'/.test(text)) return { rows: evidence.filter((o) => o.evidence_type === "nutrition").map((payload) => ({ payload, version: 1 })) };
    if (/IN \('activity_day','training'\)/.test(text)) return { rows: evidence.filter((o) => ["activity_day", "training"].includes(o.evidence_type)).map((payload) => ({ payload, version: 1 })) };
    if (values[1] === "canonicalEvidenceObjects") return { rows: evidence.map((payload) => ({ payload, version: 1 })) };
    return { rows: [] };
  });
  return { query, totalCount: 1, idleCount: 1, waitingCount: 0 };
}

describe("graduation seams: Progress evidence (Activity / Nutrition / Energy)", () => {
  const read = async (options, method) => {
    const store = createPostgresProgressEvidenceReadStore({ pool: pool(options), ownerUserId: OWNER });
    return store.run("progress.evidence.energy", () => store[method]());
  };

  it("is unchanged when the policy is absent", async () => {
    expect(await read({ days: [hkDay("activity")] }, "listCanonicalActivityAndTrainingEvidenceObjects")).toEqual([]);
    expect(await read({ days: [hkDay("nutrition")] }, "listCanonicalNutritionEvidenceObjects")).toEqual([]);
  });

  it("adds only the domain each list serves when projection is on", async () => {
    const options = { policyRecord: policy(), days: [hkDay("activity"), hkDay("nutrition")] };
    const activity = await read(options, "listCanonicalActivityAndTrainingEvidenceObjects");
    const nutrition = await read(options, "listCanonicalNutritionEvidenceObjects");
    expect(activity.map((object) => object.payload.evidence_type)).toEqual(["activity_day"]);
    expect(nutrition.map((object) => object.payload.evidence_type)).toEqual(["nutrition"]);
    expect(nutrition[0].payload.meals).toEqual([]);
  });

  it("asks for the policy once per run even when Energy reads both lists", async () => {
    const p = pool({ policyRecord: policy(), days: [hkDay("activity"), hkDay("nutrition")] });
    const store = createPostgresProgressEvidenceReadStore({ pool: p, ownerUserId: OWNER });
    await store.run("progress.evidence.energy", () => Promise.all([
      store.listCanonicalNutritionEvidenceObjects(), store.listCanonicalActivityAndTrainingEvidenceObjects(),
    ]));
    expect(p.query.mock.calls.filter(([text]) => /record_id=\$3/.test(text))).toHaveLength(1);
  });
});

describe("graduation seams: Evidence Hub timeline", () => {
  it("shows a graduated day as an ordinary day only when projection is on", async () => {
    const off = await createPostgresEvidenceTimelineReadStore({ pool: pool({ days: [hkDay("nutrition")] }), ownerUserId: OWNER }).load();
    expect(off.canonicalEvidenceObjects).toEqual([]);
    const on = await createPostgresEvidenceTimelineReadStore({ pool: pool({ policyRecord: policy(), days: [hkDay("nutrition"), hkDay("activity")] }), ownerUserId: OWNER }).load();
    expect(on.canonicalEvidenceObjects.map((object) => object.payload.evidence_type).sort()).toEqual(["activity_day", "nutrition"]);
  });
});

describe("graduation seams: Evidence Hub landing (Progress hub streams)", () => {
  const read = (options) => {
    const store = createPostgresProgressHubReadStore({ pool: pool(options), ownerUserId: OWNER });
    return store.run("progress.hub", () => store.listProgressHubCanonicalEvidenceObjects());
  };

  it("is unchanged when the policy is absent", async () => {
    expect(await read({ days: [hkDay("activity"), hkDay("nutrition")] })).toEqual([]);
  });

  it("shows graduated Activity and Nutrition in the hub stream inputs when projection is on", async () => {
    const objects = await read({ policyRecord: policy(), days: [hkDay("activity"), hkDay("nutrition")] });
    expect(objects.map((object) => object.payload.evidence_type).sort()).toEqual(["activity_day", "nutrition"]);
  });

  it("feeds the hub report so its Nutrition and Activity streams reflect the day", async () => {
    const { createProviderProgressHubReport } = await import("../../domain/services/ProgressReportingService.js");
    const objects = await read({ policyRecord: policy(), days: [hkDay("activity"), hkDay("nutrition")] });
    const report = createProviderProgressHubReport({ canonicalEvidenceObjects: objects });
    const stream = (id) => report.streams.find((item) => item.id === id);
    expect(stream("nutrition").metric).toBe("1 day");
    expect(stream("activity").metric).toMatch(/612/);
  });
});

describe("graduation seams: Core Log and operating plan", () => {
  const run = async (readModel, options, collections = ["canonicalEvidenceObjects", "user"]) => {
    const p = pool(options);
    const store = createPostgresCoreNavigationReadStore({ pool: p, ownerUserId: OWNER });
    const result = await store.run(readModel, ({ readCollections }) => readCollections(collections));
    return { result, query: p.query };
  };

  it("keeps the Log read to one provider query when graduation is off and hides the policy row", async () => {
    const { result, query } = await run("core.navigation.log", {});
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.healthKitConfiguration).toBeUndefined();
    expect(result.canonicalEvidenceObjects).toEqual([]);
  });

  it("carries the policy row in the same query and reads canonical days only when projection is on", async () => {
    const off = await run("core.navigation.log", { policyRecord: policy({ projection: { enabled: false } }), days: [hkDay("activity")] });
    expect(off.query).toHaveBeenCalledTimes(1);
    const on = await run("core.navigation.log", { policyRecord: policy(), days: [hkDay("activity"), hkDay("nutrition")] });
    expect(on.query).toHaveBeenCalledTimes(2);
    expect(on.result.canonicalEvidenceObjects.map((object) => object.payload.evidence_type).sort()).toEqual(["activity_day", "nutrition"]);
    expect(on.result.healthKitConfiguration).toBeUndefined();
  });

  it("gives the operating plan Activity only", async () => {
    const { result } = await run("core.navigation.operating-plan", { policyRecord: policy(), days: [hkDay("activity"), hkDay("nutrition")] });
    expect(result.canonicalEvidenceObjects.map((object) => object.payload.evidence_type)).toEqual(["activity_day"]);
  });

  it("leaves every other read model completely untouched", async () => {
    const { result, query } = await run("core.navigation.home", { policyRecord: policy(), days: [hkDay("activity")] });
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.canonicalEvidenceObjects).toEqual([]);
    expect(query.mock.calls[0][0]).not.toContain("healthKitConfiguration");
  });
});
