import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Activity Evidence read-model/history/detail
/// vertical introduced in this slice. Exercises the fixture through
/// `FixtureActivityAPI` (not a bespoke decode path) so these tests cover
/// the same integration surface `ActivityHistoryView`/`ActivityDayView`
/// actually use, mirroring `TrainingReadModelTests`'s own convention.
final class ActivityReadModelTests: XCTestCase {
    private let api = FixtureActivityAPI()

    // MARK: - Fixture decoding integrity

    func testLandingDecodesWithoutError() async throws {
        let landing = try await api.fetchActivityLanding()
        XCTAssertEqual(landing.title, "Activity")
        XCTAssertEqual(landing.subtitle, "Whole-day movement, energy output, and daily activity context.")
        XCTAssertFalse(landing.activityHistory.isEmpty)
        XCTAssertFalse(landing.activityAreas.isEmpty)
        XCTAssertFalse(landing.dataSources.isEmpty)
    }

    /// `report.relatedGoals`/`report.currentActivityProtocol` are real
    /// server fields but are explicitly never rendered for
    /// `report.id === "activity"` (confirmed directly against source and
    /// its own regression test) — this guards against either silently
    /// reappearing on the read model.
    func testLandingModelHasNoRelatedGoalsOrProtocolFields() {
        let mirror = Mirror(reflecting: ActivityLandingReadModel(
            title: "", subtitle: "", tone: .success,
            scope: TrainingScopeContext(options: [], dateRangeLabel: ""),
            latestActivityDay: nil, activityAreas: [], linkedTrainingContext: [],
            activityHistory: [], dataSources: []
        ))
        let fieldNames = Set(mirror.children.compactMap(\.label))
        XCTAssertFalse(fieldNames.contains("relatedGoals"))
        XCTAssertFalse(fieldNames.contains("currentActivityProtocol"))
    }

    // MARK: - Scope default (Activity's own service defaults differently than Training's)

    /// `ACTIVITY_CONTEXT_IDS.has(context) ? context : "build-lean-mass"` —
    /// Activity's own `getActivityTimelineReport` defaults to
    /// "build-lean-mass" when no context query param is present, distinct
    /// from Training's reporting service, which defaults to "all".
    func testScopeDefaultsToBuildLeanMass() async throws {
        let landing = try await api.fetchActivityLanding()
        XCTAssertEqual(landing.scope.options.map(\.id), ["goal:\(EvidenceCanonicalGoalID.buildLeanMass)", "goal:\(EvidenceCanonicalGoalID.visibleAbs)", "all"])
        let selected = landing.scope.options.filter(\.selected)
        XCTAssertEqual(selected.map(\.id), ["goal:\(EvidenceCanonicalGoalID.buildLeanMass)"])
    }

    // MARK: - History ordering

    /// `getActivityDayRecords()` maps ascending `activityDays` then
    /// `.reverse()`s — newest first, flat, no weekly grouping.
    func testActivityHistoryIsReverseChronological() async throws {
        let landing = try await api.fetchActivityLanding()
        let dates = landing.activityHistory.map(\.date)
        XCTAssertEqual(dates, dates.sorted(by: >))
    }

    // MARK: - Latest day / history / detail identity

    func testLatestActivityDayMatchesTheFirstHistoryEntry() async throws {
        let landing = try await api.fetchActivityLanding()
        let latest = try XCTUnwrap(landing.latestActivityDay)
        let first = try XCTUnwrap(landing.activityHistory.first)
        XCTAssertEqual(latest.id, first.id)
        XCTAssertEqual(latest.date, first.date)
        XCTAssertTrue(latest.isToday)
    }

    /// `fetchActivityDay(date:)` is the same day-scoped lookup
    /// `ActivityDayView` performs — its result must be identical to the
    /// corresponding history row, not a separately-derived object.
    func testFetchActivityDayReturnsTheMatchingHistoryRecord() async throws {
        let landing = try await api.fetchActivityLanding()
        let target = try XCTUnwrap(landing.activityHistory.dropFirst().first)
        let fetched = try await api.fetchActivityDay(date: target.date)
        XCTAssertEqual(fetched, target)
    }

