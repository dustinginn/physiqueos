import { describe, expect, it } from "vitest";
import { buildHealthKitPayload } from "../../../scripts/operations/buildHealthKitPayload.mjs";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { runHealthKitTrustedWatchCorrelationPolicy } from "./HealthKitTrustedWatchCorrelationPolicyRunner.js";

const OWNER = "user_founder_001";
const EFFECTIVE = "2026-10-04T07:00:00.000Z";
const NOW = new Date("2026-10-03T21:00:00.000Z");
const authorization = {
  ownerUserId: OWNER,
  trustedSourceBundleIdentifiers: ["com.physiqueos.native.dev"],
  traditionalStrengthTrainingActivityTypes: ["50"],
  clockToleranceSeconds: 120,
  effectiveAt: EFFECTIVE,
  authorizationReference: "founder-build85-exact-policy-authorization",
};

describe("guarded trusted Watch correlation policy", () => {
  it("dry-runs with zero writes and applies only the policy plus one audit row", async () => {
    const records = createInMemoryCanonicalRecordStore({
      healthKitConfiguration: [],
      healthKitObservations: [{ id: "untouched-observation", version: 1 }],
      evidenceReviews: [{ id: "untouched-review", version: 1 }],
      canonicalEvidenceObjects: [{ id: "untouched-session", version: 1 }],
    });
    const before = structuredClone(records.snapshot());
    const dry = await runHealthKitTrustedWatchCorrelationPolicy({ records, authorization, now: () => NOW });
    expect(dry).toMatchObject({
      outcome: "dry_run",
      predictedMutations: [
        { collection: "healthKitConfiguration", recordId: "healthkit_trusted_watch_workout_correlation_policy", operation: "create" },
        { collection: "healthKitConfiguration", recordIdPrefix: "healthkit_trusted_watch_correlation_audit_", operation: "create" },
      ],
      invariants: { prospectiveOnly: true, historicalBackfill: false, workoutRecordsTouched: 0, strategicArtifactsTouched: 0, sleepRecordsTouched: 0 },
    });
    expect(records.snapshot()).toEqual(before);

    const applied = await runHealthKitTrustedWatchCorrelationPolicy({
      records, authorization, apply: true, expected: dry.facts, now: () => NOW,
    });
    expect(applied).toMatchObject({ outcome: "applied", resolution: { enabled: true, effectiveAt: EFFECTIVE } });
    const after = records.snapshot();
    expect(after.healthKitConfiguration).toHaveLength(2);
    expect(after.healthKitObservations).toEqual(before.healthKitObservations);
    expect(after.evidenceReviews).toEqual(before.evidenceReviews);
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
  });

  it("fails closed on drift, a guessed bundle, or missing Founder authorization", async () => {
    const records = createInMemoryCanonicalRecordStore({ healthKitConfiguration: [] });
    const dry = await runHealthKitTrustedWatchCorrelationPolicy({ records, authorization, now: () => NOW });
    await records.put({ ownerUserId: OWNER, collection: "healthKitConfiguration", recordId: "unrelated", payload: { id: "unrelated" } });
    // Unrelated records do not drift the exact point-read contract.
    expect((await runHealthKitTrustedWatchCorrelationPolicy({
      records, authorization, apply: true, expected: dry.facts, now: () => NOW,
    })).outcome).toBe("applied");

    const guessed = await runHealthKitTrustedWatchCorrelationPolicy({
      records: createInMemoryCanonicalRecordStore({ healthKitConfiguration: [] }),
      authorization: { ...authorization, trustedSourceBundleIdentifiers: ["com.physiqueos.watch"] },
      now: () => NOW,
    });
    expect(guessed).toMatchObject({ outcome: "refused", reason: "trusted_source_bundle_must_match_audited_production_fact" });

    const noAuth = await runHealthKitTrustedWatchCorrelationPolicy({
      records: createInMemoryCanonicalRecordStore({ healthKitConfiguration: [] }),
      authorization: { ...authorization, authorizationReference: "" }, apply: true, expected: dry.facts, now: () => NOW,
    });
    expect(noAuth).toMatchObject({ outcome: "refused", reason: "authorization_reference_required" });

    const past = await runHealthKitTrustedWatchCorrelationPolicy({
      records: createInMemoryCanonicalRecordStore({ healthKitConfiguration: [] }),
      authorization: { ...authorization, effectiveAt: "2026-10-03T20:59:59.000Z" },
      now: () => NOW,
    });
    expect(past).toMatchObject({ outcome: "refused", reason: "effective_at_must_be_future" });

    const changedPlan = await runHealthKitTrustedWatchCorrelationPolicy({
      records: createInMemoryCanonicalRecordStore({ healthKitConfiguration: [] }),
      authorization: { ...authorization, effectiveAt: "2026-10-05T07:00:00.000Z" },
      apply: true,
      expected: dry.facts,
      now: () => NOW,
    });
    expect(changedPlan).toMatchObject({ outcome: "refused", reason: "production_drifted_since_dry_run" });
  });

  it("builds a SHA-gated single-file production payload and keeps apply gated", async () => {
    const sha = "1".repeat(40);
    const dry = await buildHealthKitPayload({
      kind: "trusted-watch-policy", sha, effective: EFFECTIVE, mode: "dry-run",
    });
    expect(dry.code).toContain("PHYSIQUEOS_HEALTHKIT_TRUSTED_WATCH_POLICY_DRYRUN_SUCCESS_");
    expect(dry.code).toContain(sha);
    await expect(buildHealthKitPayload({
      kind: "trusted-watch-policy", sha, effective: EFFECTIVE, mode: "apply",
    })).rejects.toThrow(/authorization-ref and --expected/);
  });
});
