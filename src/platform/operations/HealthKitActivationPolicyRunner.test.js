import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID as POLICY_ID,
  resolveHealthKitCanonicalActivationPolicy,
  resolveHealthKitWorkoutActivationPolicy,
} from "../../domain/services/HealthKitObservationService.js";
import {
  HEALTHKIT_WORKOUT_FAMILY_REPLACEMENT_AUDIT_KIND,
  runHealthKitActivationPolicy,
} from "./HealthKitActivationPolicyRunner.js";
import { buildHealthKitPayload } from "../../../scripts/operations/buildHealthKitPayload.mjs";

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
      linkAutoConfirmIsProspective: true,
      strategicEligibilityQuarantined: true,
      noBackfillRequested: true,
      canonicalWorkoutsUnchanged: true,
      linksUnchanged: true,
      evidenceUnchanged: true,
    });
    const stored = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: "healthkit_workout_canonical_activation_policy" });
    expect(resolveHealthKitWorkoutActivationPolicy(stored)).toMatchObject({
      enabled: true,
      linkAutoConfirm: true,
      linkAutoConfirmEffectiveAt: expect.any(String),
      families: ["strength"],
      openEnded: true,
    });
    expect(stored).toMatchObject({
      strategicEvidenceEligibility: "quarantined",
      historicalBackfill: false,
      linkAutoConfirmEffectiveAt: expect.any(String),
    });
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

