import SwiftUI
import WidgetKit
import XCTest
@testable import PhysiqueOS

final class HomeWidgetTests: XCTestCase {
    func testRefreshKeepsCompactGlyphInsideMinimumAccessibleTarget() {
        XCTAssertEqual(HomeWidgetInteractionMetrics.refreshHitTarget, 44)
        XCTAssertLessThan(HomeWidgetInteractionMetrics.smallRefreshGlyphFrame, HomeWidgetInteractionMetrics.refreshHitTarget)
        XCTAssertLessThan(HomeWidgetInteractionMetrics.largeRefreshGlyphFrame, HomeWidgetInteractionMetrics.refreshHitTarget)
    }

    func testRefreshKeepsTheTealActionAccentWhileStartLoggerUsesTheWorkoutAmber() {
        for colorScheme in [ColorScheme.dark, .light] {
            let palette = HomeWidgetPalette(colorScheme: colorScheme)
            XCTAssertEqual(palette.refreshAccent, palette.actionAccent)
            XCTAssertEqual(Self.hex(palette.refreshAccent), colorScheme == .dark ? 0x20BDB2 : 0x0B817F, "refresh/status stay teal")
            XCTAssertNotEqual(Self.hex(palette.refreshAccent), Self.hex(palette.workoutAction))
        }
    }

    /// Option B (Founder 2026-10-08): the Start Logger fill is the iPhone
    /// Finish Workout amber shared with the Watch and Live Activity.
    func testStartLoggerIsTheSharedWorkoutAmberWithContrastSafeInk() {
        let dark = HomeWidgetPalette(colorScheme: .dark)
        let light = HomeWidgetPalette(colorScheme: .light)
        XCTAssertEqual(Self.hex(dark.workoutAction), WorkoutActivityPrimaryAction.darkHex)
        XCTAssertEqual(Self.hex(light.workoutAction), WorkoutActivityPrimaryAction.mineralLightHex)
        XCTAssertEqual(Self.hex(dark.onWorkoutAction), WorkoutActivityPrimaryAction.foregroundHex)
        XCTAssertEqual(Self.hex(light.onWorkoutAction), WorkoutActivityPrimaryAction.foregroundHex)
        XCTAssertEqual(WorkoutActivityPrimaryAction.darkHex, 0xEFB84F)
        XCTAssertEqual(WorkoutActivityPrimaryAction.mineralLightHex, 0xC88228)
        for palette in [dark, light] {
            XCTAssertGreaterThanOrEqual(Self.contrast(palette.workoutAction, palette.onWorkoutAction), 4.5)
        }
    }

    func testSquareRefreshTargetStaysAccessibleWithoutConsumingHeaderHeight() {
        XCTAssertEqual(
            HomeWidgetInteractionMetrics.smallRefreshGlyphFrame + 2 * HomeWidgetInteractionMetrics.smallRefreshInset,
            HomeWidgetInteractionMetrics.refreshHitTarget
        )
    }

    /// Every square state fits the 170 pt systemSmall content area (16 pt
    /// WidgetKit margins) in both appearances, with and without weight.
    @MainActor
    func testOptionBSquareFitsTheSystemSmallContentAreaInEveryState() {
#if canImport(UIKit)
        var large = HomeWidgetSamples.snapshot()
        large.nutrition = .init(calories: 9_999.4, proteinG: 388, carbsG: 512, fatG: 199)
        large.activity = .init(activeCalories: 2_345, isPartialDay: false)
        var missing = HomeWidgetSamples.snapshot()
        missing.nutrition = nil
        missing.activity = nil
        let states: [(String, HomeWidgetSnapshot?)] = [
            ("full", HomeWidgetSamples.snapshot()),
            ("no weight", HomeWidgetSamples.snapshot(weight: false)),
            ("active workout", HomeWidgetSamples.snapshot(activeWorkout: true)),
            ("stale", HomeWidgetSamples.snapshot(stale: true)),
            ("waiting", HomeWidgetSamples.snapshot(waiting: true)),
            ("largest values", large),
            ("not logged", missing),
            ("no snapshot", nil),
        ]
        for scheme in [ColorScheme.dark, .light] {
            for (name, snapshot) in states {
                let host = UIHostingController(rootView: HomeLoggedTodayWidgetView(
                    snapshot: snapshot, date: HomeWidgetSamples.referenceDate, familyOverrideForPreview: .systemSmall
                ).environment(\.colorScheme, scheme))
                let size = host.sizeThatFits(in: CGSize(width: 138, height: CGFloat.greatestFiniteMagnitude))
                XCTAssertLessThanOrEqual(size.height, 138, "\(name) \(scheme) overflows the square")
            }
        }
#endif
    }

