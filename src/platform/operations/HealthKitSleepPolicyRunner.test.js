import { describe, expect, it } from "vitest";
import { HealthKitSleepPolicyAction, runHealthKitSleepPolicy } from "./HealthKitSleepPolicyRunner.js";
import { auditHealthKitSleep } from "./HealthKitSleepAudit.js";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  resolveHealthKitSleepActivationPolicy,
} from "../../domain/services/HealthKitSleepPolicies.js";
import {
  HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID,
  resolveHealthKitSleepValidationPolicy,
} from "../../domain/services/HealthKitSleepHistoricalValidation.js";

const OWNER = "user_founder_001";
const NOW = () => new Date("2026-10-01T18:00:00Z"); // 2026-10-01 11:00 in Los Angeles
const auth = (overrides = {}) => ({ ownerUserId: OWNER, authorizationReference: "founder-chat-2026-10-01", timeZone: "America/Los_Angeles", ...overrides });

function store(extra = {}) {
  return createInMemoryCanonicalRecordStore({ healthKitConfiguration: [], ...extra });
}
async function dryThenApply(records, action, authorization) {
  const dry = await runHealthKitSleepPolicy({ records, authorization, action, now: NOW });
  expect(dry.outcome).toBe("dry_run");
  return runHealthKitSleepPolicy({ records, authorization, action, apply: true, expected: dry.facts, now: NOW });
}

