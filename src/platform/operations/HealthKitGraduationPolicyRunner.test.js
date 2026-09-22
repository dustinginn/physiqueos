import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { runHealthKitGraduationPolicy } from "./HealthKitGraduationPolicyRunner.js";
import {
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID as POLICY_ID,
  resolveHealthKitGraduationPolicy,
} from "../../domain/services/HealthKitGraduation.js";

const OWNER = "user_founder_001";
const DATE = "2026-09-21";
const authorization = { ownerUserId: OWNER, authorizationReference: "founder-chat-2026-09-22-graduate" };
const both = { projection: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATE, endLocalDate: null }, evidenceEligibility: { enabled: true, domains: ["activity", "nutrition"], startLocalDate: DATE, endLocalDate: null } };

const hkDay = (domain, coverage = "complete_day") => ({
  id: `healthkit_canonical_day_${domain}_${DATE}`, domain, localDate: DATE, userId: OWNER, revision: 2, version: 3, semanticFingerprint: "sha256_x",
  createdAt: `${DATE}T15:00:00.000Z`, updatedAt: `${DATE}T23:00:00.000Z`,
  current: domain === "activity"
    ? { coverage, sourceRevision: 3, deliveryDeviceId: "d", basis: "b", values: { dailyActivity: { move_calories: 612, exercise_minutes: 41, stand_hours: 11 } } }
    : { coverage, sourceRevision: 3, deliveryDeviceId: "d", basis: "b", values: { dailyTotals: { calories: 2140, protein_g: 182, carbs_g: 205, fat_g: 68 }, dailyTotalsScope: coverage === "complete_day" ? "full_day_summary" : "partial_meal_subtotal", mealObjects: 0 } },
  provenance: { sourceObservationIds: [`healthkit_observation_${domain}`] },
});

function store({ coverage = "complete_day", evidence = [] } = {}) {
  return createInMemoryCanonicalRecordStore({
    healthKitObservations: [{ id: "healthkit_observation_activity", version: 1 }],
    healthKitCanonicalDays: [hkDay("activity", coverage), hkDay("nutrition", coverage)],
    healthKitCanonicalWorkouts: [], healthKitWorkoutLinks: [], healthKitWorkoutLinkClaims: [],
    healthKitConfiguration: [
      { id: "healthkit_canonical_daily_activation_policy", version: 1, status: "enabled", domains: ["activity", "nutrition"] },
    ],
    canonicalEvidenceObjects: evidence,
    dailyBriefings: [{ id: "briefing-1", version: 1 }],
  });
}

