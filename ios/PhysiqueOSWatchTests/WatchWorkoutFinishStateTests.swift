import XCTest
import SwiftUI
import HealthKit
@testable import PhysiqueOSWatch

/// Build 83 Watch finish state machine, HealthKit save/discard resolution,
/// Done, rest termination, Daily Totals rules and layout.
final class WatchWorkoutFinishStateTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    private func fixture(_ name: String) throws -> WatchWorkoutProjection {
        try XCTUnwrap(WatchWorkoutPreviewFixtures.make(name)?.projection)
    }

    @MainActor
    private func makeStore(_ suite: String) -> (WatchWorkoutStore, UserDefaults) {
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let now = now
        // A fake Health workout: these tests never touch HealthKit.
        return (WatchWorkoutStore(session: nil, defaults: defaults, now: { now }, health: FakeWatchHealth(startDate: now)), defaults)
    }

    // MARK: Finish confirmation (today's exact sequence)

    @MainActor
    func testPassiveAlwaysOnReachabilityDoesNotPresentFalseOffline() throws {
        let (store, _) = makeStore("reachability.passive")
        store.apply(try fixture("normal"))
        XCTAssertEqual(store.connectionState, .passive)
        XCTAssertFalse(store.shouldShowAuthorityWarning(at: now))

        store.setDisplayActive(false)
        XCTAssertFalse(
            store.shouldShowAuthorityWarning(at: now.addingTimeInterval(10 * 60)),
            "A dimmed Always-On display is not evidence that phone authority was lost."
        )
    }

    @MainActor
    func testStalePassiveAuthorityWarnsOnlyWhenTheDisplayIsActive() throws {
        let (store, _) = makeStore("reachability.stale")
        store.apply(try fixture("normal"))
        let stale = now.addingTimeInterval(WatchWorkoutStore.authoritativeProjectionStaleAfter + 1)
        store.setDisplayActive(false)
        XCTAssertFalse(store.shouldShowAuthorityWarning(at: stale))
        store.setDisplayActive(true)
        XCTAssertTrue(store.shouldShowAuthorityWarning(at: stale))
    }

    @MainActor
    func testCachedProjectionDoesNotMasqueradeAsFreshPhoneContact() throws {
        let (store, _) = makeStore("reachability.cached")
        store.apply(try fixture("normal"), recordsAuthoritativeContact: false)
        XCTAssertEqual(store.connectionState, .passive)
        XCTAssertTrue(store.shouldShowAuthorityWarning(at: now))
        store.setDisplayActive(false)
        XCTAssertFalse(store.shouldShowAuthorityWarning(at: now.addingTimeInterval(60 * 60)))
    }

    @MainActor
    func testFreshTerminalContextIsPassiveRatherThanFalseOffline() throws {
        let (store, _) = makeStore("reachability.terminal")
        store.apply(.terminal(sessionId: "current", revision: 1, phase: .unavailable))
        XCTAssertEqual(store.connectionState, .passive)
        XCTAssertFalse(store.shouldShowAuthorityWarning(at: now))

        store.apply(.terminal(sessionId: "cancelled", revision: 2, phase: .cancelled))
        XCTAssertEqual(
            store.connectionState, .passive,
            "A fresh cancelled projection must not manufacture OFFLINE by issuing an unreachable refresh."
        )
        XCTAssertFalse(store.shouldShowAuthorityWarning(at: now))
    }

    @MainActor
    func testExplicitAuthorityRetryFailsClosedWhenInteractiveLaneIsUnavailable() throws {
        let (store, _) = makeStore("reachability.retry")
        store.apply(try fixture("normal"))
        store.retryAuthorityConnection()
        XCTAssertEqual(store.connectionState, .phoneUnavailable)
        XCTAssertFalse(store.isMutationPending)
    }

    @MainActor
    func testUnavailableCommandFailsClosedAndReconnectSucceeds() throws {
        let (store, _) = makeStore("reachability.command")
        store.apply(try fixture("normal"))
        store.completeSet()
        XCTAssertEqual(store.connectionState, .phoneUnavailable)
        XCTAssertFalse(store.isMutationPending, "No unreachable structured mutation may be queued as if it was delivered.")
        XCTAssertTrue(store.shouldShowAuthorityWarning(at: now))

        var delivered: WatchWorkoutCommand?
        store.commandSinkForTesting = { delivered = $0 }
        store.completeSet()
        XCTAssertEqual(store.connectionState, .reachable)
        XCTAssertNotNil(delivered)
        XCTAssertTrue(store.isMutationPending)
        XCTAssertFalse(store.shouldShowAuthorityWarning(at: now))
    }

    @MainActor
    func testRetryPendingResendsTheExactMutationInsteadOfStartingARefresh() throws {
        let (store, _) = makeStore("reachability.retry-pending")
        store.apply(try fixture("normal"))
        var delivered: [WatchWorkoutCommand] = []
        store.commandSinkForTesting = { delivered.append($0) }
        store.completeSet()
        store.retryPending()

        XCTAssertEqual(delivered.count, 2)
        XCTAssertEqual(delivered[0].kind, .completeSet)
        XCTAssertEqual(delivered[1].commandId, delivered[0].commandId)
        XCTAssertEqual(delivered[1].mutationId, delivered[0].mutationId)
    }

    @MainActor
    func testFinalSetFinishShowsConfirmationAtOnceAndHidesRestWithoutThePhone() throws {
        let (store, _) = makeStore("finish.confirm")
        var final = try fixture("final-workout")
        final.rest = .init(id: "rest", mode: .stopwatch, startedAt: now.addingTimeInterval(-30), endsAt: nil,
                           frozenElapsedSeconds: nil, frozenRemainingSeconds: nil)
        store.apply(final)
        XCTAssertEqual(store.presentedPhase, .active)
        XCTAssertNotNil(store.visibleRest)

        store.requestFinish()

        XCTAssertEqual(store.presentedPhase, .finishConfirmation, "Confirmation on the primary surface, no phone reply needed.")
        XCTAssertNil(store.visibleRest, "Rest stops the moment Finish is tapped.")
        XCTAssertNotEqual(store.presentedPhase, .finishing, "Never 'Finishing safely…' before confirmation.")
    }

    @MainActor
    func testNotYetReturnsToTheWorkoutAndRestoresRest() throws {
        let (store, _) = makeStore("finish.notyet")
        store.apply(try fixture("normal"))
        store.requestFinish()
        XCTAssertNil(store.visibleRest)
        store.cancelFinish()
        XCTAssertEqual(store.presentedPhase, .active)
        XCTAssertNotNil(store.visibleRest, "Rest is restored from its absolute anchor.")
    }

    @MainActor
    func testPhoneRequestedConfirmationPresentsConfirmationAndConfirmedFinishPresentsFinishing() throws {
        let (store, _) = makeStore("finish.phases")
        var requested = try fixture("normal")
        requested.phase = .finishConfirmation
        requested.rest = nil
        store.apply(requested)
        XCTAssertEqual(store.presentedPhase, .finishConfirmation)

        var finishing = try fixture("finishing")
        finishing.revision = requested.revision + 1
        store.apply(finishing)
        XCTAssertEqual(store.presentedPhase, .finishing)
        XCTAssertFalse(store.localFinishConfirmation)
        XCTAssertNil(store.visibleRest)
    }

    @MainActor
    func testConfirmedFinishWaitsBoundedThenNamesTheReason() throws {
        let (store, _) = makeStore("finish.wait")
        var finishing = try fixture("finishing")
        finishing.finish?.serverWaitingForNetwork = true
        store.apply(finishing)
        XCTAssertNil(store.finishWaitReason(at: now.addingTimeInterval(29)), "No reason before 30 s.")
        XCTAssertEqual(store.finishWaitReason(at: now.addingTimeInterval(31)), "Waiting for iPhone",
                       "An unreachable phone is named first; Retry is offered, never an indefinite spinner.")
    }

    // MARK: HealthKit leg resolution

    private func ended(_ session: String, _ outcome: WatchWorkoutEndedSession.Outcome, op: String? = nil) -> WatchWorkoutEndedSession {
        .init(sessionId: session, outcome: outcome, finishOperationId: op, finishedAt: now)
    }

    func testHealthResolutionSavesForConfirmedOrCommittedAndDiscardsOnlyForCancel() throws {
        var projection = try fixture("finishing")
        let session = projection.sessionId
        XCTAssertEqual(
            WatchHealthSessionResolution.resolve(healthSessionId: session, incoming: projection, knownFinish: nil),
            .save(operationId: "finish-preview", endAt: projection.finishedAt)
        )
        projection.phase = .committed
        XCTAssertEqual(
            WatchHealthSessionResolution.resolve(healthSessionId: session, incoming: projection, knownFinish: nil),
            .save(operationId: "finish-preview", endAt: projection.finishedAt),
            "A Watch that missed .finishing still saves on .committed (phone Finish)."
        )
        XCTAssertEqual(
            WatchHealthSessionResolution.resolve(healthSessionId: session, incoming: try fixture("normal"), knownFinish: nil),
            .keep
        )
        XCTAssertEqual(
            WatchHealthSessionResolution.resolve(
                healthSessionId: session,
                incoming: .terminal(sessionId: session, revision: 3, phase: .cancelled),
                knownFinish: nil
            ),
            .discard
        )
    }

    func testReturnToLogTerminalSavesACommittedWorkoutInsteadOfDiscardingIt() {
        let unavailable = WatchWorkoutProjection.terminal(
            sessionId: "current", revision: 0, phase: .unavailable,
            recentlyEnded: [ended("s1", .committed, op: "op-1")]
        )
        XCTAssertEqual(
            WatchHealthSessionResolution.resolve(healthSessionId: "s1", incoming: unavailable, knownFinish: nil),
            .save(operationId: "op-1", endAt: now)
        )
        let cancelled = WatchWorkoutProjection.terminal(
            sessionId: "current", revision: 0, phase: .unavailable, recentlyEnded: [ended("s1", .cancelled)]
        )
        XCTAssertEqual(WatchHealthSessionResolution.resolve(healthSessionId: "s1", incoming: cancelled, knownFinish: nil), .discard)
        let unknownOutcome = WatchWorkoutProjection.terminal(
            sessionId: "current", revision: 0, phase: .unavailable, recentlyEnded: [ended("s1", .unknown)]
        )
        XCTAssertEqual(WatchHealthSessionResolution.resolve(healthSessionId: "s1", incoming: unknownOutcome, knownFinish: nil), .keep)
        let bare = WatchWorkoutProjection.terminal(sessionId: "current", revision: 0, phase: .unavailable)
        XCTAssertEqual(
            WatchHealthSessionResolution.resolve(
                healthSessionId: "s1", incoming: bare,
                knownFinish: .init(operationId: "op-known", finishedAt: now)
            ),
            .save(operationId: "op-known", endAt: now),
            "Once a finish was confirmed, the workout is never discarded."
        )
        XCTAssertEqual(
            WatchHealthSessionResolution.resolve(healthSessionId: "s1", incoming: bare, knownFinish: nil),
            .keep,
            "No record either way (Save & Leave, a newer session): never discard; the Watch offers End & Save / Discard."
        )
        var otherSession = try! fixture("start")
        otherSession.sessionId = "next-prepared"
        XCTAssertEqual(WatchHealthSessionResolution.resolve(healthSessionId: "s1", incoming: otherSession, knownFinish: nil), .keep)
        let otherCancelled = WatchWorkoutProjection.terminal(sessionId: "s2", revision: 1, phase: .cancelled)
        XCTAssertEqual(
            WatchHealthSessionResolution.resolve(healthSessionId: "s1", incoming: otherCancelled, knownFinish: nil),
            .keep,
            "Cancelling another session never discards this workout."
        )
    }

    final class MutableClock: @unchecked Sendable {
        var now: Date
        init(_ now: Date) { self.now = now }
    }

    @MainActor
    func testFinishKnowledgeKeepsEveryFinishForFortyEightHoursAndThenExpiresIt() throws {
        let suite = "finish.knowledge.order"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let clock = MutableClock(now)
        let store = WatchWorkoutStore(session: nil, defaults: defaults, now: { clock.now })
        var finishing = try fixture("finishing")
        for index in 0..<13 {
            clock.now = now.addingTimeInterval(TimeInterval(index * 60))
            finishing.sessionId = "session-\(String(format: "%02d", 12 - index))"
            finishing.finish?.operationId = "op-\(index)"
            store.apply(finishing)
        }
        XCTAssertEqual(store.finishKnowledge.count, 13)
        XCTAssertEqual(store.finishKnowledge["session-12"]?.operationId, "op-0",
                       "A thirteenth recent finish cannot crowd out the running workout's recovery key.")
        XCTAssertEqual(store.finishKnowledge["session-00"]?.operationId, "op-12", "The newest is always kept.")

        clock.now = now.addingTimeInterval((49 * 60 * 60) + (13 * 60))
        XCTAssertTrue(store.finishKnowledge.isEmpty, "Expired recovery knowledge does not grow without bound.")
    }

    func testHealthKitEndsAtTheAuthoritativeFinishInstant() {
        let start = now.addingTimeInterval(-3_800)
        let finished = now.addingTimeInterval(-120)
        XCTAssertEqual(WatchWorkoutHealthController.endDate(finishedAt: finished, workoutStart: start, now: now), finished)
        XCTAssertEqual(WatchWorkoutHealthController.endDate(finishedAt: now.addingTimeInterval(60), workoutStart: start, now: now), now)
        XCTAssertEqual(WatchWorkoutHealthController.endDate(finishedAt: start.addingTimeInterval(-60), workoutStart: start, now: now), start)
        XCTAssertEqual(WatchWorkoutHealthController.endDate(finishedAt: nil, workoutStart: start, now: now), now)
    }

    // MARK: Done

    @MainActor
    func testDoneDismissesTheSummaryLocallyAndItNeverResurrects() throws {
        let (store, _) = makeStore("summary.done")
        var summary = try fixture("summary")
        summary.finishedAt = now.addingTimeInterval(-60)
        store.apply(summary)
        XCTAssertEqual(store.presentedPhase, .committed)
        store.dismissSummary()
        XCTAssertNil(store.projection)
        XCTAssertFalse(store.isMutationPending, "Done sends no commit.")
        store.apply(summary)
        XCTAssertNil(store.projection, "The same summary does not come back.")

        let (fresh, _) = makeStore("summary.old")
        var old = summary
        old.sessionId = "older-session"
        old.finishedAt = now.addingTimeInterval(-13 * 60 * 60)
        fresh.apply(old)
        XCTAssertNil(fresh.projection, "A summary from an earlier day never resurrects on launch.")
    }

    // MARK: Rest haptics

    func testCountdownCuesNeverReplayPastThresholds() {
        let endsAt = now.addingTimeInterval(7)
        XCTAssertEqual(WatchWorkoutStore.upcomingCountdownThresholds(endsAt: endsAt, now: now), [5, 0])
        XCTAssertEqual(WatchWorkoutStore.upcomingCountdownThresholds(endsAt: now.addingTimeInterval(-30), now: now), [])
        XCTAssertEqual(WatchWorkoutStore.upcomingCountdownThresholds(endsAt: now.addingTimeInterval(60), now: now), [10, 5, 0])
    }

    // MARK: Daily Totals

    private func totals(date: String, active: Double? = 945.744, nutrition: Double? = 2_463.3, offline: Bool = false, refreshedAgo: TimeInterval = 60) -> WatchDailyTotals {
        .init(schemaVersion: WatchDailyTotals.schemaVersion, localDate: date, activeCalories: active,
              nutritionCalories: nutrition, isActivityPartialDay: true,
              refreshedAt: now.addingTimeInterval(-refreshedAgo), isOffline: offline,
              writtenAt: now.addingTimeInterval(-refreshedAgo))
    }

    func testDailyTotalsShowOnlyTodayWholeNumbersAndHonestFreshness() {
        let today = WatchDailyTotalsPresentation.localDateKey(now)
        XCTAssertNotNil(WatchDailyTotalsPresentation.todaysTotals(totals(date: today), at: now))
        XCTAssertNil(WatchDailyTotalsPresentation.todaysTotals(totals(date: "2000-01-01"), at: now), "Never yesterday's values.")
        XCTAssertEqual(WatchWorkoutClock.wholeNumber(945.744), "946")
        XCTAssertEqual(WatchWorkoutClock.wholeNumber(2_463.3), 2_463.formatted())
        XCTAssertEqual(WatchWorkoutClock.wholeNumber(nil), "—")
        XCTAssertTrue(WatchDailyTotalsPresentation.freshness(totals(date: today), connection: .reachable, at: now).hasPrefix("Updated"))
        XCTAssertTrue(WatchDailyTotalsPresentation.freshness(totals(date: today, refreshedAgo: 3_600), connection: .reachable, at: now).hasPrefix("As of"))
        XCTAssertTrue(WatchDailyTotalsPresentation.freshness(totals(date: today, offline: true), connection: .reachable, at: now).hasPrefix("Offline"))
        XCTAssertTrue(WatchDailyTotalsPresentation.freshness(totals(date: today), connection: .phoneUnavailable, at: now).hasPrefix("Offline"))
        XCTAssertTrue(WatchDailyTotalsPresentation.freshness(totals(date: today), connection: .passive, at: now).hasPrefix("Updated"))
        XCTAssertEqual(WatchDailyTotalsPresentation.freshness(nil, connection: .passive, at: now), "Waiting for iPhone")
        XCTAssertEqual(WatchDailyTotalsPresentation.freshness(nil, connection: .reachable, at: now), "Waiting for iPhone")
    }

    func testSessionTimeUsesAuthoritativeAnchorsAndPauseSemantics() throws {
        var projection = try fixture("normal")
        projection.startedAt = now.addingTimeInterval(-3_600)
        projection.accumulatedPausedSeconds = 600
        projection.pausedAt = nil
        projection.finishedAt = nil
        XCTAssertEqual(WatchWorkoutClock.sessionSeconds(projection, at: now), 3_000)
        projection.pausedAt = now.addingTimeInterval(-300)
        XCTAssertEqual(WatchWorkoutClock.sessionSeconds(projection, at: now), 2_700, "Frozen while paused.")
        projection.pausedAt = nil
        projection.finishedAt = now.addingTimeInterval(-1_000)
        XCTAssertEqual(WatchWorkoutClock.sessionSeconds(projection, at: now), 2_000, "Frozen at the confirmed finish.")
        XCTAssertEqual(WatchWorkoutClock.format(3_725), "1:02:05")
        XCTAssertEqual(WatchWorkoutClock.format(125), "2:05")
    }

    // MARK: Overnight Lane A — utility translation presentation

    func testTimedSetShowsItsSecondsInsteadOfAnEmptyRepsTile() throws {
        let timed = try XCTUnwrap(try fixture("timed").rows.first(where: \.isCompletionTarget))
        XCTAssertEqual(WatchExecutionValues(row: timed), .init(load: "BW", primary: "45", primaryLabel: "SECONDS"))

        let reps = try XCTUnwrap(try fixture("normal").rows.first(where: \.isCompletionTarget))
        XCTAssertEqual(WatchExecutionValues(row: reps), .init(load: "185", primary: "8", primaryLabel: "REPS"))

        var missing = reps
        missing.loadText = nil
        missing.repsText = nil
        XCTAssertEqual(WatchExecutionValues(row: missing), .init(load: "—", primary: "—", primaryLabel: "REPS"),
                       "Missing values stay an honest em dash.")
    }

    // MARK: Build 92 — phone-selected execution variant (display only)

    func testRowShowsThePhoneSelectedVariantLabelAndOlderPhonesDecodeUnchanged() throws {
        var row = try XCTUnwrap(try fixture("normal").rows.first(where: \.isCompletionTarget))
        XCTAssertNil(row.variantLabel, "An older phone omits the label")
        XCTAssertEqual(WatchExecutionValues.rowTitle(row), row.exerciseName)
        row.variantLabel = "Static Hold"
        row.supersetLabel = "A"
        XCTAssertEqual(WatchExecutionValues.rowTitle(row), "A · \(row.exerciseName) · Static Hold")
        XCTAssertEqual(WatchExecutionValues(row: row).primaryLabel, "REPS", "A variant never changes the set's reps/load tiles")
        let decoded = try JSONDecoder().decode(WatchWorkoutProjection.Row.self, from: JSONEncoder().encode(row))
        XCTAssertEqual(decoded.variantLabel, "Static Hold")
    }

    @MainActor
    func testPhoneReviewDisablesCompleteSetAndNamesTheReason() throws {
        let (store, _) = makeStore("laneA.review")
        store.apply(try fixture("review"))
        XCTAssertEqual(store.presentedPhase, .active)
        XCTAssertTrue(store.isReviewingOnPhone)
        XCTAssertFalse(store.isCompleteSetAvailable, "No actionable Complete Set while the phone reviews.")
        store.completeSet()
        XCTAssertFalse(store.isMutationPending, "A tap issues no command.")

        store.apply(try fixture("normal"))
        XCTAssertFalse(store.isReviewingOnPhone)
    }

    func testWatchTypographyKeepsTheBoardAtStandardSizesAndGrowsOnlyForAccessibility() {
        for size in [DynamicTypeSize.xSmall, .large, .xLarge, .xxLarge, .xxxLarge] {
            XCTAssertEqual(WatchType.scale(size), 1, "\(size)")
        }
        XCTAssertGreaterThan(WatchType.scale(.accessibility1), 1)
        XCTAssertGreaterThanOrEqual(WatchType.scale(.accessibility5), WatchType.scale(.accessibility1))
    }

    func testLockedUtilityTokensAndRetainedMetricIdentity() {
        let saved = WatchPhysiqueOSTheme.current
        defer { WatchPhysiqueOSTheme.current = saved }
        WatchPhysiqueOSTheme.current = .dark
        XCTAssertEqual(WatchPhysiqueOSTheme.background, Color(watchHex: 0x061019))
        XCTAssertEqual(WatchPhysiqueOSTheme.purple, Color(watchHex: 0xAA98FF))
        XCTAssertEqual(WatchPhysiqueOSTheme.progress, Color(watchHex: 0x55E39A))
        // The Founder's acceptance correction: production metric accents stay.
        XCTAssertEqual(WatchPhysiqueOSTheme.timeAccent, Color(watchHex: 0x60A5FA))
        XCTAssertEqual(WatchPhysiqueOSTheme.activeEnergyAccent, Color(watchHex: 0xFBBF24))
        XCTAssertEqual(WatchPhysiqueOSTheme.totalEnergyAccent, Color(watchHex: 0x4ADE80))
        XCTAssertEqual(WatchPhysiqueOSTheme.nutritionAccent, Color(watchHex: 0xC084FC))
        XCTAssertEqual(WatchPhysiqueOSTheme.heartRateAccent, Color(watchHex: 0xFF697A))
    }

    // MARK: Independent Watch appearance (Lane A addendum)

    @MainActor
    func testWatchAppearanceDefaultsToDarkPersistsAndSurvivesAnOfflineLaunch() throws {
        let (store, defaults) = makeStore("laneA.appearance")
        XCTAssertEqual(store.appearance, .dark, "Unset is Dark")

        store.receiveApplicationContext([WatchWorkoutContract.applicationContextAppearanceKey: "mineralLight"])
        XCTAssertEqual(store.appearance, .mineralLight)
        XCTAssertEqual(defaults.string(forKey: WatchWorkoutStore.appearanceKey), "mineralLight")

        // Relaunch with no phone: the stored choice renders immediately.
        let relaunched = WatchWorkoutStore(session: nil, defaults: defaults, now: { self.now }, health: FakeWatchHealth(startDate: now))
        XCTAssertEqual(relaunched.appearance, .mineralLight)
    }

    @MainActor
    func testReconnectWithoutOrWithAnUnknownAppearanceKeepsTheStoredChoice() throws {
        let (store, defaults) = makeStore("laneA.appearance.reconnect")
        store.receiveAppearance("mineralLight")
        // An older phone omits the slot; a future one may send a new value.
        store.receiveApplicationContext([:])
        XCTAssertEqual(store.appearance, .mineralLight, "No reset or flash on reconnect")
        store.receiveAppearance("sepia")
        store.receiveAppearance(7)
        XCTAssertEqual(store.appearance, .mineralLight)
        store.receiveApplicationContext([
            WatchWorkoutContract.applicationContextProjectionKey: try WatchWorkoutWireCodec.encode(try fixture("normal")),
            WatchWorkoutContract.applicationContextAppearanceKey: "dark",
        ])
        XCTAssertEqual(store.appearance, .dark)
        XCTAssertEqual(defaults.string(forKey: WatchWorkoutStore.appearanceKey), "dark")
    }

    /// Build 93 (Founder 2026-10-08): Complete Set / Finish use the iPhone
    /// Finish Workout amber of the Watch's appearance with the iPhone ink;
    /// purple is no longer the primary workout action.
    func testPrimaryWorkoutActionIsTheIPhoneFinishWorkoutAmberPerAppearance() {
        let saved = WatchPhysiqueOSTheme.current
        defer { WatchPhysiqueOSTheme.current = saved }
        XCTAssertEqual(WatchPalette.dark.workoutPrimary, Color(watchHex: 0xEFB84F))
        XCTAssertEqual(WatchPalette.mineralLight.workoutPrimary, Color(watchHex: 0xC88228))
        XCTAssertEqual(WatchPalette.dark.onWorkoutPrimary, Color(watchHex: 0x10202A))
        XCTAssertEqual(WatchPalette.mineralLight.onWorkoutPrimary, Color(watchHex: 0x10202A))
        XCTAssertEqual(WatchPalette.dark.workoutPrimary, Color(watchHex: WorkoutPrimaryActionToken.darkHex))
        XCTAssertEqual(WatchPalette.mineralLight.workoutPrimary, Color(watchHex: WorkoutPrimaryActionToken.mineralLightHex))
        for palette in [WatchPalette.dark, .mineralLight] {
            WatchPhysiqueOSTheme.current = palette
            let button = WatchEdgeCapsuleButton(title: "Complete Set", layout: WatchExecutionLayout(size: CGSize(width: 198, height: 242)), action: {})
            XCTAssertEqual(button.tint, palette.workoutPrimary, "the primary capsule defaults to the amber")
            XCTAssertEqual(button.foreground, palette.onWorkoutPrimary)
            XCTAssertNotEqual(button.tint, palette.purple)
        }
        // Purple remains the brand/navigation accent (not recolored).
        XCTAssertEqual(WatchPalette.dark.purple, Color(watchHex: 0xAA98FF))
        XCTAssertEqual(WatchPalette.mineralLight.purple, Color(watchHex: 0x5C3FD2))
    }

    func testEveryWatchScreenResolvesTheSelectedPalette() {
        let saved = WatchPhysiqueOSTheme.current
        defer { WatchPhysiqueOSTheme.current = saved }
        XCTAssertEqual(WatchPalette.of(.dark), .dark)
        XCTAssertEqual(WatchPalette.of(.mineralLight), .mineralLight)
        XCTAssertNil(WatchPalette.dark.clockCapsule, "Dark needs no clock treatment")
        XCTAssertNotNil(WatchPalette.mineralLight.clockCapsule, "The white system clock stays legible on Mineral")

        WatchPhysiqueOSTheme.current = .of(.mineralLight)
        XCTAssertEqual(WatchPhysiqueOSTheme.background, Color(watchHex: 0xE8ECE5))
        XCTAssertEqual(WatchPhysiqueOSTheme.surface, Color(watchHex: 0xFBFAF4))
        XCTAssertEqual(WatchPhysiqueOSTheme.purple, Color(watchHex: 0x5C3FD2))
        XCTAssertEqual(WatchPhysiqueOSTheme.text, Color(watchHex: 0x102431))
        XCTAssertEqual(WatchPhysiqueOSTheme.onPrimary, .white)
        XCTAssertEqual(WatchPhysiqueOSTheme.timeAccent, Color(watchHex: 0x2563B8))
        XCTAssertEqual(WatchPhysiqueOSTheme.heartRateAccent, Color(watchHex: 0xC73850))

        WatchPhysiqueOSTheme.current = .of(.dark)
        XCTAssertEqual(WatchPhysiqueOSTheme.background, Color(watchHex: 0x061019))
        XCTAssertEqual(WatchPhysiqueOSTheme.onPrimary, Color(watchHex: 0x061019))
    }

    /// Founder-selected Option A: a compact capsule around the real system
    /// time — never a full-width band — that clears the page content on both
    /// supported case sizes.
    func testMineralClockCapsuleIsCompactAndClearsContentOnBothCaseSizes() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let us = Locale(identifier: "en_US")
        let sevenOhOne = calendar.date(from: DateComponents(year: 2026, month: 10, day: 6, hour: 7, minute: 1))!
        let twelveFiftyEight = calendar.date(from: DateComponents(year: 2026, month: 10, day: 6, hour: 12, minute: 58))!
        let utc = TimeZone(identifier: "UTC")!
        XCTAssertEqual(WatchClockCapsule.clockWidth(at: sevenOhOne, locale: us, timeZone: utc), 34)
        XCTAssertEqual(WatchClockCapsule.clockWidth(at: twelveFiftyEight, locale: us, timeZone: utc), 44)

        // (page width, top safe area) measured on the Ultra 3 (49 mm: 207, 57)
        // and the 42 mm (183, 48.6) simulators via the geometry fixture.
        for (width, safeTop) in [(CGFloat(207), CGFloat(57)), (183, 48.6)] {
            let frame = WatchClockCapsule.frame(screenWidth: width, safeAreaTop: safeTop, clockWidth: 44)
            XCTAssertLessThanOrEqual(frame.width, 60, "Compact: only as wide as the widest time (\(width))")
            XCTAssertLessThanOrEqual(frame.width, width * 0.34, "Never a band (\(width))")
            XCTAssertLessThanOrEqual(frame.maxX, width, "Stays on screen (\(width))")
            XCTAssertGreaterThan(frame.minX, width / 2, "Anchored top-trailing (\(width))")
            XCTAssertLessThanOrEqual(frame.maxY, WatchExecutionLayout.topInset(safeAreaTop: safeTop) - 1,
                                     "Ends above the first content line (\(width))")
            XCTAssertLessThanOrEqual(frame.midY, safeTop * 0.5 + 0.001, "Never sits below the clock's own center")
            XCTAssertGreaterThanOrEqual(frame.midY, safeTop * 0.5 - 2.5, "Stays on the digits (\(width))")
            XCTAssertGreaterThanOrEqual(frame.minY, 0)
        }
    }

    // MARK: Fixed execution layout

    func testExecutionLayoutFitsEverySupportedWatchWithoutScrollingOrTinyCriticalText() {
        // Space below the clock, measured on the simulators (width x height):
        // 40 mm SE, 42 mm, 44 mm, 46 mm, 49 mm Ultra.
        let sizes = [CGSize(width: 158, height: 169), CGSize(width: 183, height: 186),
                     CGSize(width: 180, height: 190), CGSize(width: 204, height: 210),
                     CGSize(width: 207, height: 217)]
        for size in sizes {
            for hasRest in [true, false] {
                let layout = WatchExecutionLayout(size: size, hasRest: hasRest)
                XCTAssertLessThanOrEqual(layout.requiredHeight(hasRest: hasRest), size.height, "\(size) rest=\(hasRest)")
                XCTAssertGreaterThanOrEqual(layout.metricFont, WatchExecutionLayout.minimumMetricFont)
                XCTAssertGreaterThanOrEqual(layout.restFont, WatchExecutionLayout.minimumRestFont)
                XCTAssertGreaterThanOrEqual(layout.buttonHeight, WatchExecutionLayout.minimumButtonHeight)
            }
        }
        XCTAssertTrue(WatchExecutionLayout(size: sizes[0]).isCompact)
        XCTAssertFalse(WatchExecutionLayout(size: sizes[4]).isCompact)
        XCTAssertEqual(WatchExecutionLayout.topInset(safeAreaTop: 56), 39)
        XCTAssertEqual(WatchExecutionLayout.topInset(safeAreaTop: 40), 28)
    }

    // MARK: Command deferral (fresh re-review N1) via the test command sink

    @MainActor
    private func sinkStore(_ suite: String) -> (WatchWorkoutStore, CommandLog) {
        let (store, _) = makeStore(suite)
        let log = CommandLog()
        store.commandSinkForTesting = { log.commands.append($0) }
        return (store, log)
    }

    final class CommandLog { var commands: [WatchWorkoutCommand] = [] }

    @MainActor
    private func acknowledge(
        _ store: WatchWorkoutStore, _ command: WatchWorkoutCommand,
        status: WatchWorkoutAcknowledgement.Status = .applied, projection: WatchWorkoutProjection
    ) throws {
        let ack = WatchWorkoutAcknowledgement(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: command.commandId,
            mutationId: command.mutationId, status: status, reason: nil,
            acknowledgedRevision: projection.revision, projection: projection
        )
        store.receiveAcknowledgement(try WatchWorkoutWireCodec.encode(ack))
    }

    @MainActor
    func testFinishTappedWhileCompleteSetIsInFlightIsSentAfterItsReply() throws {
        let (store, log) = sinkStore("defer.finish")
        var active = try fixture("final-set")
        store.apply(active)
        store.completeSet()
        XCTAssertEqual(log.commands.map(\.kind), [.completeSet])
        // The context already shows every set done, so Finish is tappable.
        active.completedSets = active.totalSets
        store.requestFinish()
        XCTAssertEqual(store.presentedPhase, .finishConfirmation)
        XCTAssertEqual(log.commands.count, 1, "Deferred while Complete Set is in flight.")

        active.revision += 1
        try acknowledge(store, log.commands[0], projection: active)

        XCTAssertEqual(store.presentedPhase, .finishConfirmation, "The reply to another command never drops the Finish tap.")
        XCTAssertEqual(log.commands.map(\.kind), [.completeSet, .requestFinish])
    }

    @MainActor
    func testNotYetTappedWhileAnotherCommandIsInFlightIsNotReRaised() throws {
        let (store, log) = sinkStore("defer.notyet")
        var requested = try fixture("normal")
        requested.phase = .finishConfirmation
        requested.rest = nil
        store.apply(requested)
        store.refresh()
        store.cancelFinish()
        XCTAssertEqual(store.presentedPhase, .active)
        try acknowledge(store, log.commands[0], status: .unchanged, projection: requested)
        XCTAssertEqual(store.presentedPhase, .active, "A deferred Not Yet is not re-opened by the refresh reply.")
        XCTAssertEqual(log.commands.map(\.kind), [.refreshProjection, .cancelFinish])
    }

    @MainActor
    func testAStaleFinishRequestAsksAgainAndKeepsTheConfirmationUp() throws {
        let (store, log) = sinkStore("defer.stale")
        var active = try fixture("final-workout")
        store.apply(active)
        store.requestFinish()
        active.revision += 1
        try acknowledge(store, log.commands[0], status: .stale, projection: active)
        XCTAssertEqual(store.presentedPhase, .finishConfirmation)
        XCTAssertEqual(log.commands.map(\.kind), [.requestFinish, .requestFinish], "Re-asked on the refreshed revision.")
    }

    @MainActor
    func testPhoneSideNotYetClosesTheConfirmation() throws {
        let (store, log) = sinkStore("phone.notyet")
        var requested = try fixture("normal")
        requested.phase = .finishConfirmation
        store.apply(requested)
        XCTAssertEqual(store.presentedPhase, .finishConfirmation)
        var active = requested
        active.phase = .active
        active.revision += 1
        store.apply(active)
        XCTAssertEqual(store.presentedPhase, .active)
        XCTAssertTrue(log.commands.isEmpty)
    }

    @MainActor
    func testDoneSendsNoCommitAndDoesNotTouchHealthKit() throws {
        let (store, log) = sinkStore("done.nocommit")
        var summary = try fixture("summary")
        summary.finishedAt = now.addingTimeInterval(-60)
        store.apply(summary)
        store.dismissSummary()
        XCTAssertTrue(log.commands.allSatisfy { $0.kind == .refreshProjection }, "Only a read-only refresh.")
        XCTAssertNotEqual(store.health.lifecycle, .cancelled)
    }

    func testAKnownFinishIsSavedEvenIfTheDraftWasLaterDiscarded() {
        let discarded = WatchWorkoutProjection.terminal(
            sessionId: "current", revision: 0, phase: .unavailable,
            recentlyEnded: [.init(sessionId: "s1", outcome: .discardedAfterFinish, finishOperationId: "op-1", finishedAt: now)]
        )
        XCTAssertEqual(
            WatchHealthSessionResolution.resolve(healthSessionId: "s1", incoming: discarded, knownFinish: nil),
            .save(operationId: "op-1", endAt: now)
        )
        let cancelled = WatchWorkoutProjection.terminal(
            sessionId: "current", revision: 0, phase: .unavailable,
            recentlyEnded: [.init(sessionId: "s1", outcome: .cancelled, finishOperationId: nil, finishedAt: nil)]
        )
        XCTAssertEqual(
            WatchHealthSessionResolution.resolve(
                healthSessionId: "s1", incoming: cancelled, knownFinish: .init(operationId: "op-known", finishedAt: now)
            ),
            .save(operationId: "op-known", endAt: now),
            "A known confirmed finish beats a later cancelled record."
        )
    }

    @MainActor
    func testDiscardAfterFinishIsPersistedBeforeTerminalProjectionIsCleared() {
        let (store, _) = makeStore("finish.discarded.persisted")
        let discarded = WatchWorkoutProjection.terminal(
            sessionId: "current", revision: 0, phase: .unavailable,
            recentlyEnded: [.init(
                sessionId: "s1", outcome: .discardedAfterFinish,
                finishOperationId: "op-1", finishedAt: now
            )]
        )

        store.apply(discarded)

        XCTAssertNil(store.projection)
        XCTAssertEqual(store.finishKnowledge["s1"]?.operationId, "op-1",
                       "Relaunch recovery must retain the finish after terminal context is consumed.")
        XCTAssertEqual(store.finishKnowledge["s1"]?.finishedAt, now)
    }
}

