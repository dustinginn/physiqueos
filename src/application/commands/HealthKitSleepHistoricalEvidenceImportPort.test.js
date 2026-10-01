import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createHealthKitSleepHistoricalEvidenceImportPort, HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_IMPORT } from "./HealthKitSleepHistoricalEvidenceImportPort.js";

const OWNER = "owner";
const sample = (overrides = {}) => ({
  externalId: "00000000-0000-4000-8000-000000000001", categoryValue: 3,
  startedAt: "2026-07-05T23:00:00-07:00", endedAt: "2026-07-06T07:00:00-07:00",
  timeZone: "America/Los_Angeles", timeZoneSource: "device_at_ingest", wasUserEntered: false,
  source: { bundleIdentifier: "com.ouraring.oura", sourceVersion: "1" }, ...overrides,
});

function setup() {
  const records = createInMemoryCanonicalRecordStore({
    healthKitConfiguration: [], healthKitSleepHistoricalEvidenceSamples: [], healthKitSleepHistoricalEvidenceDays: [],
  });
  const port = createHealthKitSleepHistoricalEvidenceImportPort({ records, now: () => new Date("2026-10-01T12:00:00Z") });
  return { records, run: (payload) => port({ ownerUserId: OWNER, principal: { deviceId: "device" }, payload }) };
}

describe("historical Sleep Evidence import", () => {
  it("stores only in structurally separate collections with permanent quarantine", async () => {
    const current = setup();
    const result = await current.run({ batchId: "b1", runId: HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_IMPORT.runId, samples: [sample()] });
    expect(result.result).toMatchObject({ origin: "historical_evidence_import", strategicEvidenceEligibility: "permanently_quarantined" });
    const state = current.records.snapshot();
    expect(state.healthKitSleepSamples).toBeUndefined();
    expect(state.healthKitSleepDays).toBeUndefined();
    expect(state.healthKitSleepHistoricalEvidenceSamples[0]).toMatchObject({ origin: "historical_evidence_import", ingestionPurpose: "historical_evidence_import", strategicEligible: false, evidenceEligibility: { permanent: true } });
    expect(state.healthKitSleepHistoricalEvidenceDays.find((day) => day.sleepDay === "2026-07-06"))
      .toMatchObject({ origin: "historical_evidence_import", ingestionPurpose: "historical_evidence_import", strategicEligible: false, evidenceEligibility: { permanent: true }, algorithmVersion: "sleep-canon-v2" });
  });

  it("refuses client window widening and non-sample mutation shapes", async () => {
    const current = setup();
    await expect(current.run({ batchId: "bad", runId: "other", samples: [sample()] })).rejects.toMatchObject({ status: 409 });
    await expect(current.run({ batchId: "early", runId: HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_IMPORT.runId, samples: [sample({ startedAt: "2026-07-03T23:00:00-07:00", endedAt: "2026-07-04T07:00:00-07:00" })] })).rejects.toMatchObject({ code: "HEALTHKIT_SLEEP_HISTORICAL_IMPORT_OUTSIDE_WINDOW" });
    await expect(current.run({ batchId: "delete", runId: HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_IMPORT.runId, samples: [sample()], deletions: [] })).rejects.toMatchObject({ code: "HEALTHKIT_SLEEP_HISTORICAL_IMPORT_SAMPLES_ONLY" });
    expect(current.records.getMutationCount()).toBe(0);
  });
});
