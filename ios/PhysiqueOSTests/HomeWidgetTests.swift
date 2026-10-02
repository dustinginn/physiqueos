import SwiftUI
import WidgetKit
import XCTest
@testable import PhysiqueOS

final class HomeWidgetTests: XCTestCase {
    func testSnapshotRoundTripAndAuthorityAccountFences() throws {
        let url = temporaryFileURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = HomeWidgetSnapshotFileStore(fileURL: url)
        let snapshot = HomeWidgetSamples.snapshot()
        try store.write(snapshot)

        XCTAssertEqual(store.read(), snapshot)
        XCTAssertEqual(store.read(authority: "founderProduction", accountScope: "preview-account"), snapshot)
        XCTAssertNil(store.read(authority: "sandbox", accountScope: "preview-account"))
        XCTAssertNil(store.read(authority: "founderProduction", accountScope: "another-account"))
    }

    func testMalformedAndFutureSchemaFailSoft() throws {
        let url = temporaryFileURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = HomeWidgetSnapshotFileStore(fileURL: url)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("not-json".utf8).write(to: url)
        XCTAssertNil(store.read())

        let future = #"{"schemaVersion":2,"authority":"founderProduction","accountScope":"x","localDate":"2026-10-02","timeZoneIdentifier":"America/Los_Angeles","writtenAt":"2026-10-02T18:00:00Z","refreshState":"success","workout":{"state":"none"}}"#
        try Data(future.utf8).write(to: url)
        XCTAssertNil(store.read())
    }

    func testExactDayProjectionNeverFallsBackToYesterdayAndMissingIsNotZero() throws {
        let localDate = "2026-10-02"
        let yesterdayNutrition = nutritionDay(date: "2026-10-01")
        let yesterdayActivity = try activityDay(date: "2026-10-01")
        let rows = [
            LoggedTodayRow(kind: .training, summary: "Nothing logged yet", context: nil, destination: nil),
            LoggedTodayRow(kind: .weight, summary: "Nothing logged yet", context: nil, destination: .progressStream(streamId: "weight")),
        ]
        let snapshot = HomeWidgetSnapshotProjection.make(
            authority: .founderProduction,
            accountScope: "scope",
            localDate: localDate,
            timeZone: try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles")),
            logRows: rows,
            nutritionDay: yesterdayNutrition,
            activityDay: yesterdayActivity,
            activeWorkout: nil,
            now: HomeWidgetSamples.referenceDate
        )

        XCTAssertNil(snapshot.nutrition)
        XCTAssertNil(snapshot.activity)
        XCTAssertNil(snapshot.weight)
        XCTAssertEqual(snapshot.training?.isPresent, false)
    }

    func testExactTodayNutritionMacrosActivityAndWeightProjection() throws {
        let localDate = "2026-10-02"
        let rows = [
            LoggedTodayRow(
                kind: .training,
                summary: "Strength Training · 58 min, Outdoor Walk · 24 min",
                context: "Apple Health",
                destination: .trainingDay(date: localDate),
                lines: [
                    .init(id: "strength", kind: "strength", summary: "Strength Training · 58 min"),
                    .init(id: "walk", kind: "cardio", summary: "Outdoor Walk · 24 min"),
                ]
            ),
            LoggedTodayRow(kind: .weight, summary: "167.4 lb", context: nil, destination: .progressStream(streamId: "weight")),
        ]
        let snapshot = HomeWidgetSnapshotProjection.make(
            authority: .founderProduction,
            accountScope: "scope",
            localDate: localDate,
            timeZone: try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles")),
            logRows: rows,
            nutritionDay: nutritionDay(date: localDate),
            activityDay: try activityDay(date: localDate),
            activeWorkout: nil,
            now: HomeWidgetSamples.referenceDate
        )

        XCTAssertEqual(snapshot.training?.lines, ["Strength Training · 58 min", "Outdoor Walk · 24 min"])
        XCTAssertNil(snapshot.training?.context, "The widget must not surface Apple Health/source delineation")
        XCTAssertEqual(snapshot.nutrition?.calories, 2140)
        XCTAssertEqual(snapshot.nutrition?.proteinG, 176)
        XCTAssertEqual(snapshot.nutrition?.carbsG, 218)
        XCTAssertEqual(snapshot.nutrition?.fatG, 71)
        XCTAssertEqual(snapshot.activity?.activeCalories, 648)
        XCTAssertEqual(snapshot.activity?.isPartialDay, true)
        XCTAssertEqual(snapshot.weight?.displayValue, "167.4 lb")
    }