@MainActor
final class WatchHealthAuthorizationTests: XCTestCase {
    func testAnsweredScopePreflightsWithoutRawRequest() async throws {
        let service = WatchAuthorizationServiceFake(statuses: [.unnecessary])
        let coordinator = WatchHealthAuthorizationCoordinator(service: service, receipts: MemoryWatchAuthorizationReceipts())

        try await coordinator.ensureAuthorization(presentation: .automatic)

        XCTAssertEqual(service.statusCalls, 1)
        XCTAssertEqual(service.requestCalls, 0)
    }

    func testAutomaticStartNeverPresentsFirstTimeConsent() async {
        let service = WatchAuthorizationServiceFake(statuses: [.shouldRequest])
        let coordinator = WatchHealthAuthorizationCoordinator(service: service, receipts: MemoryWatchAuthorizationReceipts())

        do {
            try await coordinator.ensureAuthorization(presentation: .automatic)
            XCTFail("Automatic start must fail closed when Watch consent is due.")
        } catch {
            XCTAssertEqual(error as? WatchHealthAuthorizationError, .requestRequiredOnWatch)
        }
        XCTAssertEqual(service.requestCalls, 0)
    }

    func testDirectWatchActionMayPresentConsentAfterPreflight() async throws {
        let service = WatchAuthorizationServiceFake(statuses: [.shouldRequest])
        let coordinator = WatchHealthAuthorizationCoordinator(service: service, receipts: MemoryWatchAuthorizationReceipts())

        try await coordinator.ensureAuthorization(presentation: .direct)

        XCTAssertEqual(service.statusCalls, 1)
        XCTAssertEqual(service.requestCalls, 1)
    }

