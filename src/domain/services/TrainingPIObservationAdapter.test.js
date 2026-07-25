import { describe, expect, it } from "vitest";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import {
  adaptTrainingObservationToPIObservation,
  adaptTrainingPerformanceReportToPIObservations,
} from "./TrainingPIObservationAdapter";
import { isPIObservation } from "./PIObservationService";

function session(id, observedAt, weight, reps) {
  return {
    id,
    evidence_type: "training",
    observed_at: observedAt,
    metadata: { activity_type: "Traditional Strength Training" },
    exercises: [
      {
        exercise_id: "seated_cable_rows",
        name: "Seated Cable Rows",
        category: "Back",
        sets: [{ set_number: 1, weight, reps }],
      },
    ],
  };
}

describe("Training PI observation compatibility adapter", () => {
  it("adapts every legacy observation without modifying the report", () => {
    const report = createTrainingPerformanceIntelligenceReport({
      generatedAt: "2026-07-18T12:00:00.000Z",
      now: "2026-07-18T12:00:00.000Z",
      trainingSessions: [
        session("session_1", "2026-07-01", 100, 10),
        session("session_2", "2026-07-10", 110, 10),
        session("session_3", "2026-07-18", 110, 12),
      ],
    });
    const before = structuredClone(report);
    const adapted = adaptTrainingPerformanceReportToPIObservations(report);

    expect(report).toEqual(before);
    expect(adapted).toHaveLength(report.observations.length);
    expect(adapted.every(isPIObservation)).toBe(true);
    expect(adapted.map((item) => item.id)).toEqual(
      report.observations.map((item) => item.id)
    );
    expect(adapted.map((item) => item.status)).toEqual(
      report.observations.map((item) => item.status)
    );
    expect(adapted.map((item) => item.confidence.level)).toEqual(
      report.observations.map((item) => item.confidence)
    );
    expect(adapted.map((item) => item.evidenceWindow)).toEqual(
      report.observations.map((item) => ({
        startDate: item.evidence_date_range.start,
        endDate: item.evidence_date_range.end,
        comparisonStartDate: null,
        comparisonEndDate: null,
      }))
    );
    expect(adapted.map((item) => item.supportingEvidenceIds)).toEqual(
      report.observations.map((item) =>
        [...item.supporting_session_ids].sort()
      )
    );
    expect(adapted.map((item) => item.explanationData)).toEqual(
      report.observations.map((item) => item.explanation_data)
    );
  });

  it("preserves explicit legacy IDs and maps direction separately", () => {
    const legacy = {
      id: "performance|exercise|seated_cable_rows",
      observation_type: "training_performance",
      scope: "exercise",
      exercise: {
        key: "seated_cable_rows",
        name: "Seated Cable Rows",
      },
      status: "regressing",
      evidence_date_range: {
        start: "2026-07-01",
        end: "2026-07-18",
      },
      supporting_session_ids: ["session_2", "session_1"],
      confidence: "moderate",
      explanation_data: { reason: { code: "volume_decrease" } },
      provenance: {
        source: "TrainingPerformanceIntelligenceService",
        training_session_ids: ["session_1", "session_2"],
      },
    };

    const adapted = adaptTrainingObservationToPIObservation(legacy);
    expect(adapted).toMatchObject({
      id: legacy.id,
      status: "regressing",
      direction: "negative",
      supportingEvidenceIds: ["session_1", "session_2"],
      confidence: {
        level: "moderate",
        method: "training_session_count",
      },
      novelty: { state: "unevaluated" },
      lifecycle: { state: "unevaluated" },
    });
  });

  it("validates the empty-report overall observation", () => {
    const report = createTrainingPerformanceIntelligenceReport({
      generatedAt: "2026-07-18T12:00:00.000Z",
      now: "2026-07-18T12:00:00.000Z",
    });
    const adapted = adaptTrainingPerformanceReportToPIObservations(report);
    expect(adapted).toHaveLength(1);
    expect(adapted[0]).toMatchObject({
      id: "performance|overall|resistance",
      status: "insufficient_data",
      direction: "not_applicable",
      evidenceWindow: { startDate: null, endDate: null },
    });
    expect(isPIObservation(adapted[0])).toBe(true);
  });
});
