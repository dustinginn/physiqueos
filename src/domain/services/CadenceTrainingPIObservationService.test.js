import { describe, expect, it } from "vitest";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { createCadenceTrainingPIObservations } from "./CadenceTrainingPIObservationService";

describe("Cadence Training PI observations", () => {
  it.each([
    ["daily", "2026-07-24", "2026-07-24", 1],
    ["midweek", "2026-07-20", "2026-07-24", 1],
    ["weekly", "2026-07-19", "2026-07-25", 1],
  ])("separates %s evidence, comparison, and source windows", (cadence, startDate, endDate, count) => {
    const sessions = [session("prior", "2026-07-15", 100), session("current", "2026-07-24", 110)];
    const report = createTrainingPerformanceIntelligenceReport({
      trainingSessions: sessions,
      now: "2026-07-24T12:00:00Z",
      generatedAt: "2026-07-24T12:00:00.000Z",
    });
    const originalId = report.overallObservation.id;
    const result = createCadenceTrainingPIObservations({
      report,
      canonicalTrainingEvidence: sessions,
      cadence,
      evidenceWindow: { startDate, endDate },
      comparisonWindow: { startDate: "2026-07-12", endDate: "2026-07-18" },
      windowTimeZone: "America/Los_Angeles",
    });
    const overall = result.find((item) => item.subject.type === "training_scope");
    expect(overall.id).toBe(originalId);
    expect(overall.evidenceWindow).toMatchObject({
      startDate,
      endDate,
      comparisonStartDate: "2026-07-12",
      comparisonEndDate: "2026-07-18",
    });
    expect(overall.explanationData.cadenceWindow).toMatchObject({
      sourceWindow: { startDate: "2026-07-15", endDate: "2026-07-24" },
      currentWindowSessionCount: count,
      comparisonWindowSessionCount: 1,
      evidenceIds: ["current"],
      comparisonEvidenceIds: ["prior"],
      authoritativeEligible: true,
    });
  });

  it("marks Daily unsupported when only historical Training supports the trend", () => {
    const sessions = [session("prior-a", "2026-07-15", 100), session("prior-b", "2026-07-20", 110)];
    const report = createTrainingPerformanceIntelligenceReport({
      trainingSessions: sessions,
      now: "2026-07-24T12:00:00Z",
      generatedAt: "2026-07-24T12:00:00.000Z",
    });
    const overall = createCadenceTrainingPIObservations({
      report,
      canonicalTrainingEvidence: sessions,
      cadence: "daily",
      evidenceWindow: { startDate: "2026-07-24", endDate: "2026-07-24" },
      comparisonWindow: { startDate: "2026-07-14", endDate: "2026-07-23" },
      windowTimeZone: "America/Los_Angeles",
    }).find((item) => item.subject.type === "training_scope");
    expect(overall.status).toBe(report.overallObservation.status);
    expect(overall.explanationData.cadenceWindow).toMatchObject({
      currentWindowSessionCount: 0,
      authoritativeEligible: false,
      limitations: ["no_training_session_in_current_window"],
    });
  });
});

function session(id, observedAt, weight) {
  return {
    id,
    evidence_type: "training",
    observed_at: `${observedAt}T12:00:00Z`,
    session_type: "resistance",
    exercises: [{
      exercise_id: "seated_cable_row",
      name: "Seated Cable Rows",
      category: "Back",
      sets: [{ set_number: 1, reps: 10, weight, weight_unit: "lb" }],
    }],
  };
}