    func testUnknownStatusFailsClosedWithoutRawRequest() async {
        let service = WatchAuthorizationServiceFake(statuses: [.unknown])
        let coordinator = WatchHealthAuthorizationCoordinator(service: service, receipts: MemoryWatchAuthorizationReceipts())

        do {
            try await coordinator.ensureAuthorization(presentation: .direct)
            XCTFail("Unknown authorization status must fail closed.")
        } catch {
            XCTAssertEqual(error as? WatchHealthAuthorizationError, .requestStatusUnknown)
        }
        XCTAssertEqual(service.requestCalls, 0)
    }

    func testCompletedWatchTypeSetSurvivesRelaunchAndBuildUpdate() async throws {
        let receipts = MemoryWatchAuthorizationReceipts()
        let firstService = WatchAuthorizationServiceFake(statuses: [.shouldRequest])
        try await WatchHealthAuthorizationCoordinator(service: firstService, receipts: receipts)
            .ensureAuthorization(presentation: .direct)
        XCTAssertEqual(firstService.requestCalls, 1)

        let relaunchedService = WatchAuthorizationServiceFake(statuses: [.shouldRequest])
        try await WatchHealthAuthorizationCoordinator(service: relaunchedService, receipts: receipts)
            .ensureAuthorization(presentation: .direct)
        XCTAssertEqual(relaunchedService.statusCalls, 0)
        XCTAssertEqual(relaunchedService.requestCalls, 0)
        XCTAssertEqual(receipts.events["covered_skip"], 1)
    }

