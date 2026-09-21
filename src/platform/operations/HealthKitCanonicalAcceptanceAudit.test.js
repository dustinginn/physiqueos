import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { createCanonicalPersistenceCommandPorts } from "../../application/commands/CanonicalPersistenceCommandPorts.js";
import { summarizeHealthKitCanonicalAcceptance } from "./HealthKitCanonicalAcceptanceAudit.js";
import { buildHealthKitPayload } from "../../../scripts/operations/buildHealthKitPayload.mjs";

const OWNER = "user_founder_001";
const SHA = "ba250af13e66b967a4dc8add09c5c5942b0606dd";

describe("HealthKit canonical acceptance audit", () => {
  it("proves one canonical day per domain, quarantine, provenance, and zero strategic HealthKit evidence", async () => {
    const records = createInMemoryCanonicalRecordStore({
      user: [{ id: OWNER, version: 1 }],
      healthKitObservations: [],
      healthKitCanonicalDays: [],
      healthKitConfiguration: [{
        id: "healthkit_canonical_daily_activation_policy",
        schemaVersion: "healthkit-canonical-activation-policy-v1",
        status: "enabled", domains: ["activity", "nutrition"],
        effectiveLocalDate: "2026-09-23", endLocalDate: "2026-09-23",
        strategicEvidenceEligibility: "quarantined", historicalBackfill: false, version: 1,
      }],
      canonicalEvidenceObjects: [{
        canonicalId: "activity_day|2026-09-23", version: 1, quality: { status: "active" },
        payload: { evidence_type: "activity_day", observed_at: "2026-09-23", daily_activity: { move_calories: 700 }, source: { application: "Apple Fitness", modality: "screenshot" } },
      }],
    });
    const ports = createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-24T09:30:00.000Z") });
    const ctx = (batchId, observations) => ({
      ownerUserId: OWNER, principal: { userId: OWNER, deviceId: "d1", sessionId: "s" },
      metadata: { clientOccurredAt: "2026-09-24T09:30:00.000Z" }, payload: { batchId, observations },
    });
    const source = { bundleIdentifier: "com.apple.Health", sourceName: "Apple Health" };
    const occurrence = { localDate: "2026-09-23", timeZone: "America/Los_Angeles" };
    await ports.ingestHealthKitObservations(ctx("b1", [
      { observationType: "activity_summary", externalId: "a:2026-09-23", source, occurrence,
        activitySummary: { aggregationScope: "daily_total_including_workouts", coverage: "complete_day", sourceRevision: 1, dailyActivity: { move_calories: 700.4, exercise_minutes: 40, stand_hours: 12 } } },
      { observationType: "nutrition_daily_total", externalId: "n:2026-09-23", source, occurrence,
        nutritionDailyTotal: { aggregationScope: "daily_total_all_sources", coverage: "complete_day", sourceRevision: 1, dailyNutrition: { calories: 2400, protein_g: 200, carbs_g: 250, fat_g: 70 } } },
    ]));
    const snapshot = records.snapshot();
    const summary = summarizeHealthKitCanonicalAcceptance({
      policyRecord: snapshot.healthKitConfiguration[0],
      observations: snapshot.healthKitObservations,
      canonicalDays: snapshot.healthKitCanonicalDays,
      canonicalEvidenceObjects: snapshot.canonicalEvidenceObjects,
      startLocalDate: "2026-09-22",
      endLocalDate: "2026-09-24",
      includeValues: false,
    });
    expect(summary.duplicateCanonicalDays).toEqual([]);
    expect(summary.canonicalDays.map((day) => `${day.domain}:${day.localDate}:${day.revision}`).sort())
      .toEqual(["activity:2026-09-23:1", "nutrition:2026-09-23:1"]);
    expect(summary.strategic).toEqual({
      healthKitCanonicalDaysStrategicEligible: 0,
      healthKitCanonicalDaysNotQuarantined: 0,
      healthKitActivityEligible: 0,
      healthKitNutritionEligible: 0,
      healthKitDerivedRecordsInStrategicEvidence: 0,
      healthKitDerivedRecordsInStrategicEvidenceWithinWindow: 0,
    });
    const activity = summary.canonicalDays.find((day) => day.domain === "activity");
    expect(activity.provenance).toMatchObject({ integration: "HealthKit", application: "Apple Health" });
    expect(activity.liveCoexistence).toMatchObject({ state: "consistent" });
    // Handoff-safe mode carries no health values.
    expect(JSON.stringify(summary)).not.toMatch(/2400|700\.4/);
    expect(summary.policy).toMatchObject({ enabled: true, strategicEvidenceEligibility: "quarantined", historicalBackfill: false });
  });

  it("reports a HealthKit-derived record inside strategic Evidence as a violation", () => {
    const summary = summarizeHealthKitCanonicalAcceptance({
      canonicalEvidenceObjects: [{ canonicalId: "x", payload: { evidence_type: "activity_day", observed_at: "2026-09-23", source: { integration: "HealthKit" } } }],
      startLocalDate: "2026-09-23", endLocalDate: "2026-09-23",
    });
    expect(summary.strategic.healthKitDerivedRecordsInStrategicEvidence).toBe(1);
    expect(summary.strategic.healthKitDerivedRecordsInStrategicEvidenceWithinWindow).toBe(1);
  });
});

