import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID as POLICY_ID,
  resolveHealthKitCanonicalActivationPolicy,
  resolveHealthKitWorkoutActivationPolicy,
} from "../../domain/services/HealthKitObservationService.js";
import { runHealthKitActivationPolicy } from "./HealthKitActivationPolicyRunner.js";

const OWNER = "user_founder_001";
const authorization = {
  ownerUserId: OWNER,
  domains: ["activity", "nutrition"],
  effectiveLocalDate: "2026-09-23",
  endLocalDate: "2026-09-23",
  authorizationReference: "founder-chat-2026-09-21-healthkit-testday",
};

describe("HealthKit canonical activation policy operation", () => {
  it("dry-run predicts exactly two new rows, writes nothing, and never moves Evidence", async () => {
    const records = store();
    const before = records.snapshot();
    const result = await runHealthKitActivationPolicy({ records, authorization, action: "activate" });
    expect(result).toMatchObject({
      outcome: "dry_run",
      historicalBackfill: false,
      strategicEvidenceEligibility: "quarantined",
      policy: { status: "enabled", domains: ["activity", "nutrition"], effectiveLocalDate: "2026-09-23", endLocalDate: "2026-09-23" },
      predictedMutations: [
        { collection: "healthKitConfiguration", recordId: POLICY_ID, operation: "create" },
        { collection: "healthKitConfiguration", operation: "create" },
      ],
    });
    expect(records.snapshot()).toEqual(before);
    expect(records.getMutationCount()).toBe(0);
  });

  it("apply requires the dry-run facts and refuses when production drifted", async () => {
    const records = store();
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "activate" });
    await expect(runHealthKitActivationPolicy({ records, authorization, action: "activate", apply: true, expected: null }))
      .resolves.toMatchObject({ outcome: "drifted" });
    // a new observation arrives between dry-run and apply
    await records.put({ ownerUserId: OWNER, collection: "healthKitObservations", recordId: "healthkit_observation_x", payload: { id: "healthkit_observation_x", observationType: "workout", occurrenceDate: "2026-09-20" } });
    const drifted = await runHealthKitActivationPolicy({ records, authorization, action: "activate", apply: true, expected: dry.facts });
    expect(drifted).toMatchObject({ outcome: "drifted", drift: expect.arrayContaining(["observationCount"]) });
    expect(records.snapshot().healthKitConfiguration).toEqual([]);
  });

  it("apply writes only the policy record and one audit row, scoped and quarantined, with no backfill", async () => {
    const records = store();
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "activate" });
    const before = records.snapshot();
    const applied = await runHealthKitActivationPolicy({ records, authorization, action: "activate", apply: true, expected: dry.facts });
    expect(applied.outcome).toBe("applied");
    expect(Object.values(applied.invariants).every(Boolean)).toBe(true);
    const after = records.snapshot();
    expect(after.healthKitConfiguration).toHaveLength(2);
    const policy = after.healthKitConfiguration.find((row) => row.id === POLICY_ID);
    expect(policy).toMatchObject({
      status: "enabled",
      domains: ["activity", "nutrition"],
      effectiveLocalDate: "2026-09-23",
      endLocalDate: "2026-09-23",
      strategicEvidenceEligibility: "quarantined",
      historicalBackfill: false,
    });
    expect(resolveHealthKitCanonicalActivationPolicy(policy)).toMatchObject({ enabled: true });
    const audit = after.healthKitConfiguration.find((row) => row.kind === "healthkit_canonical_activation_audit");
    expect(audit).toMatchObject({ action: "activate", authorizationReference: authorization.authorizationReference });
    for (const collection of Object.keys(before).filter((name) => name !== "healthKitConfiguration")) {
      expect(after[collection]).toEqual(before[collection]);
    }
  });

  it("refuses an invalid, oversized, or unsupported scope and never accepts an eligibility or backfill parameter", async () => {
    const records = store();
    for (const bad of [
      { ...authorization, endLocalDate: "2026-10-05" },
      { ...authorization, domains: ["sleep"] },
      { ...authorization, domains: [] },
      { ...authorization, effectiveLocalDate: "2026-02-31" },
    ]) {
      expect(await runHealthKitActivationPolicy({ records, authorization: bad, action: "activate" })).toMatchObject({ outcome: "refused" });
    }
    // eligibility and backfill are not authorization parameters; extra fields are ignored, never persisted
    const dry = await runHealthKitActivationPolicy({
      records, action: "activate",
      authorization: { ...authorization, strategicEvidenceEligibility: "eligible", historicalBackfill: true },
    });
    const applied = await runHealthKitActivationPolicy({
      records, action: "activate", apply: true, expected: dry.facts,
      authorization: { ...authorization, strategicEvidenceEligibility: "eligible", historicalBackfill: true },
    });
    expect(applied.outcome).toBe("applied");
    const policy = records.snapshot().healthKitConfiguration.find((row) => row.id === POLICY_ID);
    expect(policy).toMatchObject({ strategicEvidenceEligibility: "quarantined", historicalBackfill: false });
  });

  it("refuses a window that already contains validation-only daily snapshots (immutable-purpose collision)", async () => {
    const records = store();
    await records.put({ ownerUserId: OWNER, collection: "healthKitObservations", recordId: "healthkit_observation_v", payload: {
      id: "healthkit_observation_v", observationType: "activity_summary", ingestionPurpose: "validation_only", occurrenceDate: "2026-09-23",
    } });
    const result = await runHealthKitActivationPolicy({ records, authorization, action: "activate" });
    expect(result.outcome).toBe("refused");
    expect(result.reasons[0]).toMatch(/validation-only/);
    // a window with no validation-only data is unaffected
    const other = await runHealthKitActivationPolicy({ records, authorization: { ...authorization, effectiveLocalDate: "2026-09-25", endLocalDate: "2026-09-25" }, action: "activate" });
    expect(other.outcome).toBe("dry_run");
  });

  it("does not widen an enabled policy in place", async () => {
    const records = store();
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "activate" });
    await runHealthKitActivationPolicy({ records, authorization, action: "activate", apply: true, expected: dry.facts });
    expect(await runHealthKitActivationPolicy({
      records, authorization: { ...authorization, endLocalDate: "2026-09-24", authorizationReference: "other" }, action: "activate",
    })).toMatchObject({ outcome: "refused" });
  });

  it("deactivation disables the policy without deleting canonical history or observations", async () => {
    const records = store();
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "activate" });
    await runHealthKitActivationPolicy({ records, authorization, action: "activate", apply: true, expected: dry.facts });
    // Real canonical data produced under the policy.
    await createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-24T02:00:00.000Z") })
      .ingestHealthKitObservations({
        ownerUserId: OWNER,
        principal: { userId: OWNER, deviceId: "founder-iphone", sessionId: "s" },
        metadata: { clientOccurredAt: "2026-09-24T02:00:00.000Z" },
        payload: { batchId: "b1", observations: [{
          observationType: "activity_summary", externalId: "activity-summary:2026-09-23",
          source: { bundleIdentifier: "com.apple.Health" },
          occurrence: { localDate: "2026-09-23", timeZone: "America/Los_Angeles" },
          activitySummary: { aggregationScope: "daily_total_including_workouts", coverage: "complete_day", sourceRevision: 1, dailyActivity: { move_calories: 800 } },
        }] },
      });
    const kept = records.snapshot();
    expect(kept.healthKitCanonicalDays).toHaveLength(1);
    const dryOff = await runHealthKitActivationPolicy({ records, authorization: { ...authorization, authorizationReference: "rollback-ref" }, action: "deactivate" });
    expect(dryOff).toMatchObject({ outcome: "dry_run", policy: { status: "disabled" } });
    const off = await runHealthKitActivationPolicy({
      records, authorization: { ...authorization, authorizationReference: "rollback-ref" }, action: "deactivate", apply: true, expected: dryOff.facts,
    });
    expect(off.outcome).toBe("applied");
    const after = records.snapshot();
    expect(after.healthKitCanonicalDays).toEqual(kept.healthKitCanonicalDays);
    expect(after.healthKitObservations).toEqual(kept.healthKitObservations);
    expect(after.healthKitConfiguration.find((row) => row.id === POLICY_ID).status).toBe("disabled");
    expect(after.healthKitConfiguration.filter((row) => row.kind === "healthkit_canonical_activation_audit")).toHaveLength(2);
  });

  it("refuses to deactivate when nothing is enabled and to reuse an authorization reference", async () => {
    const records = store();
    expect(await runHealthKitActivationPolicy({ records, authorization, action: "deactivate" })).toMatchObject({ outcome: "refused" });
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "activate" });
    await runHealthKitActivationPolicy({ records, authorization, action: "activate", apply: true, expected: dry.facts });
    const dryOff = await runHealthKitActivationPolicy({ records, authorization, action: "deactivate" });
    await runHealthKitActivationPolicy({ records, authorization, action: "deactivate", apply: true, expected: dryOff.facts });
    const dryAgain = await runHealthKitActivationPolicy({ records, authorization, action: "activate" });
    // same reference + same action already audited -> refused at the audit fence
    await expect(runHealthKitActivationPolicy({ records, authorization, action: "activate", apply: true, expected: dryAgain.facts }))
      .rejects.toMatchObject({ code: "AUDIT_ROW_EXISTS" });
  });
});

