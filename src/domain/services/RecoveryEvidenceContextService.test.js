import { describe, expect, it } from "vitest";
import { createRecoveryEvidenceContext } from "./RecoveryEvidenceContextService";
import { createRecoveryEvidenceRecord } from "../models/RecoveryEvidenceModel";

describe("RecoveryEvidenceContextService", () => {
  it.each([
    ["daily", window("2026-07-25", "2026-07-25"), 1],
    ["midweek", window("2026-07-20", "2026-07-24"), 5],
    ["weekly", window("2026-07-19", "2026-07-25"), 7],
  ])("keeps %s reads inside the exact window", async (_cadence, evidenceWindow, expectedDays) => {
    const records = [
      record("2026-07-18", "sleep_duration", 7, "hours"),
      record("2026-07-20", "subjective_recovery", "good", "category"),
      record("2026-07-25", "soreness", "mild", "category"),
      record("2026-07-26", "sleep_duration", 8, "hours"),
    ];
    const result = await createRecoveryEvidenceContext({
      records,
      userId: "user",
      window: evidenceWindow,
      timezone: "America/Los_Angeles",
    });
    expect(result.expectedDayCount).toBe(expectedDays);
    expect(result.records.every(
      (item) =>
        item.evidenceDate >= evidenceWindow.startDate &&
        item.evidenceDate <= evidenceWindow.endDate
    )).toBe(true);
    expect(result).toMatchObject({
      interpretationPerformed: false,
      repositoryReads: 0,
    });
  });

  it("groups multiple metrics and sources without judging Recovery", async () => {
    const records = [
      record("2026-07-25", "sleep_duration", 7.5, "hours"),
      record("2026-07-25", "subjective_recovery", "good", "category"),
      record("2026-07-25", "soreness", "mild", "category"),
    ];
    const result = await createRecoveryEvidenceContext({
      records,
      userId: "user",
      window: window("2026-07-25", "2026-07-25"),
      timezone: "America/Los_Angeles",
    });
    expect(result).toMatchObject({
      coveredDayCount: 1,
      missingDayCount: 0,
      sourceCoverage: { manual_check_in: 3 },
      metricCoverage: {
        sleep_duration: { recordCount: 1, coveredDayCount: 1 },
        subjective_recovery: { recordCount: 1, coveredDayCount: 1 },
        soreness: { recordCount: 1, coveredDayCount: 1 },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/good recovery|poor recovery|recommend/i);
  });

  it("excludes superseded, invalid, duplicate, other-user, and out-of-window records", async () => {
    const active = record("2026-07-25", "sleep_duration", 8, "hours");
    const result = await createRecoveryEvidenceContext({
      canonicalEvidenceObjects: [
        canonical(active),
        canonical(active),
        canonical({ ...active, id: `${active.id}:old`, status: "superseded" }),
        canonical({ ...active, id: `${active.id}:invalid`, status: "invalid" }),
        canonical({ ...active, id: `${active.id}:other`, userId: "other" }),
      ],
      userId: "user",
      window: window("2026-07-25", "2026-07-25"),
      timezone: "America/Los_Angeles",
    });
    expect(result.records).toEqual([active]);
  });

  it("returns a neutral empty state and performs one bounded repository read", async () => {
    let reads = 0;
    const result = await createRecoveryEvidenceContext({
      repository: {
        async listRecoveryEvidenceInWindow() {
          reads += 1;
          return [];
        },
      },
      userId: "user",
      window: window("2026-07-25", "2026-07-25"),
      timezone: "America/Los_Angeles",
    });
    expect(reads).toBe(1);
    expect(result).toMatchObject({
      records: [],
      coveredDayCount: 0,
      missingDayCount: 1,
      repositoryReads: 1,
      limitations: [
        "recovery_evidence_unavailable",
        "recovery_evidence_coverage_partial",
      ],
    });
  });
});

function record(date, metric, value, unit) {
  const recordedAt = `${date}T07:00:00-07:00`;
  return createRecoveryEvidenceRecord({
    userId: "user",
    metric,
    value,
    unit,
    evidenceDate: date,
    recordedAt,
    timezone: "America/Los_Angeles",
    source: {
      kind: "manual_check_in",
      name: "Morning Check-In",
      ingestionPath: "morning_check_in_recovery",
      recordedAt,
      confidence: "normal",
    },
    sourceRecordId: `checkin:${date}:${metric}:v1`,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  });
}
function canonical(payload) {
  return {
    canonicalId: payload.id,
    userId: payload.userId,
    evidence_type: "recovery",
    payload,
  };
}
function window(startDate, endDate) {
  return { startDate, endDate };
}