describe("guarded Sleep policy runner", () => {
  it("dry-run writes nothing and predicts the exact validation-only, quarantined, no-backfill record", async () => {
    const records = store();
    const dry = await runHealthKitSleepPolicy({
      records, authorization: auth({ effectiveSleepDay: "2026-10-02" }), action: HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, now: NOW,
    });
    expect(dry).toMatchObject({ outcome: "dry_run", plannedResolution: { enabled: true, mode: "validation_only", openEnded: true, activationFloor: "2026-10-02T01:00:00.000Z" } });
    expect(records.getMutationCount()).toBe(0);
  });

  it("apply requires an authorization reference and the exact dry-run facts, and refuses drift", async () => {
    const records = store();
    const authorization = auth({ effectiveSleepDay: "2026-10-02" });
    const dry = await runHealthKitSleepPolicy({ records, authorization, action: HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, now: NOW });
    expect(await runHealthKitSleepPolicy({ records, authorization: { ...authorization, authorizationReference: "" }, action: HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, apply: true, expected: dry.facts, now: NOW }))
      .toMatchObject({ outcome: "refused", reason: "authorization_reference_required" });
    expect(await runHealthKitSleepPolicy({ records, authorization, action: HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, apply: true, expected: { ...dry.facts, sleepSampleCount: 5 }, now: NOW }))
      .toMatchObject({ outcome: "refused", reason: "production_drifted_since_dry_run" });
    expect(records.getMutationCount()).toBe(0);
    const applied = await runHealthKitSleepPolicy({ records, authorization, action: HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, apply: true, expected: dry.facts, now: NOW });
    expect(applied.outcome).toBe("applied");
    const record = await records.get({ collection: "healthKitConfiguration", recordId: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID });
    expect(resolveHealthKitSleepActivationPolicy(record)).toMatchObject({ enabled: true, effectiveSleepDay: "2026-10-02", mode: "validation_only" });
    expect(record).toMatchObject({ historicalBackfill: false, strategicEvidenceEligibility: "quarantined" });
    // Replay of the identical authorized request is a safe no-op.
    const replay = await runHealthKitSleepPolicy({ records, authorization, action: HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, now: NOW });
    expect(replay.outcome).toBe("already_applied");
  });

  it("refuses a D0 whose floor is not strictly in the future, a conflicting D0, and a conflicting zone", async () => {
    // NOW = Oct 1 11:00 PDT: D0 = Oct 1 has a floor of Sep 30 18:00 (past).
    for (const d0 of ["2026-09-30", "2026-10-01"]) {
      expect(await runHealthKitSleepPolicy({ records: store(), authorization: auth({ effectiveSleepDay: d0 }), action: HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, now: NOW }))
        .toMatchObject({ outcome: "refused", reason: "activation_floor_not_in_future" });
      expect(await runHealthKitSleepPolicy({ records: store(), authorization: auth({ effectiveSleepDay: d0 }), action: HealthKitSleepPolicyAction.OPEN_HISTORICAL_VALIDATION, now: NOW }))
        .toMatchObject({ outcome: "refused", reason: "activation_floor_not_in_future" });
    }
    // After 18:00 local, even tomorrow's floor has passed.
    expect(await runHealthKitSleepPolicy({ records: store(), authorization: auth({ effectiveSleepDay: "2026-10-02" }), action: HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, now: () => new Date("2026-10-02T02:00:00Z") }))
      .toMatchObject({ outcome: "refused", reason: "activation_floor_not_in_future" });
    const zoned = store();
    await dryThenApply(zoned, HealthKitSleepPolicyAction.OPEN_HISTORICAL_VALIDATION, auth({ effectiveSleepDay: "2026-10-05" }));
    expect(await runHealthKitSleepPolicy({ records: zoned, authorization: auth({ effectiveSleepDay: "2026-10-05", timeZone: "America/New_York" }), action: HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, now: NOW }))
      .toMatchObject({ outcome: "refused", reason: "historical_validation_anchored_to_different_time_zone" });
    // A CLOSED run still anchors D0.
    await dryThenApply(zoned, HealthKitSleepPolicyAction.CLOSE_HISTORICAL_VALIDATION, auth());
    expect(await runHealthKitSleepPolicy({ records: zoned, authorization: auth({ effectiveSleepDay: "2026-10-03" }), action: HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, now: NOW }))
      .toMatchObject({ outcome: "refused", reason: "historical_validation_anchored_to_different_d0" });
    expect((await dryThenApply(zoned, HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, auth({ effectiveSleepDay: "2026-10-05" }))).outcome).toBe("applied");
    const records = store();
    await dryThenApply(records, HealthKitSleepPolicyAction.ACTIVATE_PROSPECTIVE, auth({ effectiveSleepDay: "2026-10-02" }));
    expect(await runHealthKitSleepPolicy({ records, authorization: auth({ effectiveSleepDay: "2026-10-05" }), action: HealthKitSleepPolicyAction.OPEN_HISTORICAL_VALIDATION, now: NOW }))
      .toMatchObject({ outcome: "refused", reason: "active_policy_has_different_d0" });
  });

  it("opens a <=30-day historical window that ends the day before D0, and close keeps its facts", async () => {
    const records = store();
    const opened = await dryThenApply(records, HealthKitSleepPolicyAction.OPEN_HISTORICAL_VALIDATION, auth({ effectiveSleepDay: "2026-10-02" }));
    expect(opened.resolution).toMatchObject({
      enabled: true, runId: "hv-2026-10-02-30d", windowStartSleepDay: "2026-09-02", windowEndSleepDay: "2026-10-01",
    });
    expect(await runHealthKitSleepPolicy({ records, authorization: auth({ effectiveSleepDay: "2026-10-02", historicalDays: 31 }), action: HealthKitSleepPolicyAction.OPEN_HISTORICAL_VALIDATION, now: NOW }))
      .toMatchObject({ outcome: "refused", reason: "historical_days_invalid" });
    await dryThenApply(records, HealthKitSleepPolicyAction.CLOSE_HISTORICAL_VALIDATION, auth());
    const closed = await records.get({ collection: "healthKitConfiguration", recordId: HEALTHKIT_SLEEP_VALIDATION_POLICY_RECORD_ID });
    expect(resolveHealthKitSleepValidationPolicy(closed).enabled).toBe(false);
    expect(closed).toMatchObject({ runId: "hv-2026-10-02-30d", windowEndSleepDay: "2026-10-01" });
  });

  it("writes the Oura preference only through the generic preference record", async () => {
    const records = store();
    const applied = await dryThenApply(records, HealthKitSleepPolicyAction.SET_SOURCE_PREFERENCE, auth({ preferredSourceFamilies: ["oura"] }));
    expect(applied.resolution).toMatchObject({ configured: true, preferredSources: [{ sourceFamily: "oura" }] });
    expect(await runHealthKitSleepPolicy({ records: store(), authorization: auth({ preferredSourceFamilies: ["manual"] }), action: HealthKitSleepPolicyAction.SET_SOURCE_PREFERENCE, now: NOW }))
      .toMatchObject({ outcome: "refused", reason: "preferred_sources_invalid" });
  });
});

describe("zero-write Sleep audit", () => {
  it("proves dormancy: no policies, zero Sleep rows, zero strategic leaks, capability disabled", async () => {
    const records = store({ canonicalEvidenceObjects: [{ id: "evidence-1" }] });
    const audit = await auditHealthKitSleep({ records, ownerUserId: OWNER, kind: "dormancy" });
    expect(audit).toMatchObject({
      policies: { activation: { present: false, enabled: false }, sourcePreference: { configured: false }, historicalValidation: { enabled: false } },
      servedCapability: { enabled: false },
      counts: { healthKitSleepSamples: 0, healthKitSleepDays: 0, healthKitSleepValidationSamples: 0 },
      strategicLeakTotal: 0,
    });
    expect(records.getMutationCount()).toBe(0);
  });

  it("flags any Sleep-shaped record found in a strategic collection", async () => {
    const records = store({ canonicalEvidenceObjects: [{ id: "healthkit_sleep_day_2026-10-03" }] });
    const audit = await auditHealthKitSleep({ records, ownerUserId: OWNER, kind: "dormancy" });
    expect(audit.strategicLeaks.canonicalEvidenceObjects).toBe(1);
  });
});
