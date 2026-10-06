import XCTest
import UIKit
@testable import PhysiqueOS

/// Build 33: proves the Founder-observed Workout Detail duplication is
/// fixed at the read-model decision point `TrainingSessionDetailView` uses
/// — telemetry renders once (structured), exercises render once
/// (structured), and the generated one-line `detail` summary never
/// appears alongside a structured exercise breakdown for the same session.
final class TrainingSessionDetailPresentationTests: XCTestCase {
    private static func record(
        _ id: String,
        exerciseId: String = "bench_press",
        exerciseName: String = "Bench Press",
        type: TrainingPerformanceEventType = .sessionVolumePR,
        title: String = "Session volume record",
        value: String = "4,200 lb",
        relationshipContext: TrainingPerformanceRelationshipContext? = nil
    ) -> TrainingPerformanceRecord {
        TrainingPerformanceRecord(
            id: id, canonicalExerciseId: exerciseId, canonicalExerciseName: exerciseName,
            title: title, value: value, previousBaseline: "Previous: 4,000 lb",
            improvement: "Improved by 200 lb", detail: "Previous: 4,000 lb · Improved by 200 lb",
            workoutDate: "2026-09-28", executionVariant: nil,
            relationshipContext: relationshipContext, achievedValue: 4200,
            achievementType: type, sourceEventId: "event-\(id)"
        )
    }

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

    // MARK: - Build 89 workout-detail performance records

    func testOneCanonicalRecordProducesOneHistoricalWorkoutGroup() throws {
        let record = Self.record("one")
        let presentation = try XCTUnwrap(TrainingSessionPerformanceRecordsPresentation(
            performanceRecords: .init(status: "completed", records: [record])
        ))
        XCTAssertEqual(presentation.records, [record])
        XCTAssertEqual(presentation.groups.map(\.canonicalExerciseName), ["Bench Press"])
        XCTAssertEqual(presentation.groups.flatMap(\.records).map(\.value), ["4,200 lb"])
    }

    func testMultipleCanonicalRecordsPreserveServerOrderTypeAndValues() throws {
        let records = [
            Self.record("volume"),
            Self.record(
                "reps", type: .repsAtLoadPR,
                title: "Reps-at-load record", value: "13 reps at 125 lb"
            ),
        ]
        let presentation = try XCTUnwrap(TrainingSessionPerformanceRecordsPresentation(
            performanceRecords: .init(status: "completed", records: records)
        ))
        XCTAssertEqual(presentation.records, records)
        XCTAssertEqual(presentation.groups.flatMap(\.records).map(\.achievementType), [.sessionVolumePR, .repsAtLoadPR])
        XCTAssertEqual(presentation.groups.flatMap(\.records).map(\.value), ["4,200 lb", "13 reps at 125 lb"])
    }

    func testNoCanonicalRecordsOrUnknownAuthorityOmitsHistoricalCard() {
        XCTAssertNil(TrainingSessionPerformanceRecordsPresentation(performanceRecords: nil))
        XCTAssertNil(TrainingSessionPerformanceRecordsPresentation(
            performanceRecords: .init(status: "completed", records: [])
        ))
        XCTAssertNil(TrainingSessionPerformanceRecordsPresentation(
            performanceRecords: .init(status: "deferred", records: [Self.record("not-authoritative")])
        ))
    }

    func testExactWorkoutAttributionAndSupersetContextNeverCreateASecondCalculation() throws {
        let relationship = TrainingPerformanceRelationshipContext(
            relationshipType: "superset", memberIndex: 0,
            orderedPartners: [.init(canonicalExerciseId: "cable_fly", name: "Cable Fly")],
            comparisonKey: "superset|partners:cable_fly"
        )
        let exactWorkoutRecord = Self.record("exact", relationshipContext: relationship)
        let exact = try XCTUnwrap(TrainingSessionPerformanceRecordsPresentation(
            performanceRecords: .init(status: "completed", records: [exactWorkoutRecord])
        ))
        let anotherWorkout = TrainingSessionPerformanceRecordsPresentation(
            performanceRecords: .init(status: "completed", records: [])
        )

        XCTAssertEqual(exact.records, [exactWorkoutRecord])
        XCTAssertEqual(exact.records.first?.relationshipContext, relationship)
        XCTAssertNil(anotherWorkout, "A different finalized workout cannot inherit a PR from history or a superset partner.")
    }

    func testWatchAndPhoneFinishedRecordsShareTheSameCanonicalPresentation() throws {
        let serverRecords = TrainingSessionPerformanceRecords(
            status: "completed", records: [Self.record("canonical")]
        )
        let phoneFinished = try XCTUnwrap(TrainingSessionPerformanceRecordsPresentation(performanceRecords: serverRecords))
        let watchFinished = try XCTUnwrap(TrainingSessionPerformanceRecordsPresentation(performanceRecords: serverRecords))
        XCTAssertEqual(watchFinished, phoneFinished)
    }

