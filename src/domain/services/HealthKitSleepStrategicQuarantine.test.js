import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertNotQuarantinedHealthKitEvidence,
  assessHealthKitStrategicEvidenceEligibility,
  selectStrategicallyEligibleRecords,
} from "./HealthKitEvidenceEligibilityPolicy.js";
import { resolveHealthKitGraduationPolicy, HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION } from "./HealthKitGraduation.js";
import { DEFAULT_SETTLEMENT_POLICY } from "./BriefingEvidenceSettlementPolicy.js";
import { canonicalizeHealthKitSleep } from "./HealthKitSleepCanonicalizer.js";
import { createHealthKitSleepTombstoneRecord } from "./HealthKitSleepContract.js";
import { redactStructuredValue } from "../../platform/observability/structuredLogger.js";
import { OWNER, stored, uuid } from "../../testSupport/healthKitSleepSynthetic.js";

// Strategic quarantine for HealthKit Sleep, made structural. Stored Sleep is
// always quarantined. Its ONLY strategic path is the reviewed, prospective
// Sleep graduation (HealthKitSleepGraduation.js via the graduation reader): a
// read-time `sleep_night` projection under the evidence-only `sleep` scope.
// No strategic reader (V3, briefings/readiness, Goal or Strategy confidence,
// recommendations, Home) may read Sleep storage itself; widening this list is a
// reviewed code change here.