    func testFetchActivityDayReturnsNilForAnUnknownDate() async throws {
        let fetched = try await api.fetchActivityDay(date: "1999-01-01")
        XCTAssertNil(fetched)
    }

    // MARK: - History-to-detail routing contract

    /// Every history/preview/"Show All" row navigates via
    /// `.activityDay(date:)`, which must round-trip through the same
    /// `progress.stream` compound-streamId wire shape `.trainingDay`
    /// already established — no dedicated destination id exists for this
    /// on the server, and this native-only route must not invent one.
    func testActivityDayDestinationRoundTripsThroughTheProgressStreamWireShape() throws {
        let destination = AppDestination.activityDay(date: "2026-08-30")
        let encoded = try JSONEncoder().encode(destination)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual(json["id"] as? String, "progress.stream")
        let parameters = try XCTUnwrap(json["parameters"] as? [String: Any])
        XCTAssertEqual(parameters["streamId"] as? String, "activity/day/2026-08-30")

        let decoded = try JSONDecoder().decode(AppDestination.self, from: encoded)
        XCTAssertEqual(decoded, destination)
    }

    func testActivityStreamRowDestinationIsTheProgressStreamCatchAll() throws {
        // Mirrors `EvidenceReadModelTests.testTrainingStreamDestinationMatchesTheRouterSpecialCase`
        // for Activity: the Evidence Hub's own fixture must resolve to the
        // exact streamId `AppDestinationRouterView` special-cases.
        let url = try XCTUnwrap(Bundle.main.url(forResource: "EvidenceFixture", withExtension: "json"))
        let data = try Data(contentsOf: url)
        let hub = try JSONDecoder().decode(EvidenceHubReadModel.self, from: data)
        let activity = try XCTUnwrap(hub.streams.first { $0.id == "activity" })
        guard case .progressStream(let streamId) = activity.destination else {
            return XCTFail("Expected a progressStream destination.")
        }
        XCTAssertEqual(streamId, "activity")
    }

    // MARK: - Metric tile formatting

    func testMetricTilesFormatPresentValuesWithUnitsAndMissingValuesAsPending() {
        let day = ActivityDayRecord(
            id: "test", label: "Daily Activity", value: "", detail: "", date: "2026-08-30", isToday: false,
            activeCalories: 612, totalCalories: nil, exerciseMinutes: 48, standHours: nil,
            moveGoal: 650, exerciseGoal: nil, standGoal: nil, ringCompletion: nil,
            workoutActiveCalories: 402, nonWorkoutActiveCalories: nil,
            linkedTrainingSessionCount: 2, protocolStatus: ""
        )
        let tilesByLabel = Dictionary(uniqueKeysWithValues: day.metricTiles.map { ($0.label, $0.value) })
        XCTAssertEqual(tilesByLabel["Active Calories"], "612 cal")
        XCTAssertEqual(tilesByLabel["Total Calories"], "Pending")
        XCTAssertEqual(tilesByLabel["Exercise Minutes"], "48 min")
        XCTAssertEqual(tilesByLabel["Stand Hours"], "Pending")
        XCTAssertEqual(tilesByLabel["Workout Calories"], "402 cal")
        XCTAssertEqual(tilesByLabel["Non-Workout Calories"], "Pending")
        XCTAssertEqual(tilesByLabel["Move Goal"], "650 cal")
        XCTAssertEqual(tilesByLabel["Linked Workouts"], "2")
        // Exactly the 8 live tiles — no "Steps" tile, matching the
        // production `ActivityMetricGrid`'s real field set.
        XCTAssertEqual(day.metricTiles.count, 8)
        XCTAssertFalse(tilesByLabel.keys.contains("Steps"))
    }

