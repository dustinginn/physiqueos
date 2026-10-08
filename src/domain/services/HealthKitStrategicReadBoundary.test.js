import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Read-side quarantine, made structural. HealthKit canonical days and raw
// observations may be referenced only by the ingestion, operations, audit, and
// diagnostic files listed here. A strategic reader (V3, Confidence, Energy,
// briefings, Training, Goal) that starts loading them must fail this test and
// be reviewed against the eligibility policy first.
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname, "src");
const ALLOWED = new Set([
  "application/commands/CanonicalPersistenceCommandPorts.js",
  "application/native/HealthKitCanaryDiagnosticReadService.js",
  // Contract description text only; it loads nothing.
  "application/native/nativeProductionContractManifest.js",
  "domain/services/HealthKitCanonicalDayService.js",
  "domain/services/HealthKitEvidenceEligibilityPolicy.js",
  // Graduation: read-time overlay of accepted canonical days (policy-controlled).
  "domain/services/HealthKitGraduation.js",
  "platform/database/HealthKitGraduationReader.js",
  // Prospective Sleep graduation: per-night eligibility + read-time sleep_night
  // projection (policy-controlled; the reader above does the bounded load).
  "domain/services/HealthKitSleepGraduation.js",
  "domain/services/HealthKitObservationService.js",
  "domain/services/HealthKitWorkoutLinkService.js",
  "domain/services/HealthKitWorkoutPresentationService.js",
  "domain/services/HealthKitWorkoutRelationshipService.js",
  "domain/services/HealthKitWorkoutService.js",
  // Presentation-only read path for confirmed, quarantined relationships.
  // These readers may project provenance/telemetry but the projection service
  // rejects strategic eligibility and additive Activity semantics.
  "application/core/CoreNavigationReadService.js",
  "platform/database/PostgresProgressEvidenceReadStore.js",
  "platform/database/PostgresTrainingNavigationReadStore.js",
  "platform/migration/phase4DomainCollections.js",
  "platform/operations/HealthKitActivationPolicyRunner.js",
  "platform/operations/HealthKitCanonicalAcceptanceAudit.js",
  "platform/operations/HealthKitGraduationPolicyRunner.js",
  "platform/operations/HealthKitWorkoutCanaryAudit.js",
  // Split the name so the independent structural test that enumerates actual
  // runner importers does not mistake this allowlist string for an import.
  ["platform/operations", "HealthKitDeferredWorkout" + "ReconciliationRunner.js"].join("/"),
  // Guarded, explicitly authorized link confirmation: the only production caller of the relationship service.
  "platform/operations/HealthKitWorkoutLinkConfirmationRunner.js",
  // One-date, transaction-guarded acceptance operation; it preserves quarantine.
  "platform/operations/HealthKitStrengthAutoConfirmAcceptanceRunner.js",
  // Guarded, candidate-only reassessment of one already-canonical workout.
  "platform/operations/HealthKitWorkoutLinkReassessmentRunner.js",
  // Guarded one-time repair of the two 2026-10-02 unsupported-type workouts
  // (Stair Stepper, Cooldown); canonical workouts stay quarantined.
  "platform/operations/HealthKitUnsupportedWorkoutTypeRepairRunner.js",
  // HealthKit Sleep (Phase A, dormant): contract, policies, pure canonicalizer,
  // the Sleep ingest port, and the one-record manifest capability reader.
  "domain/services/HealthKitSleepContract.js",
  "domain/services/HealthKitSleepPolicies.js",
  "domain/services/HealthKitSleepCanonicalizer.js",
  "application/commands/HealthKitSleepIngestPort.js",
  "application/native/HealthKitSleepCapabilityReadService.js",
  "platform/database/PostgresHealthKitSleepEvidenceReadStore.js",
  // Phase C: isolated historical-validation lane, guarded Sleep policy
  // runner, and the zero-write Sleep audit.
  "domain/services/HealthKitSleepHistoricalValidation.js",
  "application/commands/HealthKitSleepHistoricalValidationPort.js",
  "platform/operations/HealthKitSleepPolicyRunner.js",
  "platform/operations/HealthKitSleepAudit.js",
  "platform/operations/HealthKitSleepCanonV3Activation.js",
  // Recovery Briefing V1 (Weekly/Monthly only): the bounded, read-only loader of
  // ordinary canonical Sleep days for the NON-strategic Recovery projection.
  // Wired for Weekly/Monthly only; OFF without the authority record; it never
  // loads historical Sleep.
  "platform/database/RecoverySleepInputReaderV1.js",
]);
const NEEDLES = [
  "healthKitCanonicalDays", "healthKitObservations", "HEALTHKIT_CANONICAL_DAY_COLLECTION",
  "healthKitCanonicalWorkouts", "healthKitWorkoutLinks",
  "HEALTHKIT_CANONICAL_WORKOUT_COLLECTION", "HEALTHKIT_WORKOUT_LINK_COLLECTION",
  "healthKitWorkoutLinkClaims", "HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION",
  "healthKitSleepSamples", "healthKitSleepDays",
  "HEALTHKIT_SLEEP_SAMPLE_COLLECTION", "HEALTHKIT_SLEEP_DAY_COLLECTION",
  "healthKitSleepValidationSamples", "HEALTHKIT_SLEEP_VALIDATION_SAMPLE_COLLECTION",
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "fixtures" || entry.name === "node_modules" ? [] : walk(full);
    return /\.(js|jsx|mjs|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

describe("HealthKit strategic read boundary", () => {
  it("lets only the ingestion, operation, audit, and diagnostic files reference HealthKit collections", () => {
    const offenders = walk(ROOT)
      .map((file) => path.relative(ROOT, file))
      .filter((relative) => !ALLOWED.has(relative))
      .filter((relative) => NEEDLES.some((needle) => fs.readFileSync(path.join(ROOT, relative), "utf8").includes(needle)));
    expect(offenders).toEqual([]);
  });

  it("keeps every allowlisted file real, so the allowlist cannot silently rot", () => {
    for (const relative of ALLOWED) expect(fs.existsSync(path.join(ROOT, relative)), relative).toBe(true);
  });

  // The graduation reader is the ONE sanctioned way a normal reader sees a
  // canonical HealthKit day. It is enumerated so a new reader cannot start
  // consuming HealthKit days by accident, and no write path may import it.
  const READER_IMPORTERS = new Set([
    "application/composition/providerBriefingCadenceComposition.js",
    "platform/database/PostgresCoreNavigationReadStore.js",
    "platform/database/PostgresPhotoEventReadStore.js",
    "platform/database/PostgresProgressHubReadStore.js",
    "platform/database/PostgresEvidenceTimelineReadStore.js",
    "platform/database/PostgresProgressEvidenceReadStore.js",
  ]);
  const importersOf = (needle) => walk(ROOT)
    .map((file) => path.relative(ROOT, file))
    .filter((relative) => fs.readFileSync(path.join(ROOT, relative), "utf8").includes(needle));

  it("enumerates every reader of graduated HealthKit days", () => {
    const importers = importersOf("HealthKitGraduationReader").filter((relative) => relative !== "platform/database/HealthKitGraduationReader.js");
    expect(new Set(importers)).toEqual(READER_IMPORTERS);
  });

  it("keeps graduated days out of every write, command, repair and ingestion path", () => {
    const writePaths = walk(ROOT)
      .map((file) => path.relative(ROOT, file))
      .filter((relative) => /^(application\/commands|application\/native\/nativeCommand|domain\/services\/.*(Repair|Commit|Recovery|Migration))/.test(relative));
    expect(writePaths.length).toBeGreaterThan(0);
    for (const relative of writePaths) {
      const source = fs.readFileSync(path.join(ROOT, relative), "utf8");
      expect(source, relative).not.toMatch(/HealthKitGraduation|overlayGraduatedHealthKitDays/);
    }
  });

  it("uses the strategic (evidence) purpose only where briefings are generated or the V3 evidence universe is assembled", () => {
    const strategic = importersOf("HealthKitGraduationPurpose.EVIDENCE")
      // The two operations only REPORT a read-only strategic prediction in their dry-run output.
      .filter((relative) => !/^domain\/services\/HealthKitGraduation\.js$|^platform\/database\/HealthKitGraduationReader\.js$|^platform\/operations\/HealthKitGraduationPolicyRunner\.js$|^platform\/operations\/HealthKitUnsupportedWorkoutTypeRepairRunner\.js$/.test(relative));
    expect(new Set(strategic)).toEqual(new Set([
      "application/composition/providerBriefingCadenceComposition.js",
      "platform/database/PostgresPhotoEventReadStore.js",
    ]));
  });
});
