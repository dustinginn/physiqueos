import { describe, expect, it } from "vitest";
import { createRecoveryEvidenceRecord } from "../models/RecoveryEvidenceModel";
import { assessRecoveryEvidence } from "./RecoveryEvidenceAssessmentService";

const timezone = "America/Los_Angeles";
function record(metric, value, evidenceDate, suffix = "v1", status = "valid") {
  const timestamp = `${evidenceDate}T14:00:00.000Z`;
  return createRecoveryEvidenceRecord({
    userId: "founder",
    metric,
    value,
    status,
    evidenceDate,
    recordedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    timezone,
    source: {
      kind: "manual_check_in",
      name: "Morning Check-In",
      ingestionPath: "structured_recovery_check_in",
      recordedAt: timestamp,
      confidence: "normal",
    },
    sourceRecordId: `${evidenceDate}-${metric}-${suffix}`,
  });
}
function assess(records, overrides = {}) {
  return assessRecoveryEvidence({
    records,
    cadence: "midweek",
    currentWindow: { startDate: "2026-07-20", endDate: "2026-07-22" },
    comparisonWindow: { startDate: "2026-07-13", endDate: "2026-07-15" },
    timezone,
    expectedDates: ["2026-07-20", "2026-07-21", "2026-07-22"],
    ...overrides,
  });
}

describe("RecoveryEvidenceAssessmentService", () => {
  it("keeps absent evidence insufficient rather than poor Recovery", () => {
    const result = assess([]);
    expect(result.compositeState).toBe("insufficient");
    expect(result.status).toBe("missing");
    expect(JSON.stringify(result)).not.toMatch(/overtrain|fatigue|injury/i);
  });

  it("requires two current dates for Midweek interpretation", () => {
    const one = assess([record("subjective_recovery", "good", "2026-07-20")]);
    const two = assess([
      record("subjective_recovery", "good", "2026-07-20"),
      record("subjective_recovery", "good", "2026-07-21"),
      record("subjective_recovery", "average", "2026-07-13"),
      record("subjective_recovery", "average", "2026-07-14"),
    ]);
    expect(one.compositeState).toBe("insufficient");
    expect(two.compositeState).toBe("improving");
  });

  it("uses exact Daily evidence without inventing a trend", () => {
    const result = assessRecoveryEvidence({
      records: [record("sleep_duration", 7.25, "2026-07-24")],
      cadence: "daily",
      currentWindow: { startDate: "2026-07-24", endDate: "2026-07-24" },
      timezone,
    });
    expect(result.metricAssessments.sleep_duration.direction).toBe("not_applicable");
    expect(result.metricAssessments.sleep_duration.currentValue).toBe(7.25);
    expect(result.compositeState).toBe("insufficient");
  });

  it("represents soreness improvement using the inverse ordered scale", () => {
    const result = assess([
      record("soreness", "mild", "2026-07-20"),
      record("soreness", "mild", "2026-07-21"),
      record("soreness", "high", "2026-07-13"),
      record("soreness", "moderate", "2026-07-14"),
    ]);
    expect(result.metricAssessments.soreness.direction).toBe("falling");
    expect(result.compositeState).toBe("improving");
  });

  it("preserves conflicting metric directions", () => {
    const result = assess([
      record("subjective_recovery", "excellent", "2026-07-20"),
      record("subjective_recovery", "good", "2026-07-21"),
      record("subjective_recovery", "average", "2026-07-13"),
      record("subjective_recovery", "average", "2026-07-14"),
      record("soreness", "severe", "2026-07-20"),
      record("soreness", "high", "2026-07-21"),
      record("soreness", "mild", "2026-07-13"),
      record("soreness", "mild", "2026-07-14"),
    ]);
    expect(result.conflictState).toBe("conflict");
    expect(result.compositeState).toBe("mixed");
  });

  it("deduplicates retries and excludes superseded records deterministically", () => {
    const valid = record("sleep_duration", 7, "2026-07-20");
    const superseded = record("sleep_duration", 6, "2026-07-21", "old", "superseded");
    const result = assess([valid, structuredClone(valid), superseded]);
    expect(result.metricAssessments.sleep_duration.currentRecordCount).toBe(1);
    expect(result.evidenceIds).toEqual([valid.id]);
    expect(result.provenance).toMatchObject({ repositoryReads: 0, runtimeClockReads: 0 });
  });

  it("supports Weekly two-date partial and three-date normal-confidence thresholds", () => {
    const base = ["2026-07-19", "2026-07-20", "2026-07-21"].map(
      (date) => record("subjective_recovery", "good", date)
    );
    const comparison = ["2026-07-12", "2026-07-13"].map(
      (date) => record("subjective_recovery", "average", date)
    );
    const input = {
      cadence: "weekly",
      currentWindow: { startDate: "2026-07-19", endDate: "2026-07-25" },
      comparisonWindow: { startDate: "2026-07-12", endDate: "2026-07-18" },
      timezone,
    };
    expect(assessRecoveryEvidence({ ...input, records: [...base.slice(0, 2), ...comparison] })
      .metricAssessments.subjective_recovery.confidence.level).toBe("low");
    expect(assessRecoveryEvidence({ ...input, records: [...base, ...comparison] })
      .metricAssessments.subjective_recovery.confidence.level).toBe("moderate");
  });
});
