import { describe, expect, it } from "vitest";
import { createTrainingReportingPresentation } from "./TrainingReportingPresentationService.js";

describe("Training Reporting finished presentation", () => {
  it("server-composes status groups, highlights, PRs, attention, categories, and bounded history with canonical identities", () => {
    const improving = observation("curl", "EZ Bar Curls", "improving", {
      pr_detection: { detected: true, prs: [{ type: "heaviest_load", value: 75, unit: "lb" }] },
      volume_trend: { direction: "up" },
    });
    const plateauing = observation("pulldown", "Lat Pulldown", "plateauing");
    const result = createTrainingReportingPresentation({
      reportingLinks: [{ id: "resistance", label: "Resistance Training" }],
      resistancePerformance: {
        exerciseObservations: [improving, plateauing],
        categoryObservations: [{
          category: "biceps", status: "improving", evidence_date_range: { end: "2026-09-08" },
          explanation_data: { exercise_count: 2, status_counts: { improving: 2 }, latest_trained_at: "2026-09-08" },
        }],
      },
      trainingDays: [{ id: "day-1", date: "2026-09-08", label: "Sep 8", sessions: [{ canonicalId: "session-1", label: "Resistance Training", version: 3 }] }],
    });
    expect(result.resistance.statusGroups.find((group) => group.status === "improving")).toMatchObject({
      count: 1, exercises: [{ canonicalExerciseId: "curl" }],
    });
    expect(result.resistance.highlights[0]).toMatchObject({ canonicalExerciseId: "curl", detail: "Load PR: 75 lb." });
    expect(result.resistance.recentPrs[0]).toMatchObject({ canonicalExerciseId: "curl" });
    expect(result.resistance.needsAttention[0]).toMatchObject({ canonicalExerciseId: "pulldown", status: "plateauing" });
    expect(result.resistance.categories[0]).toMatchObject({ categoryId: "biceps", exerciseCount: 2 });
    expect(result.history.days[0].sessions[0]).toMatchObject({ sessionId: "session-1", revision: 3 });
  });
});

function observation(key, name, status, explanation = {}) {
  return {
    exercise: { key, name, primaryNavigationCategory: "biceps" }, status,
    evidence_date_range: { start: "2026-09-01", end: "2026-09-08" },
    explanation_data: { pr_detection: { detected: false, prs: [] }, ...explanation },
  };
}