    func testGenuinelyNewWatchTypeMayPromptOnce() async throws {
        let receipts = MemoryWatchAuthorizationReceipts()
        let original = WatchAuthorizationServiceFake(statuses: [.shouldRequest])
        try await WatchHealthAuthorizationCoordinator(service: original, receipts: receipts)
            .ensureAuthorization(presentation: .direct)

        let expanded = WatchAuthorizationServiceFake(
            statuses: [.shouldRequest],
            identifiers: .init(read: ["heart", "active", "basal", "respiratory"], share: ["workout"])
        )
        let coordinator = WatchHealthAuthorizationCoordinator(service: expanded, receipts: receipts)
        try await coordinator.ensureAuthorization(presentation: .direct)
        try await coordinator.ensureAuthorization(presentation: .direct)

        XCTAssertEqual(expanded.statusCalls, 1)
        XCTAssertEqual(expanded.requestCalls, 1)
    }

    func testLegacyExactSetIsAdoptedOnlyAfterARealShareDecision() async throws {
        let service = WatchAuthorizationServiceFake(statuses: [.shouldRequest], legacyShareDecision: true)
        let receipts = MemoryWatchAuthorizationReceipts()

        try await WatchHealthAuthorizationCoordinator(service: service, receipts: receipts)
            .ensureAuthorization(presentation: .direct)

        XCTAssertEqual(service.statusCalls, 0)
        XCTAssertEqual(service.requestCalls, 0)
        XCTAssertEqual(receipts.events["legacy_exact_set_adopted"], 1)

        let expanded = WatchAuthorizationServiceFake(
            statuses: [.shouldRequest],
            identifiers: .init(
                read: WatchAuthorizationServiceFake.legacyIdentifiers.read.union(["new-type"]),
                share: WatchAuthorizationServiceFake.legacyIdentifiers.share
            ),
            legacyShareDecision: true
        )
        try await WatchHealthAuthorizationCoordinator(service: expanded, receipts: receipts)
            .ensureAuthorization(presentation: .direct)
        XCTAssertEqual(expanded.requestCalls, 1)
    }

