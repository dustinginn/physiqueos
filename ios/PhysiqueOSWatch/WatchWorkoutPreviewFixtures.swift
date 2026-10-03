#if DEBUG
import Foundation

/// Launch-only rendering harness for screenshots of the actual shipping
/// SwiftUI surfaces. It is compiled out of Release and never opens a second
/// authority path or accepts mutations.
enum WatchWorkoutPreviewFixtures {
    struct Fixture {
        var projection: WatchWorkoutProjection
        var connectionState: WatchWorkoutStore.ConnectionState = .reachable
        var notice: WatchWorkoutStore.Notice?
        var heartRate: Double? = 128
        var activeCalories: Double? = 184
        var basalCalories: Double? = 46
        var averageHeartRate: Double? = 121
        var page: WatchWorkoutStore.Page = .workout
        var localFinishConfirmation = false
        var dailyTotals: WatchDailyTotals? = WatchWorkoutPreviewFixtures.totals()
        var finishingObservedAt: Date?
        var pendingCommand: WatchWorkoutCommand?
        var pendingIssuedAt: Date?
    }

    static func totals(
        offline: Bool = false,
        refreshedMinutesAgo: Double = 2,
        localDate: String = WatchDailyTotalsPresentation.localDateKey(Date())
    ) -> WatchDailyTotals {
        .init(
            schemaVersion: WatchDailyTotals.schemaVersion,
            localDate: localDate,
            activeCalories: 912.6,
            nutritionCalories: 2_463.3,
            isActivityPartialDay: true,
            refreshedAt: Date().addingTimeInterval(-refreshedMinutesAgo * 60),
            isOffline: offline,
            writtenAt: Date().addingTimeInterval(-refreshedMinutesAgo * 60)
        )
    }

    static func make(_ name: String) -> Fixture? {
        var fixture = Fixture(projection: projection())
        switch name {
        case "start":
            fixture.projection.phase = .prepared
            fixture.projection.completedSets = 0
            fixture.projection.rows = []
            fixture.projection.canCompleteSet = false
            fixture.projection.elapsedWorkoutSeconds = nil
        case "normal", "metrics", "always-on", "daily-totals", "geometry":
            break
        case "daily-totals-stale":
            fixture.dailyTotals = totals(offline: true, refreshedMinutesAgo: 47)
        case "daily-totals-missing":
            fixture.dailyTotals = totals(localDate: "2000-01-01")
        case "controls":
            fixture.page = .controls
        case "controls-paused":
            fixture.page = .controls
            fixture.projection.phase = .paused
            fixture.projection.canCompleteSet = false
            fixture.projection.pausedAt = Date().addingTimeInterval(-35)
        case "controls-finish-confirmation":
            fixture.page = .controls
            fixture.projection.phase = .finishConfirmation
            fixture.projection.finishEligibility = .confirmable
            fixture.projection.canCompleteSet = false
            fixture.projection.rest = nil
            fixture.localFinishConfirmation = true
        case "finish-confirmation":
            fixture.projection.completedSets = fixture.projection.totalSets
            fixture.projection.phase = .finishConfirmation
            fixture.projection.finishEligibility = .confirmable
            fixture.projection.canCompleteSet = false
            fixture.projection.rest = nil
            fixture.localFinishConfirmation = true
        case "finish-confirmation-waiting":
            fixture.projection.completedSets = fixture.projection.totalSets
            fixture.projection.canCompleteSet = false
            fixture.localFinishConfirmation = true
            fixture.connectionState = .phoneUnavailable
        case "final-set":
            fixture.projection.completedSets = 4
            fixture.projection.rows = [
                row(role: "previous", name: "Incline Press", set: 2, count: 3, load: "180", reps: "8", target: false),
                row(role: "current", name: "Incline Press", set: 3, count: 3, load: "185", reps: "8", target: true),
            ]
        case "final-workout":
            fixture.projection.completedSets = fixture.projection.totalSets
            fixture.projection.rows = [
                row(role: "previous", name: "Cable Row", set: 3, count: 3, load: "150", reps: "10", target: false)
            ]
            fixture.projection.canCompleteSet = false
            fixture.projection.isFinalPlannedSetTransition = true
        case "paused":
            fixture.projection.phase = .paused
            fixture.projection.canCompleteSet = false
            fixture.projection.pausedAt = Date().addingTimeInterval(-35)
            fixture.projection.rest = .init(
                id: "rest-paused", mode: .stopwatch,
                startedAt: Date().addingTimeInterval(-82), endsAt: nil,
                frozenElapsedSeconds: 47, frozenRemainingSeconds: nil
            )
        case "countdown":
            fixture.projection.rest = .init(
                id: "rest-countdown", mode: .countdown,
                startedAt: Date().addingTimeInterval(-20),
                endsAt: Date().addingTimeInterval(70),
                frozenElapsedSeconds: nil, frozenRemainingSeconds: nil
            )
        case "offline":
            fixture.connectionState = .phoneUnavailable
            fixture.projection.stalenessReason = .phoneUnreachable
        case "stale":
            fixture.notice = .staleRefreshed
            fixture.projection.stalenessReason = .revisionMismatch
        case "superset":
            fixture.projection.rows = [
                row(role: "current", name: "DB Curl", set: 2, count: 3, load: "35", reps: "10", target: true, superset: "SUPERSET · ROUND 2"),
                row(role: "upNext", name: "Rope Pressdown", set: 2, count: 3, load: "55", reps: "12", target: false, superset: "B"),
            ]
        case "single-set":
            fixture.projection.totalSets = 1
            fixture.projection.completedSets = 0
            fixture.projection.rows = [
                row(role: "current", name: "Face Pull", set: 1, count: 1, load: "45", reps: "15", target: true)
            ]
        case "finishing", "finishing-waiting":
            fixture.projection.phase = .finishing
            fixture.projection.canCompleteSet = false
            fixture.projection.rest = nil
            fixture.projection.finishedAt = Date().addingTimeInterval(-40)
            fixture.projection.finish = .init(
                operationId: "finish-preview", healthSaved: true, healthFailed: false,
                serverCommitted: false, serverPending: true, correlationPending: true,
                serverWaitingForNetwork: name == "finishing-waiting"
            )
            fixture.finishingObservedAt = Date().addingTimeInterval(name == "finishing-waiting" ? -45 : -3)
        case "summary":
            fixture.projection.phase = .committed
            fixture.projection.completedSets = fixture.projection.totalSets
            fixture.projection.rows = []
            fixture.projection.canCompleteSet = false
            fixture.projection.finishEligibility = .unavailable
            fixture.projection.finish = .init(
                operationId: "finish-preview", healthSaved: true, healthFailed: false,
                serverCommitted: true, serverPending: false, correlationPending: false
            )
            fixture.projection.summary = .init(
                activeDurationSeconds: 3_245, completedSets: 6,
                volume: 8_760, authoritativePRCount: 2
            )
            fixture.projection.finishedAt = Date().addingTimeInterval(-60)
        default:
            return nil
        }
        return fixture
    }

