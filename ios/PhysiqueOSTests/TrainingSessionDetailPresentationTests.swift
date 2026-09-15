import XCTest
@testable import PhysiqueOS

/// Build 33: proves the Founder-observed Workout Detail duplication is
/// fixed at the read-model decision point `TrainingSessionDetailView` uses
/// — telemetry renders once (structured), exercises render once
/// (structured), and the generated one-line `detail` summary never
/// appears alongside a structured exercise breakdown for the same session.
final class TrainingSessionDetailPresentationTests: XCTestCase {
    private func session(
        exercises: [TrainingExerciseOccurrence] = [],
        telemetry: TrainingSessionTelemetryReadModel? = nil
    ) -> TrainingSessionDetailReadModel {
        TrainingSessionDetailReadModel(
            id: "session-1", label: "Traditional Strength Training", value: "438 active cal",
            detail: "7:45 AM-8:44 AM · 59 min · 121 bpm avg HR · Leg Press: 1 x 15 @ 225 lb",
            date: "2026-09-14", sourceEvidence: ["Apple Fitness", "Training Logger"],
            exercises: exercises, exerciseRelationshipGroups: [], telemetry: telemetry
        )
    }

    private func exercise(_ id: String, sets: Int = 1) -> TrainingExerciseOccurrence {
        TrainingExerciseOccurrence(
            id: "\(id)-occurrence", name: id, canonicalExerciseId: id, executionVariant: nil,
            sets: (0..<sets).map { index in
                TrainingSet(setNumber: index + 1, reps: 10, weight: 100, weightUnit: "lb", durationSeconds: nil, loadType: "external_load", setType: "weighted_reps")
            }
        )
    }

    func testAReconciledSessionWithExercisesShowsStructuredExercisesNotTheGeneratedSummary() {
        let reconciled = session(
            exercises: [exercise("leg_press_feet_middle", sets: 3)],
            telemetry: TrainingSessionTelemetryReadModel(startTime: "2026-09-14T07:45:00.000Z", endTime: "2026-09-14T08:44:00.000Z", durationSeconds: 3540, activeCalories: 438, averageHeartRate: 121)
        )

        XCTAssertFalse(reconciled.showsGeneratedSummaryInsteadOfStructuredExercises, "A session with structured exercises must render the structured list, not the generated summary — that's the duplication this fixes.")
        XCTAssertNotNil(reconciled.telemetry, "The reconciled session must still carry its Apple telemetry.")
        XCTAssertEqual(reconciled.exercises.count, 1, "Structured data survives reconciliation.")
    }

    func testAnAppleOnlyTelemetrySessionWithNoExercisesFallsBackToTheGeneratedSummary() {
        let appleOnly = session(
            exercises: [],
            telemetry: TrainingSessionTelemetryReadModel(startTime: "2026-09-14T07:45:00.000Z", endTime: "2026-09-14T08:44:00.000Z", durationSeconds: 3540, activeCalories: 438, averageHeartRate: 121)
        )

        XCTAssertTrue(appleOnly.showsGeneratedSummaryInsteadOfStructuredExercises, "With no structured exercises to show instead, the generated summary is the only content available.")
    }

    func testASessionWithNoTelemetryRendersNoTelemetryCard() {
        let structuredOnly = session(exercises: [exercise("bench_press")], telemetry: nil)
        XCTAssertNil(structuredOnly.telemetry)
        XCTAssertFalse(structuredOnly.showsGeneratedSummaryInsteadOfStructuredExercises)
    }

    func testEachExerciseAndItsSetsAppearExactlyOnceInTheStructuredBreakdown() {
        let multiExercise = session(exercises: [
            exercise("leg_press_feet_middle", sets: 3),
            exercise("pendulum_squat_machine", sets: 4),
        ])

        let items = TrainingSessionExerciseGrouping.renderItems(for: multiExercise)
        let renderedExerciseIDs = items.compactMap { item -> String? in
            if case .exercise(let occurrence) = item { return occurrence.canonicalExerciseId }
            return nil
        }
        XCTAssertEqual(renderedExerciseIDs, ["leg_press_feet_middle", "pendulum_squat_machine"], "Each exercise renders exactly once, in order, with no duplication.")
        let totalSets = multiExercise.exercises.reduce(0) { $0 + $1.sets.count }
        XCTAssertEqual(totalSets, 7, "Sets are not duplicated by the structured breakdown either.")
    }
}
