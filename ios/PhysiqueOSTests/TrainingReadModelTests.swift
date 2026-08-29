import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Training evidence/history vertical —
/// history list, Training Day, and TrainingSession detail — introduced in
/// this slice. Exercises the fixture through `FixtureTrainingAPI` (not a
/// bespoke decode path) so these tests cover the same integration surface
/// the screens actually use.
final class TrainingReadModelTests: XCTestCase {
    private let api = FixtureTrainingAPI()

    // MARK: - Fixture decoding integrity

    func testHistoryDecodesWithoutError() async throws {
        let history = try await api.fetchTrainingHistory()
        XCTAssertFalse(history.trainingDays.isEmpty)
        XCTAssertFalse(history.trainingOverview.isEmpty)
        XCTAssertFalse(history.trainingUnderstanding.isEmpty)
    }

    // MARK: - Training history ordering/grouping

    /// The list page always shows the most recent Training Day first
    /// (`trainingDays[0]` == `latestTrainingDay`,
    /// `ProgressReportingService.js:1162-1169`).
    func testTrainingDaysAreOrderedNewestFirst() async throws {
        let history = try await api.fetchTrainingHistory()
        let dates = history.trainingDays.map(\.date)
        XCTAssertEqual(dates, dates.sorted(by: >))
    }

    /// A day's own `summary.sessionCount` must agree with the actual
    /// number of sessions returned for that day — grouping must not silently
    /// drift between the list-page count and the day-page detail.
    func testDaySessionCountMatchesActualSessionsForEveryDay() async throws {
        let history = try await api.fetchTrainingHistory()
        for daySummary in history.trainingDays {
            let day = try await api.fetchTrainingDay(date: daySummary.date)
            let unwrapped = try XCTUnwrap(day, "Every listed training day must resolve.")
            XCTAssertEqual(unwrapped.summary.sessionCount, unwrapped.sessions.count)
        }
    }

    /// Exercises both real presentation states this fixture was built to
    /// cover: a day with multiple sessions (strength + walking) grouped
    /// together, and a pure-cardio day with zero exercises.
    func testMultiSessionDayGroupsBothSessionsUnderOneDay() async throws {
        let day = try await api.fetchTrainingDay(date: "2026-08-26")
        let unwrapped = try XCTUnwrap(day)
        XCTAssertEqual(unwrapped.sessions.count, 2)
        XCTAssertTrue(unwrapped.summary.hasWalking)
        XCTAssertEqual(unwrapped.summary.strengthSessions, 1)
    }

    func testCardioOnlyDayHasNoExercisesAndFlagsCardio() async throws {
        let day = try await api.fetchTrainingDay(date: "2026-08-22")
        let unwrapped = try XCTUnwrap(day)
        XCTAssertTrue(unwrapped.summary.hasCardio)
        XCTAssertEqual(unwrapped.summary.exerciseCount, 0)
        XCTAssertEqual(unwrapped.summary.strengthSessions, 0)
    }

    func testUnknownDayResolvesToNilRatherThanCrashing() async throws {
        let day = try await api.fetchTrainingDay(date: "2099-01-01")
        XCTAssertNil(day)
    }

    // MARK: - TrainingSession detail integrity

    func testSessionDetailIntegrityForTheStrengthSession() async throws {
        let session = try await api.fetchTrainingSession(sessionId: "session-fixture-001")
        let unwrapped = try XCTUnwrap(session)
        XCTAssertEqual(unwrapped.exercises.count, 4)
        XCTAssertFalse(unwrapped.sourceEvidence.isEmpty)
    }

    func testUnknownSessionResolvesToNilRatherThanCrashing() async throws {
        let session = try await api.fetchTrainingSession(sessionId: "not-a-real-session")
        XCTAssertNil(session)
    }

    // MARK: - Sets/reps/load preservation (snake_case canonical fields)

    /// `normalizeTrainingSets`'s canonical field names are genuinely
    /// snake_case in source (`set_number`, `weight_unit`) — this guards
    /// that `FixtureTrainingAPI`'s `.convertFromSnakeCase` decoder actually
    /// preserves every value, not just successfully decodes the shape.
    func testSetsPreserveRepsWeightAndUnitExactly() async throws {
        let session = try await api.fetchTrainingSession(sessionId: "session-fixture-001")
        let unwrapped = try XCTUnwrap(session)
        let press = try XCTUnwrap(unwrapped.exercises.first { $0.id == "press" })
        XCTAssertEqual(press.sets.map(\.setNumber), [1, 2, 3])
        XCTAssertEqual(press.sets.map(\.reps), [8, 8, 6])
        XCTAssertEqual(press.sets.map(\.weight), [135, 145, 155])
        XCTAssertEqual(press.sets.map(\.weightUnit), ["lb", "lb", "lb"])
    }

    func testBodyweightSetsFormatAsBWNotARawNilWeight() async throws {
        let session = try await api.fetchTrainingSession(sessionId: "session-fixture-001")
        let unwrapped = try XCTUnwrap(session)
        let pushups = try XCTUnwrap(unwrapped.exercises.first { $0.id == "pushups" })
        for set in pushups.sets {
            XCTAssertTrue(set.isBodyweight)
            XCTAssertEqual(set.formattedLoad, "BW")
            XCTAssertTrue(set.formattedDetail.contains("BW"))
        }
    }

