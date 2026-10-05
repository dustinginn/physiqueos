import { describe, expect, it } from "vitest";
import { assessHealthKitSleepStrategicEligibility } from "./HealthKitSleepStrategicEligibility.js";

const broad = { schemaVersion: "healthkit-sleep-strategic-eligibility-v1", enabled: true, strategicEffectiveAt: "2026-11-01" };

describe("Sleep strategic quarantine", () => {
  it("categorically refuses historical imports even under a future broad policy", () => {
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2030-01-01", ingestionPurpose: "historical_evidence_import" }, broad))
      .toEqual({ eligible: false, permanent: true, reason: "historical_evidence_import_permanently_display_only" });
  });
  it("keeps validation-only prospective data quarantined without an explicit policy", () => {
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2030-01-01", ingestionPurpose: "validation_only" }))
      .toMatchObject({ eligible: false, reason: "prospective_validation_only_quarantined" });
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2026-10-31", ingestionPurpose: "validation_only" }, broad).eligible).toBe(false);
  });
  it("treats ingestion purpose as provenance: a prospective canary day follows the explicit policy boundary", () => {
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2026-11-01", ingestionPurpose: "validation_only" }, broad))
      .toMatchObject({ eligible: true, reason: "explicit_sleep_strategic_policy" });
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2026-11-09", ingestionPurpose: "operational" }, { ...broad, endSleepDay: "2026-11-08" }))
      .toMatchObject({ eligible: false, reason: "after_strategic_end_boundary" });
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2026-11-02", ingestionPurpose: "something_else" }, broad).eligible).toBe(false);
  });
  it("models but does not enable a future operational strategicEffectiveAt", () => {
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2026-10-31", ingestionPurpose: "operational" }, broad).eligible).toBe(false);
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2026-11-01", ingestionPurpose: "operational" }, broad).eligible).toBe(true);
    expect(assessHealthKitSleepStrategicEligibility({ sleepDay: "2030-01-01", ingestionPurpose: "operational" }).eligible).toBe(false);
  });
});