    func testConcurrentWatchAuthorizationRequestsCoalesceToOneSheet() async throws {
        let service = SuspendingWatchAuthorizationService()
        let coordinator = WatchHealthAuthorizationCoordinator(
            service: service,
            receipts: MemoryWatchAuthorizationReceipts()
        )

        async let first: Void = coordinator.ensureAuthorization(presentation: .direct)
        while service.statusCalls == 0 { await Task.yield() }
        async let second: Void = coordinator.ensureAuthorization(presentation: .direct)
        service.releaseStatus()
        try await first
        try await second

        XCTAssertEqual(service.statusCalls, 1)
        XCTAssertEqual(service.requestCalls, 1)
    }
}

@MainActor
private final class WatchAuthorizationServiceFake: WatchHealthAuthorizationServicing {
    static let legacyIdentifiers = WatchHealthAuthorizationTypeIdentifiers(
        read: [
            HKQuantityTypeIdentifier.heartRate.rawValue,
            HKQuantityTypeIdentifier.activeEnergyBurned.rawValue,
            HKQuantityTypeIdentifier.basalEnergyBurned.rawValue,
        ],
        share: [HKObjectType.workoutType().identifier]
    )

    let isHealthDataAvailable = true
    private var statuses: [HKAuthorizationRequestStatus]
    private let identifiers: WatchHealthAuthorizationTypeIdentifiers
    private let legacyShareDecision: Bool
    private(set) var statusCalls = 0
    private(set) var requestCalls = 0

    init(
        statuses: [HKAuthorizationRequestStatus],
        identifiers: WatchHealthAuthorizationTypeIdentifiers = WatchAuthorizationServiceFake.legacyIdentifiers,
        legacyShareDecision: Bool = false
    ) {
        self.statuses = statuses
        self.identifiers = identifiers
        self.legacyShareDecision = legacyShareDecision
    }

    func authorizationTypeIdentifiers() throws -> WatchHealthAuthorizationTypeIdentifiers { identifiers }
    func hasDecidedLegacySharingAuthorization() throws -> Bool { legacyShareDecision }

    func requestStatus() async throws -> HKAuthorizationRequestStatus {
        statusCalls += 1
        return statuses.isEmpty ? .unknown : statuses.removeFirst()
    }

    func requestAuthorization() async throws { requestCalls += 1 }
}

@MainActor
private final class SuspendingWatchAuthorizationService: WatchHealthAuthorizationServicing {
    let isHealthDataAvailable = true
    private(set) var statusCalls = 0
    private(set) var requestCalls = 0
    private var continuation: CheckedContinuation<HKAuthorizationRequestStatus, Never>?

    func authorizationTypeIdentifiers() throws -> WatchHealthAuthorizationTypeIdentifiers {
        WatchAuthorizationServiceFake.legacyIdentifiers
    }

    func hasDecidedLegacySharingAuthorization() throws -> Bool { false }

    func requestStatus() async throws -> HKAuthorizationRequestStatus {
        statusCalls += 1
        return await withCheckedContinuation { continuation = $0 }
    }

    func releaseStatus() {
        let pending = continuation
        continuation = nil
        pending?.resume(returning: .shouldRequest)
    }

    func requestAuthorization() async throws { requestCalls += 1 }
}

private final class MemoryWatchAuthorizationReceipts: WatchHealthAuthorizationReceiptStoring {
    private var handled = WatchHealthAuthorizationTypeIdentifiers(read: [], share: [])
    private(set) var events: [String: Int] = [:]

    func covers(_ identifiers: WatchHealthAuthorizationTypeIdentifiers) -> Bool {
        identifiers.read.isSubset(of: handled.read) && identifiers.share.isSubset(of: handled.share)
    }

    func recordHandled(_ identifiers: WatchHealthAuthorizationTypeIdentifiers) {
        handled = .init(read: handled.read.union(identifiers.read), share: handled.share.union(identifiers.share))
    }

    func record(event: String, reason: String) { events[event, default: 0] += 1 }

    var diagnostics: WatchHealthAuthorizationDiagnostics {
        .init(
            installationID: "watch-install", sessionID: "watch-session", build: "95",
            sessionEventCounts: events, buildEventCounts: events, lastReason: nil
        )
    }
}

// MARK: - Build 86: Watch HealthKit start, truthful status, refresh lane

/// Deterministic stand-in for the Watch HealthKit workout. Mirrors the
/// controller's observable contract without touching HealthKit.
@MainActor
final class FakeWatchHealth: WatchWorkoutHealthRecording {
    struct StartFailure: Error {}

    var lifecycle: WatchWorkoutHealthController.Lifecycle = .idle
    var currentHeartRateBPM: Double?
    var activeCalories: Double?
    var basalCalories: Double?
    var totalCalories: Double? {
        guard let activeCalories, let basalCalories else { return nil }
        return activeCalories + basalCalories
    }
    var averageHeartRateBPM: Double?
    var rawDurationSeconds: Double?
    var correlationId: String?
    var storedCorrelationId: String?
    var savedCorrelationPendingReport: String?
    var savedSessionIds: Set<String> = []

    let startDate: Date
    var failNextStart = false
    /// Holds the next start until `releaseStart()` (start/cancel races).
    var holdNextStart = false
    private var heldStart: CheckedContinuation<Void, Never>?
    private(set) var startCalls: [String] = []
    private(set) var authorizationPresentations: [WatchHealthAuthorizationPresentation] = []
    private(set) var pauseCalls = 0
    private(set) var resumeCalls = 0
    private(set) var finishCalls: [String?] = []
    private(set) var cancelCalls = 0

    init(startDate: Date) { self.startDate = startDate }

    var activeCorrelationId: String? {
        guard let correlationId, [.running, .paused, .ending, .failed].contains(lifecycle) else { return nil }
        return correlationId
    }
    var recordingCorrelationId: String? {
        lifecycle == .running || lifecycle == .paused ? correlationId : nil
    }

    func hasSaved(structuredSessionId: String) -> Bool {
        savedSessionIds.contains(structuredSessionId) || savedCorrelationPendingReport == structuredSessionId
    }

    func start(
        structuredSessionId: String,
        authorizationPresentation: WatchHealthAuthorizationPresentation
    ) async throws -> Date {
        startCalls.append(structuredSessionId)
        authorizationPresentations.append(authorizationPresentation)
        lifecycle = .starting
        if holdNextStart {
            holdNextStart = false
            await withCheckedContinuation { heldStart = $0 }
        }
        if failNextStart {
            failNextStart = false
            lifecycle = .failed
            throw StartFailure()
        }
        correlationId = structuredSessionId
        storedCorrelationId = structuredSessionId
        lifecycle = .running
        return startDate
    }

    func releaseStart() {
        heldStart?.resume()
        heldStart = nil
    }

    func pause() {
        guard lifecycle == .running else { return }
        pauseCalls += 1
        lifecycle = .paused
    }

    func resume() {
        guard lifecycle == .paused else { return }
        resumeCalls += 1
        lifecycle = .running
    }

    func finish(structuredSessionId: String?, endAt: Date?) async throws {
        guard let correlationId, [.running, .paused, .ending, .failed].contains(lifecycle),
              structuredSessionId == nil || structuredSessionId == correlationId
        else { throw StartFailure() }
        finishCalls.append(structuredSessionId)
        savedSessionIds.insert(correlationId)
        savedCorrelationPendingReport = correlationId
        self.correlationId = nil
        storedCorrelationId = nil
        lifecycle = .saved
    }

    func cancel() async {
        cancelCalls += 1
        correlationId = nil
        storedCorrelationId = nil
        currentHeartRateBPM = nil
        activeCalories = nil
        basalCalories = nil
        lifecycle = .cancelled
    }

    func recover(structuredSessionId: String?) async throws {}

    func resetPresentationMetrics() {
        guard correlationId == nil else { return }
        currentHeartRateBPM = nil
        activeCalories = nil
        basalCalories = nil
    }

    func markSavedCorrelationReported(_ structuredSessionId: String) {
        if savedCorrelationPendingReport == structuredSessionId { savedCorrelationPendingReport = nil }
    }

    func installDebugMetrics(
        heartRate: Double?, activeCalories: Double?, basalCalories: Double?, averageHeartRate: Double?,
        recordingCorrelationId: String?
    ) {
        currentHeartRateBPM = heartRate
        self.activeCalories = activeCalories
        self.basalCalories = basalCalories
        averageHeartRateBPM = averageHeartRate
    }
}

extension WatchWorkoutFinishStateTests {
    @MainActor
    private func healthStore(_ suite: String) -> (WatchWorkoutStore, CommandLog, FakeWatchHealth) {
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let now = now
        let health = FakeWatchHealth(startDate: now.addingTimeInterval(-90))
        let store = WatchWorkoutStore(session: nil, defaults: defaults, now: { now }, health: health)
        let log = CommandLog()
        store.commandSinkForTesting = { log.commands.append($0) }
        return (store, log, health)
    }

    @MainActor
    private func settle(_ store: WatchWorkoutStore) async {
        await store.healthStartInFlight?.value
        for _ in 0..<5 { await Task.yield() }
    }

    // 1 + 6 (Watch half): a phone-started active session records HealthKit exactly once and tells the phone.
    @MainActor
    func testPhoneStartedActiveSessionStartsHealthExactlyOnceAndReportsTheStart() async throws {
        let (store, log, health) = healthStore("health.auto.start")
        let active = try fixture("normal")
        XCTAssertNil(active.watchHealthStartedAt, "Phone-started: the phone has no Watch Health start.")
        XCTAssertEqual(store.healthStatus, .notRecording)

        store.apply(active)
        XCTAssertNotNil(store.healthStartInFlight)
        XCTAssertEqual(store.healthStatus, .starting)
        await settle(store)

        XCTAssertEqual(health.startCalls, [active.sessionId])
        XCTAssertEqual(health.authorizationPresentations, [.automatic])
        XCTAssertEqual(store.healthStatus, .recording)
        XCTAssertNil(store.healthHeaderText, "Recording shows the workout title, not a Health warning.")
        XCTAssertEqual(log.commands.map(\.kind), [.reportHealthStarted])
        XCTAssertEqual(log.commands[0].sessionId, active.sessionId)
        XCTAssertEqual(log.commands[0].healthStartedAt, health.startDate)

        // The phone records it; its projection now carries the start.
        var recorded = active
        recorded.revision += 1
        recorded.watchHealthStartedAt = health.startDate
        try acknowledge(store, log.commands[0], projection: recorded)
        store.apply(recorded)
        await settle(store)
        XCTAssertEqual(health.startCalls.count, 1)
        XCTAssertEqual(log.commands.count, 1, "The answered report is never re-sent.")
        XCTAssertFalse(store.isMutationPending)
    }

