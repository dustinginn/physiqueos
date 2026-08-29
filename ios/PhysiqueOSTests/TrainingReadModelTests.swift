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

    // MARK: - View Training Day CTA resolves to the correct day (Objective 1)

    /// `AppDestinationRouterView` special-cases `.trainingDay(date:)` to the
    /// real `TrainingDayView` — this guards that "View Training Day →"
    /// (`latestTrainingDayCard`'s `NavigationLink`) carries a destination
    /// for the *same date* the card is displaying, not a stale or
    /// mismatched one.
    func testViewTrainingDayDestinationResolvesToTheDisplayedDate() async throws {
        let landing = try await api.fetchTrainingLanding()
        let day = try XCTUnwrap(landing.latestTrainingDay)
        XCTAssertEqual(day.destination, .trainingDay(date: day.date))
    }

    func testViewTrainingDayDestinationRoundTripsAndResolvesTheCorrectFixtureDay() async throws {
        let landing = try await api.fetchTrainingLanding()
        let day = try XCTUnwrap(landing.latestTrainingDay)
        guard case .trainingDay(let date) = day.destination else {
            return XCTFail("Expected a trainingDay destination.")
        }
        let resolved = try await api.fetchTrainingDay(date: date)
        XCTAssertEqual(resolved?.date, day.date)
    }

    // MARK: - Training icon mappings are centrally stable (Objective 2)

    func testTrainingAreaIconMappingMatchesTheVerifiedWebIconVocabulary() {
        // CircleDot (Chest) is a ring with a small filled center dot;
        // smallcircle.filled.circle is SF Symbols' literal match — guards
        // against the previous circle.circle.fill mismatch silently
        // returning.
        XCTAssertEqual(TrainingAreaIcon.systemImage(for: "chest"), "smallcircle.filled.circle")
        XCTAssertEqual(TrainingAreaIcon.systemImage(for: "back"), "dumbbell.fill")
        XCTAssertEqual(TrainingAreaIcon.systemImage(for: "core"), "shield.fill")
        XCTAssertEqual(TrainingAreaIcon.systemImage(for: "glutes"), "flame.fill")
        XCTAssertEqual(TrainingAreaIcon.systemImage(for: "quads"), "bolt.fill")
    }

    func testTrainingAreaIconMappingFailsSafeToDumbbellForAnUnknownArea() {
        XCTAssertEqual(TrainingAreaIcon.systemImage(for: "not-a-real-area"), "dumbbell.fill")
    }

    // MARK: - Chest Training Area (Objective 3)

    func testChestAreaDecodesWithoutError() async throws {
        let chest = try await api.fetchTrainingArea(areaId: "chest")
        let unwrapped = try XCTUnwrap(chest)
        XCTAssertEqual(unwrapped.title, "Chest")
        XCTAssertFalse(unwrapped.exercises.isEmpty)
    }

    /// `getTrainingLibraryHeaderItems` always resolves to exactly
    /// `["Training", "Training Library"]` for a bare area path — the
    /// area's own breadcrumb entry is filtered out because its href equals
    /// the current route (verified from source, not assumed).
    func testChestBreadcrumbsAreTrainingThenTrainingLibraryOnly() async throws {
        let chest = try await api.fetchTrainingArea(areaId: "chest")
        let unwrapped = try XCTUnwrap(chest)
        XCTAssertEqual(unwrapped.breadcrumbs.map(\.label), ["Training", "Training Library"])
    }

    func testChestBreadcrumbsResolveToRealDestinations() async throws {
        let chest = try await api.fetchTrainingArea(areaId: "chest")
        let unwrapped = try XCTUnwrap(chest)
        let training = try XCTUnwrap(unwrapped.breadcrumbs.first { $0.label == "Training" })
        XCTAssertEqual(training.destination, .progressStream(streamId: "training"))
    }

    /// Exercise identity/count integrity: every exercise has a unique id,
    /// a non-empty label, and a `training.exercise` destination carrying
    /// that same id.
    func testChestExerciseIdentityAndDestinationsAreConsistent() async throws {
        let chest = try await api.fetchTrainingArea(areaId: "chest")
        let unwrapped = try XCTUnwrap(chest)
        XCTAssertEqual(unwrapped.exercises.map(\.label), ["Bench Press", "Cable Fly", "Push-ups"])
        XCTAssertEqual(Set(unwrapped.exercises.map(\.id)).count, unwrapped.exercises.count)
        for exercise in unwrapped.exercises {
            guard case .trainingExercise(let exerciseId) = exercise.destination else {
                return XCTFail("Expected a trainingExercise destination for \(exercise.label).")
            }
            XCTAssertEqual(exerciseId, exercise.id)
        }
    }

    /// Verified, source-confirmed current-web behavior (not a native
    /// simplification): `formatExerciseSetSummary` reads `set.summary` off
    /// plain formatted strings, which is always `undefined`, so no detail
    /// line renders for any exercise on the production Training Library
    /// page today. Reproduced exactly.
    func testChestExerciseRowsHaveNoDetailTextMatchingTheCurrentWebBehavior() async throws {
        let chest = try await api.fetchTrainingArea(areaId: "chest")
        let unwrapped = try XCTUnwrap(chest)
        for exercise in unwrapped.exercises {
            XCTAssertNil(exercise.detail)
        }
    }

    // MARK: - Chest navigation from the Training landing page

    func testChestAreaRowOnLandingNavigatesToTheRealChestDestination() async throws {
        let landing = try await api.fetchTrainingLanding()
        let chestRow = try XCTUnwrap(landing.trainingAreas.first { $0.id == "chest" })
        XCTAssertEqual(chestRow.destination, .trainingExercise(exerciseId: "chest"))
    }

    /// All 10 canonical Training Areas are now fixture-backed (extends the
    /// prior slice, which only backed Chest) — every landing row resolves
    /// to a real `TrainingAreaReadModel`, and each area's own resolved
    /// `exercises.count` agrees exactly with the landing row's
    /// `exerciseCount`, so the grid and the area page can never disagree.
    func testEveryTrainingAreaIsFixtureBackedAndItsExerciseCountAgreesWithLanding() async throws {
        let landing = try await api.fetchTrainingLanding()
        for area in landing.trainingAreas {
            let fixtureBacked = try await api.fetchTrainingArea(areaId: area.id)
            let unwrapped = try XCTUnwrap(fixtureBacked, "\(area.id) must be fixture-backed.")
            XCTAssertEqual(unwrapped.title, area.label)
            XCTAssertEqual(
                unwrapped.exercises.count, area.exerciseCount,
                "\(area.id)'s Browse list must have exactly as many rows as the landing grid claims."
            )
        }
    }

    /// The six areas with no logged exercises today (Biceps, Core, Quads,
    /// Hamstrings, Glutes, Calves) still render a real, honest area page —
    /// an empty "Browse" section, not a placeholder or an error — matching
    /// `InformationList`'s real behavior for zero exercises (verified
    /// directly from source: no "come back later" copy exists there).
    func testAreasWithNoLoggedExercisesRenderAnEmptyBrowseListNotAPlaceholder() async throws {
        for areaId in ["biceps", "core", "quads", "hamstrings", "glutes", "calves"] {
            let area = try await api.fetchTrainingArea(areaId: areaId)
            let unwrapped = try XCTUnwrap(area, "\(areaId) must be fixture-backed.")
            XCTAssertTrue(unwrapped.exercises.isEmpty)
            XCTAssertEqual(unwrapped.breadcrumbs.map(\.label), ["Training", "Training Library"])
        }
    }

    /// Back/Shoulders/Triceps' exercises are drawn from the same
    /// `session-fixture-001`/`session-fixture-002` exercises those areas'
    /// landing counts were computed from (`testTrainingAreaExerciseCountsMatchTheFixturedSessions`)
    /// — not invented area-specific duplicates of exercises that already
    /// have a canonical identity elsewhere in the fixture.
    func testBackShouldersAndTricepsExercisesMatchTheirFixturedSessionExercises() async throws {
        let back = try await api.fetchTrainingArea(areaId: "back")
        XCTAssertEqual(try XCTUnwrap(back).exercises.map(\.label), ["Lat Pulldown", "Seated Cable Row"])

        let shoulders = try await api.fetchTrainingArea(areaId: "shoulders")
        XCTAssertEqual(try XCTUnwrap(shoulders).exercises.map(\.label), ["Face Pull"])

        let triceps = try await api.fetchTrainingArea(areaId: "triceps")
        XCTAssertEqual(try XCTUnwrap(triceps).exercises.map(\.label), ["Overhead Triceps Extension"])
    }

    /// Every area's exercise rows keep the same identity/destination/no-
    /// detail-text integrity Chest's own tests already establish — not
    /// just Chest's.
    func testEveryAreaExerciseRowHasConsistentIdentityAndNoDetailText() async throws {
        for areaId in ["chest", "back", "shoulders", "triceps"] {
            let area = try await api.fetchTrainingArea(areaId: areaId)
            let unwrapped = try XCTUnwrap(area)
            XCTAssertEqual(Set(unwrapped.exercises.map(\.id)).count, unwrapped.exercises.count)
            for exercise in unwrapped.exercises {
                guard case .trainingExercise(let exerciseId) = exercise.destination else {
                    return XCTFail("Expected a trainingExercise destination for \(exercise.label).")
                }
                XCTAssertEqual(exerciseId, exercise.id)
                XCTAssertNil(exercise.detail)
            }
        }
    }

    func testUnknownAreaResolvesToNilRatherThanCrashing() async throws {
        let area = try await api.fetchTrainingArea(areaId: "not-a-real-area")
        XCTAssertNil(area)
    }

    // MARK: - Training Day fidelity (Stage 2)

    func testCompactDateFormattingMatchesTheFounderSpecifiedForm() {
        XCTAssertEqual(TrainingDayView.formatCompactDate("2026-08-26"), "Aug 26, 2026")
        XCTAssertEqual(TrainingDayView.formatCompactDate("2026-01-05"), "Jan 5, 2026")
    }

    func testTrainingDaySessionsDistinguishStrengthFromCardioByKind() async throws {
        let day = try await api.fetchTrainingDay(date: "2026-08-26")
        let unwrapped = try XCTUnwrap(day)
        let strength = try XCTUnwrap(unwrapped.sessions.first { $0.id == "session-fixture-001" })
        let walking = try XCTUnwrap(unwrapped.sessions.first { $0.id == "session-fixture-004" })
        XCTAssertEqual(strength.kind, .strength)
        XCTAssertEqual(walking.kind, .walking)
    }

    func testEveryTrainingDaySessionCarriesATrainingSessionDestination() async throws {
        let day = try await api.fetchTrainingDay(date: "2026-08-26")
        let unwrapped = try XCTUnwrap(day)
        for session in unwrapped.sessions {
            guard case .trainingSession(let sessionId) = session.destination else {
                return XCTFail("Expected a trainingSession destination for \(session.id).")
            }
            XCTAssertEqual(sessionId, session.id)
        }
    }

    // MARK: - Workout Detail fidelity (Stage 3)

    /// A prior revision joined source labels with `", "` — the real web
    /// (`getSessionContent`, `TrainingKnowledgeScreen.jsx:782-786`) and
    /// every other Training source line in this app already use `" + "`.
    func testSourceLineJoinsMultipleSourcesWithPlusNotComma() {
        XCTAssertEqual(TrainingSessionDetailView.formatSourceLine(["Typed evidence"]), "Source: Typed evidence")
        XCTAssertEqual(
            TrainingSessionDetailView.formatSourceLine(["Screenshot", "Typed evidence"]),
            "Source: Screenshot + Typed evidence"
        )
    }

    /// `formatDurationSet` (`TrainingKnowledgeScreen.jsx:1746-1753`): under
    /// 60s is `"Ns"`; 60s and over is `"M:SS"` — a prior revision rendered
    /// the latter as `"1m 15s"`, which the fixture's original single 30s
    /// timed set never exercised.
    func testTimedSetsSixtySecondsOrLongerUseColonNotationNotMinutesSeconds() async throws {
        let session = try await api.fetchTrainingSession(sessionId: "session-fixture-001")
        let unwrapped = try XCTUnwrap(session)
        let triceps = try XCTUnwrap(unwrapped.exercises.first { $0.id == "triceps" })
        let longTimedSet = try XCTUnwrap(triceps.sets.first { $0.durationSeconds == 75 })
        XCTAssertEqual(longTimedSet.formattedDetail, "1:15")
        let shortTimedSet = try XCTUnwrap(triceps.sets.first { $0.durationSeconds == 30 })
        XCTAssertEqual(shortTimedSet.formattedDetail, "30s")
    }

    // MARK: - Add / Correct Workout Details (Stage 4)

    /// Mirrors the real web's `"missing-details"` client validation
    /// message exactly — this is honest client-side input validation, not
    /// a claim about server state.
    func testCorrectionValidationRequiresNonEmptyText() {
        XCTAssertEqual(TrainingSessionCorrectionValidation.validationError(forText: ""), "Add workout details before saving.")
        XCTAssertEqual(TrainingSessionCorrectionValidation.validationError(forText: "   \n  "), "Add workout details before saving.")
        XCTAssertNil(TrainingSessionCorrectionValidation.validationError(forText: "15 x #120"))
    }
}