    private static func components(_ color: Color) -> (Double, Double, Double) {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return (Double(red), Double(green), Double(blue))
    }

    private static func hex(_ color: Color) -> UInt32 {
        let (red, green, blue) = components(color)
        return UInt32((red * 255).rounded()) << 16 | UInt32((green * 255).rounded()) << 8 | UInt32((blue * 255).rounded())
    }

    private static func contrast(_ lhs: Color, _ rhs: Color) -> Double {
        func luminance(_ color: Color) -> Double {
            let (red, green, blue) = components(color)
            let linear = [red, green, blue].map { $0 <= 0.03928 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }
            return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
        }
        let (a, b) = (luminance(lhs), luminance(rhs))
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

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
        // A stale Resume link or a stale snapshot's Start never leads to a
        // second workout while one is live: the live session is reopened.
        XCTAssertEqual(
            HomeWidgetNavigationResolver.resolve(
                .resumeWorkout(sessionId: "stale", authority: "founderProduction"),
                selectedAuthority: .founderProduction,
                sessionAuthority: authority
            ),
            .resumeWorkout(sessionId: started.id)
        )
        XCTAssertEqual(
            HomeWidgetNavigationResolver.resolve(
                .startWorkout(authority: "founderProduction"),
                selectedAuthority: .founderProduction,
                sessionAuthority: authority
            ),
            .resumeWorkout(sessionId: started.id)
        )
        XCTAssertEqual(authority.drafts.count, 1, "Resolving links never creates a session")
        _ = authority.saveAndLeave(sessionId: started.id, leftAt: TrainingSessionClock.string(from: HomeWidgetSamples.referenceDate))
        XCTAssertEqual(HomeWidgetSnapshotProjection.workoutProjection(authority.activeLiveSession()), .none)
        // Saved-and-left is never silently resumed.
        XCTAssertEqual(
            HomeWidgetNavigationResolver.resolve(
                .resumeWorkout(sessionId: started.id, authority: "founderProduction"),
                selectedAuthority: .founderProduction,
                sessionAuthority: authority
            ),
            .startWorkout
        )
    }

    // MARK: Build 80 display formatting (display only; canonical precision kept)

    func testWholeNumberRoundsToNearestNeverTruncates() {
        let us = Locale(identifier: "en_US")
        XCTAssertEqual(HomeWidgetValueFormatter.wholeNumber(182.0, locale: us), "182")
        XCTAssertEqual(HomeWidgetValueFormatter.wholeNumber(182.1, locale: us), "182")
        XCTAssertEqual(HomeWidgetValueFormatter.wholeNumber(182.49, locale: us), "182")
        XCTAssertEqual(HomeWidgetValueFormatter.wholeNumber(182.5, locale: us), "183")
        XCTAssertEqual(HomeWidgetValueFormatter.wholeNumber(182.9, locale: us), "183")
        XCTAssertEqual(HomeWidgetValueFormatter.wholeNumber(0.5, locale: us), "1")
        XCTAssertEqual(HomeWidgetValueFormatter.wholeNumber(999.5, locale: us), "1,000")
    }