describe("open-ended (permanent, forward-only) canonicalization", () => {
  const openEndedAuth = {
    ownerUserId: OWNER,
    domains: ["activity", "nutrition"],
    effectiveLocalDate: "2026-09-22",
    openEnded: true,
    authorizationReference: "founder-chat-2026-09-22-open-ended-canonicalization",
  };

  it("dry-run predicts an open-ended window with no end date and no HEALTHKIT_CANONICAL_ACTIVATION_MAX_DAYS refusal", async () => {
    const records = store();
    const result = await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "activate" });
    expect(result).toMatchObject({
      outcome: "dry_run",
      policy: { status: "enabled", domains: ["activity", "nutrition"], effectiveLocalDate: "2026-09-22", endLocalDate: null },
    });
  });

  it("applies an open-ended policy, and it resolves with no upper bound", async () => {
    const records = store();
    const dry = await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "activate" });
    const applied = await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "activate", apply: true, expected: dry.facts });
    expect(applied.outcome).toBe("applied");
    expect(Object.values(applied.invariants).every(Boolean)).toBe(true);
    const policy = (await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: POLICY_ID }));
    expect(resolveHealthKitCanonicalActivationPolicy(policy)).toMatchObject({ enabled: true, effectiveLocalDate: "2026-09-22", endLocalDate: null, openEnded: true });
  });

  it("deactivates an open-ended policy exactly like a bounded one, preserving canonical history", async () => {
    const records = store();
    const dry = await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "activate" });
    await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "activate", apply: true, expected: dry.facts });
    const dryOff = await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "deactivate" });
    const off = await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "deactivate", apply: true, expected: dryOff.facts });
    expect(off.outcome).toBe("applied");
    const policy = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: POLICY_ID });
    expect(policy.status).toBe("disabled");
  });

  it("activates a prospective Strength-only open-ended Workout policy: no end date, explicit families, auto-confirm off", async () => {
    const records = store();
    const authorization = { ownerUserId: OWNER, domains: ["workout"], effectiveLocalDate: "2026-09-23", openEnded: true, families: ["strength"], authorizationReference: "founder-chat-strength-prospective" };
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "activate", policyKind: "workout" });
    expect(dry).toMatchObject({
      outcome: "dry_run",
      policy: { status: "enabled", domains: ["workout"], effectiveLocalDate: "2026-09-23", endLocalDate: null, openEnded: true, families: ["strength"] },
    });
    expect(records.getMutationCount()).toBe(0);
    const applied = await runHealthKitActivationPolicy({ records, authorization, action: "activate", policyKind: "workout", apply: true, expected: dry.facts });
    expect(applied.outcome).toBe("applied");
    expect(applied.invariants).toMatchObject({ linkAutoConfirmOff: true, familiesAreExactlyAuthorized: true, otherPolicyUntouched: true });
    const stored = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: "healthkit_workout_canonical_activation_policy" });
    expect(stored).toMatchObject({ status: "enabled", openEnded: true, families: ["strength"], linkAutoConfirm: false, historicalBackfill: false, strategicEvidenceEligibility: "quarantined" });
    expect(stored.endLocalDate).toBeUndefined();
    expect(resolveHealthKitWorkoutActivationPolicy(stored)).toMatchObject({ enabled: true, endLocalDate: null, openEnded: true, families: ["strength"] });
    const deactivated = await runHealthKitActivationPolicy({
      records, authorization: { ownerUserId: OWNER, authorizationReference: "founder-chat-strength-prospective-off" }, action: "deactivate", policyKind: "workout", apply: true,
      expected: (await runHealthKitActivationPolicy({ records, authorization: { ownerUserId: OWNER }, action: "deactivate", policyKind: "workout" })).facts,
    });
    expect(deactivated).toMatchObject({ outcome: "applied", policy: { status: "disabled", openEnded: true, families: ["strength"] } });
  });

  it("changes only the enabled Workout policy's explicit auto-confirm flag through a separately guarded action", async () => {
    const records = store();
    const activation = { ownerUserId: OWNER, domains: ["workout"], effectiveLocalDate: "2026-09-23", openEnded: true, families: ["strength"], authorizationReference: "activate-before-auto-confirm" };
    const activationDry = await runHealthKitActivationPolicy({ records, authorization: activation, action: "activate", policyKind: "workout" });
    await runHealthKitActivationPolicy({ records, authorization: activation, action: "activate", policyKind: "workout", apply: true, expected: activationDry.facts });
    const before = records.snapshot();
    const authorization = { ownerUserId: OWNER, linkAutoConfirm: true, authorizationReference: "founder-enable-deterministic-auto-confirm" };
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "set-link-auto-confirm", policyKind: "workout" });
    expect(dry).toMatchObject({
      outcome: "dry_run",
      policy: { status: "enabled", openEnded: true, families: ["strength"], linkAutoConfirm: true },
      predictedMutations: [
        { collection: "healthKitConfiguration", recordId: "healthkit_workout_canonical_activation_policy", operation: "update" },
        { collection: "healthKitConfiguration", operation: "create" },
      ],
    });
    expect(records.snapshot()).toEqual(before);
    const applied = await runHealthKitActivationPolicy({ records, authorization, action: "set-link-auto-confirm", policyKind: "workout", apply: true, expected: dry.facts });
    expect(applied.invariants).toMatchObject({
      policyIsExactlyTheAuthorizedRecord: true,
      linkAutoConfirmIsExactlyAuthorized: true,
      strategicEligibilityQuarantined: true,
      noBackfillRequested: true,
      canonicalWorkoutsUnchanged: true,
      linksUnchanged: true,
      evidenceUnchanged: true,
    });
    const stored = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: "healthkit_workout_canonical_activation_policy" });
    expect(resolveHealthKitWorkoutActivationPolicy(stored)).toMatchObject({ enabled: true, linkAutoConfirm: true, families: ["strength"], openEnded: true });
    expect(stored).toMatchObject({ strategicEvidenceEligibility: "quarantined", historicalBackfill: false });
  });

  it("writes the family scope explicitly (every family when none is named) and refuses families on the daily kind or an invalid scope", async () => {
    const records = store();
    const bounded = await runHealthKitActivationPolicy({
      records, authorization: { ownerUserId: OWNER, domains: ["workout"], effectiveLocalDate: "2026-09-25", endLocalDate: "2026-09-25" }, action: "activate", policyKind: "workout",
    });
    expect(bounded.policy).toMatchObject({ openEnded: false, endLocalDate: "2026-09-25", families: ["cardio", "strength"] });
    const daily = await runHealthKitActivationPolicy({
      records, authorization: { ownerUserId: OWNER, domains: ["activity"], effectiveLocalDate: "2026-09-25", openEnded: true, families: ["strength"] }, action: "activate", policyKind: "daily",
    });
    expect(daily.outcome).toBe("refused");
    expect(daily.reasons[0]).toMatch(/no family scope/);
    const invalid = await runHealthKitActivationPolicy({
      records, authorization: { ownerUserId: OWNER, domains: ["workout"], effectiveLocalDate: "2026-09-25", openEnded: true, families: ["swimming"] }, action: "activate", policyKind: "workout",
    });
    expect(invalid.outcome).toBe("refused");
    expect(invalid.reasons[0]).toMatch(/families_invalid/);
    const nullScope = await runHealthKitActivationPolicy({
      records, authorization: { ownerUserId: OWNER, domains: ["workout"], effectiveLocalDate: "2026-09-25", openEnded: true, families: null }, action: "activate", policyKind: "workout",
    });
    expect(nullScope.outcome).toBe("refused");
    expect(nullScope.reasons[0]).toMatch(/families must be a list/);
    expect(records.getMutationCount()).toBe(0);
  });

  it("counts observations correctly inside an open-ended (no upper bound) window", async () => {
    const records = store();
    await records.put({
      ownerUserId: OWNER, collection: "healthKitObservations", recordId: "healthkit_observation_today",
      payload: { id: "healthkit_observation_today", observationType: "activity_summary", occurrenceDate: "2026-09-22", ingestionPurpose: "operational" },
    });
    await records.put({
      ownerUserId: OWNER, collection: "healthKitObservations", recordId: "healthkit_observation_far_future",
      payload: { id: "healthkit_observation_far_future", observationType: "activity_summary", occurrenceDate: "2027-01-01", ingestionPurpose: "operational" },
    });
    await records.put({
      ownerUserId: OWNER, collection: "healthKitObservations", recordId: "healthkit_observation_before",
      payload: { id: "healthkit_observation_before", observationType: "activity_summary", occurrenceDate: "2026-09-21", ingestionPurpose: "operational" },
    });
    const result = await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "activate" });
    expect(result.outcome).toBe("dry_run");
    expect(result.existingObservationsInWindowRemainRaw).toBe(2);
  });

  it("refuses activation when a validation-only observation exists anywhere inside an open-ended window", async () => {
    const records = store();
    await records.put({
      ownerUserId: OWNER, collection: "healthKitObservations", recordId: "healthkit_observation_val",
      payload: { id: "healthkit_observation_val", observationType: "activity_summary", occurrenceDate: "2026-11-15", ingestionPurpose: "validation_only" },
    });
    const result = await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "activate" });
    expect(result.outcome).toBe("refused");
    expect(result.reasons[0]).toMatch(/validation-only/);
  });

  it("still refuses an already-enabled policy, open-ended or not (windows are never widened in place)", async () => {
    const records = store();
    const dry = await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "activate" });
    await runHealthKitActivationPolicy({ records, authorization: openEndedAuth, action: "activate", apply: true, expected: dry.facts });
    const second = await runHealthKitActivationPolicy({ records, authorization: { ...openEndedAuth, authorizationReference: "founder-chat-again" }, action: "activate" });
    expect(second.outcome).toBe("refused");
  });
});

