import XCTest
@testable import PhysiqueOS

/// Guards the Stage 1 tab set against silent information-architecture
/// drift. `AppTab` encodes a product decision — the actual live web
/// bottom navigation (`src/fixtures/bottomNavigation.js`) — not an
/// implementation detail, so an accidental reorder, rename, or removal
/// here should fail a test rather than only be caught by eyeballing the
/// simulator.
final class AppTabTests: XCTestCase {
    func testFiveTabsInEstablishedOrder() {
        XCTAssertEqual(
            AppTab.allCases.map(\.title),
            ["Home", "Goals", "Log", "Evidence", "You"]
        )
    }

    /// Log is the center tab of five — a deliberate product requirement,
    /// not incidental to whatever order the cases happen to be declared in.
    func testLogIsTheCenterTab() {
        XCTAssertEqual(AppTab.allCases.count, 5)
        XCTAssertEqual(AppTab.allCases[2], .log)
    }

    func testEveryTabHasAStableIdentityAndSystemImage() {
        for tab in AppTab.allCases {
            XCTAssertEqual(tab.id, tab.rawValue)
            XCTAssertFalse(tab.systemImageName.isEmpty)
        }
    }

    /// The prior foundation slice's Progress/Coach/Profile root tabs were a
    /// stale information architecture the web does not have — guards
    /// against that structure silently reappearing (e.g. a bad merge or a
    /// future slice reintroducing the old planning-doc set).
    func testOldRootTabStructureCannotReturnSilently() {
        let titles = Set(AppTab.allCases.map(\.title))
        XCTAssertFalse(titles.contains("Progress"))
        XCTAssertFalse(titles.contains("Coach"))
        XCTAssertFalse(titles.contains("Profile"))
        XCTAssertNil(AppTab(rawValue: "progress"))
        XCTAssertNil(AppTab(rawValue: "coach"))
        XCTAssertNil(AppTab(rawValue: "profile"))
    }

    /// The Evidence tab's underlying route/icon key is `"progress"` (its
    /// href is `/progress`, the Evidence Hub page) and You's is
    /// `"profile"` — both differ from their tab label, mirroring
    /// `bottomNavigation.js` exactly.
    func testServerRouteKeysMatchTheWebFixtureNotTheTabLabel() {
        XCTAssertEqual(AppTab.evidence.serverRouteKey, "progress")
        XCTAssertEqual(AppTab.you.serverRouteKey, "profile")
        XCTAssertEqual(AppTab.home.serverRouteKey, "home")
        XCTAssertEqual(AppTab.goals.serverRouteKey, "goals")
        XCTAssertEqual(AppTab.log.serverRouteKey, "log")
    }

    // MARK: Context-aware Log tab -> active Workout Logger

    private func draft(_ id: String, mode: TrainingLoggerMode = .live, step: TrainingLoggerStep = .workout,
                       startedMinutesAgo: Double? = 20, submission: TrainingLoggerSubmissionState? = nil,
                       now: Date) -> TrainingLoggerDraft {
        var draft = TrainingLoggerDraft.fresh(mode: mode, workoutDate: "2026-09-28",
            startedAt: startedMinutesAgo.map { ISO8601DateFormatter().string(from: now.addingTimeInterval(-$0 * 60)) })
        draft.id = id
        draft.step = step
        draft.submissionState = submission
        return draft
    }

