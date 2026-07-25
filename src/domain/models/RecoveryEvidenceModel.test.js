import { describe, expect, it } from "vitest";
import {
  assignPreviousNightSleepEvidenceDate,
  createCanonicalRecoveryEvidenceObject,
  createRecoveryEvidenceRecord,
} from "./RecoveryEvidenceModel";

describe("RecoveryEvidenceModel", () => {
  it.each([
    ["sleep_duration", 7.5, "hours"],
    ["subjective_recovery", "good", "category"],
    ["soreness", "moderate", "category"],
  ])("creates deterministic canonical %s evidence", (metric, value, unit) => {
    const input = fixture({ metric, value, unit });
    const before = structuredClone(input);
    const first = createRecoveryEvidenceRecord(input);
    expect(createRecoveryEvidenceRecord(input)).toEqual(first);
    expect(input).toEqual(before);
    expect(first).toMatchObject({
      schemaVersion: "recovery_evidence_v1",
      type: "physiological_recovery",
      metric,
      value,
      unit,
      evidenceDate: "2026-07-25",
      timezone: "America/Los_Angeles",
      confidence: { level: "normal" },
    });
    expect(createCanonicalRecoveryEvidenceObject(first)).toMatchObject({
      canonicalId: first.id,
      evidence_type: "recovery",
      payload: first,
    });
  });

  it("assigns previous-night sleep once to the local check-in date", () => {
    expect(assignPreviousNightSleepEvidenceDate({
      checkInDate: "2026-07-25",
    })).toBe("2026-07-25");
    const result = createRecoveryEvidenceRecord(fixture({
      metric: "sleep_duration",
      value: 7.25,
      unit: "hours",
      sleepEpisode: {
        start: "2026-07-24T23:15:00-07:00",
        end: "2026-07-25T06:30:00-07:00",
      },
    }));
    expect(result.sleepEpisode).toMatchObject({
      timezone: "America/Los_Angeles",
    });
  });

  it.each([-1, 25, Number.NaN])("rejects invalid sleep duration %s", (value) => {
    expect(() => createRecoveryEvidenceRecord(fixture({
      metric: "sleep_duration",
      value,
      unit: "hours",
    }))).toThrow("Sleep duration");
  });

  it.each([
    ["subjective_recovery", "amazing"],
    ["soreness", "injured"],
  ])("rejects unsupported %s values", (metric, value) => {
    expect(() => createRecoveryEvidenceRecord(fixture({
      metric,
      value,
      unit: "category",
    }))).toThrow("Unsupported");
  });

  it("preserves identity when value, confidence, and limitations change", () => {
    const first = createRecoveryEvidenceRecord(fixture());
    const changed = createRecoveryEvidenceRecord(fixture({
      value: 8,
      confidence: { level: "high" },
      limitations: ["source_range_unknown"],
    }));
    expect(changed.id).toBe(first.id);
  });

  it("supports explicit correction lineage without self-reference", () => {
    const original = createRecoveryEvidenceRecord(fixture());
    const corrected = createRecoveryEvidenceRecord(fixture({
      sourceRecordId: "checkin:2026-07-25:sleep_duration:v2",
      correctsEvidenceId: original.id,
      supersedesEvidenceId: original.id,
      value: 8,
    }));
    expect(corrected).toMatchObject({
      isCorrection: true,
      correctsEvidenceId: original.id,
      supersedesEvidenceId: original.id,
    });
    expect(() => createRecoveryEvidenceRecord(fixture({
      id: original.id,
      correctsEvidenceId: original.id,
    }))).toThrow("cannot reference itself");
  });

  it.each([
    { metric: "protocol_adherence", value: "completed", unit: "category" },
    { metric: "subjective_recovery", value: "foam rolling completed", unit: "category" },
    { metric: "sleep_duration", value: "poor sleep note", unit: "hours" },
    { source: { kind: "oura" } },
  ])("rejects unsupported, freeform, protocol, and fabricated source input", (override) => {
    const source = override.source
      ? { ...fixture().source, ...override.source }
      : fixture().source;
    expect(() => createRecoveryEvidenceRecord(fixture({
      ...override,
      source,
    }))).toThrow();
  });
});

function fixture(overrides = {}) {
  const recordedAt = "2026-07-25T07:00:00-07:00";
  return {
    userId: "user",
    metric: "sleep_duration",
    value: 7.5,
    unit: "hours",
    evidenceDate: "2026-07-25",
    recordedAt,
    timezone: "America/Los_Angeles",
    source: {
      kind: "manual_check_in",
      name: "Morning Check-In",
      ingestionPath: "morning_check_in_recovery",
      recordedAt,
      confidence: "normal",
    },
    sourceRecordId: "checkin:2026-07-25:sleep_duration:v1",
    sourceEvidenceIds: ["daily_check_in_2026_07_25"],
    confidence: { level: "normal" },
    createdAt: recordedAt,
    updatedAt: recordedAt,
    ...overrides,
  };
}