    // 2: replay / reconnect / relaunch never start a second workout.
    @MainActor
    func testReplayReconnectAndRelaunchNeverStartASecondHealthWorkout() async throws {
        let (store, log, health) = healthStore("health.auto.replay")
        let active = try fixture("normal")
        store.apply(active)
        store.apply(active)                       // replayed context before the start lands
        await settle(store)
        store.apply(active)                       // replayed context after it landed
        store.setDisplayActive(false)
        store.setDisplayActive(true)              // wrist down / up
        await settle(store)
        XCTAssertEqual(health.startCalls, [active.sessionId])
        XCTAssertEqual(log.commands.filter { $0.kind == .reportHealthStarted }.count, 1)

        // Relaunch: a workout still running but not yet recovered is stored.
        let (relaunched, relaunchedLog, relaunchedHealth) = healthStore("health.auto.relaunch.stored")
        relaunchedHealth.storedCorrelationId = active.sessionId
        relaunched.apply(active)
        await settle(relaunched)
        XCTAssertTrue(relaunchedHealth.startCalls.isEmpty)
        XCTAssertTrue(relaunchedLog.commands.isEmpty)

        // Relaunch: the phone already knows a Watch Health workout exists.
        let (known, knownLog, knownHealth) = healthStore("health.auto.relaunch.known")
        var started = active
        started.watchHealthStartedAt = now.addingTimeInterval(-600)
        known.apply(started)
        await settle(known)
        XCTAssertTrue(knownHealth.startCalls.isEmpty, "Never a silent second workout for the same session.")
        XCTAssertTrue(knownLog.commands.isEmpty)
        XCTAssertEqual(known.healthStatus, .notRecording, "Truthful when this Watch has nothing recording.")
        XCTAssertTrue(known.canStartHealthManually, "An explicit Record to Health stays available.")

        // Recovery still pending (cold launch): eligible, but waits.
        var inputs = WatchHealthAutoStart.Inputs(
            projection: active, displayActive: true, recoveryPending: true,
            liveCorrelationId: nil, storedCorrelationId: nil,
            startInFlight: false, alreadySaved: false, alreadyAttempted: false
        )
        XCTAssertEqual(WatchHealthAutoStart.decide(inputs), .wait)
        inputs.recoveryPending = false
        inputs.displayActive = false
        XCTAssertEqual(WatchHealthAutoStart.decide(inputs), .wait, "HealthKit starts with the app in front.")
        inputs.displayActive = true
        XCTAssertEqual(WatchHealthAutoStart.decide(inputs), .start(paused: false))
        inputs.alreadySaved = true
        XCTAssertEqual(WatchHealthAutoStart.decide(inputs), .none)
        inputs.alreadySaved = false
        inputs.liveCorrelationId = "another-session"
        XCTAssertEqual(WatchHealthAutoStart.decide(inputs), .none, "Never alongside another workout.")
    }

    // 3: a paused session establishes a paused workout; phone pause/resume follow.
    @MainActor
    func testPausedSessionStartsHealthPausedAndFollowsPhonePauseAndResume() async throws {
        let (store, log, health) = healthStore("health.auto.paused")
        var paused = try fixture("paused")
        paused.pausedAt = now.addingTimeInterval(-30)
        store.apply(paused)
        await settle(store)
        XCTAssertEqual(health.startCalls, [paused.sessionId])
        XCTAssertEqual(health.pauseCalls, 1)
        XCTAssertEqual(health.lifecycle, .paused)
        XCTAssertEqual(store.healthStatus, .paused)
        XCTAssertEqual(log.commands.map(\.kind), [.reportHealthStarted])

        var resumed = paused
        resumed.phase = .active
        resumed.pausedAt = nil
        resumed.revision += 1
        resumed.watchHealthStartedAt = health.startDate
        store.apply(resumed)                      // phone-originated resume
        XCTAssertEqual(health.resumeCalls, 1)
        XCTAssertEqual(health.lifecycle, .running)

        var pausedAgain = resumed
        pausedAgain.phase = .paused
        pausedAgain.revision += 1
        store.apply(pausedAgain)                  // phone-originated pause
        XCTAssertEqual(health.pauseCalls, 2)
        XCTAssertEqual(health.startCalls.count, 1)
    }

    // 4: terminal / cancelled / not-yet-running sessions never auto-start.
    @MainActor
    func testTerminalCancelledAndNonExecutingSessionsNeverStartHealth() async throws {
        for name in ["start", "finish-confirmation", "finishing", "summary"] {
            let (store, log, health) = healthStore("health.never.\(name)")
            store.apply(try fixture(name))
            await settle(store)
            XCTAssertTrue(health.startCalls.isEmpty, name)
            XCTAssertTrue(log.commands.isEmpty, name)
        }
        let (store, _, health) = healthStore("health.never.terminal")
        store.apply(.terminal(sessionId: "current", revision: 1, phase: .unavailable))
        store.apply(.terminal(sessionId: "gone", revision: 2, phase: .cancelled))
        await settle(store)
        XCTAssertTrue(health.startCalls.isEmpty)
    }

    // 4b: a Cancel that lands while the start is in flight discards it.
    @MainActor
    func testCancelArrivingDuringAutomaticStartDiscardsTheWorkoutAndReportsNothing() async throws {
        let (store, log, health) = healthStore("health.cancel.during.start")
        health.holdNextStart = true
        let active = try fixture("normal")
        store.apply(active)
        for _ in 0..<3 { await Task.yield() }
        XCTAssertEqual(health.startCalls, [active.sessionId])
        store.apply(.terminal(sessionId: active.sessionId, revision: active.revision + 1, phase: .cancelled))
        health.releaseStart()
        await settle(store)
        XCTAssertEqual(health.lifecycle, .cancelled)
        XCTAssertNil(health.recordingCorrelationId)
        XCTAssertFalse(log.commands.contains { $0.kind == .reportHealthStarted })
    }

    // 5: failure is visible, never loops, and an explicit retry succeeds once.
    @MainActor
    func testHealthStartFailureIsVisibleDoesNotLoopAndExplicitRetryStartsOnce() async throws {
        let (store, log, health) = healthStore("health.start.failure")
        health.failNextStart = true
        var active = try fixture("normal")
        store.apply(active)
        await settle(store)
        XCTAssertEqual(store.notice, .healthStartFailed)
        XCTAssertEqual(store.healthStatus, .failed)
        XCTAssertEqual(store.healthHeaderText, "HEALTH START FAILED")
        XCTAssertTrue(store.canStartHealthManually)
        XCTAssertTrue(log.commands.isEmpty, "A failed start is never reported as started.")

        active.revision += 1
        store.apply(active)
        await settle(store)
        XCTAssertEqual(health.startCalls.count, 1, "One automatic attempt; no retry loop.")

        store.retryHealthStart()
        await settle(store)
        XCTAssertEqual(health.startCalls.count, 2)
        XCTAssertEqual(health.authorizationPresentations, [.automatic, .direct])
        XCTAssertEqual(store.healthStatus, .recording)
        XCTAssertNil(store.notice)
        XCTAssertFalse(store.canStartHealthManually)
        XCTAssertEqual(log.commands.map(\.kind), [.reportHealthStarted])
    }

    // 7 (Watch half): a confirmed finish saves the auto-started workout exactly once.
    @MainActor
    func testFinishOfAnAutoStartedWorkoutSavesAndReportsExactlyOnce() async throws {
        let (store, log, health) = healthStore("health.finish.once")
        var active = try fixture("normal")
        store.apply(active)
        await settle(store)
        active.revision += 1
        active.watchHealthStartedAt = health.startDate
        try acknowledge(store, log.commands[0], projection: active)

        var finishing = try fixture("finishing")
        finishing.revision = active.revision + 1
        finishing.watchHealthStartedAt = health.startDate
        finishing.finish?.healthSaved = false
        store.apply(finishing)
        await settle(store)
        store.apply(finishing)
        await settle(store)

        XCTAssertEqual(health.finishCalls, [active.sessionId])
        let saveReports = log.commands.filter { $0.kind == .reportHealthSaved }
        XCTAssertEqual(saveReports.count, 1)
        XCTAssertEqual(saveReports.first?.finishOperationId, finishing.finish?.operationId)
        XCTAssertEqual(health.startCalls.count, 1)
    }

    // 8: the truthful Health status matrix.
    func testHealthStatusMatrixIsTruthful() {
        typealias L = WatchWorkoutHealthController.Lifecycle
        func status(_ lifecycle: L, recording: String? = nil, inFlight: Bool = false, failed: Bool = false) -> WatchHealthStatus {
            .of(lifecycle: lifecycle, recordingSessionId: recording, sessionId: "s1", startInFlight: inFlight, startFailed: failed)
        }
        XCTAssertEqual(status(.running, recording: "s1"), .recording)
        XCTAssertEqual(status(.paused, recording: "s1"), .paused)
        XCTAssertEqual(status(.running, recording: "other"), .notRecording, "Another session's workout is not this one's.")
        XCTAssertEqual(status(.idle), .notRecording)
        XCTAssertEqual(status(.saved), .notRecording)
        XCTAssertEqual(status(.cancelled), .notRecording)
        XCTAssertEqual(status(.authorizing), .starting)
        XCTAssertEqual(status(.starting), .starting)
        XCTAssertEqual(status(.idle, inFlight: true), .starting)
        XCTAssertEqual(status(.failed, failed: true), .failed)

        XCTAssertNil(WatchHealthStatus.recording.headerText)
        XCTAssertNil(WatchHealthStatus.paused.headerText)
        XCTAssertEqual(WatchHealthStatus.notRecording.headerText, "NOT RECORDING TO HEALTH")
        XCTAssertEqual(WatchHealthStatus.starting.headerText, "STARTING HEALTH…")
        XCTAssertEqual(WatchHealthStatus.failed.headerText, "HEALTH START FAILED")
        XCTAssertEqual(WatchHealthStatus.recording.authorityWarningText, "IPHONE UNAVAILABLE · HEALTH ON")
        XCTAssertEqual(WatchHealthStatus.paused.authorityWarningText, "IPHONE UNAVAILABLE · HEALTH ON")
        for off in [WatchHealthStatus.notRecording, .starting, .failed] {
            XCTAssertEqual(off.authorityWarningText, "IPHONE UNAVAILABLE · HEALTH OFF", "HEALTH ON only while recording.")
        }
    }

