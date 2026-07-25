import { describe, expect, it } from "vitest";
import { assessRecoveryEvidence } from "./RecoveryEvidenceAssessmentService";
import { createRecoveryEvidenceRecord } from "../models/RecoveryEvidenceModel";
import { createRecoveryPIObservations } from "./RecoveryPIObservationService";

function record(metric, value, date) {
  const timestamp = `${date}T14:00:00.000Z`;
  return createRecoveryEvidenceRecord({
    userId: "founder", metric, value, evidenceDate: date,
    recordedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
    timezone: "America/Los_Angeles",
    source: { kind: "manual_check_in", name: "Morning Check-In",
      ingestionPath: "structured_recovery_check_in", recordedAt: timestamp },
    sourceRecordId: `${date}-${metric}`,
  });
}
function assessment(records) {
  return assessRecoveryEvidence({
    records, cadence: "midweek",
    currentWindow: { startDate: "2026-07-20", endDate: "2026-07-22" },
    comparisonWindow: { startDate: "2026-07-13", endDate: "2026-07-15" },
    timezone: "America/Los_Angeles",
  });
}

describe("RecoveryPIObservationService", () => {
  it("creates stable semantic IDs that exclude values and direction", () => {
    const first = createRecoveryPIObservations({ assessment: assessment([
      record("soreness", "mild", "2026-07-20"),
      record("soreness", "mild", "2026-07-21"),
      record("soreness", "high", "2026-07-13"),
    ]) });
    const second = createRecoveryPIObservations({ assessment: assessment([
      record("soreness", "high", "2026-07-20"),
      record("soreness", "severe", "2026-07-21"),
      record("soreness", "mild", "2026-07-13"),
    ]) });
    const pick = (items) => items.find((item) => item.kind === "recovery_soreness_change");
    expect(pick(first).id).toBe(pick(second).id);
    expect(pick(first).direction).not.toBe(pick(second).direction);
  });

  it("emits explicit insufficiency for sparse evidence", () => {
    const observations = createRecoveryPIObservations({ assessment: assessment([
      record("subjective_recovery", "poor", "2026-07-20"),
    ]) });
    expect(observations.some((item) =>
      item.kind === "recovery_insufficient_evidence" &&
      item.status === "insufficient_data"
    )).toBe(true);
  });

  it("keeps output observational, non-diagnostic, non-causal and non-prescriptive", () => {
    const observations = createRecoveryPIObservations({ assessment: assessment([
      record("sleep_duration", 8, "2026-07-20"),
      record("sleep_duration", 7.5, "2026-07-21"),
      record("sleep_duration", 6, "2026-07-13"),
    ]) });
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toMatch(/overtrain|under.?recover|injury risk|sleep disorder/i);
    expect(observations.every((item) =>
      item.explanationData?.causalInference !== true &&
      !Object.hasOwn(item.explanationData ?? {}, "recommendation")
    )).toBe(true);
  });
});