describe("atomic Workout family-scope replacement (replace-families)", () => {
  const WORKOUT_ID = "healthkit_workout_canonical_activation_policy";

  // The exact concrete replacement this capability exists for: currently
  // Strength-only, open-ended, quarantined, no backfill, no auto-confirm ->
  // widen to Cardio + Strength, preserving every other field.
  async function strengthOnlyStore() {
    const records = store();
    const strengthAuth = {
      ownerUserId: OWNER, domains: ["workout"], effectiveLocalDate: "2026-09-23", openEnded: true,
      families: ["strength"], authorizationReference: "founder-chat-strength-prospective",
    };
    const dry = await runHealthKitActivationPolicy({ records, authorization: strengthAuth, action: "activate", policyKind: "workout" });
    await runHealthKitActivationPolicy({ records, authorization: strengthAuth, action: "activate", policyKind: "workout", apply: true, expected: dry.facts });
    return records;
  }

  async function currentDigest(records) {
    const probe = await runHealthKitActivationPolicy({ records, authorization: { ownerUserId: OWNER }, action: "deactivate", policyKind: "workout" });
    return probe.facts.policyDigest;
  }

  it("dry-run predicts the exact target mutation (cardio+strength, everything else preserved) and writes nothing", async () => {
    const records = await strengthOnlyStore();
    const expectedCurrentPolicyDigest = await currentDigest(records);
    const before = records.snapshot();
    const authorization = {
      ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["strength"],
      expectedCurrentPolicyDigest, authorizationReference: "founder-chat-widen-cardio-strength",
    };
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout" });
    expect(dry).toMatchObject({
      outcome: "dry_run",
      action: "replace-families",
      policyKind: "workout",
      policy: {
        status: "enabled", effectiveLocalDate: "2026-09-23", endLocalDate: null, openEnded: true,
        families: ["cardio", "strength"], linkAutoConfirm: false,
      },
      addedFamilies: ["cardio"],
      droppedFamilies: [],
      strategicEvidenceEligibility: "quarantined",
      historicalBackfill: false,
      predictedMutations: [
        { collection: "healthKitConfiguration", recordId: WORKOUT_ID, operation: "update" },
        { collection: "healthKitConfiguration", operation: "create" },
      ],
    });
    expect(records.snapshot()).toEqual(before);
    // an unrelated read immediately after the dry-run shows no change occurred
    const stored = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: WORKOUT_ID });
    expect(resolveHealthKitWorkoutActivationPolicy(stored)).toMatchObject({ families: ["strength"] });
  });

  it("applies the widen in one guarded transaction: exactly one policy update and one new audit row, everything else byte-identical", async () => {
    const records = await strengthOnlyStore();
    const expectedCurrentPolicyDigest = await currentDigest(records);
    const authorization = {
      ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["strength"],
      expectedCurrentPolicyDigest, authorizationReference: "founder-chat-widen-cardio-strength",
    };
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout" });
    const rowsBefore = records.snapshot().healthKitConfiguration.length;
    // the policy record is an in-place CAS update (records.put with expectedVersion),
    // which is this store's only counted mutation; the audit row is a fresh insert
    // (records.putIfAbsent), proven instead by the row-count delta below.
    const mutationsBefore = records.getMutationCount();
    const applied = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout", apply: true, expected: dry.facts });
    expect(applied.outcome).toBe("applied");
    expect(Object.values(applied.invariants).every(Boolean)).toBe(true);
    expect(records.getMutationCount() - mutationsBefore).toBe(1);
    // exactly one new row (the audit row); the policy row was updated in place, not appended
    expect(records.snapshot().healthKitConfiguration.length - rowsBefore).toBe(1);
    const stored = await records.get({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: WORKOUT_ID });
    expect(stored).toMatchObject({
      status: "enabled", domains: ["workout"], effectiveLocalDate: "2026-09-23", openEnded: true,
      families: ["cardio", "strength"], strategicEvidenceEligibility: "quarantined", historicalBackfill: false, linkAutoConfirm: false,
    });
    expect(stored.endLocalDate).toBeUndefined();
    expect(resolveHealthKitWorkoutActivationPolicy(stored)).toMatchObject({
      enabled: true, effectiveLocalDate: "2026-09-23", endLocalDate: null, openEnded: true, families: ["cardio", "strength"], linkAutoConfirm: false,
    });
    const audit = records.snapshot().healthKitConfiguration.find((row) => row.kind === HEALTHKIT_WORKOUT_FAMILY_REPLACEMENT_AUDIT_KIND);
    expect(audit).toMatchObject({
      action: "replace-families",
      authorizationReference: "founder-chat-widen-cardio-strength",
      policyRecordId: WORKOUT_ID,
      before: { digest: expectedCurrentPolicyDigest, families: ["strength"] },
      after: { families: ["cardio", "strength"] },
    });
    expect(typeof audit.after.digest).toBe("string");
    expect(audit.after.digest).not.toBe(audit.before.digest);
  });

  it("idempotent replay: applying the identical authorized replacement again is a zero-write no-op", async () => {
    const records = await strengthOnlyStore();
    const expectedCurrentPolicyDigest = await currentDigest(records);
    const authorization = {
      ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["strength"],
      expectedCurrentPolicyDigest, authorizationReference: "founder-chat-widen-cardio-strength",
    };
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout" });
    await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout", apply: true, expected: dry.facts });
    const before = records.snapshot();
    const mutationsBefore = records.getMutationCount();
    const replay = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout", apply: true, expected: dry.facts });
    expect(replay.outcome).toBe("already_replaced");
    expect(records.getMutationCount()).toBe(mutationsBefore);
    expect(records.snapshot()).toEqual(before);
    // a dry-run replay agrees
    const dryReplay = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout" });
    expect(dryReplay.outcome).toBe("already_replaced");
    expect(records.getMutationCount()).toBe(mutationsBefore);
  });

  it("refuses cleanly when the caller's belief of the current policy digest is wrong", async () => {
    const records = await strengthOnlyStore();
    const mutationsBefore = records.getMutationCount();
    const authorization = {
      ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["strength"],
      expectedCurrentPolicyDigest: "stale-digest-from-before-someone-else-changed-it",
      authorizationReference: "founder-chat-widen-cardio-strength",
    };
    const result = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout" });
    expect(result.outcome).toBe("refused");
    expect(result.reasons[0]).toMatch(/expectedCurrentPolicyDigest does not match/);
    expect(records.getMutationCount()).toBe(mutationsBefore);
    expect(records.snapshot().healthKitConfiguration.find((row) => row.id === WORKOUT_ID).families).toEqual(["strength"]);
  });

  it("refuses cleanly when expectedCurrentFamilies is a stale belief of the actual current scope", async () => {
    const records = await strengthOnlyStore();
    const expectedCurrentPolicyDigest = await currentDigest(records);
    const result = await runHealthKitActivationPolicy({
      records, action: "replace-families", policyKind: "workout",
      authorization: {
        ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["cardio"],
        expectedCurrentPolicyDigest, authorizationReference: "founder-chat-widen-cardio-strength",
      },
    });
    expect(result.outcome).toBe("refused");
    expect(result.reasons[0]).toMatch(/expectedCurrentFamilies does not match/);
  });

  it("refuses an accidental narrowing (omitting strength) unless explicitly acknowledged", async () => {
    const records = await strengthOnlyStore();
    const expectedCurrentPolicyDigest = await currentDigest(records);
    const accidental = {
      ownerUserId: OWNER, families: ["cardio"], expectedCurrentFamilies: ["strength"],
      expectedCurrentPolicyDigest, authorizationReference: "oops-forgot-strength",
    };
    const refused = await runHealthKitActivationPolicy({ records, authorization: accidental, action: "replace-families", policyKind: "workout" });
    expect(refused.outcome).toBe("refused");
    expect(refused.reasons[0]).toMatch(/drops strength/);
    expect(refused.droppedFamilies).toEqual(["strength"]);
    expect(records.snapshot().healthKitConfiguration.find((row) => row.id === WORKOUT_ID).families).toEqual(["strength"]);

    // The same narrowing, explicitly acknowledged, is genuinely intended and proceeds.
    const acknowledged = { ...accidental, acknowledgeNarrowing: true, authorizationReference: "founder-chat-intentional-narrow-to-cardio-only" };
    const dry = await runHealthKitActivationPolicy({ records, authorization: acknowledged, action: "replace-families", policyKind: "workout" });
    expect(dry.outcome).toBe("dry_run");
    expect(dry.droppedFamilies).toEqual(["strength"]);
    const applied = await runHealthKitActivationPolicy({ records, authorization: acknowledged, action: "replace-families", policyKind: "workout", apply: true, expected: dry.facts });
    expect(applied.outcome).toBe("applied");
    expect(applied.policy.families).toEqual(["cardio"]);
  });

  it("refuses an invalid or ambiguous target family set (unknown family, empty, duplicates)", async () => {
    const records = await strengthOnlyStore();
    const expectedCurrentPolicyDigest = await currentDigest(records);
    const base = { ownerUserId: OWNER, expectedCurrentFamilies: ["strength"], expectedCurrentPolicyDigest, authorizationReference: "ref" };
    for (const families of [["swimming"], [], ["strength", "strength"]]) {
      const result = await runHealthKitActivationPolicy({ records, authorization: { ...base, families }, action: "replace-families", policyKind: "workout" });
      expect(result.outcome).toBe("refused");
    }
  });

  it("refuses replace-families against the daily policy or an unenabled workout policy", async () => {
    const dailyRecords = store();
    await dailyRecords.put({
      ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: POLICY_ID,
      payload: { id: POLICY_ID, schemaVersion: "healthkit-canonical-activation-policy-v1", status: "enabled", domains: ["activity", "nutrition"],
        effectiveLocalDate: "2026-09-21", endLocalDate: "2026-09-21", strategicEvidenceEligibility: "quarantined", historicalBackfill: false },
    });
    const daily = await runHealthKitActivationPolicy({
      records: dailyRecords, action: "replace-families", policyKind: "daily",
      authorization: { ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["strength"], expectedCurrentPolicyDigest: "x", authorizationReference: "ref" },
    });
    expect(daily.outcome).toBe("refused");
    expect(daily.reasons[0]).toMatch(/workout policy only/);

    const neverActivated = store();
    const notEnabled = await runHealthKitActivationPolicy({
      records: neverActivated, action: "replace-families", policyKind: "workout",
      authorization: { ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["strength"], expectedCurrentPolicyDigest: "x", authorizationReference: "ref" },
    });
    expect(notEnabled.outcome).toBe("refused");
    expect(notEnabled.reasons[0]).toMatch(/must already be enabled/);
  });

  it("leaves the co-existing Activity/Nutrition policy provably untouched (digest-compared)", async () => {
    const records = await strengthOnlyStore();
    await records.put({
      ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: POLICY_ID,
      payload: {
        id: POLICY_ID, schemaVersion: "healthkit-canonical-activation-policy-v1", status: "enabled", domains: ["activity", "nutrition"],
        effectiveLocalDate: "2026-09-21", endLocalDate: "2026-09-21", strategicEvidenceEligibility: "quarantined", historicalBackfill: false,
      },
    });
    const dailyBefore = structuredClone(records.snapshot().healthKitConfiguration.find((row) => row.id === POLICY_ID));
    const expectedCurrentPolicyDigest = await currentDigest(records);
    const authorization = {
      ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["strength"],
      expectedCurrentPolicyDigest, authorizationReference: "founder-chat-widen-cardio-strength",
    };
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout" });
    const applied = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout", apply: true, expected: dry.facts });
    expect(applied.outcome).toBe("applied");
    expect(applied.invariants.otherPolicyUntouched).toBe(true);
    const dailyAfter = records.snapshot().healthKitConfiguration.find((row) => row.id === POLICY_ID);
    expect(dailyAfter).toEqual(dailyBefore);
  });

  it("leaves canonical workouts, links, claims, evidence, and observations provably untouched (digest-compared)", async () => {
    const records = await strengthOnlyStore();
    await records.put({ ownerUserId: OWNER, collection: "healthKitCanonicalWorkouts", recordId: "healthkit_canonical_workout_x", payload: { id: "healthkit_canonical_workout_x", localDate: "2026-09-23", revision: 1 } });
    await records.put({ ownerUserId: OWNER, collection: "healthKitWorkoutLinks", recordId: "healthkit_workout_link_x", payload: { id: "healthkit_workout_link_x", canonicalWorkoutId: "healthkit_canonical_workout_x", status: "confirmed" } });
    await records.put({ ownerUserId: OWNER, collection: "healthKitWorkoutLinkClaims", recordId: "healthkit_workout_link_claim_x", payload: { id: "healthkit_workout_link_claim_x", canonicalWorkoutId: "healthkit_canonical_workout_x" } });
    await records.put({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects", recordId: "evidence_x", payload: { id: "evidence_x", evidence_type: "logger_session" } });
    await records.put({ ownerUserId: OWNER, collection: "healthKitObservations", recordId: "healthkit_observation_z", payload: { id: "healthkit_observation_z", observationType: "workout", occurrenceDate: "2026-09-23" } });

    const before = structuredClone(records.snapshot());
    const expectedCurrentPolicyDigest = await currentDigest(records);
    const authorization = {
      ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["strength"],
      expectedCurrentPolicyDigest, authorizationReference: "founder-chat-widen-cardio-strength",
    };
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout" });
    const applied = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout", apply: true, expected: dry.facts });
    expect(applied.outcome).toBe("applied");
    expect(applied.invariants).toMatchObject({
      canonicalWorkoutsUnchanged: true, linksUnchanged: true, claimsUnchanged: true, evidenceUnchanged: true, observationsUnchanged: true,
    });
    const after = records.snapshot();
    for (const collection of ["healthKitCanonicalWorkouts", "healthKitWorkoutLinks", "healthKitWorkoutLinkClaims", "canonicalEvidenceObjects", "healthKitObservations", "healthKitCanonicalDays"]) {
      expect(after[collection]).toEqual(before[collection]);
    }
  });

  it("refuses on drift between dry-run and apply (someone else changed state in between)", async () => {
    const records = await strengthOnlyStore();
    const expectedCurrentPolicyDigest = await currentDigest(records);
    const authorization = {
      ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["strength"],
      expectedCurrentPolicyDigest, authorizationReference: "founder-chat-widen-cardio-strength",
    };
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout" });
    await records.put({ ownerUserId: OWNER, collection: "healthKitObservations", recordId: "healthkit_observation_drift", payload: { id: "healthkit_observation_drift", observationType: "workout", occurrenceDate: "2026-09-23" } });
    const drifted = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout", apply: true, expected: dry.facts });
    expect(drifted.outcome).toBe("drifted");
    expect(records.snapshot().healthKitConfiguration.find((row) => row.id === WORKOUT_ID).families).toEqual(["strength"]);
  });

  it("refuses to reuse an authorization reference for a different family-scope transition (audit row fence, no partial write)", async () => {
    const records = await strengthOnlyStore();
    const expectedCurrentPolicyDigest = await currentDigest(records);
    const authorization = {
      ownerUserId: OWNER, families: ["cardio", "strength"], expectedCurrentFamilies: ["strength"],
      expectedCurrentPolicyDigest, authorizationReference: "reused-reference",
    };
    const dry = await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout" });
    await runHealthKitActivationPolicy({ records, authorization, action: "replace-families", policyKind: "workout", apply: true, expected: dry.facts });
    // narrow back down to strength-only, reusing the SAME authorization reference
    const digestAfterWiden = await currentDigest(records);
    const reused = {
      ownerUserId: OWNER, families: ["strength"], expectedCurrentFamilies: ["cardio", "strength"],
      expectedCurrentPolicyDigest: digestAfterWiden, acknowledgeNarrowing: true, authorizationReference: "reused-reference",
    };
    const reusedDry = await runHealthKitActivationPolicy({ records, authorization: reused, action: "replace-families", policyKind: "workout" });
    expect(reusedDry.outcome).toBe("dry_run");
    const before = records.snapshot();
    await expect(runHealthKitActivationPolicy({ records, authorization: reused, action: "replace-families", policyKind: "workout", apply: true, expected: reusedDry.facts }))
      .rejects.toMatchObject({ code: "AUDIT_ROW_EXISTS" });
    expect(records.snapshot()).toEqual(before);
  });
});

