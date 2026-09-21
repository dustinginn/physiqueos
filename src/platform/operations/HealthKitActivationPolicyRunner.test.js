import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID as POLICY_ID,
  resolveHealthKitCanonicalActivationPolicy,
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

function store() {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, timeZone: "America/Los_Angeles", version: 1 }],
    healthKitObservations: [],
    healthKitCanonicalDays: [],
    healthKitConfiguration: [],
    canonicalEvidenceObjects: [{ canonicalId: "activity_day|2026-09-20", version: 1, payload: { evidence_type: "activity_day", observed_at: "2026-09-20" } }],
    dailyBriefings: [{ id: "briefing-1", version: 1 }],
  });
}
