import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Training evidence/history vertical —
/// history list, Training Day, and TrainingSession detail — introduced in
/// this slice. Exercises the fixture through `FixtureTrainingAPI` (not a
/// bespoke decode path) so these tests cover the same integration surface
/// the screens actually use.
final class TrainingReadModelTests: XCTestCase {
    private let api = FixtureTrainingAPI()

    private func performanceEvent(
        id: String,
        canonicalExerciseId: String = "x",
        canonicalExerciseName: String = "Example Exercise",
        eventType: TrainingPerformanceEventType,
        workoutDate: String,
        previousBaselineValue: Double? = nil,
        improvement: Double? = nil,
        unit: String? = nil,
        load: Double? = nil,
        loadUnit: String? = nil,
        reps: Double? = nil,
        sessionVolume: Double? = nil,
        executionVariant: TrainingExecutionVariant? = nil,
        relationshipContext: TrainingPerformanceRelationshipContext? = nil,
        schemaVersion: String = TrainingPerformanceRecordsCalculator.schemaVersion,
        category: String = TrainingPerformanceRecordsCalculator.category
    ) -> TrainingPerformanceEvent {
        var event = TrainingPerformanceEvent(
            id: id,
            schemaVersion: schemaVersion,
            category: category,
            eventType: eventType.rawValue,
            sourceReviewId: "review-\(id)",
            sourceEvidencePackageId: "evidence-\(id)",
            sourceCanonicalTrainingId: "canonical-\(id)",
            sourceSessionId: "session-\(id)",
            sourceAnalysisId: "analysis-\(id)",
            canonicalExerciseId: canonicalExerciseId,
            canonicalExerciseName: canonicalExerciseName,
            workoutDate: workoutDate,
            currentValue: sessionVolume ?? reps,
            executionVariant: executionVariant,
            relationshipContext: relationshipContext,
            previousBaselineValue: previousBaselineValue,
            improvement: improvement,
            unit: unit,
            load: load,
            loadUnit: loadUnit,
            reps: reps,
            sessionVolume: sessionVolume,
            createdAt: "\(workoutDate)T12:00:00.000Z"
        )
        event.id = TrainingPerformanceEventValidator.expectedId(for: event) ?? id
        return event
    }

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

    // MARK: - Exercise Detail / History routing (Training Library slice)

    /// Every Browse row that carries a canonical exercise id is a real
    /// exercise, never one of the 10 area ids `AppDestinationRouterView`
    /// special-cases to `TrainingAreaView` — proving these rows route to
    /// the new exercise-history screen instead of accidentally re-entering
    /// the area page.
    func testExerciseRowIdsAreNeverConfusedWithCanonicalAreaIds() async throws {
        for areaId in ["chest", "back", "shoulders", "triceps"] {
            let area = try await api.fetchTrainingArea(areaId: areaId)
            let unwrapped = try XCTUnwrap(area)
            for exercise in unwrapped.exercises {
                XCTAssertFalse(TrainingAreaIcon.canonicalAreaIds.contains(exercise.id))
            }
        }
    }

    func testChestExerciseRowsCarryTheSameCanonicalIdsUsedBySessionOccurrences() async throws {
        let chest = try await api.fetchTrainingArea(areaId: "chest")
        let unwrapped = try XCTUnwrap(chest)
        let byLabel = Dictionary(uniqueKeysWithValues: unwrapped.exercises.map { ($0.label, $0.canonicalExerciseId) })
        XCTAssertEqual(byLabel["Bench Press"], "barbell_bench_press")
        XCTAssertEqual(byLabel["Cable Fly"], "cable_fly")
        XCTAssertEqual(byLabel["Push-ups"], "pushup")
    }

    // MARK: - Exercise Detail / History fetch integrity