    /// Regression for the live-production defect where real HealthKit-summed
    /// Activity totals (binary floating-point sums) rendered their raw
    /// `Double` description to the user, e.g. "734.6809999999961 cal" on the
    /// Activity Evidence Report. Every calorie tile must round to a whole
    /// number and never leak a fractional tail.
    func testMetricTilesRoundBinaryFloatingPointTailsToWholeCaloriesNeverLeakingRawPrecision() {
        let day = ActivityDayRecord(
            id: "test", label: "Daily Activity", value: "", detail: "", date: "2026-09-22", isToday: false,
            activeCalories: 734.6809999999961, totalCalories: 928.0000000000001, exerciseMinutes: 42, standHours: 10,
            moveGoal: 650, exerciseGoal: nil, standGoal: nil, ringCompletion: nil,
            workoutActiveCalories: 541.0000000000002, nonWorkoutActiveCalories: 193.68099999999606,
            linkedTrainingSessionCount: 1, protocolStatus: ""
        )
        let tilesByLabel = Dictionary(uniqueKeysWithValues: day.metricTiles.map { ($0.label, $0.value) })
        XCTAssertEqual(tilesByLabel["Active Calories"], "735 cal")
        XCTAssertEqual(tilesByLabel["Total Calories"], "928 cal")
        XCTAssertEqual(tilesByLabel["Workout Calories"], "541 cal")
        XCTAssertEqual(tilesByLabel["Non-Workout Calories"], "194 cal")
        for tile in day.metricTiles {
            XCTAssertFalse(tile.value.contains("."), "Tile \"\(tile.label)\" leaked a fractional value: \(tile.value)")
        }
    }

