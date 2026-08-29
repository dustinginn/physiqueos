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

    func testLandingDecodesWithoutError() async throws {
        let landing = try await api.fetchTrainingLanding()
        XCTAssertEqual(landing.title, "Training")
        XCTAssertFalse(landing.trainingDays.isEmpty)
        XCTAssertFalse(landing.trainingAreas.isEmpty)
        XCTAssertFalse(landing.reportingLinks.isEmpty)
    }

    /// `report.trainingOverview`/`report.trainingUnderstanding` are real
    /// server fields but are never rendered by `TrainingEvidenceReport`
    /// (confirmed directly from `ProgressPlaceholderScreen.jsx`) — this
    /// guards against that native-only "Overview" dashboard silently
    /// reappearing in the read model.
    func testLandingModelHasNoOverviewOrUnderstandingFields() {
        let mirror = Mirror(reflecting: TrainingLandingReadModel(
            title: "", subtitle: nil, tone: .primary,
            scope: TrainingScopeContext(options: [], dateRangeLabel: ""),
            latestTrainingDay: nil, trainingAreas: [], reportingLinks: [],
            trainingDays: [], currentProtocol: TrainingProtocolSummary(sourceOfTruth: "", dailyActivityTarget: "", trainingObjective: "", goal: ""),
            relatedGoals: [], sourceEvidence: []
        ))
        let fieldNames = Set(mirror.children.compactMap(\.label))
        XCTAssertFalse(fieldNames.contains("trainingOverview"))
        XCTAssertFalse(fieldNames.contains("trainingUnderstanding"))
    }

    // MARK: - Scope-control (`TrainingTimelineSelector`) model/state

    /// The default scope is "All Training" / "Complete history" — matching
    /// `normalizeTrainingContextId`'s own default when no `context` query
    /// param is present.
    func testScopeDefaultsToAllTrainingWithCompleteHistoryLabel() async throws {
        let landing = try await api.fetchTrainingLanding()
        XCTAssertEqual(landing.scope.options.map(\.id), ["build-lean-mass", "visible-abs", "all"])
        XCTAssertEqual(landing.scope.options.map(\.label), ["Build Lean Mass", "Visible Abs", "All Training"])
        let selected = landing.scope.options.filter(\.selected)
        XCTAssertEqual(selected.map(\.id), ["all"])
        XCTAssertEqual(landing.scope.dateRangeLabel, "Complete history")
    }

    // MARK: - Latest Training Day content

    func testLatestTrainingDayShowsBothOfThatDaysSessionsNewestFirst() async throws {
        let landing = try await api.fetchTrainingLanding()
        let latest = try XCTUnwrap(landing.latestTrainingDay)
        XCTAssertEqual(latest.date, "2026-08-26")
        XCTAssertEqual(latest.sessions.map(\.id), ["session-fixture-004", "session-fixture-001"])
        XCTAssertEqual(latest.daySummary, "Chest · Triceps · Walking")
    }

    func testEveryLatestDaySessionCarriesATrainingSessionDestination() async throws {
        let landing = try await api.fetchTrainingLanding()
        let latest = try XCTUnwrap(landing.latestTrainingDay)
        for session in latest.sessions {
            guard case .trainingSession(let sessionId) = session.destination else {
                return XCTFail("Expected a trainingSession destination.")
            }
            XCTAssertEqual(sessionId, session.id)
        }
    }

    // MARK: - Training Areas / exercise counts

    /// Always the 10 canonical muscle-group categories, in
    /// `TRAINING_AREA_NAV_GROUPS` order, each with its own resolved count.
    func testTrainingAreasCoverAllTenCanonicalCategoriesInOrder() async throws {
        let landing = try await api.fetchTrainingLanding()
        XCTAssertEqual(
            landing.trainingAreas.map(\.label),
            ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Core", "Quads", "Hamstrings", "Glutes", "Calves"]
        )
    }

    func testTrainingAreaExerciseCountsMatchTheFixturedSessions() async throws {
        let landing = try await api.fetchTrainingLanding()
        let countsByLabel = Dictionary(uniqueKeysWithValues: landing.trainingAreas.map { ($0.label, $0.exerciseCount) })
        XCTAssertEqual(countsByLabel["Chest"], 3)
        XCTAssertEqual(countsByLabel["Back"], 2)
        XCTAssertEqual(countsByLabel["Shoulders"], 1)
        XCTAssertEqual(countsByLabel["Triceps"], 1)
        XCTAssertEqual(countsByLabel["Biceps"], 0)
    }

    func testEveryTrainingAreaCarriesATrainingExerciseDestination() async throws {
        let landing = try await api.fetchTrainingLanding()
        for area in landing.trainingAreas {
            guard case .trainingExercise(let exerciseId) = area.destination else {
                return XCTFail("Expected a trainingExercise destination for \(area.label).")
            }
            XCTAssertEqual(exerciseId, area.id)
        }
    }

    // MARK: - Recent Training History day grouping (list-page shape, unchanged from prior slice)

    /// The list page always shows the most recent Training Day first
    /// (`trainingDays[0]` == `latestTrainingDay`,
    /// `ProgressReportingService.js:1162-1169`).
    func testTrainingDaysAreOrderedNewestFirst() async throws {
        let landing = try await api.fetchTrainingLanding()
        let dates = landing.trainingDays.map(\.date)
        XCTAssertEqual(dates, dates.sorted(by: >))
    }

    /// `TrainingDayHistoryPreview`/`TrainingHistorySheet` both render
    /// `getTrainingDaySummary(day.sessions)`, not the day's own (differently
    /// shaped) `"N session(s)"` summary — every listed day must carry that
    /// precomputed text, and it must agree with the Latest Training Day
    /// card's own summary for the same date.
    func testTrainingDaysSummaryAgreesWithLatestTrainingDayForTheSameDate() async throws {
        let landing = try await api.fetchTrainingLanding()
        let latest = try XCTUnwrap(landing.latestTrainingDay)
        let matchingRow = try XCTUnwrap(landing.trainingDays.first { $0.date == latest.date })
        XCTAssertEqual(matchingRow.summary, latest.daySummary)
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