    // 9: metrics come only from the live builder; TIME stays the phone clock.
    @MainActor
    func testWorkoutMetricsComeOnlyFromTheLiveHealthWorkout() throws {
        let health = FakeWatchHealth(startDate: now)
        var values = WatchWorkoutMetricsPresentation(health: health)
        XCTAssertEqual(values, .init(health: health))
        XCTAssertEqual(values.activeCalories, "—")
        XCTAssertEqual(values.totalCalories, "—")
        XCTAssertEqual(values.heartRate, "—")

        health.activeCalories = 212.4
        health.currentHeartRateBPM = 131.6
        values = WatchWorkoutMetricsPresentation(health: health)
        XCTAssertEqual(values.activeCalories, "212 CAL")
        XCTAssertEqual(values.totalCalories, "—", "Total needs both active and basal energy.")
        XCTAssertEqual(values.heartRate, "132 BPM")
        health.basalCalories = 60
        XCTAssertEqual(WatchWorkoutMetricsPresentation(health: health).totalCalories, "272 CAL")

        var active = try fixture("normal")
        active.startedAt = now.addingTimeInterval(-600)
        active.pausedAt = nil
        active.accumulatedPausedSeconds = 0
        XCTAssertEqual(try XCTUnwrap(WatchWorkoutClock.sessionSeconds(active, at: now)), 600, accuracy: 0.001,
                       "TIME is the structured session clock, independent of HealthKit.")
    }

    // 10: an activation/reachability refresh never disables Complete Set.
    @MainActor
    func testReadOnlyRefreshNeverDisablesCompleteSet() throws {
        let (store, log, _) = healthStore("latency.refresh.lane")
        var active = try fixture("normal")
        active.watchHealthStartedAt = now           // isolate from the Health start
        store.apply(active)
        store.refresh()
        XCTAssertEqual(log.commands.map(\.kind), [.refreshProjection])
        XCTAssertNotNil(store.refreshInFlight)
        XCTAssertFalse(store.isMutationPending, "A read is not a mutation.")
        XCTAssertTrue(store.isCompleteSetAvailable)
        XCTAssertFalse(store.isWaitingForPhone(at: now.addingTimeInterval(60)))
        store.refresh()
        XCTAssertEqual(log.commands.count, 1, "One refresh in flight at a time.")
    }

    // 11: Complete Set racing a refresh is sent once, never lost or duplicated.
    @MainActor
    func testCompleteSetDuringRefreshIsSentOnceAndSettlesExactlyOnce() throws {
        let (store, log, _) = healthStore("latency.refresh.race")
        var active = try fixture("normal")
        active.watchHealthStartedAt = now
        store.apply(active)
        store.refresh()
        store.completeSet()
        XCTAssertEqual(log.commands.map(\.kind), [.refreshProjection, .completeSet])
        XCTAssertTrue(store.isMutationPending)

        try acknowledge(store, log.commands[0], status: .unchanged, projection: active)
        XCTAssertNil(store.refreshInFlight)
        XCTAssertTrue(store.isMutationPending, "The refresh reply never clears the in-flight mutation.")

        var advanced = active
        advanced.revision += 1
        advanced.completedSets += 1
        try acknowledge(store, log.commands[1], projection: advanced)
        XCTAssertFalse(store.isMutationPending)
        XCTAssertEqual(store.projection?.completedSets, advanced.completedSets)
        XCTAssertEqual(log.commands.filter { $0.kind == .completeSet }.count, 1)
    }

    // 12: a stale Complete Set is re-sent once only when it still targets the same set.
    @MainActor
    func testStaleCompleteSetIsResentOnceForTheSameSetAndNeverForAMovedTarget() throws {
        let (store, log, _) = healthStore("latency.stale")
        var active = try fixture("normal")
        active.watchHealthStartedAt = now
        store.apply(active)
        store.completeSet()
        let target = try XCTUnwrap(store.currentRow)

        // The phone edited something (revision moved); the same set is still next.
        var edited = active
        edited.revision += 1
        try acknowledge(store, log.commands[0], status: .stale, projection: edited)
        XCTAssertEqual(log.commands.map(\.kind), [.completeSet, .completeSet])
        XCTAssertNotEqual(log.commands[1].mutationId, log.commands[0].mutationId)
        XCTAssertEqual(log.commands[1].setId, target.setId)
        XCTAssertEqual(log.commands[1].expectedRevision, edited.revision)
        XCTAssertEqual(store.notice, .setPending)

        // Stale again: bounded, surfaced, not re-sent a third time.
        var editedAgain = edited
        editedAgain.revision += 1
        try acknowledge(store, log.commands[1], status: .stale, projection: editedAgain)
        XCTAssertEqual(log.commands.count, 2)
        XCTAssertEqual(store.notice, .staleRefreshed)

        // The phone completed that set itself: the target moved, so no re-send.
        let (other, otherLog, _) = healthStore("latency.stale.moved")
        other.apply(active)
        other.completeSet()
        var moved = active
        moved.revision += 1
        // The tapped set is now "previous" and the next set is the target.
        var done = try XCTUnwrap(moved.rows.first(where: \.isCompletionTarget))
        done.role = "previous"
        done.isCompletionTarget = false
        var next = done
        next.role = "current"
        next.setNumber += 1
        next.setId = "\(done.setId)-next"
        next.isCompletionTarget = true
        moved.rows = [done, next]
        moved.completedSets += 1
        try acknowledge(other, otherLog.commands[0], status: .stale, projection: moved)
        XCTAssertEqual(otherLog.commands.count, 1, "Never completes a set the Founder did not tap.")
        XCTAssertEqual(other.notice, .staleRefreshed)
    }

    // Instrumentation: activation -> refresh -> ack -> Complete Set enabled.
    @MainActor
    func testLatencyTraceMeasuresActivationToCompleteSetEnabled() {
        var trace = WatchWorkoutLatencyTrace()
        let t = Date(timeIntervalSince1970: 1_000)
        trace.record(.displayActive, at: t)
        trace.record(.reachable, at: t.addingTimeInterval(0.8))
        trace.record(.refreshIssued, at: t.addingTimeInterval(0.81))
        trace.record(.refreshAcknowledged, at: t.addingTimeInterval(1.4))
        let enabled = trace.record(.completeSetEnabled, at: t.addingTimeInterval(0.82))
        XCTAssertEqual(enabled.sinceActivation ?? -1, 0.82, accuracy: 0.0001)
        XCTAssertEqual(trace.interval(from: .displayActive, to: .reachable) ?? -1, 0.8, accuracy: 0.0001)
        XCTAssertEqual(trace.interval(from: .refreshIssued, to: .refreshAcknowledged) ?? -1, 0.59, accuracy: 0.0001)
        for index in 0..<100 { trace.record(.contextApplied, at: t.addingTimeInterval(Double(index))) }
        XCTAssertEqual(trace.entries.count, WatchWorkoutLatencyTrace.capacity, "Bounded.")
    }
}

// MARK: Build 87 workout reliability — Complete Set acknowledgement

extension WatchWorkoutFinishStateTests {
    @MainActor
    func testAContextNamingThePendingCompleteSetSettlesItWithoutWaitingForTheReply() throws {
        let (store, log, _) = healthStore("b87.context.ack")
        var active = try fixture("normal")
        active.watchHealthStartedAt = now
        store.apply(active)
        store.completeSet()
        let sent = try XCTUnwrap(log.commands.last)
        XCTAssertEqual(sent.kind, .completeSet)
        XCTAssertTrue(store.isMutationPending)

        var advanced = active
        advanced.revision += 1
        advanced.completedSets += 1
        advanced.lastAcknowledgedMutationId = sent.mutationId
        store.receiveApplicationContext([
            WatchWorkoutContract.applicationContextProjectionKey: try WatchWorkoutWireCodec.encode(advanced),
        ])
        XCTAssertFalse(store.isMutationPending, "The phone's context already proves the tap was applied.")
        XCTAssertNil(store.notice)
        XCTAssertEqual(store.projection?.completedSets, advanced.completedSets)
        XCTAssertTrue(store.latencyTrace.entries.contains { $0.event == .commandAcknowledgedByContext })

        // The late reply is harmless: nothing settles twice or re-sends.
        try acknowledge(store, sent, projection: advanced)
        XCTAssertFalse(store.isMutationPending)
        XCTAssertEqual(log.commands.filter { $0.kind == .completeSet }.count, 1)

        // A context naming a different mutation never settles a pending tap.
        store.completeSet()
        XCTAssertTrue(store.isMutationPending)
        var unrelated = advanced
        unrelated.revision += 1
        unrelated.lastAcknowledgedMutationId = "another-mutation"
        store.receiveApplicationContext([
            WatchWorkoutContract.applicationContextProjectionKey: try WatchWorkoutWireCodec.encode(unrelated),
        ])
        XCTAssertTrue(store.isMutationPending)
        XCTAssertEqual(store.notice, .setPending)
    }

    @MainActor
    func testACompleteSetTapThatCannotBeSentNeverClaimsSetPending() throws {
        let (store, _) = makeStore("b87.unsent")
        store.apply(try fixture("normal"))
        store.completeSet()
        XCTAssertEqual(store.connectionState, .phoneUnavailable)
        XCTAssertFalse(store.isMutationPending)
        XCTAssertNotEqual(store.notice, .setPending, "Nothing was sent, so nothing is pending.")
        XCTAssertTrue(store.latencyTrace.entries.contains { $0.event == .commandNotSent })

        // A tap while another command is in flight is likewise not claimed.
        let (busy, log, _) = healthStore("b87.unsent.busy")
        var active = try fixture("normal")
        active.watchHealthStartedAt = now
        busy.apply(active)
        busy.pauseOrResume()
        XCTAssertEqual(log.commands.map(\.kind), [.pause])
        busy.completeSet()
        XCTAssertEqual(log.commands.map(\.kind), [.pause])
        XCTAssertNotEqual(busy.notice, .setPending)
    }

    // MARK: Build 90

    /// Build 89 dropped the appearance slot on a live application-context
    /// delivery (only a relaunch picked it up). All three slots now reach the
    /// store.
    @MainActor
    func testLiveApplicationContextDeliveryForwardsTheAppearanceSlot() throws {
        let projection = try WatchWorkoutWireCodec.encode(try fixture("normal"))
        let slots = WatchWorkoutStore.forwardedApplicationContextSlots([
            WatchWorkoutContract.applicationContextProjectionKey: projection,
            WatchWorkoutContract.applicationContextAppearanceKey: "mineralLight",
        ])
        XCTAssertEqual(slots.projection, projection)
        XCTAssertNil(slots.dailyTotals)
        XCTAssertEqual(slots.appearance, "mineralLight")
        XCTAssertNil(WatchWorkoutStore.forwardedApplicationContextSlots([:]).appearance)
    }

