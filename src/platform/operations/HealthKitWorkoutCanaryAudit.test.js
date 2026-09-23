import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import { summarizeHealthKitWorkoutCanary } from "./HealthKitWorkoutCanaryAudit.js";
import { buildHealthKitPayload } from "../../../scripts/operations/buildHealthKitPayload.mjs";

const OWNER = "user_founder_001";
const SHA = "a40c0b53c49240d5666d2a3475d48541cfd5f57e";
const DAY = "2026-09-25";
const HK_UUID = "9f3c2a10-1111-4222-8333-444455556666";

describe("Workout canary audit", () => {
  it("proves candidate linkage, quarantine, and Logger authority for a canary window without private identifiers", async () => {
    const session = {
      canonicalId: "training|authoritative|training_logger_draft_SECRET-SESSION-ID", version: 1, quality: { status: "active" },
      payload: { id: "SECRET-SESSION-ID", evidence_type: "training", observed_at: DAY, source: { application: "Training Logger + Apple Fitness", modality: "mixed" },
        metadata: { activity_type: "Traditional Strength Training", start_time: `${DAY}T10:01:00-07:00`, end_time: `${DAY}T10:59:00-07:00`, duration_seconds: 3480 },
        exercises: [{ name: "Squat", sets: [{ reps: 5, weight: 225 }] }] },
    };
    const records = createInMemoryCanonicalRecordStore({
      user: [{ id: OWNER, version: 1 }], healthKitObservations: [], healthKitCanonicalDays: [], healthKitCanonicalWorkouts: [], healthKitWorkoutLinks: [],
      healthKitConfiguration: [{ id: "healthkit_workout_canonical_activation_policy", schemaVersion: "healthkit-workout-activation-policy-v1", status: "enabled",
        domains: ["workout"], effectiveLocalDate: DAY, endLocalDate: DAY, strategicEvidenceEligibility: "quarantined", historicalBackfill: false, linkAutoConfirm: false, version: 1 }],
      canonicalEvidenceObjects: [session],
    });
    await createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-25T20:00:00.000Z") }).ingestHealthKitObservations({
      ownerUserId: OWNER, principal: { userId: OWNER, deviceId: "d", sessionId: "s" }, metadata: { clientOccurredAt: "2026-09-25T20:00:00.000Z" },
      payload: { batchId: "b", observations: [{
        observationType: "workout", externalId: HK_UUID, source: { bundleIdentifier: "com.apple.health.watch" },
        occurrence: { localDate: DAY, timeZone: "America/Los_Angeles", startedAt: `${DAY}T10:00:00-07:00`, endedAt: `${DAY}T11:00:00-07:00` },
        workout: { activityType: "50", durationSeconds: 3600, activeCalories: 410, averageHeartRate: 121 } }] },
    });
    const snapshot = records.snapshot();
    const summary = summarizeHealthKitWorkoutCanary({
      policyRecord: snapshot.healthKitConfiguration[0], observations: snapshot.healthKitObservations,
      canonicalWorkouts: snapshot.healthKitCanonicalWorkouts, links: snapshot.healthKitWorkoutLinks,
      canonicalEvidenceObjects: snapshot.canonicalEvidenceObjects, startLocalDate: "2026-09-24", endLocalDate: "2026-09-26", includeValues: false,
    });
    expect(summary.policy).toMatchObject({ enabled: true, openEnded: false, families: ["cardio", "strength"], strategicEvidenceEligibility: "quarantined", historicalBackfill: false, linkAutoConfirm: false });
    expect(summary.canonicalWorkoutCount).toBe(1);
    expect(summary.duplicateCanonicalWorkoutsByWindow).toBe(0);
    expect(summary.loggerStrengthSessionsInWindow).toBe(1);
    expect(summary.workouts[0]).toMatchObject({
      family: "strength", revision: 1, evidenceEligibility: "quarantined", strategicEligible: false,
      storedLinkAssessment: { outcome: "confident_match" }, liveLinkAssessment: { outcome: "confident_match" },
      links: [{ status: "candidate", matchOutcome: "confident_match", createdBy: "system_matcher", contentAuthority: { trainingContent: "workout_logger" } }],
    });
    expect(summary.strategic).toEqual({ healthKitWorkoutsStrategicEligible: 0, healthKitWorkoutsNotQuarantined: 0, healthKitDerivedRecordsInStrategicEvidence: 0 });
    expect(summary.ambiguousAutoLinked).toBe(0);
    const text = JSON.stringify(summary);
    expect(text).not.toContain(HK_UUID);
    expect(text).not.toContain("SECRET-SESSION-ID");
    expect(text).not.toMatch(/410|121|3600/);
  });

  it("bundles a read-only audit and a workout-kind policy payload with baked identity", async () => {
    const audit = await buildHealthKitPayload({ kind: "workout-audit", sha: SHA, start: "2026-09-24", end: "2026-09-26" });
    expect(audit.code).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const entry = fs.readFileSync(new URL("../../../scripts/operations/healthKitWorkoutCanaryAudit.entry.mjs", import.meta.url), "utf8");
    expect(entry).not.toMatch(/INSERT INTO|UPDATE physiqueos|DELETE FROM|records\.put|putIfAbsent|COMMIT/);
    const policy = await buildHealthKitPayload({ kind: "policy", policyKind: "workout", sha: SHA, action: "activate", domains: "workout", effective: DAY, end: DAY });
    expect(policy.code).toContain(SHA);
    expect(policy.marker).toContain("WORKOUT_ACTIVATION");
    const prospective = await buildHealthKitPayload({ kind: "policy", policyKind: "workout", sha: SHA, action: "activate", domains: "workout", effective: DAY, openEnded: true, families: "strength" });
    expect(prospective.code).toContain(SHA);
    expect(prospective.marker).toContain("WORKOUT_ACTIVATION_ACTIVATE_DRYRUN");
    // The family restriction must travel from the build-time define into the
    // runner's authorization, or a "Strength-only" apply would scope every family.
    const activationEntry = fs.readFileSync(new URL("../../../scripts/operations/healthKitActivationPolicy.entry.mjs", import.meta.url), "utf8");
    expect(activationEntry).toMatch(/const AUTHORIZED_FAMILIES = FAMILIES \? FAMILIES\.split\(","\)\.filter\(Boolean\) : undefined;/);
    expect(activationEntry).toMatch(/\.\.\.\(AUTHORIZED_FAMILIES \? \{ families: AUTHORIZED_FAMILIES \} : \{\}\),\n\s+authorizationReference: AUTHORIZATION_REFERENCE,/);
    expect(activationEntry).not.toMatch(/OPEN_ENDED_NOT_SUPPORTED_FOR_POLICY_KIND/);
    await expect(buildHealthKitPayload({ kind: "policy", policyKind: "daily", sha: SHA, action: "activate", domains: "activity", effective: DAY, openEnded: true, families: "strength" }))
      .rejects.toThrow(/families/);
    await expect(buildHealthKitPayload({ kind: "policy", policyKind: "workout", sha: SHA, action: "activate", domains: "workout", effective: DAY, openEnded: true, families: "swimming" }))
      .rejects.toThrow(/families/);
    await expect(buildHealthKitPayload({ kind: "policy", policyKind: "sleep", sha: SHA, action: "activate", domains: "workout", effective: DAY, end: DAY }))
      .rejects.toThrow(/policy-kind/);
  });
});