function store() {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    healthKitObservations: [],
    healthKitCanonicalDays: [],
    healthKitCanonicalWorkouts: [],
    healthKitWorkoutLinks: [],
    healthKitConfiguration: [],
    canonicalEvidenceObjects: [{ canonicalId: "activity_day|2026-09-20", version: 1, payload: { evidence_type: "activity_day", observed_at: "2026-09-20" } }],
    dailyBriefings: [{ id: "briefing-1", version: 1 }],
  });
}

describe("independent Workout activation policy", () => {
  const workoutAuth = { ownerUserId: OWNER, domains: ["workout"], effectiveLocalDate: "2026-09-25", endLocalDate: "2026-09-25", authorizationReference: "founder-chat-workout-canary" };
  const WORKOUT_ID = "healthkit_workout_canonical_activation_policy";
  const withDailyPolicy = () => {
    const records = store();
    return records.put({
      ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: POLICY_ID,
      payload: { id: POLICY_ID, schemaVersion: "healthkit-canonical-activation-policy-v1", status: "enabled", domains: ["activity", "nutrition"],
        effectiveLocalDate: "2026-09-21", endLocalDate: "2026-09-21", strategicEvidenceEligibility: "quarantined", historicalBackfill: false, version: 1 },
    }).then(() => records);
  };

  it("dry-run predicts two new rows and previews the raw workouts in the window without writing", async () => {
    const records = await withDailyPolicy();
    await records.put({ ownerUserId: OWNER, collection: "healthKitObservations", recordId: "healthkit_observation_w", payload: {
      id: "healthkit_observation_w", observationType: "workout", ingestionPurpose: "operational", occurrenceDate: "2026-09-25", measurement: { activityType: "50" } } });
    const before = records.snapshot();
    const result = await runHealthKitActivationPolicy({ records, authorization: workoutAuth, action: "activate", policyKind: "workout" });
    expect(result).toMatchObject({
      outcome: "dry_run", policyKind: "workout", strategicEvidenceEligibility: "quarantined", historicalBackfill: false,
      policy: { status: "enabled", domains: ["workout"], effectiveLocalDate: "2026-09-25", endLocalDate: "2026-09-25" },
      predictedMutations: [{ collection: "healthKitConfiguration", recordId: WORKOUT_ID, operation: "create" }, { operation: "create" }],
      workoutPreview: { rawWorkoutObservationsInWindow: 1, byFamily: { strength: 1, cardio: 0, unsupported: 0 } },
    });
    expect(result.unchangedByDesign.otherPolicyRecord).not.toBe("absent");
    expect(records.snapshot()).toEqual(before);
  });

  it("applies only the Workout policy and audit rows, and provably leaves the Activity + Nutrition policy untouched", async () => {
    const records = await withDailyPolicy();
    const dailyBefore = structuredClone(records.snapshot().healthKitConfiguration.find((row) => row.id === POLICY_ID));
    const dry = await runHealthKitActivationPolicy({ records, authorization: workoutAuth, action: "activate", policyKind: "workout" });
    const applied = await runHealthKitActivationPolicy({ records, authorization: workoutAuth, action: "activate", policyKind: "workout", apply: true, expected: dry.facts });
    expect(applied.outcome).toBe("applied");
    expect(applied.invariants).toMatchObject({ otherPolicyUntouched: true, linkAutoConfirmOff: true, canonicalWorkoutsUnchanged: true, linksUnchanged: true });
    expect(Object.values(applied.invariants).every(Boolean)).toBe(true);
    const rows = records.snapshot().healthKitConfiguration;
    expect(rows.find((row) => row.id === POLICY_ID)).toEqual(dailyBefore);
    expect(rows.find((row) => row.id === WORKOUT_ID)).toMatchObject({
      status: "enabled", domains: ["workout"], effectiveLocalDate: "2026-09-25", endLocalDate: "2026-09-25",
      strategicEvidenceEligibility: "quarantined", historicalBackfill: false, linkAutoConfirm: false,
    });
    expect(rows.find((row) => row.kind === "healthkit_workout_activation_audit")).toMatchObject({ action: "activate", policyRecordId: WORKOUT_ID });
    expect(rows.filter((row) => String(row.id).startsWith("healthkit_workout_activation_audit_"))).toHaveLength(1);
  });

  it("refuses a daily domain, an over-long window, or an already-enabled Workout policy, and never accepts eligibility or auto-confirm", async () => {
    const records = store();
    for (const bad of [
      { ...workoutAuth, domains: ["activity"] },
      { ...workoutAuth, domains: ["workout", "nutrition"] },
      { ...workoutAuth, endLocalDate: "2026-09-29" },
    ]) {
      expect(await runHealthKitActivationPolicy({ records, authorization: bad, action: "activate", policyKind: "workout" })).toMatchObject({ outcome: "refused" });
    }
    const auth = { ...workoutAuth, strategicEvidenceEligibility: "eligible", linkAutoConfirm: true, historicalBackfill: true };
    const dry = await runHealthKitActivationPolicy({ records, authorization: auth, action: "activate", policyKind: "workout" });
    await runHealthKitActivationPolicy({ records, authorization: auth, action: "activate", policyKind: "workout", apply: true, expected: dry.facts });
    expect(records.snapshot().healthKitConfiguration.find((row) => row.id === WORKOUT_ID))
      .toMatchObject({ strategicEvidenceEligibility: "quarantined", linkAutoConfirm: false, historicalBackfill: false });
    expect(await runHealthKitActivationPolicy({ records, authorization: { ...workoutAuth, authorizationReference: "other" }, action: "activate", policyKind: "workout" }))
      .toMatchObject({ outcome: "refused" });
  });

  it("deactivates the Workout policy without touching canonical workouts, links, or the daily policy", async () => {
    const records = await withDailyPolicy();
    const dry = await runHealthKitActivationPolicy({ records, authorization: workoutAuth, action: "activate", policyKind: "workout" });
    await runHealthKitActivationPolicy({ records, authorization: workoutAuth, action: "activate", policyKind: "workout", apply: true, expected: dry.facts });
    await records.put({ ownerUserId: OWNER, collection: "healthKitCanonicalWorkouts", recordId: "healthkit_canonical_workout_x", payload: { id: "healthkit_canonical_workout_x", localDate: "2026-09-25", revision: 1 } });
    const off = { ...workoutAuth, authorizationReference: "rollback-workout" };
    const dryOff = await runHealthKitActivationPolicy({ records, authorization: off, action: "deactivate", policyKind: "workout" });
    const applied = await runHealthKitActivationPolicy({ records, authorization: off, action: "deactivate", policyKind: "workout", apply: true, expected: dryOff.facts });
    expect(applied.outcome).toBe("applied");
    const rows = records.snapshot();
    expect(rows.healthKitConfiguration.find((row) => row.id === WORKOUT_ID).status).toBe("disabled");
    expect(rows.healthKitCanonicalWorkouts).toHaveLength(1);
    expect(rows.healthKitConfiguration.find((row) => row.id === POLICY_ID).status).toBe("enabled");
  });

  it("an unknown policy kind is rejected", async () => {
    await expect(runHealthKitActivationPolicy({ records: store(), authorization: workoutAuth, action: "activate", policyKind: "sleep" }))
      .rejects.toMatchObject({ code: "POLICY_KIND_INVALID" });
  });
});

describe("Workout preview uses the derived day (review MINOR-4)", () => {
  it("counts a workout by its own start in its own time zone, not the client label", async () => {
    const records = store();
    await records.put({ ownerUserId: OWNER, collection: "healthKitObservations", recordId: "healthkit_observation_late", payload: {
      id: "healthkit_observation_late", observationType: "workout", ingestionPurpose: "operational", occurrenceDate: "2026-09-26",
      occurrence: { startedAt: "2026-09-25T23:50:00-07:00", timeZone: "America/Los_Angeles" }, measurement: { activityType: "52" } } });
    const dry = await runHealthKitActivationPolicy({
      records, action: "activate", policyKind: "workout",
      authorization: { ownerUserId: OWNER, domains: ["workout"], effectiveLocalDate: "2026-09-25", endLocalDate: "2026-09-25", authorizationReference: "ref" },
    });
    expect(dry.workoutPreview).toMatchObject({ rawWorkoutObservationsInWindow: 1, byFamily: { cardio: 1 } });
  });
});