    /// Founder Build 90 Option A: panel actions are centered in the free
    /// space below the content; overflow keeps the original 18 pt gap.
    func testPanelActionsAreTrueCenteredBelowTheContentAndOverflowKeepsTheGap() {
        // Content 100, actions 38, page 300: free = 300 - 100 - 18 - 38 = 144.
        let origin = WatchPanelActionLayout.actionsOriginY(contentHeight: 100, actionsHeight: 38, boundsHeight: 300)
        XCTAssertEqual(origin, 100 + 18 + 72)
        XCTAssertEqual(origin - (100 + 18), 300 - (origin + 38), "Equal space above and below the button.")
        XCTAssertEqual(WatchPanelActionLayout.actionsOriginY(contentHeight: 280, actionsHeight: 38, boundsHeight: 300), 298,
                       "Taller than the page: the 18 pt gap and scrolling, as before.")
    }
}

/// Build 91 (Founder D6): the single truthful "your Watch is ready for you"
/// cue. Driven through the real store with a fake transport; the haptic is
/// counted through `readyCueSinkForTesting`.
final class WatchReadyCueTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    final class Clock: @unchecked Sendable {
        var now: Date
        init(_ now: Date) { self.now = now }
    }

    final class Counter {
        var count = 0
        var commands: [WatchWorkoutCommand] = []
    }

    @MainActor
    private func makeStore(_ suite: String, clock: Clock, wipe: Bool = true) -> (WatchWorkoutStore, Counter) {
        let defaults = UserDefaults(suiteName: suite)!
        if wipe { defaults.removePersistentDomain(forName: suite) }
        let store = WatchWorkoutStore(session: nil, defaults: defaults, now: { clock.now })
        let counter = Counter()
        store.readyCueSinkForTesting = { counter.count += 1 }
        store.commandSinkForTesting = { counter.commands.append($0) }
        return (store, counter)
    }

    private func prepared(at preparedAt: Date?, session: String = "session-ready") throws -> WatchWorkoutProjection {
        var projection = try XCTUnwrap(WatchWorkoutPreviewFixtures.make("start")?.projection)
        projection.sessionId = session
        projection.preparedAt = preparedAt
        return projection
    }

    /// Prepared + confirmed reachable + active: Start is actionable.
    @MainActor
    private func present(_ store: WatchWorkoutStore, _ projection: WatchWorkoutProjection, _ counter: Counter? = nil) {
        store.apply(projection)
        store.refresh()
        if let counter { answerRefresh(store, counter) }
    }

    /// The phone answers the read-only refresh (no projection change), which
    /// clears the in-flight refresh so a later one can be sent.
    @MainActor
    private func answerRefresh(_ store: WatchWorkoutStore, _ counter: Counter) {
        guard let refresh = counter.commands.last(where: { $0.kind == .refreshProjection }) else { return }
        let ack = WatchWorkoutAcknowledgement(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: refresh.commandId,
            mutationId: refresh.mutationId, status: .unchanged, reason: nil, acknowledgedRevision: nil, projection: nil
        )
        store.receiveAcknowledgement(try! WatchWorkoutWireCodec.encode(ack))
    }

    @MainActor
    func testCuesExactlyOnceForANewPreparationDespiteReplayRefreshAndRedisplay() throws {
        let clock = Clock(now)
        let (store, counter) = makeStore("ready.once", clock: clock)
        let projection = try prepared(at: now.addingTimeInterval(-5))
        present(store, projection)
        XCTAssertEqual(store.presentedPhase, .prepared)
        XCTAssertTrue(store.isStartWorkoutEnabled)
        XCTAssertEqual(counter.count, 1, "Ready on screen with Start enabled: one cue.")

        store.apply(projection)
        store.receiveApplicationContext([
            WatchWorkoutContract.applicationContextProjectionKey: try WatchWorkoutWireCodec.encode(projection),
        ])
        store.setDisplayActive(false)
        store.setDisplayActive(true)
        XCTAssertEqual(counter.count, 1, "Replay, refresh and redisplay never repeat the cue.")
    }

    @MainActor
    func testColdLaunchOfTheSamePreparationDoesNotReplayTheCue() throws {
        let clock = Clock(now)
        let projection = try prepared(at: now.addingTimeInterval(-5))
        let (first, firstCounter) = makeStore("ready.cold", clock: clock)
        present(first, projection)
        XCTAssertEqual(firstCounter.count, 1)

        clock.now = now.addingTimeInterval(30)
        let (relaunched, counter) = makeStore("ready.cold", clock: clock, wipe: false)
        present(relaunched, projection)
        XCTAssertEqual(counter.count, 0, "The cued lifecycle is persisted across a relaunch.")
    }

    @MainActor
    func testANewPreparationOfTheSameSessionCuesAgain() throws {
        let clock = Clock(now)
        let (store, counter) = makeStore("ready.new", clock: clock)
        present(store, try prepared(at: now.addingTimeInterval(-5)), counter)
        XCTAssertEqual(counter.count, 1)

        clock.now = now.addingTimeInterval(90)
        var again = try prepared(at: now.addingTimeInterval(80))
        again.revision += 2
        store.apply(again)
        XCTAssertEqual(counter.count, 1, "A new context alone is passive (reachability not confirmed).")
        store.refresh()
        XCTAssertEqual(counter.count, 2, "A genuinely new preparation gets its own single cue.")
    }

    @MainActor
    func testStalePreparationNeverCues() throws {
        let clock = Clock(now)
        let (store, counter) = makeStore("ready.stale", clock: clock)
        present(store, try prepared(at: now.addingTimeInterval(-(WatchReadyCue.freshness + 1))))
        XCTAssertEqual(store.presentedPhase, .prepared)
        XCTAssertEqual(counter.count, 0)
    }

    @MainActor
    func testAPreparationWithoutPreparedAtNeverCues() throws {
        let clock = Clock(now)
        let (store, counter) = makeStore("ready.legacy", clock: clock)
        present(store, try prepared(at: nil))
        XCTAssertEqual(counter.count, 0, "An older phone cannot prove freshness: no cue.")
    }

    @MainActor
    func testInactiveAppCuesOnActivationOnlyWhileFresh() throws {
        let clock = Clock(now)
        let (store, counter) = makeStore("ready.inactive", clock: clock)
        store.setDisplayActive(false)
        present(store, try prepared(at: now))
        XCTAssertEqual(counter.count, 0, "Never while the app is not presenting it.")
        clock.now = now.addingTimeInterval(20)
        store.setDisplayActive(true)
        XCTAssertEqual(counter.count, 1, "Cues when the Watch actually presents it.")

        clock.now = now
        let (late, lateCounter) = makeStore("ready.inactive.late", clock: clock)
        late.setDisplayActive(false)
        present(late, try prepared(at: now, session: "session-late"))
        clock.now = now.addingTimeInterval(WatchReadyCue.freshness + 5)
        late.setDisplayActive(true)
        XCTAssertEqual(lateCounter.count, 0, "Opening the app after the window: no cue.")
    }

    @MainActor
    func testReachabilityAloneOrAnActiveWorkoutNeverCues() throws {
        let clock = Clock(now)
        let (store, counter) = makeStore("ready.reachability", clock: clock)
        store.refresh()
        XCTAssertEqual(counter.count, 0)
        var active = try XCTUnwrap(WatchWorkoutPreviewFixtures.make("normal")?.projection)
        active.preparedAt = now
        present(store, active)
        XCTAssertEqual(counter.count, 0)
    }

    @MainActor
    func testUseWithoutWatchNeverCues() throws {
        let clock = Clock(now)
        let (store, counter) = makeStore("ready.decline", clock: clock)
        store.setDisplayActive(false)
        store.apply(try prepared(at: now))
        // "Use without Watch": the phone withdraws the preparation and
        // starts on iPhone before the Watch ever presents it.
        var started = try XCTUnwrap(WatchWorkoutPreviewFixtures.make("normal")?.projection)
        started.sessionId = "session-ready"
        started.revision += 5
        store.apply(started)
        store.setDisplayActive(true)
        store.refresh()
        XCTAssertEqual(counter.count, 0)
    }

    @MainActor
    func testCueIsNotStartAndStartStaysAnExplicitTap() throws {
        let clock = Clock(now)
        let (store, counter) = makeStore("ready.start", clock: clock)
        present(store, try prepared(at: now))
        XCTAssertEqual(counter.count, 1)
        XCTAssertTrue(counter.commands.allSatisfy { $0.kind == .refreshProjection },
                      "The cue sends nothing: no start, no mutation.")
        XCTAssertEqual(store.presentedPhase, .prepared, "Cueing never starts the workout.")
        store.startPreparedWorkout()
        XCTAssertEqual(counter.commands.last?.kind, .startPreparedWorkout, "Start is still the explicit tap.")
        XCTAssertFalse(store.isStartWorkoutEnabled, "A pending start disables Start until the phone answers.")
        XCTAssertEqual(counter.count, 1)
    }

    func testDecisionRules() {
        let key = WatchReadyCue.lifecycleKey(sessionId: "s", preparedAt: now)
        func decide(_ phase: WatchWorkoutStore.PresentedPhase = .prepared, start: Bool = true, active: Bool = true,
                    at: Date? = nil, last: String? = nil) -> String? {
            WatchReadyCue.decide(phase: phase, isStartEnabled: start, isDisplayActive: active, sessionId: "s",
                                 preparedAt: now, now: at ?? now, lastCuedKey: last)
        }
        XCTAssertEqual(decide(), key)
        XCTAssertNil(decide(last: key), "Same lifecycle: no repeat.")
        XCTAssertNil(decide(.active))
        XCTAssertNil(decide(.none))
        XCTAssertNil(decide(start: false), "Start not actionable (pending or unreachable).")
        XCTAssertNil(decide(active: false))
        XCTAssertNotNil(decide(at: now.addingTimeInterval(WatchReadyCue.freshness)))
        XCTAssertNil(decide(at: now.addingTimeInterval(WatchReadyCue.freshness + 1)))
        XCTAssertNotNil(decide(at: now.addingTimeInterval(-30)), "Small phone-ahead skew is tolerated.")
        XCTAssertNil(decide(at: now.addingTimeInterval(-(WatchReadyCue.futureSkew + 1))))
        XCTAssertNil(WatchReadyCue.decide(phase: .prepared, isStartEnabled: true, isDisplayActive: true, sessionId: "s",
                                          preparedAt: nil, now: now, lastCuedKey: nil))
    }

    func testPreparedAtIsAdditiveAndBackwardDecodable() throws {
        var projection = try XCTUnwrap(WatchWorkoutPreviewFixtures.make("start")?.projection)
        projection.preparedAt = now
        let data = try WatchWorkoutWireCodec.encode(projection)
        XCTAssertEqual(try WatchWorkoutWireCodec.decode(WatchWorkoutProjection.self, from: data).preparedAt, now)

        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        object.removeValue(forKey: "preparedAt")
        let legacy = try JSONSerialization.data(withJSONObject: object)
        let decoded = try WatchWorkoutWireCodec.decode(WatchWorkoutProjection.self, from: legacy)
        XCTAssertNil(decoded.preparedAt, "An older phone omits it.")
        XCTAssertEqual(decoded.phase, .prepared)
    }
}