describe("HealthKit production payload builder", () => {
  it("bundles a scoped, gated activation payload with baked identity and a success marker", async () => {
    const { code, marker } = await buildHealthKitPayload({
      kind: "policy", sha: SHA, action: "activate", domains: "activity,nutrition", effective: "2026-09-23", end: "2026-09-23",
    });
    expect(code.startsWith("// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ")).toBe(true);
    expect(code).toContain(marker);
    expect(code).toContain(SHA);
    expect(code).toContain("READ ONLY");
    expect(code).toContain("pg_advisory_xact_lock");
    expect(code).not.toMatch(/PHYSIQUEOS_DATABASE_URL\s*=/);
  });

  it("the activation entry prints its success marker only for the requested clean outcome", () => {
    const entry = fs.readFileSync(new URL("../../../scripts/operations/healthKitActivationPolicy.entry.mjs", import.meta.url), "utf8");
    const guard = entry.indexOf('const expectedOutcome = MODE === "apply" ? "applied" : "dry_run"');
    const marker = entry.lastIndexOf("process.stdout.write(`${MARKER}");
    expect(guard).toBeGreaterThan(0);
    expect(marker).toBeGreaterThan(guard);
    expect(entry).toContain("if (result.outcome !== expectedOutcome) stop(");
  });

  it("refuses apply without an authorization reference and expected facts", async () => {
    await expect(buildHealthKitPayload({ kind: "policy", sha: SHA, action: "activate", domains: "activity", effective: "2026-09-23", end: "2026-09-23", mode: "apply" }))
      .rejects.toThrow(/authorization-ref/);
    await expect(buildHealthKitPayload({ kind: "policy", sha: "abc", action: "activate", effective: "2026-09-23", end: "2026-09-23" }))
      .rejects.toThrow(/40-hex/);
  });

  it("bundles a read-only audit that opens only a READ ONLY transaction and never writes", async () => {
    const { code } = await buildHealthKitPayload({ kind: "audit", sha: SHA, start: "2026-09-22", end: "2026-09-24" });
    expect(code).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(code).toContain("transaction_read_only");
    // The bundled record store contains write methods the entry never calls; the
    // database itself enforces the READ ONLY transaction. Check the entry's own calls.
    const entry = fs.readFileSync(new URL("../../../scripts/operations/healthKitCanonicalAcceptanceAudit.entry.mjs", import.meta.url), "utf8");
    expect(entry).not.toMatch(/INSERT INTO|UPDATE physiqueos|DELETE FROM|records\.put|putIfAbsent|COMMIT/);
  });
});