    func testFounderPhysicalExampleFormatsAsRequested() {
        let us = Locale(identifier: "en_US")
        XCTAssertEqual(HomeWidgetValueFormatter.calories(2_463.3, locale: us), "2,463")
        XCTAssertEqual(HomeWidgetValueFormatter.grams(182.2, locale: us), "182")
        XCTAssertEqual(HomeWidgetValueFormatter.grams(166.7, locale: us), "167")
        XCTAssertEqual(HomeWidgetValueFormatter.grams(110.1, locale: us), "110")
        XCTAssertEqual(HomeWidgetValueFormatter.activeCalories(890.1, locale: us), "890")
        XCTAssertEqual(HomeWidgetValueFormatter.weight(.init(displayValue: "176.1 lb")), "176.1 lb")
    }

    func testThousandsGroupingIsLocaleAware() {
        XCTAssertEqual(HomeWidgetValueFormatter.calories(12_345.6, locale: Locale(identifier: "en_US")), "12,346")
        XCTAssertEqual(HomeWidgetValueFormatter.activeCalories(1_000, locale: Locale(identifier: "en_US")), "1,000")
        XCTAssertEqual(HomeWidgetValueFormatter.calories(2_463.3, locale: Locale(identifier: "de_DE")), "2.463")
    }

    func testZeroMissingAndNonFiniteValues() {
        let us = Locale(identifier: "en_US")
        XCTAssertEqual(HomeWidgetValueFormatter.calories(0, locale: us), "0", "A canonical zero is shown as zero")
        XCTAssertEqual(HomeWidgetValueFormatter.grams(0.4, locale: us), "0")
        XCTAssertEqual(HomeWidgetValueFormatter.grams(-0.4, locale: us), "0", "Never a signed zero")
        XCTAssertEqual(HomeWidgetValueFormatter.calories(nil, locale: us), "—", "Missing never becomes 0")
        XCTAssertEqual(HomeWidgetValueFormatter.activeCalories(.nan, locale: us), "—")
        XCTAssertNil(HomeWidgetValueFormatter.weight(nil))
    }

    func testWeightDisplayKeepsItsOneDecimalString() {
        for value in ["176.1 lb", "176.0 lb", "79.9 kg"] {
            XCTAssertEqual(HomeWidgetValueFormatter.weight(.init(displayValue: value)), value)
        }
    }