    func testActiveLiveSessionIsTheNewestInProgressLiveWorkout() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        XCTAssertNil(TrainingLoggerDraft.activeLiveSession(in: [], now: now))
        let older = draft("older", startedMinutesAgo: 90, now: now)
        let newer = draft("newer", startedMinutesAgo: 10, now: now)
        XCTAssertEqual(TrainingLoggerDraft.activeLiveSession(in: [older, newer], now: now)?.id, "newer")
    }

    func testNoActiveSessionForPastCompletedSubmittedOrStaleDrafts() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let candidates = [
            draft("past", mode: .past, startedMinutesAgo: nil, now: now),
            draft("complete", step: .complete, now: now),
            draft("submitted", submission: .acceptedProcessing, now: now),
            draft("unknown-result", submission: .resultUnknown, now: now),
            draft("stale", startedMinutesAgo: 13 * 60, now: now),
            draft("no-start", startedMinutesAgo: nil, now: now),
        ]
        XCTAssertNil(TrainingLoggerDraft.activeLiveSession(in: candidates, now: now),
                     "Completed/abandoned/submitted sessions immediately restore normal Log behavior.")
    }

    func testOnlyExplicitlyPendingCompletionRoutesBackToWorkoutComplete() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        var legacy = draft("legacy-complete", step: .complete, now: now)
        XCTAssertNil(TrainingLoggerDraft.pendingCompletion(in: [legacy]),
                     "A historical or legacy completion is never replayed.")

        legacy.completionPresentationPending = true
        let newer = draft("newer-active", startedMinutesAgo: 5, now: now)
        XCTAssertEqual(
            TrainingLoggerDraft.pendingCompletion(in: [newer, legacy])?.id,
            "legacy-complete",
            "An unacknowledged durable completion wins over ordinary active-session routing."
        )
    }

    /// The Log tab routes into a live workout in progress first (Build 77
    /// routing), otherwise back to an unacknowledged durable completion.
    @MainActor
    func testLogTabRoutingPrefersTheLiveWorkoutThenThePendingCompletion() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        func stamp(_ minutesAgo: Double) -> String { TrainingSessionClock.string(from: now.addingTimeInterval(-minutesAgo * 60)) }
        var completion = draft("completion", step: .complete, startedMinutesAgo: 80, now: now)
        completion.completionPresentationPending = true
        completion.completionRecordedAt = stamp(30)
        let olderLive = draft("older-live", startedMinutesAgo: 60, now: now)
        let newerLive = draft("newer-live", startedMinutesAgo: 10, now: now)

        func target(_ drafts: [TrainingLoggerDraft]) -> String? {
            TrainingSessionAuthority(store: MemoryTrainingLoggerDraftStore(drafts: drafts), environment: .sandbox, now: { now })
                .logTabRoutingTarget(at: now)?.id
        }
        XCTAssertEqual(target([completion]), "completion")
        XCTAssertEqual(target([completion, olderLive]), "older-live",
                       "A resumed older workout is where the Founder lands, even after a newer completion.")
        XCTAssertEqual(target([completion, newerLive]), "newer-live",
                       "A workout started after the completion is where the Founder lands.")
        var lateRecovered = completion
        lateRecovered.completionRecordedAt = stamp(1)
        XCTAssertEqual(target([lateRecovered, newerLive]), "newer-live",
                       "A completion resolved in the background never takes over a live workout.")

        var stale = completion
        stale.completionRecordedAt = stamp(13 * 60)
        XCTAssertNil(target([stale]), "An unacknowledged presentation older than the in-progress window never routes.")
    }

    func testSaveAndLeaveEndsLogTabRoutingUntilTheWorkoutIsResumed() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        var left = draft("left", now: now)
        left.leftAt = ISO8601DateFormatter().string(from: now)
        XCTAssertNil(TrainingLoggerDraft.activeLiveSession(in: [left], now: now),
                     "After Save & Leave the Log tab never re-traps the Founder.")
        left.leftAt = nil
        XCTAssertEqual(TrainingLoggerDraft.activeLiveSession(in: [left], now: now)?.id, "left")
    }

    func testLogTabRoutesIntoTheActiveSessionOnlyWhenEnteringLogAtItsRoot() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let tabs = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/Root/RootTabView.swift"), encoding: .utf8)
        XCTAssertTrue(tabs.contains("TabView(selection: Binding(get: { selectedTab }, set: selectTab))"))
        // Only when switching INTO Log from another tab with Log at its root: no trap, no bounce.
        XCTAssertTrue(tabs.contains("guard newTab == .log, previous != .log, logPath.isEmpty,"))
        XCTAssertTrue(tabs.contains(".logTabRoutingTarget()"))
        // Pushed on top of Log (never replacing it), so Back returns to the ordinary Log page.
        XCTAssertTrue(tabs.contains("logPath.append(AppDestination.trainingLogger)"))
        let logger = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift"), encoding: .utf8)
        // Resumes the exact hinted draft once, and never rebuilds on tab revisit.
        XCTAssertTrue(logger.contains("if let draftId = environment.consumeTrainingLoggerResumeDraftId(),"))
        // The in-progress workout wins over a relaunch-recovered completion of a different workout.
        XCTAssertTrue(logger.contains("viewModel?.draft == nil || (viewModel?.draft?.step == .complete && viewModel?.draft?.id != draftId)"))
        XCTAssertTrue(logger.contains("if viewModelAuthority != environment.nativeAuthority {"))
    }
}