describe("production tooling: buildHealthKitPayload --kind policy --action replace-families", () => {
  const SHA = "a40c0b53c49240d5666d2a3475d48541cfd5f57e";
  const DIGEST = "0123456789abcdef0123456789abcdef";

  it("bundles a dry-run zero-write payload with baked identity and the exact family-scope inputs", async () => {
    const dry = await buildHealthKitPayload({
      kind: "policy", policyKind: "workout", action: "replace-families", sha: SHA, mode: "dry-run",
      families: "cardio,strength", expectedCurrentFamilies: "strength", expectedCurrentPolicyDigest: DIGEST,
    });
    expect(dry.code).toContain(SHA);
    expect(dry.code).toContain("REPEATABLE READ READ ONLY");
    expect(dry.marker).toContain("WORKOUT_ACTIVATION_REPLACE_FAMILIES_DRYRUN");
  });

  it("bundles an apply payload only once authorization-ref and expected are both supplied", async () => {
    await expect(buildHealthKitPayload({
      kind: "policy", policyKind: "workout", action: "replace-families", sha: SHA, mode: "apply",
      families: "cardio,strength", expectedCurrentFamilies: "strength", expectedCurrentPolicyDigest: DIGEST,
    })).rejects.toThrow(/authorization-ref and --expected/);
    const applied = await buildHealthKitPayload({
      kind: "policy", policyKind: "workout", action: "replace-families", sha: SHA, mode: "apply",
      families: "cardio,strength", expectedCurrentFamilies: "strength", expectedCurrentPolicyDigest: DIGEST,
      authorizationReference: "founder-chat-widen-cardio-strength", expected: JSON.stringify({ policyDigest: DIGEST }),
    });
    expect(applied.marker).toContain("WORKOUT_ACTIVATION_REPLACE_FAMILIES_APPLY");
  });

  it("refuses to bundle without the exact-scope preconditions or against the daily policy kind", async () => {
    const base = { kind: "policy", policyKind: "workout", action: "replace-families", sha: SHA, mode: "dry-run" };
    await expect(buildHealthKitPayload({ ...base, expectedCurrentFamilies: "strength", expectedCurrentPolicyDigest: DIGEST }))
      .rejects.toThrow(/--families/);
    await expect(buildHealthKitPayload({ ...base, families: "cardio,strength", expectedCurrentPolicyDigest: DIGEST }))
      .rejects.toThrow(/--expected-current-families/);
    await expect(buildHealthKitPayload({ ...base, families: "cardio,strength", expectedCurrentFamilies: "strength" }))
      .rejects.toThrow(/--expected-current-policy-digest/);
    await expect(buildHealthKitPayload({ ...base, families: "cardio,strength", expectedCurrentFamilies: "strength", expectedCurrentPolicyDigest: "not-hex" }))
      .rejects.toThrow(/--expected-current-policy-digest/);
    await expect(buildHealthKitPayload({
      ...base, policyKind: "daily", families: "cardio,strength", expectedCurrentFamilies: "strength", expectedCurrentPolicyDigest: DIGEST,
    })).rejects.toThrow(/policy-kind workout/);
  });
});