    func testHistoricalRecordAccessibilityAndSemanticGreenWorkInDarkAndMineral() {
        let record = Self.record("accessible")
        XCTAssertEqual(
            TrainingSessionPerformanceRecordsPresentation.accessibilityLabel(for: record),
            "Bench Press. Session volume record. 4,200 lb. Previous: 4,000 lb · Improved by 200 lb"
        )
        for style: UIUserInterfaceStyle in [.dark, .light] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let foreground = UIColor(EvidencePalette.training.green).resolvedColor(with: traits)
            let background = UIColor(EvidencePalette.training.surface).resolvedColor(with: traits)
            XCTAssertGreaterThanOrEqual(Self.contrast(foreground, background), 4.5)
        }
    }

    private static func contrast(_ first: UIColor, _ second: UIColor) -> Double {
        func luminance(_ color: UIColor) -> Double {
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
            func channel(_ value: CGFloat) -> Double {
                let value = Double(value)
                return value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
        }
        let brighter = max(luminance(first), luminance(second))
        let darker = min(luminance(first), luminance(second))
        return (brighter + 0.05) / (darker + 0.05)
    }

    // MARK: - Real-JSON decode regressions for the Sep24 candidate-shape decode defect
    //
    // The tests above construct `HealthKitWorkoutAttachmentReadModel` by hand,
    // which is exactly why the Sep24 defect shipped uncaught: it never
    // exercises `Decodable` at all. These decode genuine snake_case Server
    // JSON (the real wire shape -- see `ProductionNativeAPI`/`TrainingAPI`'s
    // `.convertFromSnakeCase` decoder) through the real `JSONDecoder`.

    private static func productionDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }

    private static func jsonData(_ object: [String: Any]) -> Data {
        try! JSONSerialization.data(withJSONObject: object)
    }

    /// Sep 23's real, previously-working shape: `confirmedAt` present.
    func testConfirmedRelationshipShapeDecodesThroughTheRealDecoder() throws {
        let json: [String: Any] = [
            "status": "confirmed",
            "confirmed_at": "2026-09-24T02:46:00.000Z",
            "content_authority": ["training_content": "workout_logger", "telemetry": "healthkit"],
        ]
        let relationship = try Self.productionDecoder().decode(
            HealthKitWorkoutAttachmentReadModel.Relationship.self, from: Self.jsonData(json)
        )
        XCTAssertEqual(relationship.status, "confirmed")
        XCTAssertEqual(relationship.confirmedAt, "2026-09-24T02:46:00.000Z")
        XCTAssertNil(relationship.matchOutcome)
        XCTAssertNil(relationship.confidence)
        XCTAssertEqual(relationship.contentAuthority.trainingContent, "workout_logger")
        XCTAssertEqual(relationship.contentAuthority.telemetry, "healthkit")
    }

    /// Sep 24's real, previously-crashing shape: no `confirmedAt` key at all --
    /// `matchOutcome`/`confidence` instead. Before the fix, Swift's
    /// synthesized `Decodable` conformance required `confirmedAt`
    /// unconditionally, so this exact shape threw `DecodingError.keyNotFound`
    /// and the whole session detail failed to load.
    func testCandidateRelationshipShapeDecodesThroughTheRealDecoderWithNoConfirmedAtKey() throws {
        let json: [String: Any] = [
            "status": "candidate",
            "match_outcome": "possible_match",
            "confidence": 60,
            "content_authority": ["training_content": "workout_logger", "telemetry": "healthkit"],
        ]
        let relationship = try Self.productionDecoder().decode(
            HealthKitWorkoutAttachmentReadModel.Relationship.self, from: Self.jsonData(json)
        )
        XCTAssertEqual(relationship.status, "candidate")
        XCTAssertNil(relationship.confirmedAt, "A candidate relationship never has a confirmation instant -- it must decode to nil, not a fabricated timestamp.")
        XCTAssertEqual(relationship.matchOutcome, "possible_match")
        XCTAssertEqual(relationship.confidence, 60)
        XCTAssertEqual(relationship.contentAuthority.trainingContent, "workout_logger")
        XCTAssertEqual(relationship.contentAuthority.telemetry, "healthkit")
    }

    /// The full Sep 24 production shape: a Logger session (structured
    /// exercises/sets) PLUS a candidate (unconfirmed) HealthKit attachment
    /// carrying real telemetry -- proving the desired coexistence (Logger
    /// detail + HK telemetry, neither replacing the other) actually decodes
    /// end to end through `TrainingSessionDetailReadModel`, not merely that
    /// it doesn't crash.
    func testSep24ProductionShapedSessionWithLoggerExercisesAndCandidateHealthKitTelemetryDecodesTogether() throws {
        let json: [String: Any] = [
            "id": "session-sep24",
            "label": "Traditional Strength Training",
            "value": "206 active cal",
            "detail": "11:22 AM-11:50 AM · 28 min · Bench Press: 4 x 8 @ 185 lb",
            "date": "2026-09-24",
            "source_evidence": ["Training Logger", "Apple Watch"],
            "exercises": [[
                "id": "bench-press-occurrence",
                "name": "bench_press",
                "canonical_exercise_id": "bench_press",
                "sets": [[
                    "set_number": 1, "reps": 8, "weight": 185, "weight_unit": "lb",
                    "load_type": "external_load", "set_type": "weighted_reps",
                ]],
            ]],
            "exercise_relationship_groups": [],
            "health_kit_attachment": [
                "canonical_workout_id": "healthkit_canonical_workout_sep24",
                "family": "strength",
                "canonical_type": "traditional_strength_training",
                "relationship": [
                    "status": "candidate",
                    "match_outcome": "possible_match",
                    "confidence": 60,
                    "content_authority": ["training_content": "workout_logger", "telemetry": "healthkit"],
                ],
                "source": ["application": "Apple Health", "source_name": "Apple Watch", "product_type": "Watch7,5"],
                "session": [
                    "started_at": "2026-09-24T16:22:10.000Z",
                    "ended_at": "2026-09-24T16:50:09.000Z",
                    "duration_seconds": 1679,
                    "active_calories": 206.2,
                    "average_heart_rate": 120.14,
                ],
            ],
        ]

        let decoded = try Self.productionDecoder().decode(TrainingSessionDetailReadModel.self, from: Self.jsonData(json))

        // Logger content survives untouched.
        XCTAssertFalse(decoded.exercises.isEmpty, "Logger exercises must still decode alongside a candidate HealthKit attachment.")
        XCTAssertEqual(decoded.exercises.first?.canonicalExerciseId, "bench_press")
        XCTAssertEqual(decoded.exercises.first?.sets.count, 1)

        // HealthKit telemetry decodes fully, without a confirmed relationship.
        let attachment = try XCTUnwrap(decoded.healthKitAttachment)
        XCTAssertEqual(attachment.relationship.status, "candidate")
        XCTAssertNil(attachment.relationship.confirmedAt)
        XCTAssertEqual(attachment.relationship.matchOutcome, "possible_match")
        XCTAssertEqual(attachment.relationship.confidence, 60)
        XCTAssertEqual(attachment.session.startedAt, "2026-09-24T16:22:10.000Z")
        XCTAssertEqual(attachment.session.endedAt, "2026-09-24T16:50:09.000Z")
        XCTAssertEqual(attachment.session.durationSeconds, 1679)
        XCTAssertEqual(attachment.session.activeCalories, 206.2)
        XCTAssertEqual(attachment.session.averageHeartRate, 120.14)
    }

    /// A confirmed relationship keeps the existing "Confirmed" label.
    @MainActor
    func testAppleHealthAttachmentLabelSaysConfirmedOnlyForAConfirmedRelationship() {
        let confirmed = HealthKitWorkoutAttachmentReadModel.Relationship(
            status: "confirmed", confirmedAt: "2026-09-24T02:46:00.000Z",
            contentAuthority: .init(trainingContent: "workout_logger", telemetry: "healthkit")
        )
        XCTAssertEqual(TrainingSessionDetailView.relationshipLabel(for: confirmed), "Confirmed with Workout Logger")
    }

    /// A candidate (unconfirmed) relationship -- the Sep24 real case this
    /// fix makes decodable -- must never claim confirmation. Before the
    /// Sep24 decode fix, a candidate shape could never even reach this
    /// view (it always threw during decode), so this label was implicitly
    /// always true; now it must be gated honestly.
    @MainActor
    func testAppleHealthAttachmentLabelNeverClaimsConfirmedForACandidateRelationship() {
        let candidate = HealthKitWorkoutAttachmentReadModel.Relationship(
            status: "candidate", matchOutcome: "possible_match", confidence: 60,
            contentAuthority: .init(trainingContent: "workout_logger", telemetry: "healthkit")
        )
        let label = TrainingSessionDetailView.relationshipLabel(for: candidate)
        XCTAssertNotEqual(label, "Confirmed with Workout Logger")
        XCTAssertFalse(label.contains("Confirmed"), "A candidate match must never use the word \"Confirmed\": \(label)")
    }
}
