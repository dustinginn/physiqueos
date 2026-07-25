import { describe, expect, it } from "vitest";
import {
  createCanonicalRecoveryEvidenceObject,
  createRecoveryEvidenceRecord,
} from "../models/RecoveryEvidenceModel";
import { composeMidweekBriefingPreview } from "./MidweekBriefingPreviewService";
import { getPlaceholderEntries } from "./ProgressReportingService";

describe("Recovery evidence consumer compatibility", () => {
  it("presents structured Recovery evidence instead of legacy notes", () => {
    const evidence = canonical();
    const entries = getPlaceholderEntries("recovery", {
      canonicalEvidenceObjects: [evidence],
      checkIns: [{
        date: "2026-07-25",
        notes: "freeform sleep note must not become Recovery evidence",
      }],
    });
    expect(entries).toEqual([{
      id: evidence.canonicalId,
      label: "Sleep duration",
      value: "7.5 hours",
      date: "2026-07-25",
      source: "Morning Check-In",
      correctionStatus: "Original",
    }]);
    expect(JSON.stringify(entries)).not.toContain("freeform");
  });

  it("counts canonical Recovery dates in Midweek coverage without interpretation", () => {
    const result = composeMidweekBriefingPreview({
      window: {
        id: "midweek",
        cadence: "midweek",
        briefingDate: "2026-07-25",
        startDate: "2026-07-23",
        endDate: "2026-07-25",
        timeZone: "America/Los_Angeles",
      },
      canonicalObjects: [canonical()],
      weights: [],
      dexaScans: [],
      goal: null,
      generatedAt: "2026-07-25T12:00:00.000Z",
    });
    expect(result.evidenceCompleteness.recovery).toEqual({
      completeDays: 1,
      expectedDays: 3,
    });
    expect(JSON.stringify(result.evidenceCompleteness.recovery))
      .not.toMatch(/good|bad|strained|improving|declining/i);
  });

  it("does not count Recovery protocols as physiological coverage", () => {
    const result = getPlaceholderEntries("recovery", {
      canonicalEvidenceObjects: [],
      checkIns: [],
      protocols: [{ category: "recovery", status: "completed" }],
    });
    expect(result).toEqual([{
      label: "Status",
      value: "Structured reporting placeholder",
    }]);
  });
});

function canonical() {
  const recordedAt = "2026-07-25T07:00:00-07:00";
  return createCanonicalRecoveryEvidenceObject(createRecoveryEvidenceRecord({
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
    createdAt: recordedAt,
    updatedAt: recordedAt,
  }));
}
