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
  "domain/services/HealthKitObservationService.js",
  "domain/services/HealthKitWorkoutLinkService.js",
  "domain/services/HealthKitWorkoutService.js",
  "platform/migration/phase4DomainCollections.js",
  "platform/operations/HealthKitActivationPolicyRunner.js",
  "platform/operations/HealthKitCanonicalAcceptanceAudit.js",
  "platform/operations/HealthKitWorkoutCanaryAudit.js",
]);
const NEEDLES = [
  "healthKitCanonicalDays", "healthKitObservations", "HEALTHKIT_CANONICAL_DAY_COLLECTION",
  "healthKitCanonicalWorkouts", "healthKitWorkoutLinks",
  "HEALTHKIT_CANONICAL_WORKOUT_COLLECTION", "HEALTHKIT_WORKOUT_LINK_COLLECTION",
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
});