const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname, "src");
const SLEEP_NEEDLES = [
  "HealthKitSleep", "healthKitSleepSamples", "healthKitSleepDays", "healthkit_sleep_", "healthkit.sleep.ingest",
  "HEALTHKIT_SLEEP_", "canonicalizeHealthKitSleep", "INGEST_HEALTHKIT_SLEEP", "healthkit-sleep-",
];
// Every non-test file allowed to mention Sleep ingestion. Composition and the
// Native contract are transport; none of them is a strategic reader.
const SLEEP_ALLOWED = new Set([
  "domain/services/HealthKitSleepContract.js",
  "domain/services/HealthKitSleepPolicies.js",
  "domain/services/HealthKitSleepCanonicalizer.js",
  "domain/services/HealthKitEvidenceEligibilityPolicy.js",
  "application/commands/HealthKitSleepIngestPort.js",
  "application/commands/CanonicalPersistenceCommandPorts.js",
  "application/commands/Phase3CommandService.js",
  "application/native/HealthKitSleepCapabilityReadService.js",
  "application/native/NativeProductionContractService.js",
  "application/native/nativeProductionContractManifest.js",
  "application/native/nativeCommandRequestBounds.js",
  "application/composition/productionApplicationComposition.js",
  "platform/auth/nativeProductionContractRuntime.js",
  "platform/migration/phase4DomainCollections.js",
  "testSupport/healthKitSleepSynthetic.js",
  // Phase C isolated historical-validation lane and guarded operations.
  "domain/services/HealthKitSleepHistoricalValidation.js",
  "application/commands/HealthKitSleepHistoricalValidationPort.js",
  "application/commands/HealthKitSleepHistoricalEvidenceImportPort.js",
  "application/recovery/HealthKitSleepEvidenceReadService.js",
  "domain/services/HealthKitSleepStrategicEligibility.js",
  "platform/database/PostgresHealthKitSleepEvidenceReadStore.js",
  "platform/operations/HealthKitSleepPolicyRunner.js",
  "platform/operations/HealthKitSleepAudit.js",
  // Bounded prospective-only sleep-canon-v3 activation (guarded operation).
  "platform/operations/HealthKitSleepCanonV3Activation.js",
  // Prospective Sleep -> V3 graduation: eligibility + read-time projection, the
  // one reader seam that loads canonical nights for it, and the guarded
  // graduation-policy operation that simulates it.
  "domain/services/HealthKitSleepGraduation.js",
  "platform/database/HealthKitGraduationReader.js",
  "platform/operations/HealthKitGraduationPolicyRunner.js",
]);
const STRATEGIC_DIRECTORIES = ["domain/intelligence", "app/briefings", "app/confidence", "application/core", "application/progress", "application/read-models"];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full);
    return /\.(js|jsx|mjs|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

const night = () => stored({ id: uuid(1), source: "oura", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T07:00:00-07:00" });

describe("HealthKit Sleep strategic quarantine", () => {
  it("only the Sleep contract/ingest/transport files mention Sleep ingestion; no strategic reader does", () => {
    const offenders = walk(ROOT)
      .map((file) => path.relative(ROOT, file))
      .filter((relative) => !SLEEP_ALLOWED.has(relative))
      .filter((relative) => SLEEP_NEEDLES.some((needle) => fs.readFileSync(path.join(ROOT, relative), "utf8").includes(needle)));
    expect(offenders).toEqual([]);
    for (const relative of SLEEP_ALLOWED) {
      expect(STRATEGIC_DIRECTORIES.some((directory) => relative.startsWith(directory)), relative).toBe(false);
      expect(fs.existsSync(path.join(ROOT, relative)), relative).toBe(true);
    }
  });

  it("stored Sleep samples, days and tombstones are HealthKit-derived and refused by the strategic write guard", () => {
    const sample = night();
    const day = { ...canonicalizeHealthKitSleep({ samples: [sample] }).get("2026-09-11"), id: "healthkit_sleep_day_2026-09-11" };
    const tombstone = createHealthKitSleepTombstoneRecord({ ownerUserId: OWNER, externalId: uuid(2), deletedAt: "2026-09-11T00:00:00Z", batchId: "b", deletionSource: "hk_deleted_object" });
    for (const record of [sample, day, tombstone]) {
      expect(assessHealthKitStrategicEvidenceEligibility(record)).toMatchObject({ applicable: true, eligible: false, state: "quarantined" });
      expect(() => assertNotQuarantinedHealthKitEvidence(record)).toThrow(expect.objectContaining({ code: "HEALTHKIT_STRATEGIC_EVIDENCE_QUARANTINED" }));
    }
    // Even without its id, a canonical day is recognised by its schema.
    const { id: _id, ...anonymousDay } = day;
    expect(assessHealthKitStrategicEvidenceEligibility(anonymousDay).state).toBe("quarantined");
    expect(selectStrategicallyEligibleRecords([sample, day, { id: "manual-check-in" }])).toEqual([{ id: "manual-check-in" }]);
  });

  it("Sleep is an evidence-eligibility domain only: a projection scope naming sleep disables every scope", () => {
    const scope = { enabled: true, domains: ["sleep"], startLocalDate: "2026-09-10" };
    const evidence = resolveHealthKitGraduationPolicy({ schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION, evidenceEligibility: scope });
    expect(evidence).toMatchObject({ valid: true });
    expect(evidence.evidenceEligibility.domains).toEqual(["sleep"]);
    expect(evidence.projection.enabled).toBe(false);
    const projection = resolveHealthKitGraduationPolicy({ schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION, projection: scope, evidenceEligibility: scope });
    expect(projection).toMatchObject({ valid: false, invalidReason: "scope_invalid" });
    expect(projection.evidenceEligibility.enabled).toBe(false);
  });

  it("Sleep is not a briefing readiness domain (supporting evidence never holds a briefing)", () => {
    expect(DEFAULT_SETTLEMENT_POLICY.readinessDomains).not.toContain("sleep");
    expect(DEFAULT_SETTLEMENT_POLICY.readinessDomains).toEqual(["activity", "nutrition"]);
  });
});

describe("HealthKit Sleep privacy in logs", () => {
  it("redacts Sleep, source-name and device-name keys from structured logs", () => {
    const redacted = redactStructuredValue({
      event: "sleep.ingest",
      sleepDay: "2026-09-11",
      sleepSamples: [{ stage: "asleep_deep" }],
      sourceName: "A Person's Apple Watch",
      deviceName: "A Person's iPhone",
      batchId: "b1",
    });
    expect(redacted).toEqual({
      event: "sleep.ingest",
      sleepDay: "[REDACTED]",
      sleepSamples: "[REDACTED]",
      sourceName: "[REDACTED]",
      deviceName: "[REDACTED]",
      batchId: "b1",
    });
  });
});
