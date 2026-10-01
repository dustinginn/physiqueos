import { describe, expect, it } from "vitest";
import { assessHealthKitSleepStrategicEligibility } from "./HealthKitSleepStrategicEligibility.js";

const broad = { schemaVersion: "healthkit-sleep-strategic-eligibility-v1", enabled: true, strategicEffectiveAt: "2026-11-01" };

describe("Sleep strategic quarantine", () => {
  it("categorically refuses historical imports even under a future broad policy", () => {
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2030-01-01", ingestionPurpose: "historical_evidence_import" }, broad))
      .toEqual({ eligible: false, permanent: true, reason: "historical_evidence_import_permanently_display_only" });
  });
  it("keeps validation-only prospective data quarantined", () => {
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2030-01-01", ingestionPurpose: "validation_only" }, broad).eligible).toBe(false);
  });
  it("models but does not enable a future operational strategicEffectiveAt", () => {
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2026-10-31", ingestionPurpose: "operational" }, broad).eligible).toBe(false);
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2026-11-01", ingestionPurpose: "operational" }, broad).eligible).toBe(true);
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2030-01-01", ingestionPurpose: "operational" }).eligible).toBe(false);
  });
});