    func testUnknownExerciseResolvesToNilRatherThanCrashing() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "not-a-real-exercise")
        XCTAssertNil(exercise)
    }

    func testExerciseDetailBreadcrumbsAreTrainingThenTrainingLibraryThenTheOwningArea() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "bench-press")
        let unwrapped = try XCTUnwrap(exercise)
        XCTAssertEqual(unwrapped.breadcrumbs.map(\.label), ["Training", "Training Library", "Chest"])
        let areaCrumb = try XCTUnwrap(unwrapped.breadcrumbs.first { $0.label == "Chest" })
        XCTAssertEqual(areaCrumb.destination, .trainingExercise(exerciseId: "chest"))
    }

    /// Bench Press has exactly one historical occurrence, and it's inside
    /// a superset — `getCurrentExerciseBenchmark` must isolate it from any
    /// (nonexistent) standalone comparison rather than silently comparing
    /// across relationship contexts.
    func testBenchPressBenchmarkIsolatesTheSupersetOccurrence() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "bench-press")
        let unwrapped = try XCTUnwrap(exercise)
        XCTAssertEqual(unwrapped.history.count, 1)
        let benchmark = try XCTUnwrap(unwrapped.benchmark)
        XCTAssertEqual(benchmark.comparison, "No comparable prior superset session.")
        XCTAssertEqual(benchmark.workingWeight, "155 lb")
    }

    /// Overhead Triceps Extension's one occurrence carries a "Static Hold"
    /// variant — isolated the same way, by variant key this time.
    func testOverheadTricepsExtensionBenchmarkIsolatesTheVariantOccurrence() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "overhead-triceps-extension")
        let unwrapped = try XCTUnwrap(exercise)
        let benchmark = try XCTUnwrap(unwrapped.benchmark)
        XCTAssertEqual(benchmark.comparison, "No comparable prior variant session.")
    }

    /// Lat Pulldown has two standalone occurrences at different loads
    /// (100/110/120 lb on 2026-08-17, then 110/120/130 lb on 2026-08-24) —
    /// this is the multi-session "new best" path, and history must show
    /// both, newest first.
    func testLatPulldownShowsTwoOccurrencesNewestFirstWithANewBest() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "lat-pulldown")
        let unwrapped = try XCTUnwrap(exercise)
        XCTAssertEqual(unwrapped.history.map(\.sessionDate), unwrapped.history.map(\.sessionDate).sorted(by: >))
        XCTAssertEqual(unwrapped.history.count, 2)
        XCTAssertEqual(unwrapped.history.first?.sessionId, "session-fixture-002")
        XCTAssertEqual(unwrapped.history.last?.sessionId, "session-fixture-005")
        let benchmark = try XCTUnwrap(unwrapped.benchmark)
        XCTAssertEqual(benchmark.comparison, "Last session established a new best.")
        XCTAssertEqual(benchmark.workingWeight, "130 lb")
        XCTAssertEqual(benchmark.bestSet, "8 x 130 lb")
    }

    /// Push-ups is bodyweight across both its occurrences (20/18 reps on
    /// 2026-08-26, 16/15 reps on 2026-08-17) — the benchmark comparator
    /// must rank by reps when weight is absent on both sides, not treat a
    /// bodyweight exercise as unranked.
    func testPushUpsBodyweightHistoryComparesByRepsAndFormatsAsBW() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "push-ups")
        let unwrapped = try XCTUnwrap(exercise)
        XCTAssertEqual(unwrapped.history.count, 2)
        for occurrence in unwrapped.history {
            for set in occurrence.exercise.sets {
                XCTAssertTrue(set.isBodyweight)
                XCTAssertEqual(set.formattedLoad, "BW")
            }
        }
        let benchmark = try XCTUnwrap(unwrapped.benchmark)
        XCTAssertEqual(benchmark.comparison, "Last session established a new best.")
        XCTAssertEqual(benchmark.workingWeight, "BW")
        XCTAssertEqual(benchmark.bestSet, "20 x BW")
    }

    func testExerciseHistoryPreservesRawSetsAcrossSessions() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "lat-pulldown")
        let unwrapped = try XCTUnwrap(exercise)
        let earlier = try XCTUnwrap(unwrapped.history.first { $0.sessionId == "session-fixture-005" })
        XCTAssertEqual(earlier.exercise.sets.map(\.reps), [10, 10, 8])
        XCTAssertEqual(earlier.exercise.sets.map(\.weight), [100, 110, 120])
        XCTAssertEqual(earlier.exercise.sets.map(\.weightUnit), ["lb", "lb", "lb"])
    }

    func testExerciseHistoryCarriesVariantSemantics() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "overhead-triceps-extension")
        let unwrapped = try XCTUnwrap(exercise)
        let occurrence = try XCTUnwrap(unwrapped.lastSession)
        XCTAssertEqual(occurrence.exercise.executionVariant?.label, "Static Hold")
        XCTAssertEqual(occurrence.exercise.occurrenceLabel, "Overhead Triceps Extension · Static Hold")
        XCTAssertNil(occurrence.relationship)
    }

    func testExerciseHistoryCarriesSupersetSemantics() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "bench-press")
        let unwrapped = try XCTUnwrap(exercise)
        let occurrence = try XCTUnwrap(unwrapped.lastSession)
        let relationship = try XCTUnwrap(occurrence.relationship)
        XCTAssertEqual(relationship.relationshipType, "superset")
        XCTAssertEqual(relationship.partnerNames, ["Cable Fly"])
        XCTAssertEqual(relationship.label, "Superset with Cable Fly")
    }

    // MARK: - Pure benchmark/formatting helpers

    func testCompareExerciseSetsRanksByWeightThenRepsThenTreatsMissingAsWorst() {
        let heavier = TrainingSet(setNumber: 1, reps: 8, weight: 150, weightUnit: "lb", durationSeconds: nil, loadType: nil, setType: nil)
        let lighter = TrainingSet(setNumber: 1, reps: 8, weight: 140, weightUnit: "lb", durationSeconds: nil, loadType: nil, setType: nil)
        let moreReps = TrainingSet(setNumber: 1, reps: 10, weight: 140, weightUnit: "lb", durationSeconds: nil, loadType: nil, setType: nil)
        let timed = TrainingSet(setNumber: 1, reps: nil, weight: nil, weightUnit: nil, durationSeconds: 30, loadType: nil, setType: nil)

        XCTAssertLessThan(TrainingExerciseHistoryCalculator.compare(heavier, lighter), 0)
        XCTAssertLessThan(TrainingExerciseHistoryCalculator.compare(moreReps, lighter), 0)
        XCTAssertEqual(TrainingExerciseHistoryCalculator.compare(lighter, lighter), 0)
        XCTAssertLessThan(TrainingExerciseHistoryCalculator.compare(lighter, timed), 0)
    }

    func testTrainingSetGlanceFormatsWeightedBodyweightAndTimedSets() {
        let weighted = TrainingSet(setNumber: 1, reps: 8, weight: 150, weightUnit: "lb", durationSeconds: nil, loadType: nil, setType: nil)
        XCTAssertEqual(weighted.glance, "8 x 150 lb")

        let bodyweight = TrainingSet(setNumber: 1, reps: 20, weight: nil, weightUnit: "bodyweight", durationSeconds: nil, loadType: "bodyweight", setType: "bodyweight_reps")
        XCTAssertEqual(bodyweight.glance, "20 x BW")

        let shortTimed = TrainingSet(setNumber: 1, reps: nil, weight: nil, weightUnit: nil, durationSeconds: 30, loadType: nil, setType: nil)
        XCTAssertEqual(shortTimed.glance, "30s")

        let longTimed = TrainingSet(setNumber: 1, reps: nil, weight: nil, weightUnit: nil, durationSeconds: 75, loadType: nil, setType: nil)
        XCTAssertEqual(longTimed.glance, "1:15")
    }

    /// `referenceDate` is injectable specifically so this doesn't depend
    /// on the device clock — deterministic against fixed fixture dates.
    func testSessionBadgeShowsTodayYesterdayOrAShortDate() throws {
        let reference = try XCTUnwrap(TrainingDateFormatting.date(from: "2026-08-26T12:00:00-07:00"))
        XCTAssertEqual(TrainingExerciseHistoryCalculator.sessionBadge(for: "2026-08-26T06:02:00-07:00", referenceDate: reference), "Today")
        XCTAssertEqual(TrainingExerciseHistoryCalculator.sessionBadge(for: "2026-08-25T06:02:00-07:00", referenceDate: reference), "Yesterday")
        XCTAssertEqual(TrainingExerciseHistoryCalculator.sessionBadge(for: "2026-08-17T06:05:00-07:00", referenceDate: reference), "Aug 17")
    }

    // MARK: - Performance Records (completeness sweep, Known Gap 1)

    /// Lat Pulldown's session-volume PR ties directly to its own already-
    /// fixtured occurrences (3,060 lb on 2026-08-17 → 3,340 lb on
    /// 2026-08-24) — the exact same numbers `testLatPulldownShowsTwoOccurrencesNewestFirstWithANewBest`
    /// already exercises, so the record and the benchmark never disagree.
    func testLatPulldownHasASessionVolumeRecordWithPreviousAndImprovement() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "lat-pulldown")
        let unwrapped = try XCTUnwrap(exercise)
        let model = try XCTUnwrap(unwrapped.performanceRecords)
        XCTAssertEqual(model.heading, "Performance Records")
        let record = try XCTUnwrap(model.records.first { $0.achievementType == .sessionVolumePR })
        XCTAssertEqual(record.title, "Session volume record")
        XCTAssertEqual(record.value, "3,340 lb")
        XCTAssertEqual(record.detail, "Previous: 3,060 lb · Improved by 280 lb")
        XCTAssertNil(record.executionVariant)
    }

    /// Overhead Triceps Extension's reps-at-load record carries the
    /// "Static Hold" variant — the Founder's exact reference example
    /// (record + variant + previous value), reproduced with synthetic
    /// data rather than the literal screenshot numbers.
    func testOverheadTricepsExtensionRecordCarriesTheVariant() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "overhead-triceps-extension")
        let unwrapped = try XCTUnwrap(exercise)
        let model = try XCTUnwrap(unwrapped.performanceRecords)
        let record = try XCTUnwrap(model.records.first)
        XCTAssertEqual(record.title, "Reps-at-load record")
        XCTAssertEqual(record.value, "10 reps at 40 lb")
        XCTAssertEqual(record.detail, "Previous: 8 reps at this load")
        XCTAssertEqual(record.executionVariant?.label, "Static Hold")
    }

    func testBenchPressRecordPreservesPreviousBaselineAndSupersetContext() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "bench-press")
        let unwrapped = try XCTUnwrap(exercise)
        let model = try XCTUnwrap(unwrapped.performanceRecords)
        let record = try XCTUnwrap(model.records.first)
        XCTAssertEqual(record.value, "6 reps at 155 lb")
        XCTAssertEqual(record.detail, "Previous: 5 reps at this load")
        XCTAssertEqual(record.relationshipContext?.relationshipType, "superset")
        XCTAssertEqual(record.relationshipContext?.orderedPartners.map(\.name), ["Cable Fly"])
    }

    /// `createTrainingLibraryExerciseRecordsReadModel` returns `nil` (not
    /// an empty-records object) when an exercise has zero qualifying PR
    /// events — Face Pull has none in the fixture.
    func testExerciseWithNoPerformanceEventsHasNilPerformanceRecords() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "face-pull")
        let unwrapped = try XCTUnwrap(exercise)
        XCTAssertNil(unwrapped.performanceRecords)
    }

    /// `compareRecords`: workout date descending, then session-volume
    /// before reps-at-load on the same date, then achieved value
    /// descending, then event id ascending — verified directly on the
    /// calculator with events spanning multiple exercises is not possible
    /// (the read model is always scoped to one canonical exercise id), so
    /// this constructs same-exercise events to exercise the comparator
    /// itself.
    func testPerformanceRecordsOrderByDateThenTypeThenValueThenId() throws {
        let events = [
            performanceEvent(id: "b", eventType: .repsAtLoadPR, workoutDate: "2026-08-20", load: 100, loadUnit: "lb", reps: 10),
            performanceEvent(id: "a", eventType: .sessionVolumePR, workoutDate: "2026-08-20", unit: "lb", sessionVolume: 2000),
            performanceEvent(id: "c", eventType: .sessionVolumePR, workoutDate: "2026-08-22", unit: "lb", sessionVolume: 1500),
        ]
        let model = try XCTUnwrap(TrainingPerformanceRecordsCalculator.recordsReadModel(canonicalExerciseId: "x", events: events))
        XCTAssertEqual(model.records.map(\.workoutDate), ["2026-08-22", "2026-08-20", "2026-08-20"])
        XCTAssertEqual(model.records.map(\.achievementType), [.sessionVolumePR, .sessionVolumePR, .repsAtLoadPR])
    }

    func testPerformanceRecordsTruncateAtFiveWithACountLabel() {
        let events = (1...7).map { index in
            performanceEvent(
                id: "event-\(index)", eventType: .repsAtLoadPR,
                workoutDate: String(format: "2026-08-%02d", index),
                load: Double(index), loadUnit: "lb", reps: 10
            )
        }
        let model = TrainingPerformanceRecordsCalculator.recordsReadModel(canonicalExerciseId: "x", events: events)
        XCTAssertEqual(model?.records.count, 5)
        XCTAssertEqual(model?.visibleCount, 5)
        XCTAssertEqual(model?.totalCount, 7)
        XCTAssertEqual(model?.hiddenCount, 2)
        XCTAssertEqual(model?.countLabel, "Showing 5 of 7 records")
    }

    func testPerformanceRecordsCalculatorReturnsNilForEmptyOrMismatchedEvents() {
        XCTAssertNil(TrainingPerformanceRecordsCalculator.recordsReadModel(canonicalExerciseId: "x", events: []))
        let mismatched = [
            performanceEvent(id: "a", canonicalExerciseId: "other", eventType: .sessionVolumePR, workoutDate: "2026-08-20", unit: "lb", sessionVolume: 2000),
        ]
        XCTAssertNil(TrainingPerformanceRecordsCalculator.recordsReadModel(canonicalExerciseId: "x", events: mismatched))
    }

    func testPerformanceRecordsRejectMalformedSchemaCategoryNameDateAndType() {
        let valid = performanceEvent(id: "valid", eventType: .sessionVolumePR, workoutDate: "2026-08-20", unit: "lb", sessionVolume: 2000)
        var wrongSchema = valid
        wrongSchema.id = "schema"
        wrongSchema.schemaVersion = "training_performance_event_v0"
        var wrongCategory = valid
        wrongCategory.id = "category"
        wrongCategory.category = "training"
        var blankName = valid
        blankName.id = "name"
        blankName.canonicalExerciseName = "  "
        var invalidDate = valid
        invalidDate.id = "date"
        invalidDate.workoutDate = "2026-02-30"
        var unsupportedType = valid
        unsupportedType.id = "type"
        unsupportedType.eventType = "future_record_type"

        let model = TrainingPerformanceRecordsCalculator.recordsReadModel(
            canonicalExerciseId: " x ",
            events: [wrongSchema, wrongCategory, blankName, invalidDate, unsupportedType, valid]
        )
        XCTAssertEqual(model?.records.map(\.sourceEventId), [valid.id])
        XCTAssertEqual(model?.canonicalExerciseName, "Example Exercise")
    }

    func testPerformanceRecordsDeduplicateBeforeValidationAndRequireExactImprovement() {
        let malformedFirst = performanceEvent(
            id: "duplicate", eventType: .sessionVolumePR, workoutDate: "2026-08-20",
            previousBaselineValue: 1800, improvement: 199, unit: "lb", sessionVolume: 2000,
            schemaVersion: "invalid"
        )
        let validDuplicate = performanceEvent(
            id: "duplicate", eventType: .sessionVolumePR, workoutDate: "2026-08-20",
            previousBaselineValue: 1800, improvement: 200, unit: "lb", sessionVolume: 2000
        )
        XCTAssertNil(TrainingPerformanceRecordsCalculator.recordsReadModel(canonicalExerciseId: "x", events: [malformedFirst, validDuplicate]))

        let mismatchedDelta = performanceEvent(
            id: "delta", eventType: .sessionVolumePR, workoutDate: "2026-08-20",
            previousBaselineValue: 1800, improvement: 199, unit: "lb", sessionVolume: 2000
        )
        let record = TrainingPerformanceRecordsCalculator.recordsReadModel(canonicalExerciseId: "x", events: [mismatchedDelta])?.records.first
        XCTAssertEqual(record?.previousBaseline, "Previous: 1,800 lb")
        XCTAssertNil(record?.improvement)
        XCTAssertEqual(record?.detail, "Previous: 1,800 lb")
    }

    func testDurablePerformanceEventValidationRejectsBrokenProducerSemantics() {
        let valid = performanceEvent(
            id: "valid-durable", eventType: .sessionVolumePR, workoutDate: "2026-08-20",
            previousBaselineValue: 1800, improvement: 200, unit: "lb", sessionVolume: 2000
        )
        XCTAssertTrue(TrainingPerformanceEventValidator.isValid(valid))

        var badCurrent = valid
        badCurrent.currentValue = 1999
        XCTAssertFalse(TrainingPerformanceEventValidator.isValid(badCurrent))
        var badImprovement = valid
        badImprovement.improvement = 199
        XCTAssertFalse(TrainingPerformanceEventValidator.isValid(badImprovement))
        var badSource = valid
        badSource.sourceAnalysisId = "  "
        XCTAssertFalse(TrainingPerformanceEventValidator.isValid(badSource))
        var badIdentity = valid
        badIdentity.id = "training_performance_event_tampered"
        XCTAssertFalse(TrainingPerformanceEventValidator.isValid(badIdentity))
    }

    func testFirstRecordWithoutBaselineOmitsDetail() {
        let event = performanceEvent(id: "first", eventType: .repsAtLoadPR, workoutDate: "2026-08-20", load: 100, loadUnit: "lb", reps: 10)
        let record = TrainingPerformanceRecordsCalculator.recordsReadModel(canonicalExerciseId: "x", events: [event])?.records.first
        XCTAssertNil(record?.detail)
    }

    // MARK: - Reporting (completeness sweep, Known Gap 2)

    func testTrainingLandingReportingLinksCoverAllSixRealWebIds() async throws {
        let landing = try await api.fetchTrainingLanding()
        XCTAssertEqual(
            landing.reportingLinks.map(\.id),
            ["resistance", "cardio", "volume", "frequency", "consistency", "history"]
        )
    }

    func testEveryReportingLinkCarriesAProgressStreamDestination() async throws {
        let landing = try await api.fetchTrainingLanding()
        for link in landing.reportingLinks {
            guard case .progressStream(let streamId) = link.destination else {
                return XCTFail("Expected a progressStream destination for \(link.id).")
            }
            XCTAssertEqual(streamId, "training/reporting/\(link.id)")
        }
    }

    func testUnknownReportIdResolvesToNilRatherThanCrashing() async throws {
        let report = try await api.fetchTrainingReporting(reportId: "not-a-real-report")
        XCTAssertNil(report)
    }

    /// Cardio/Volume/Frequency/Consistency are verified real current web
    /// behavior — an identical static "Foundation" placeholder, not a
    /// native shortcut for an unbuilt feature.
    func testCardioVolumeFrequencyConsistencyShowTheIdenticalFoundationPlaceholder() async throws {
        for reportId in ["cardio", "volume", "frequency", "consistency"] {
            let report = try await api.fetchTrainingReporting(reportId: reportId)
            let unwrapped = try XCTUnwrap(report)
            XCTAssertEqual(unwrapped.eyebrow, "Reporting")
            XCTAssertEqual(
                unwrapped.placeholderBody,
                "This page is now a permanent destination. It will grow into graphs, trends, comparisons, goal impact, and historical analysis as more canonical training evidence accumulates."
            )
            XCTAssertNil(unwrapped.resistance)
            XCTAssertNil(unwrapped.historyDays)
        }
    }

    func testResistanceReportHasRealStatusGroupsPrsHighlightsAndCategoryRollups() async throws {
        let report = try await api.fetchTrainingReporting(reportId: "resistance")
        let unwrapped = try XCTUnwrap(report)
        XCTAssertEqual(unwrapped.title, "Resistance Training")
        XCTAssertEqual(unwrapped.scope.dateRangeLabel, "Complete history")
        let resistance = try XCTUnwrap(unwrapped.resistance)
        XCTAssertEqual(resistance.statusGroups.map(\.label), ["Improving", "Stable", "Plateauing", "Regressing"])
        XCTAssertEqual(resistance.statusGroups.map(\.tone), [.success, .stable, .warning, .danger])
        XCTAssertEqual(resistance.statusGroups.first?.items.map(\.label), ["Lat Pulldown", "Push-ups", "Overhead Triceps Extension"])
        XCTAssertFalse(resistance.recentPrs.isEmpty)
        XCTAssertFalse(resistance.highlights.isEmpty)
        XCTAssertFalse(resistance.needsAttention.isEmpty)
        XCTAssertEqual(resistance.categoryRollups.map(\.label), ["Chest", "Back", "Shoulders", "Triceps"])
        XCTAssertEqual(resistance.categoryRollups.first?.detail, "Latest Aug 26 · 3 exercises · 7 sets · 3,890 lb · 1 improving · 1 plateauing · 1 needs data")
    }

    /// Recent PRs on the Resistance report must reuse the exact same
    /// `trainingPerformanceEvents` fixture data the exercise-detail page's
    /// Performance Records card uses — not an independently invented list.
    func testResistanceReportRecentPrsMatchThePerformanceEventsFixture() async throws {
        let report = try await api.fetchTrainingReporting(reportId: "resistance")
        let resistance = try XCTUnwrap(report?.resistance)
        XCTAssertEqual(resistance.recentPrs.count, 3)
        XCTAssertEqual(resistance.recentPrs.first?.detail, "Volume PR: 3,340 lb.")
        for pr in resistance.recentPrs {
            guard case .trainingExercise = pr.destination else {
                return XCTFail("Expected a trainingExercise destination for \(pr.label).")
            }
        }
    }

    func testHistoryReportShowsAllFixturedDaysNewestFirst() async throws {
        let report = try await api.fetchTrainingReporting(reportId: "history")
        let unwrapped = try XCTUnwrap(report)
        XCTAssertEqual(unwrapped.title, "Training History")
        let days = try XCTUnwrap(unwrapped.historyDays)
        XCTAssertEqual(days.map(\.date), ["2026-08-26", "2026-08-24", "2026-08-22"])
        let firstDaySessions = try XCTUnwrap(days.first?.sessions)
        for session in firstDaySessions {
            guard case .trainingSession = session.destination else {
                return XCTFail("Expected a trainingSession destination.")
            }
        }
    }

    // MARK: - Training Library root (completeness sweep)

    func testTrainingLibraryRootExposesAllTenAreasViaLandingFetch() async throws {
        // `TrainingLibraryRootView` fetches the same `TrainingLandingReadModel`
        // the Training landing page does — verified here at the data layer
        // rather than duplicating a second area list.
        let landing = try await api.fetchTrainingLanding()
        XCTAssertEqual(landing.trainingAreas.count, 10)
        for area in landing.trainingAreas {
            guard case .trainingExercise(let exerciseId) = area.destination else {
                return XCTFail("Expected a trainingExercise destination for \(area.label).")
            }
            XCTAssertEqual(exerciseId, area.id)
        }
    }

    // MARK: - Related Goals / Data Sources (completeness sweep — reconfirm already-correct behavior)

    func testRelatedGoalsCarryGoalDetailDestinations() async throws {
        let landing = try await api.fetchTrainingLanding()
        XCTAssertFalse(landing.relatedGoals.isEmpty)
        for goal in landing.relatedGoals {
            guard case .goalDetail(let goalId) = goal.destination else {
                return XCTFail("Expected a goalDetail destination for \(goal.title).")
            }
            XCTAssertEqual(goalId, goal.id)
        }
    }

    /// `TrainingSourceMetadataFooter`: capped to 5, purely informational —
    /// reconfirming existing accepted behavior as part of this sweep, not
    /// a new requirement.
    func testDataSourcesAreCappedAtFiveAndPurelyInformational() async throws {
        let landing = try await api.fetchTrainingLanding()
        XCTAssertLessThanOrEqual(landing.sourceEvidence.count, 5)
        XCTAssertFalse(landing.sourceEvidence.isEmpty)
    }

    // MARK: - Current Protocol (completeness sweep — reconfirm exact web fields)

    /// Verified directly against `CurrentProtocolCard`/`ProtocolRow`
    /// source: exactly these 4 dynamic rows plus the static "Future
    /// protocol settings: Coming soon" row — no more, no fewer.
    func testCurrentProtocolCarriesTheFourRealFieldsPlusTheStaticComingSoonRow() async throws {
        let landing = try await api.fetchTrainingLanding()
        let protocolSummary = landing.currentProtocol
        XCTAssertFalse(protocolSummary.sourceOfTruth.isEmpty)
        XCTAssertFalse(protocolSummary.dailyActivityTarget.isEmpty)
        XCTAssertFalse(protocolSummary.trainingObjective.isEmpty)
        XCTAssertFalse(protocolSummary.goal.isEmpty)
    }
}
