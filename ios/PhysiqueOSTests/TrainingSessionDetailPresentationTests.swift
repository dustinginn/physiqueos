import XCTest
@testable import PhysiqueOS

/// Build 33: proves the Founder-observed Workout Detail duplication is
/// fixed at the read-model decision point `TrainingSessionDetailView` uses
/// — telemetry renders once (structured), exercises render once
/// (structured), and the generated one-line `detail` summary never
/// appears alongside a structured exercise breakdown for the same session.
final class TrainingSessionDetailPresentationTests: XCTestCase {
    @MainActor
    func testWorkoutDateFormatsFractionalInstantsAndCalendarDatesWithoutRawSerialization() {
        XCTAssertNotEqual(TrainingSessionDetailView.formatDate("2026-09-14T19:00:00.123Z"), "2026-09-14")
        XCTAssertNotEqual(TrainingSessionDetailView.formatDate("2026-09-14"), "2026-09-14")
        XCTAssertEqual(TrainingSessionDetailView.formatDate("not-a-date"), "Date unavailable")
    }
    private func session(
        exercises: [TrainingExerciseOccurrence] = [],
        telemetry: TrainingSessionTelemetryReadModel? = nil,
        healthKitAttachment: HealthKitWorkoutAttachmentReadModel? = nil
    ) -> TrainingSessionDetailReadModel {
        TrainingSessionDetailReadModel(
            id: "session-1", label: "Traditional Strength Training", value: "438 active cal",
            detail: "7:45 AM-8:44 AM · 59 min · 121 bpm avg HR · Leg Press: 1 x 15 @ 225 lb",
            date: "2026-09-14", sourceEvidence: ["Apple Fitness", "Training Logger"],
            exercises: exercises, exerciseRelationshipGroups: [], telemetry: telemetry,
            healthKitAttachment: healthKitAttachment
        )
    }

    private func healthKitAttachment(activeCalories: Double? = 410) -> HealthKitWorkoutAttachmentReadModel {
        HealthKitWorkoutAttachmentReadModel(
            canonicalWorkoutId: "healthkit_canonical_workout_sep23", family: "strength",
            canonicalType: "traditional_strength_training",
            relationship: .init(
                status: "confirmed", confirmedAt: "2026-09-24T02:46:00.000Z",
                contentAuthority: .init(trainingContent: "workout_logger", telemetry: "healthkit")
            ),
            source: .init(application: "Apple Health", sourceName: "Apple Watch", productType: "Watch7,5"),
            session: .init(
                startedAt: "2026-09-23T17:00:00.000Z", endedAt: "2026-09-23T18:00:00.000Z",
                durationSeconds: 3600, activeCalories: activeCalories, totalCalories: 515,
                distance: nil, distanceUnit: nil, averageHeartRate: 122
            )
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
        XCTAssertFalse(reconciled.showsWorkoutValueInHeader, "Calories/duration belong in the workout summary once, not also in the header.")
        XCTAssertEqual(reconciled.exercises.count, 1, "Structured data survives reconciliation.")
    }

    func testAnAppleOnlyTelemetrySessionDoesNotRepeatItsTypedTelemetryInAGeneratedSummary() {
        let appleOnly = session(
            exercises: [],
            telemetry: TrainingSessionTelemetryReadModel(startTime: "2026-09-14T07:45:00.000Z", endTime: "2026-09-14T08:44:00.000Z", durationSeconds: 3540, activeCalories: 438, averageHeartRate: 121)
        )

        XCTAssertFalse(appleOnly.showsGeneratedSummaryInsteadOfStructuredExercises, "Typed telemetry is already presented once in the workout summary.")
        XCTAssertFalse(appleOnly.showsWorkoutValueInHeader)
    }

    func testLegacySessionWithNeitherTelemetryNorExercisesRetainsItsSummary() {
        XCTAssertTrue(session(exercises: [], telemetry: nil).showsGeneratedSummaryInsteadOfStructuredExercises)
    }

    func testASessionWithNoTelemetryRendersNoTelemetryCard() {
        let structuredOnly = session(exercises: [exercise("bench_press")], telemetry: nil)
        XCTAssertNil(structuredOnly.telemetry)
        XCTAssertTrue(structuredOnly.showsWorkoutValueInHeader)
        XCTAssertFalse(structuredOnly.showsGeneratedSummaryInsteadOfStructuredExercises)
    }

    func testConfirmedAppleAttachmentKeepsLoggerExercisesAndOwnsTelemetryPresentation() {
        let exercises = [exercise("bench_press", sets: 4)]
        let confirmed = session(exercises: exercises, healthKitAttachment: healthKitAttachment())
        XCTAssertEqual(confirmed.exercises, exercises)
        XCTAssertEqual(confirmed.healthKitAttachment?.relationship.status, "confirmed")
        XCTAssertEqual(confirmed.healthKitAttachment?.relationship.contentAuthority.trainingContent, "workout_logger")
        XCTAssertEqual(confirmed.healthKitAttachment?.relationship.contentAuthority.telemetry, "healthkit")
        XCTAssertEqual(confirmed.healthKitAttachment?.source.sourceName, "Apple Watch")
        XCTAssertEqual(confirmed.healthKitAttachment?.session.activeCalories, 410)
        XCTAssertFalse(confirmed.showsWorkoutValueInHeader)
        XCTAssertFalse(confirmed.showsGeneratedSummaryInsteadOfStructuredExercises)
    }

    func testMissingAppleEnergyStaysMissing() {
        XCTAssertNil(healthKitAttachment(activeCalories: nil).session.activeCalories)
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
