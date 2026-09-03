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
        XCTAssertEqual(landing.scope.options.map(\.id), ["build-lean-mass", "visible-abs", "all"])
        let selected = landing.scope.options.filter(\.selected)
        XCTAssertEqual(selected.map(\.id), ["build-lean-mass"])
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
}