describe("HealthKit graduation policy operation", () => {
  it("dry-run is the graduation simulation and writes nothing", async () => {
    const records = store();
    const before = records.snapshot();
    const result = await runHealthKitGraduationPolicy({ records, authorization, desired: both });
    expect(result.outcome).toBe("dry_run");
    expect(records.snapshot()).toEqual(before);
    expect(records.getMutationCount()).toBe(0);
    expect(result.predictedMutations).toHaveLength(2);
    expect(result.historicalBriefingRegeneration).toBe(false);
    expect(result.trainingAndWorkoutChanges).toBe("none");
    expect(result.simulation.projection.daysGraduated).toEqual([
      { domain: "activity", localDate: DATE, mode: "projected_alone", coexistence: null },
      { domain: "nutrition", localDate: DATE, mode: "projected_alone", coexistence: null },
    ]);
    const predicted = result.simulation.projection.predicted[0];
    expect(predicted).toMatchObject({ date: DATE, activeDays: 1, nutritionDays: 1, activitySource: "Apple Health/direct" });
    expect(predicted.logRows).toEqual([
      { id: "nutrition", summary: "2,140 calories", context: "182P · 205C · 68F · Apple Health" },
      { id: "activity", summary: "612 active calories", context: "Apple Health" },
    ]);
    expect(predicted.nutritionAuthority).toMatchObject({ tier: "full_day_asserted", reliability: "high", energyUsable: true, energyCompleteness: "complete" });
    expect(predicted.energyInputs).toEqual({ calorieIntake: 2140, activeCalories: 612 });
    expect(result.simulation.v3).toMatchObject({ eligibleObservationDaysAdded: 2, hiddenHealthKitSpecialCase: false, historicalBriefingsRegenerated: 0 });
  });

  it("can omit values so the simulation is safe to report", async () => {
    const result = await runHealthKitGraduationPolicy({ records: store(), authorization, desired: both, includeValues: false });
    const predicted = result.simulation.projection.predicted[0];
    expect(JSON.stringify(predicted)).not.toMatch(/2,140|612|182P/);
    expect(predicted.energyInputs).toEqual({ calorieIntake: "present", activeCalories: "present" });
  });

  it("predicts duplicate suppression against another source for the same day", async () => {
    const shot = { canonicalId: `activity_day|${DATE}`, evidence_type: "activity_day", quality: { status: "active" }, activityRevision: { revision: 1 }, userId: OWNER, updatedAt: `${DATE}T22:00:00.000Z`, id: "shot-1", version: 1,
      payload: { id: "activity-shot", evidence_type: "activity_day", observed_at: DATE, source: { application: "Apple Fitness", modality: "screenshot" }, daily_activity: { move_calories: 612, exercise_minutes: 41, stand_hours: 11, move_goal: 700 } } };
    const result = await runHealthKitGraduationPolicy({ records: store({ evidence: [shot] }), authorization, desired: both });
    expect(result.simulation.projection.duplicateSuppression).toMatchObject({ mergedIntoExisting: 1, projectedAlone: 1 });
    expect(result.simulation.projection.predicted[0].activeDays).toBe(1);
  });

  it("apply requires the dry-run facts and refuses when production drifted", async () => {
    const records = store();
    const dry = await runHealthKitGraduationPolicy({ records, authorization, desired: both });
    await expect(runHealthKitGraduationPolicy({ records, authorization, desired: both, apply: true, expected: null })).resolves.toMatchObject({ outcome: "drifted" });
    await records.put({ ownerUserId: OWNER, collection: "healthKitCanonicalDays", recordId: hkDay("activity").id, expectedVersion: 3, payload: { ...hkDay("activity"), revision: 3 } });
    const drifted = await runHealthKitGraduationPolicy({ records, authorization, desired: both, apply: true, expected: dry.facts });
    expect(drifted).toMatchObject({ outcome: "drifted", drift: expect.arrayContaining(["canonicalDaysDigest"]) });
    expect(records.snapshot().healthKitConfiguration).toHaveLength(1);
  });

  it("apply writes only the policy record and one audit row and leaves everything else identical", async () => {
    const records = store();
    const dry = await runHealthKitGraduationPolicy({ records, authorization, desired: both });
    const before = records.snapshot();
    const applied = await runHealthKitGraduationPolicy({ records, authorization, desired: both, apply: true, expected: dry.facts });
    expect(applied.outcome).toBe("applied");
    expect(Object.values(applied.invariants).every(Boolean)).toBe(true);
    const after = records.snapshot();
    for (const collection of Object.keys(before).filter((name) => name !== "healthKitConfiguration")) expect(after[collection]).toEqual(before[collection]);
    expect(after.healthKitConfiguration).toHaveLength(3);
    const policy = after.healthKitConfiguration.find((row) => row.id === POLICY_ID);
    expect(policy).toMatchObject({ historicalBriefingRegeneration: false });
    expect(resolveHealthKitGraduationPolicy(policy)).toMatchObject({ valid: true, projection: { enabled: true }, evidenceEligibility: { enabled: true } });
    expect(after.healthKitConfiguration.find((row) => row.id === "healthkit_canonical_daily_activation_policy"))
      .toEqual(before.healthKitConfiguration[0]);
    expect(after.healthKitConfiguration.find((row) => row.kind === "healthkit_graduation_audit")).toMatchObject({ authorizationReference: authorization.authorizationReference });
  });

  it("switches projection and evidence eligibility independently and keeps the omitted scope", async () => {
    const records = store();
    let dry = await runHealthKitGraduationPolicy({ records, authorization, desired: { projection: both.projection } });
    await runHealthKitGraduationPolicy({ records, authorization, desired: { projection: both.projection }, apply: true, expected: dry.facts });
    let resolved = resolveHealthKitGraduationPolicy(await records.get({ collection: "healthKitConfiguration", recordId: POLICY_ID }));
    expect(resolved.projection.enabled).toBe(true);
    expect(resolved.evidenceEligibility.enabled).toBe(false);

    const next = { ...authorization, authorizationReference: "founder-chat-eligibility" };
    dry = await runHealthKitGraduationPolicy({ records, authorization: next, desired: { evidenceEligibility: both.evidenceEligibility } });
    expect(dry.policy.projection.enabled).toBe(true);
    await runHealthKitGraduationPolicy({ records, authorization: next, desired: { evidenceEligibility: both.evidenceEligibility }, apply: true, expected: dry.facts });
    resolved = resolveHealthKitGraduationPolicy(await records.get({ collection: "healthKitConfiguration", recordId: POLICY_ID }));
    expect(resolved.projection.enabled && resolved.evidenceEligibility.enabled).toBe(true);
  });

  it("rolls back prospectively: turning a scope off withdraws the days and deletes nothing", async () => {
    const records = store();
    let dry = await runHealthKitGraduationPolicy({ records, authorization, desired: both });
    await runHealthKitGraduationPolicy({ records, authorization, desired: both, apply: true, expected: dry.facts });
    const before = records.snapshot();
    const rollback = { ...authorization, authorizationReference: "founder-chat-rollback" };
    dry = await runHealthKitGraduationPolicy({ records, authorization: rollback, desired: { evidenceEligibility: { enabled: false } } });
    expect(dry.simulation.evidenceEligibility.daysWithdrawn).toHaveLength(2);
    expect(dry.simulation.evidenceEligibility.daysGraduated).toEqual([]);
    const applied = await runHealthKitGraduationPolicy({ records, authorization: rollback, desired: { evidenceEligibility: { enabled: false } }, apply: true, expected: dry.facts });
    expect(applied.outcome).toBe("applied");
    const after = records.snapshot();
    expect(after.healthKitCanonicalDays).toEqual(before.healthKitCanonicalDays);
    expect(after.healthKitObservations).toEqual(before.healthKitObservations);
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
    const resolved = resolveHealthKitGraduationPolicy(after.healthKitConfiguration.find((row) => row.id === POLICY_ID));
    expect(resolved.projection.enabled).toBe(true);
    expect(resolved.evidenceEligibility.enabled).toBe(false);
  });

  it("refuses an invalid scope and a no-op, and a reused authorization reference", async () => {
    const records = store();
    await expect(runHealthKitGraduationPolicy({ records, authorization, desired: { projection: { enabled: true, domains: ["workout"], startLocalDate: DATE } } }))
      .resolves.toMatchObject({ outcome: "refused" });
    const dry = await runHealthKitGraduationPolicy({ records, authorization, desired: both });
    await runHealthKitGraduationPolicy({ records, authorization, desired: both, apply: true, expected: dry.facts });
    const noop = await runHealthKitGraduationPolicy({ records, authorization: { ...authorization, authorizationReference: "again" }, desired: both, apply: true, expected: (await runHealthKitGraduationPolicy({ records, authorization: { ...authorization, authorizationReference: "again" }, desired: both })).facts });
    expect(noop).toMatchObject({ outcome: "refused" });
  });

  it("does not need a partial day to graduate for projection and predicts it is not strategic", async () => {
    const result = await runHealthKitGraduationPolicy({ records: store({ coverage: "partial_day" }), authorization, desired: both });
    expect(result.simulation.projection.daysGraduated).toHaveLength(2);
    expect(result.simulation.evidenceEligibility.daysGraduated).toHaveLength(0);
    expect(result.simulation.v3.eligibleObservationDaysAdded).toBe(0);
  });
});