    func testConfirmedWorkoutAttributionAndEnergyAnomalyDecodeWithoutHidingTheFloor() throws {
        let json = Data(#"""
        {"id":"sep23","label":"Daily Activity","value":"300 active cal","detail":"1 workout linked","date":"2026-09-23","isToday":false,
         "activeCalories":300,"totalCalories":null,"exerciseMinutes":60,"standHours":11,
         "moveGoal":650,"exerciseGoal":null,"standGoal":null,"ringCompletion":null,
         "workoutActiveCalories":410,"nonWorkoutActiveCalories":0,"linkedTrainingSessionCount":1,
         "workoutEnergyAttribution":{"policy":"workout_energy_is_descriptive_never_additive","confirmedHealthKitWorkoutCount":1},
         "energyAnomaly":{"code":"WORKOUT_ENERGY_EXCEEDS_DAILY_ACTIVE_ENERGY","dailyActiveCalories":300,"workoutActiveCalories":410},
         "protocolStatus":"350 active calories below the recorded daily target."}
        """#.utf8)
        let day = try JSONDecoder().decode(ActivityDayRecord.self, from: json)
        XCTAssertEqual(day.workoutEnergyAttribution?.confirmedHealthKitWorkoutCount, 1)
        XCTAssertEqual(day.metricTiles.first { $0.label == "Workout Calories" }?.value, "410 cal")
        XCTAssertEqual(day.metricTiles.first { $0.label == "Non-Workout Calories" }?.value, "0 cal")
        XCTAssertEqual(
            day.energyAnomalyMessage,
            "Workout energy (410 cal) exceeds the recorded daily active total (300 cal). Non-workout calories are shown as 0."
        )
    }

    /// Sep 28: a partial Apple Health day is "so far"; its workout-over-total
    /// gap is provisional, not a data conflict. Complete days are unchanged.
    func testPartialDayIsInProgressAndItsEnergyGapIsProvisional() throws {
        func day(coverage: String?, provisional: Bool?, isPartialDay: Bool? = nil) throws -> ActivityDayRecord {
            let coverageJSON = coverage.map { "\"\($0)\"" } ?? "null"
            let partialJSON = isPartialDay.map { $0 ? "true" : "false" } ?? "null"
            let provisionalJSON = provisional.map { $0 ? "true" : "false" } ?? "null"
            let json = Data("""
            {"id":"sep28","label":"Daily Activity","value":"171 active cal / 26 min so far","detail":"3 workouts linked · 0 non-workout active cal","date":"2026-09-28","isToday":true,
             "activeCalories":171,"totalCalories":null,"exerciseMinutes":26,"standHours":2,"moveGoal":null,"exerciseGoal":null,"standGoal":null,"ringCompletion":null,
             "workoutActiveCalories":567,"nonWorkoutActiveCalories":0,"linkedTrainingSessionCount":3,"coverage":\(coverageJSON),"isPartialDay":\(partialJSON),
             "energyAnomaly":{"code":"WORKOUT_ENERGY_EXCEEDS_DAILY_ACTIVE_ENERGY","dailyActiveCalories":171,"workoutActiveCalories":567,"provisional":\(provisionalJSON)},
             "protocolStatus":"Activity context available."}
            """.utf8)
            return try JSONDecoder().decode(ActivityDayRecord.self, from: json)
        }
        let partial = try day(coverage: "partial_day", provisional: true, isPartialDay: true)
        XCTAssertTrue(partial.isInProgress)
        XCTAssertTrue(partial.energyAnomalyIsProvisional)
        XCTAssertEqual(partial.energyAnomalyMessage,
            "Apple Health is still updating today's total. Workout energy (567 cal) is above the active total so far (171 cal); non-workout calories show 0 until it catches up.")
        XCTAssertEqual(partial.metricTiles.first { $0.label == "Linked Workouts" }?.value, "3")

        let complete = try day(coverage: "complete_day", provisional: false)
        XCTAssertFalse(complete.isInProgress)
        XCTAssertFalse(complete.energyAnomalyIsProvisional)
        XCTAssertTrue(complete.energyAnomalyMessage?.hasPrefix("Workout energy (567 cal) exceeds") == true)

        // An older Server (no coverage, no provisional flag) keeps today's exact wording.
        let legacy = try day(coverage: nil, provisional: nil)
        XCTAssertFalse(legacy.isInProgress)
        XCTAssertTrue(legacy.energyAnomalyMessage?.hasPrefix("Workout energy (567 cal) exceeds") == true)
        // An unknown future coverage value decodes and is not treated as partial.
        XCTAssertFalse(try day(coverage: "some_new_value", provisional: nil).isInProgress)
        // A PAST day left partial: the Server says it is not in progress, so no
        // "still updating" and the ordinary anomaly wording.
        let pastPartial = try day(coverage: "partial_day", provisional: false, isPartialDay: false)
        XCTAssertFalse(pastPartial.isInProgress)
        XCTAssertFalse(pastPartial.energyAnomalyIsProvisional)
    }

    // MARK: - Server-owned intelligence remains presentation data, never recomputed

    /// `protocolStatus` must decode as an opaque, already-formatted server
    /// string — this test guards against `ActivityDayRecord` ever growing
    /// a raw target/threshold field that a Native screen could use to
    /// regenerate this sentence locally instead of trusting the server's
    /// own copy.
    func testProtocolStatusDecodesVerbatimAndNoRawTargetFieldExists() throws {
        let json = Data(#"""
        {"id":"d","label":"Daily Activity","value":"v","detail":"d","date":"2026-08-30","isToday":false,
         "activeCalories":600,"totalCalories":null,"exerciseMinutes":null,"standHours":null,
         "moveGoal":650,"exerciseGoal":null,"standGoal":null,"ringCompletion":null,
         "workoutActiveCalories":null,"nonWorkoutActiveCalories":null,"linkedTrainingSessionCount":0,
         "protocolStatus":"50 active calories below the recorded daily target."}
        """#.utf8)
        let record = try JSONDecoder().decode(ActivityDayRecord.self, from: json)
        XCTAssertEqual(record.protocolStatus, "50 active calories below the recorded daily target.")

        let mirror = Mirror(reflecting: record)
        let fieldNames = Set(mirror.children.compactMap(\.label))
        XCTAssertFalse(fieldNames.contains("dailyTarget"))
        XCTAssertFalse(fieldNames.contains("target"))
        XCTAssertFalse(fieldNames.contains("threshold"))
    }

    // MARK: - Date-only semantics: never shift across device time zones

    /// Activity days are calendar dates, not instants. Both date utilities
    /// this vertical reuses (`TrainingDateFormatting.short`,
    /// `TrainingDayView.formatCompactDate`) must resolve identically
    /// regardless of the device's time zone — proven here across Pacific
    /// (the Founder's own zone) and a UTC+14 zone (the largest possible
    /// offset from UTC in either direction), not merely asserted in
    /// whatever zone the test happens to run in.
    func testDateOnlyFormattingIsUnaffectedByDeviceTimeZone() {
        let originalTimeZone = NSTimeZone.default
        defer { NSTimeZone.default = originalTimeZone }

        NSTimeZone.default = TimeZone(identifier: "America/Los_Angeles")!
        let pacificShort = TrainingDateFormatting.short("2026-08-30")
        let pacificCompact = TrainingDayView.formatCompactDate("2026-08-30")

        NSTimeZone.default = TimeZone(identifier: "Pacific/Kiritimati")!
        let farEastShort = TrainingDateFormatting.short("2026-08-30")
        let farEastCompact = TrainingDayView.formatCompactDate("2026-08-30")

        XCTAssertEqual(pacificShort, "Aug 30")
        XCTAssertEqual(pacificShort, farEastShort)
        XCTAssertEqual(pacificCompact, "Aug 30, 2026")
        XCTAssertEqual(pacificCompact, farEastCompact)
    }

    // MARK: - Empty state

    /// Mirrors `ActivityEvidenceContextService.test.js`'s own "keeps every
    /// time-dependent surface empty in an empty scope" case: an empty
    /// landing must decode and expose `nil`/`[]`, not synthesize
    /// placeholder content.
    func testEmptyLandingDecodesToNilAndEmptyCollectionsNotSyntheticContent() throws {
        let json = Data(#"""
        {"title":"Activity","subtitle":"Whole-day movement, energy output, and daily activity context.",
         "tone":"effort","scope":{"options":[],"dateRangeLabel":""},
         "latestActivityDay":null,"activityAreas":[],"linkedTrainingContext":[],
         "activityHistory":[],"dataSources":[]}
        """#.utf8)
        let landing = try JSONDecoder().decode(ActivityLandingReadModel.self, from: json)
        XCTAssertNil(landing.latestActivityDay)
        XCTAssertTrue(landing.activityHistory.isEmpty)
        XCTAssertTrue(landing.activityAreas.isEmpty)
        XCTAssertTrue(landing.linkedTrainingContext.isEmpty)
    }

    // MARK: - Shared chronology adoption

    /// Activity's scope selector had the identical "inert pills" gap
    /// Training's did (same shared `TrainingScopeSelectorView`/
    /// `TrainingScopeContext` type) — this is the minimal adoption noted in
    /// the final report, not a redesign of Activity's already-accepted
    /// presentation.
    func testScopeSelectionActuallyNarrowsActivityHistoryNowInsteadOfBeingInert() async throws {
        let all = try await api.fetchActivityLanding(scope: .all)
        let buildLeanMass = try await api.fetchActivityLanding(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))
        let visibleAbs = try await api.fetchActivityLanding(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        XCTAssertEqual(all.activityHistory.count, 7)
        // Build Lean Mass excludes the one Visible-Abs-era day (2026-06-05);
        // Visible Abs is the complementary single day — proves both
        // directions of the filter genuinely narrow, not just relabel the
        // same dataset.
        XCTAssertEqual(buildLeanMass.activityHistory.count, 6)
        XCTAssertEqual(visibleAbs.activityHistory.count, 1)
        XCTAssertEqual(visibleAbs.activityHistory.first?.date, "2026-06-05")
    }

    /// `phase-establish-maintenance` (2026-07-19...2026-08-15) vs
    /// `phase-lean-mass-build` (2026-08-16...) — the fixture now carries
    /// real days in both Build Lean Mass phases, so this proves the
    /// contextual Phase pill genuinely filters, not just Goal-level scope.
    func testPhaseScopeNarrowsActivityHistoryToOnePhase() async throws {
        let phase1 = try await api.fetchActivityLanding(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-establish-maintenance"))
        let phase2 = try await api.fetchActivityLanding(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-lean-mass-build"))
        XCTAssertEqual(phase1.activityHistory.map(\.date).sorted(), ["2026-07-25", "2026-08-05"])
        XCTAssertEqual(phase2.activityHistory.count, 4)
        XCTAssertTrue(phase2.activityHistory.allSatisfy { $0.date >= "2026-08-16" })
    }

    /// Verified directly against source (`ProgressReportingService
    /// .getActivityReport`/`buildActivityReport`): `latestActivityDay` is
    /// re-derived from the scoped `activityDays` array, not held fixed
    /// while only `activityHistory` narrows. Selecting Visible Abs must
    /// surface *that* era's latest day, not the global-latest Phase 2 day.
    func testLatestActivityDayIsReDerivedFromTheScopedHistoryNotHeldFixed() async throws {
        let all = try await api.fetchActivityLanding(scope: .all)
        let visibleAbs = try await api.fetchActivityLanding(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        let phase1 = try await api.fetchActivityLanding(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-establish-maintenance"))

        XCTAssertEqual(all.latestActivityDay?.date, "2026-08-30")
        XCTAssertEqual(visibleAbs.latestActivityDay?.date, "2026-06-05")
        XCTAssertEqual(phase1.latestActivityDay?.date, "2026-08-05")
    }

    func testEveryActivityHistoryRowCarriesGoalPhaseAttribution() async throws {
        let landing = try await api.fetchActivityLanding(scope: .all)
        XCTAssertTrue(landing.activityHistory.allSatisfy { $0.attributedScope != nil })
    }

    /// No historical Activity record may be attributed to the Phase that
    /// happens to be active *today* just because "today" is Phase 2 — each
    /// day's chip must reflect the Phase that owned its own date.
    func testHistoricalActivityDaysAreAttributedToThePhaseActiveOnTheirOwnDateNotToday() async throws {
        let landing = try await api.fetchActivityLanding(scope: .all)
        XCTAssertEqual(landing.activityHistory.first { $0.date == "2026-06-05" }?.attributedScope?.goalId, EvidenceCanonicalGoalID.visibleAbs)
        XCTAssertEqual(landing.activityHistory.first { $0.date == "2026-07-25" }?.attributedScope?.phaseName, "Establish Maintenance")
        XCTAssertEqual(landing.activityHistory.first { $0.date == "2026-08-05" }?.attributedScope?.phaseName, "Establish Maintenance")
        XCTAssertEqual(landing.activityHistory.first { $0.date == "2026-08-30" }?.attributedScope?.phaseName, "Lean Mass Build")
    }

    // MARK: - Batch 3 lower-page completeness and state behavior

    /// Every lower Activity section the redesigned page renders has real
    /// canonical content in the shipping fixture: areas, linked training,
    /// and more than the 3-row preview of history (so Show All exists).
    func testLandingCarriesEveryLowerPageSectionTheRedesignRenders() async throws {
        let landing = try await api.fetchActivityLanding(scope: .all)
        XCTAssertNotNil(landing.latestActivityDay)
        XCTAssertFalse(landing.activityAreas.isEmpty)
        XCTAssertFalse(landing.linkedTrainingContext.isEmpty)
        XCTAssertGreaterThan(landing.activityHistory.count, ActivityHistoryView.historyPreviewLimit)
    }

    @MainActor
    func testActivityViewModelsStartLoadingAndReportFailureOrEmptyHonestly() async {
        let root = ActivityHistoryViewModel(api: FailingActivityAPI())
        XCTAssertEqual(root.state, .loading)
        await root.load()
        XCTAssertEqual(root.state, .failed("Activity could not be loaded."))

        let failedDay = ActivityDayViewModel(api: FailingActivityAPI(), date: "2026-08-30")
        await failedDay.load()
        XCTAssertEqual(failedDay.state, .failed("This activity day could not be loaded."))

        let emptyDay = ActivityDayViewModel(api: api, date: "1999-01-01")
        await emptyDay.load()
        XCTAssertEqual(emptyDay.state, .loaded(nil))
    }
}

private struct FailingActivityAPI: ActivityAPI {
    struct Failure: Error {}
    func fetchActivityLanding(scope: EvidenceScopeSelection) async throws -> ActivityLandingReadModel { throw Failure() }
    func fetchActivityDay(date: String) async throws -> ActivityDayRecord? { throw Failure() }
}