    func testFreshAgingStaleOfflineAndMidnightStates() {
        let fresh = HomeWidgetSamples.snapshot()
        XCTAssertEqual(fresh.presentationState(at: HomeWidgetSamples.referenceDate), .fresh(ageMinutes: 18))

        var aging = fresh
        aging.lastSuccessfulReadAt = HomeWidgetSnapshotClock.string(from: HomeWidgetSamples.referenceDate.addingTimeInterval(-2 * 3600))
        XCTAssertEqual(aging.presentationState(at: HomeWidgetSamples.referenceDate), .aging(ageMinutes: 120))

        let stale = HomeWidgetSamples.snapshot(stale: true)
        XCTAssertEqual(stale.presentationState(at: HomeWidgetSamples.referenceDate), .stale(ageMinutes: 300, offline: true))

        let waiting = HomeWidgetSamples.snapshot(waiting: true)
        XCTAssertEqual(waiting.presentationState(at: HomeWidgetSamples.referenceDate), .waitingForToday)
    }

    func testLocalDateClockHandlesDSTAndNamedZone() throws {
        let zone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        let beforeSpringMidnight = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-03-08T07:59:59Z"))
        let afterSpringMidnight = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-03-08T08:00:01Z"))
        XCTAssertEqual(HomeWidgetSnapshotClock.localDateKey(at: beforeSpringMidnight, timeZone: zone), "2026-03-07")
        XCTAssertEqual(HomeWidgetSnapshotClock.localDateKey(at: afterSpringMidnight, timeZone: zone), "2026-03-08")
    }

    func testTypedDeepLinksRoundTripAndRejectMalformedValues() {
        let routes: [HomeWidgetDeepLink] = [
            .summary(localDate: "2026-10-02"),
            .training(localDate: "2026-10-02"),
            .nutrition(localDate: "2026-10-02"),
            .activity(localDate: "2026-10-02"),
            .weight(localDate: "2026-10-02"),
            .refresh(authority: "founderProduction"),
            .startWorkout(authority: "founderProduction"),
            .resumeWorkout(sessionId: "session-1", authority: "founderProduction"),
        ]
        for route in routes { XCTAssertEqual(HomeWidgetDeepLink.parse(route.url), route) }
        XCTAssertNil(HomeWidgetDeepLink.parse(URL(string: "physiqueos-workout://widget?route=training&date=yesterday")!))
        XCTAssertNil(HomeWidgetDeepLink.parse(URL(string: "physiqueos-workout://widget?route=training&date=2026-02-31")!))
        XCTAssertNil(HomeWidgetDeepLink.parse(URL(string: "physiqueos-workout://widget?route=start&route=resume&authority=founderProduction")!))
        XCTAssertNil(HomeWidgetDeepLink.parse(URL(string: "physiqueos-workout://widget?route=resume&session=x")!))
        XCTAssertNil(HomeWidgetDeepLink.parse(URL(string: "https://example.com/widget?route=start")!))
    }

    func testSquareRefreshIntentRunsThroughTheAppProcessHook() async {
        let capture = HomeWidgetRefreshIntentCapture()
        HomeWidgetRefreshIntentRuntime.handler = { authority in
            await capture.record(authority)
        }
        defer { HomeWidgetRefreshIntentRuntime.handler = nil }

        XCTAssertTrue(RefreshHomeWidgetTotalsIntent.openAppWhenRun)
        await HomeWidgetRefreshIntentRuntime.request(authority: "founderProduction", waitingUpTo: 0)
        let captured = await capture.value
        XCTAssertEqual(captured, "founderProduction")
    }

    @MainActor
    func testStartDoesNotCreateSessionResumeRequiresExactActiveSessionAndSavedLeftFallsBack() throws {
        let store = MemoryTrainingLoggerDraftStore()
        let authority = TrainingSessionAuthority(
            store: store,
            environment: .founderProduction,
            now: { HomeWidgetSamples.referenceDate }
        )
        XCTAssertEqual(
            HomeWidgetNavigationResolver.resolve(
                .startWorkout(authority: "founderProduction"),
                selectedAuthority: .founderProduction,
                sessionAuthority: authority
            ),
            .startWorkout
        )
        XCTAssertTrue(authority.drafts.isEmpty, "Resolving a widget Start link must create zero sessions")
        XCTAssertEqual(
            HomeWidgetNavigationResolver.resolve(
                .refresh(authority: "founderProduction"),
                selectedAuthority: .founderProduction,
                sessionAuthority: authority
            ),
            .refreshTotals
        )
        XCTAssertTrue(authority.drafts.isEmpty, "Resolving Refresh must not create a workout session")

        let started = try XCTUnwrap(authority.startSession(
            mode: .live,
            workoutDate: "2026-10-02",
            startedAt: ISO8601DateFormatter().string(from: HomeWidgetSamples.referenceDate)
        ))
        XCTAssertEqual(
            HomeWidgetNavigationResolver.resolve(
                .resumeWorkout(sessionId: started.id, authority: "founderProduction"),
                selectedAuthority: .founderProduction,
                sessionAuthority: authority
            ),
            .resumeWorkout(sessionId: started.id)
        )
        XCTAssertEqual(
            HomeWidgetNavigationResolver.resolve(
                .resumeWorkout(sessionId: "stale", authority: "founderProduction"),
                selectedAuthority: .founderProduction,
                sessionAuthority: authority
            ),
            .startWorkout
        )
        _ = authority.saveAndLeave(sessionId: started.id, leftAt: TrainingSessionClock.string(from: HomeWidgetSamples.referenceDate))
        XCTAssertEqual(HomeWidgetSnapshotProjection.workoutProjection(authority.activeLiveSession()), .none)
    }