    func testSnapshotKeepsCanonicalPrecisionAndFormattingIsDisplayOnly() throws {
        let snapshot = HomeWidgetSamples.snapshot()
        XCTAssertEqual(snapshot.nutrition?.calories, 2_463.3)
        XCTAssertEqual(snapshot.nutrition?.proteinG, 182.2)
        XCTAssertEqual(snapshot.activity?.activeCalories, 890.1)
        let url = temporaryFileURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = HomeWidgetSnapshotFileStore(fileURL: url)
        try store.write(snapshot)
        XCTAssertEqual(store.read()?.nutrition?.carbsG, 166.7, "The shared file stores full precision")
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("PhysiqueOSShared/HomeLoggedTodayWidgetView.swift"),
            encoding: .utf8
        )
        // Every family/state renders numbers through the one formatter.
        XCTAssertFalse(source.contains("String(format:"), "No ad-hoc numeric formatting in the widget view")
        XCTAssertFalse(source.contains(".displayValue ??"), "Weight renders through the formatter")
    }

    // MARK: Build 79 integration review fixes

    func testSessionEndingErrorsAreClassifiedForSnapshotRetirement() {
        XCTAssertTrue(HomeWidgetSnapshotCoordinator.endsSession(ProductionNativeError.notPaired))
        XCTAssertTrue(HomeWidgetSnapshotCoordinator.endsSession(ProductionNativeError.reconnectRequired))
        // A non-terminal 401 leaves the credential in place; only the real
        // boundary (which also reaches the observer) ends the widget session.
        XCTAssertFalse(HomeWidgetSnapshotCoordinator.endsSession(ProductionNativeError.unauthenticated(nil)))
        XCTAssertTrue(HomeWidgetSnapshotCoordinator.endsSession(FounderServerError.notPaired))
        XCTAssertTrue(HomeWidgetSnapshotCoordinator.endsSession(FounderServerError.deviceOrSessionRevoked))
        XCTAssertFalse(HomeWidgetSnapshotCoordinator.endsSession(ProductionNativeError.networkFailure))
        XCTAssertFalse(HomeWidgetSnapshotCoordinator.endsSession(ProductionNativeError.temporaryServer(nil)))
        XCTAssertFalse(HomeWidgetSnapshotCoordinator.endsSession(FounderServerError.networkFailure))
    }

    @MainActor
    func testSessionBoundaryClearsTheSharedSnapshotAndRotatesTheAccountScope() async throws {
        let harness = try CoordinatorHarness(authority: .sandbox)
        defer { harness.tearDown() }
        await harness.coordinator.refreshCanonicalSnapshot()
        let scope = harness.scopes.scope(for: .sandbox)
        XCTAssertNotNil(harness.store.read(authority: "sandbox", accountScope: scope), "Sandbox refresh writes a snapshot")

        harness.coordinator.endSession(for: .sandbox)
        XCTAssertNil(harness.store.read(), "A session boundary removes the shared file")
        XCTAssertNotEqual(harness.scopes.scope(for: .sandbox), scope, "A new session never reads the old scope back")
    }

    @MainActor
    func testARefreshInFlightAcrossASessionBoundaryNeverWritesTheOldSessionBack() async throws {
        let harness = try CoordinatorHarness(authority: .sandbox)
        defer { harness.tearDown() }
        let refresh = Task { await harness.coordinator.refreshCanonicalSnapshot() }
        // The boundary lands while the refresh awaits its reads.
        await Task.yield()
        harness.coordinator.endSession(for: .sandbox)
        await refresh.value
        XCTAssertNil(harness.store.read(), "An old-session refresh must not repopulate the cleared file")

        await harness.coordinator.refreshCanonicalSnapshot()
        XCTAssertNotNil(
            harness.store.read(authority: "sandbox", accountScope: harness.scopes.scope(for: .sandbox)),
            "The next session's refresh writes under the new scope"
        )
    }

    @MainActor
    func testSessionBoundaryForTheOtherAuthorityLeavesTheVisibleSnapshot() async throws {
        let harness = try CoordinatorHarness(authority: .sandbox)
        defer { harness.tearDown() }
        await harness.coordinator.refreshCanonicalSnapshot()
        harness.coordinator.endSession(for: .founderProduction)
        XCTAssertNotNil(harness.store.read(authority: "sandbox", accountScope: harness.scopes.scope(for: .sandbox)))
    }

    @MainActor
    func testLockedProductionLaunchLeavesTheSnapshotUntouchedInsteadOfMarkingItOffline() async throws {
        let harness = try CoordinatorHarness(authority: .founderProduction, protectedDataAvailable: false)
        defer { harness.tearDown() }
        let scope = harness.scopes.scope(for: .founderProduction)
        var snapshot = HomeWidgetSamples.snapshot()
        snapshot.accountScope = scope
        try harness.store.write(snapshot)

        await harness.coordinator.refreshCanonicalSnapshot()
        XCTAssertEqual(harness.store.read(), snapshot, "No read, no offline downgrade while protected data is unavailable")
        XCTAssertEqual(harness.reloads, 0)
    }

    @MainActor
    func testUnchangedWorkoutProjectionDoesNotRewriteOrReload() async throws {
        let harness = try CoordinatorHarness(authority: .sandbox)
        defer { harness.tearDown() }
        await harness.coordinator.refreshCanonicalSnapshot()
        let written = harness.store.read()
        let reloads = harness.reloads
        harness.coordinator.refreshWorkoutProjection()
        harness.coordinator.refreshWorkoutProjection()
        XCTAssertEqual(harness.reloads, reloads, "A set edit that leaves the projection unchanged must not reload timelines")
        XCTAssertEqual(harness.store.read(), written)
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
            directory: URL,
            scheme: ColorScheme = .dark
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
                        HomeWidgetPalette(colorScheme: scheme).background
                        base.padding(padding)
                    }
                    .frame(width: width, height: height)
                    .clipShape(RoundedRectangle(cornerRadius: family == .systemSmall ? 22 : 26, style: .continuous))
                }
            }
            .environment(\.colorScheme, scheme)
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

        try render(family: .systemSmall, width: 170, height: 170, padding: 16, directory: output)
        try render(
            family: .systemSmall,
            width: 170,
            height: 170,
            padding: 16,
            directory: output.appendingPathComponent("mineral-light", isDirectory: true),
            scheme: .light
        )
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

    @MainActor
    private final class CoordinatorHarness {
        let defaults: UserDefaults
        let suite: String
        let store: HomeWidgetSnapshotFileStore
        let scopes: HomeWidgetAccountScopeStore
        let coordinator: HomeWidgetSnapshotCoordinator
        let environment: AppEnvironment
        private let directory: URL
        private(set) var reloads = 0

        init(authority: NativeAPIEnvironment, protectedDataAvailable: Bool = true) throws {
            suite = "HomeWidgetTests.coordinator.\(UUID().uuidString)"
            defaults = UserDefaults(suiteName: suite)!
            directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            store = HomeWidgetSnapshotFileStore(fileURL: directory.appendingPathComponent(HomeWidgetSnapshotFileStore.fileName))
            scopes = HomeWidgetAccountScopeStore(defaults: defaults)
            environment = AppEnvironment(
                nativeAuthority: authority,
                authoritySelectionStore: UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority"),
                trainingLoggerDraftStore: MemoryTrainingLoggerDraftStore(),
                founderProductionTrainingLoggerDraftStore: MemoryTrainingLoggerDraftStore()
            )
            var reloadCount: () -> Void = {}
            coordinator = HomeWidgetSnapshotCoordinator(
                environment: environment,
                store: store,
                accountScopes: scopes,
                reload: { reloadCount() },
                isProtectedDataAvailable: { protectedDataAvailable }
            )
            reloadCount = { [unowned self] in self.reloads += 1 }
        }

        func tearDown() {
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
        }
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

/// Acceptance renders of the shipping square against the Founder-approved
/// Option B design renders (branch claude/build93-widget-design-options-20261008),
/// on the same fixture: Founder-reported 1,139 cal / 649 active cal / 12m,
/// illustrative macros. Opt-in (`WIDGET_ACCEPTANCE_DIR`).
final class HomeWidgetOptionBAcceptanceRenderTests: XCTestCase {
    @MainActor
    func testRenderShippingSquareOnTheApprovedDesignFixture() throws {
#if canImport(UIKit)
        guard let directory = ProcessInfo.processInfo.environment["WIDGET_ACCEPTANCE_DIR"].map(URL.init(fileURLWithPath:)) else {
            throw XCTSkip("Acceptance renders are produced on request (WIDGET_ACCEPTANCE_DIR).")
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for scheme in [ColorScheme.dark, .light] {
            for weight in [false, true] {
                var snapshot = HomeWidgetSamples.snapshot(weight: weight)
                snapshot.lastSuccessfulReadAt = HomeWidgetSnapshotClock.string(from: HomeWidgetSamples.referenceDate.addingTimeInterval(-12 * 60))
                snapshot.nutrition = .init(calories: 1_139, proteinG: 96, carbsG: 104, fatG: 38)
                snapshot.activity = .init(activeCalories: 649, isPartialDay: true)
                let tile = ZStack {
                    HomeWidgetPalette(colorScheme: scheme).background
                    HomeLoggedTodayWidgetView(snapshot: snapshot, date: HomeWidgetSamples.referenceDate, familyOverrideForPreview: .systemSmall)
                        .padding(16)
                }
                .frame(width: 170, height: 170)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .environment(\.colorScheme, scheme)
                let renderer = ImageRenderer(content: tile)
                renderer.proposedSize = ProposedViewSize(width: 170, height: 170)
                renderer.scale = 3
                let data = try XCTUnwrap(renderer.uiImage?.pngData())
                let name = "shipping-option-b\(weight ? "-with-weight" : "")-\(scheme == .dark ? "dark" : "mineral-light").png"
                try data.write(to: directory.appendingPathComponent(name), options: .atomic)
            }
        }
#endif
    }
}