    func testTimedSetsFormatAsTimedNotAsZeroReps() async throws {
        let session = try await api.fetchTrainingSession(sessionId: "session-fixture-001")
        let unwrapped = try XCTUnwrap(session)
        let triceps = try XCTUnwrap(unwrapped.exercises.first { $0.id == "triceps" })
        let timedSet = try XCTUnwrap(triceps.sets.first { $0.durationSeconds != nil })
        XCTAssertEqual(timedSet.formattedDetail, "30s")
    }

    // MARK: - Variant presentation data

    /// `formatTrainingExerciseOccurrenceLabel`
    /// (`src/domain/models/trainingExecutionVariant.js:52-56`): the label
    /// includes the variant only when one was actually captured.
    func testExecutionVariantAppearsInTheOccurrenceLabelOnlyWhenPresent() async throws {
        let session = try await api.fetchTrainingSession(sessionId: "session-fixture-001")
        let unwrapped = try XCTUnwrap(session)
        let triceps = try XCTUnwrap(unwrapped.exercises.first { $0.id == "triceps" })
        XCTAssertEqual(triceps.executionVariant?.label, "Static Hold")
        XCTAssertEqual(triceps.occurrenceLabel, "Overhead Triceps Extension · Static Hold")

        let press = try XCTUnwrap(unwrapped.exercises.first { $0.id == "press" })
        XCTAssertNil(press.executionVariant)
        XCTAssertEqual(press.occurrenceLabel, "Bench Press")
    }

    // MARK: - Superset/relationship presentation data

    func testSupersetGroupCapturesBothMembers() async throws {
        let session = try await api.fetchTrainingSession(sessionId: "session-fixture-001")
        let unwrapped = try XCTUnwrap(session)
        let group = try XCTUnwrap(unwrapped.exerciseRelationshipGroups.first)
        XCTAssertEqual(group.relationshipType, "superset")
        XCTAssertEqual(Set(group.memberExerciseIds), ["press", "fly"])
    }

    /// Mirrors `getTrainingSessionExerciseRenderItems`
    /// (`TrainingKnowledgeScreen.jsx:804-826`): superset members render
    /// together as one grouped item, in original order, and standalone
    /// exercises remain their own items — never double-counted.
    func testExerciseGroupingProducesOneSupersetItemAndTwoStandaloneItems() async throws {
        let session = try await api.fetchTrainingSession(sessionId: "session-fixture-001")
        let unwrapped = try XCTUnwrap(session)
        let items = TrainingSessionExerciseGrouping.renderItems(for: unwrapped)

        XCTAssertEqual(items.count, 3, "press+fly grouped, plus triceps and pushups standalone.")

        guard case .relationship(let group, let exercises) = items[0] else {
            return XCTFail("Expected the first item to be the superset group (press, fly appear first).")
        }
        XCTAssertEqual(group.id, "session-fixture-001_superset")
        XCTAssertEqual(exercises.map(\.id), ["press", "fly"])

        guard case .exercise(let triceps) = items[1] else {
            return XCTFail("Expected a standalone exercise item.")
        }
        XCTAssertEqual(triceps.id, "triceps")

        guard case .exercise(let pushups) = items[2] else {
            return XCTFail("Expected a standalone exercise item.")
        }
        XCTAssertEqual(pushups.id, "pushups")
    }

    /// A session with no relationship groups must render every exercise
    /// standalone — the grouping logic must not accidentally group
    /// unrelated exercises.
    func testSessionWithoutRelationshipGroupsRendersAllExercisesStandalone() async throws {
        let session = try await api.fetchTrainingSession(sessionId: "session-fixture-002")
        let unwrapped = try XCTUnwrap(session)
        let items = TrainingSessionExerciseGrouping.renderItems(for: unwrapped)
        XCTAssertEqual(items.count, unwrapped.exercises.count)
        for item in items {
            guard case .exercise = item else {
                return XCTFail("Expected every item to be standalone.")
            }
        }
    }

    // MARK: - Destination wire shape (Training Day's compound streamId quirk)

    func testTrainingDayDestinationRoundTripsThroughTheCompoundStreamId() throws {
        let destination = AppDestination.trainingDay(date: "2026-08-26")
        let data = try JSONEncoder().encode(destination)
        let decoded = try JSONDecoder().decode(AppDestination.self, from: data)
        XCTAssertEqual(decoded, destination)

        let wire = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        let parameters = try XCTUnwrap(wire["parameters"] as? [String: String])
        XCTAssertEqual(parameters["streamId"], "training/day/2026-08-26")
    }

    func testPlainProgressStreamStillDecodesWhenNotATrainingDay() throws {
        let json = Data(#"{"id":"progress.stream","parameters":{"streamId":"nutrition"}}"#.utf8)
        let decoded = try JSONDecoder().decode(AppDestination.self, from: json)
        XCTAssertEqual(decoded, .progressStream(streamId: "nutrition"))
    }
}