    private static func projection() -> WatchWorkoutProjection {
        .init(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            sessionId: "11111111-1111-4111-8111-111111111111",
            revision: 12,
            phase: .active,
            title: "Push · Pull",
            completedSets: 2,
            totalSets: 6,
            rows: [
                row(role: "previous", name: "Bench Press", set: 1, count: 3, load: "180", reps: "8", target: false),
                row(role: "current", name: "Bench Press", set: 2, count: 3, load: "185", reps: "8", target: true),
            ],
            rest: .init(
                id: "rest-normal", mode: .stopwatch,
                startedAt: Date().addingTimeInterval(-47), endsAt: nil,
                frozenElapsedSeconds: nil, frozenRemainingSeconds: nil
            ),
            canCompleteSet: true,
            finishEligibility: .confirmationRequired,
            isFinalPlannedSetTransition: false,
            startedAt: Date().addingTimeInterval(-1_505),
            pausedAt: nil,
            accumulatedPausedSeconds: 92,
            elapsedWorkoutSeconds: 1_413,
            stalenessReason: nil,
            lastAcknowledgedMutationId: "preview",
            metrics: nil
        )
    }

    private static func row(
        role: String,
        name: String,
        set: Int,
        count: Int,
        load: String,
        reps: String,
        target: Bool,
        superset: String? = nil
    ) -> WatchWorkoutProjection.Row {
        .init(
            role: role,
            exerciseId: "exercise-\(name)",
            exerciseName: name,
            setId: "set-\(name)-\(set)",
            setNumber: set,
            setCount: count,
            valueText: "\(reps) × \(load) lb",
            loadText: load,
            repsText: reps,
            supersetLabel: superset,
            partnerName: nil,
            isCompletionTarget: target
        )
    }
}
#endif
