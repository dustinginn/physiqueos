import { describe, expect, it } from "vitest";
import { getResistanceBreakdown } from "./ProgressReportingService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { produceTrainingPerformanceEvents } from "./TrainingPerformanceEventProducer";
import { mergeTypedEvidenceIntoTrainingObjects } from "../interpreters/ScreenshotInterpreterService";
import {
  listPreviouslyUsedExecutionVariants,
  resolvePreviousExerciseOccurrence,
} from "./TrainingExerciseOccurrenceHistoryService";

const ordinary = session("ordinary", "2026-08-01", null, 12, 35);
const staticHold = session("static", "2026-08-08", {
  key: "static_hold", label: "Static Hold", rawLabel: "Static Hold",
}, 13, 35);

describe("Training execution variant propagation", () => {
  it("keeps screenshot ordinary sets separate from typed Static Hold sets", () => {
    const [merged] = mergeTypedEvidenceIntoTrainingObjects({
      evidenceObjects: [{
        ...ordinary,
        provenance: { source_artifact_refs: ["screenshot_0"] },
        source: { source_artifact_refs: ["screenshot_0"] },
      }],
      typedEvidence: "Spider Curls (Static Hold)\n35p 13r",
    });
    expect(merged.exercises).toHaveLength(2);
    expect(merged.exercises.map((exercise) => exercise.sets[0].reps)).toEqual([12, 13]);
    expect(merged.exercises[1].executionVariant.key).toBe("static_hold");
  });

  it("prefers exact variant history and labels canonical fallback separately", () => {
    const exact = resolvePreviousExerciseOccurrence({
      sessions: [ordinary, staticHold],
      canonicalExerciseId: "spider_curl",
      variantKey: "static_hold",
      before: "2026-08-09",
    });
    expect(exact.matchKind).toBe("exact_variant");
    expect(exact.exactVariantOccurrence.session.id).toBe("static");
    expect(exact.canonicalFallbackOccurrence.session.id).toBe("ordinary");
    expect(listPreviouslyUsedExecutionVariants({
      sessions: [ordinary, staticHold], canonicalExerciseId: "spider_curl",
    })).toEqual([expect.objectContaining({ key: "static_hold" })]);
  });

  it("retains one movement aggregate with queryable occurrence variants and no double count", () => {
    const regions = getResistanceBreakdown([ordinary, staticHold]);
    const spider = regions.flatMap((region) => region.movementFamilies)
      .flatMap((family) => family.exercises)
      .find((exercise) => exercise.canonicalExerciseId === "spider_curl");
    expect(spider.occurrences).toHaveLength(2);
    expect(spider.executionVariants).toEqual([
      expect.objectContaining({ key: "static_hold" }),
    ]);
    expect(spider.sets).toHaveLength(2);
  });

  it("compares the latest occurrence only with the same variant and carries context to PI", () => {
    const laterStaticHold = session("static-2", "2026-08-15", {
      key: "static_hold", label: "Static Hold", rawLabel: "Static Hold",
    }, 14, 35);
    const report = createTrainingPerformanceIntelligenceReport({
      trainingSessions: [ordinary, staticHold, laterStaticHold],
      now: new Date("2026-08-16T12:00:00Z"),
    });
    const observation = report.exerciseObservations.find(
      (item) => item.exercise.key === "spider_curl"
    );
    expect(observation.explanation_data.last_session.execution_variant.key).toBe("static_hold");
    expect(observation.explanation_data.previous_comparable_session.session_id).toBe("static");
    expect(observation.explanation_data.comparison_context.comparable_session_count).toBe(2);
  });

  it("produces durable PR events with the matching variant context", () => {
    const report = createTrainingPerformanceIntelligenceReport({
      trainingSessions: [staticHold, session("static-2", "2026-08-15", {
        key: "static_hold", label: "Static Hold", rawLabel: "Static Hold",
      }, 15, 35)],
      now: new Date("2026-08-16T12:00:00Z"),
    });
    const current = session("static-2", "2026-08-15", {
      key: "static_hold", label: "Static Hold", rawLabel: "Static Hold",
    }, 15, 35);
    const events = produceTrainingPerformanceEvents({
      canonicalTrainingSession: { canonicalId: "canonical-static", payload: current },
      trainingAnalysis: { id: "analysis-static", trainingPerformance: report },
      sourceReviewId: "review",
      sourceEvidencePackageId: "package",
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.executionVariant?.key === "static_hold"))
      .toBe(true);
  });
});

function session(id, observedAt, executionVariant, reps, weight) {
  return {
    id,
    evidence_type: "training",
    observed_at: observedAt,
    metadata: { activity_type: "Traditional Strength Training" },
    exercises: [{
      id: `${id}-spider`,
      name: "Spider Curls",
      canonicalExerciseId: "spider_curl",
      body_region: "Arms",
      primary_muscle_groups: ["Biceps"],
      movement_pattern: "Elbow Flexion",
      ...(executionVariant ? { executionVariant } : {}),
      sets: [{ set_number: 1, reps, weight, weight_unit: "lb", volume: reps * weight }],
    }],
  };
}
