import XCTest
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
        return (WatchWorkoutStore(session: nil, defaults: defaults, now: { now }), defaults)
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