    @MainActor
    func testShippingViewsRenderAllRequiredStates() throws {
#if canImport(UIKit)
        let output = ProcessInfo.processInfo.environment["HOME_WIDGET_SCREENSHOT_DIR"]
            .map(URL.init(fileURLWithPath:))
            ?? URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("agent-handoffs/artifacts/home-screen-widget-v1", isDirectory: true)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        let cases: [(String, HomeWidgetSnapshot?, Bool)] = [
            ("01-full-data", HomeWidgetSamples.snapshot(), false),
            ("02-no-weight", HomeWidgetSamples.snapshot(weight: false), false),
            ("03-active-workout", HomeWidgetSamples.snapshot(activeWorkout: true), false),
            ("04-stale-offline", HomeWidgetSamples.snapshot(stale: true), false),
            ("05-waiting-for-today", HomeWidgetSamples.snapshot(waiting: true), false),
            ("06-privacy-redacted", HomeWidgetSamples.snapshot(), true),
            ("07-long-training-summary", HomeWidgetSamples.snapshot(longTraining: true), false),
        ]
        func render(
            family: WidgetFamily,
            width: CGFloat,
            height: CGFloat,
            padding: CGFloat,
            directory: URL
        ) throws {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let gallery = VStack(spacing: 0) {
                ForEach(Array(cases.enumerated()), id: \.offset) { _, item in
                    let base = HomeLoggedTodayWidgetView(
                        snapshot: item.1,
                        date: HomeWidgetSamples.referenceDate,
                        privacyRedactedForPreview: item.2,
                        familyOverrideForPreview: family
                    )
                    ZStack {
                        Color(red: 0.035, green: 0.055, blue: 0.095)
                        base.padding(padding)
                    }
                    .frame(width: width, height: height)
                    .clipShape(RoundedRectangle(cornerRadius: family == .systemSmall ? 22 : 26, style: .continuous))
                }
            }
            .environment(\.colorScheme, .dark)
            let renderer = ImageRenderer(content: gallery)
            renderer.proposedSize = ProposedViewSize(width: width, height: height * Double(cases.count))
            renderer.scale = 3
            let image = try XCTUnwrap(renderer.uiImage)
            let pixels = try XCTUnwrap(image.cgImage)
            for (index, item) in cases.enumerated() {
                let rect = CGRect(
                    x: 0,
                    y: CGFloat(index) * height * 3,
                    width: width * 3,
                    height: height * 3
                )
                let cropped = try XCTUnwrap(pixels.cropping(to: rect))
                let data = try XCTUnwrap(UIImage(cgImage: cropped, scale: 3, orientation: .up).pngData())
                XCTAssertGreaterThan(data.count, family == .systemSmall ? 8_000 : 20_000)
                try data.write(to: directory.appendingPathComponent("\(item.0).png"), options: .atomic)
            }
        }

        try render(family: .systemSmall, width: 170, height: 170, padding: 12, directory: output)
        try render(
            family: .systemLarge,
            width: 360,
            height: 376,
            padding: 16,
            directory: output.appendingPathComponent("large", isDirectory: true)
        )
#endif
    }

    private func nutritionDay(date: String) -> NutritionDayRecord {
        NutritionDayRecord(
            id: "nutrition-\(date)",
            date: date,
            value: "2140 calories",
            detail: "176g protein · 218g carbs · 71g fat",
            sourceEvidence: [],
            totals: .init(calories: 2140, proteinG: 176, carbsG: 218, fatG: 71, fiberG: nil),
            meals: []
        )
    }

    private func activityDay(date: String) throws -> ActivityDayRecord {
        let json = #"{"id":"activity-1","label":"Daily Activity","value":"648 active cal / 42 min","detail":"2450 total calories","date":"\#(date)","isToday":true,"activeCalories":648,"linkedTrainingSessionCount":0,"coverage":"partial_day","isPartialDay":true,"protocolStatus":"Activity context available."}"#
        return try JSONDecoder().decode(ActivityDayRecord.self, from: Data(json.utf8))
    }

    private func temporaryFileURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
            .appendingPathComponent(HomeWidgetSnapshotFileStore.fileName)
    }
}

private actor HomeWidgetRefreshIntentCapture {
    private(set) var value: String?
    func record(_ value: String) { self.value = value }
}
