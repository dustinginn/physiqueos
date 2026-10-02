import Foundation
import UIKit
import WidgetKit

actor HomeWidgetRefreshRelay {
    private var handler: (@Sendable (Bool) async -> Void)?

    func install(_ handler: @escaping @Sendable (Bool) async -> Void) {
        self.handler = handler
    }

    /// `reloadingReads` bypasses the short-lived read cache for the widget's
    /// canonical reads: a HealthKit ingest or an explicit widget refresh must
    /// not stamp a pre-ingest cached copy as freshly read.
    func request(reloadingReads: Bool = false) async {
        await handler?(reloadingReads)
    }
}

@MainActor
final class HomeWidgetAccountScopeStore {
    private let defaults: UserDefaults
    private let keyPrefix: String

    init(defaults: UserDefaults = .standard, keyPrefix: String = "physiqueos.homeWidget.accountScope.v1") {
        self.defaults = defaults
        self.keyPrefix = keyPrefix
    }

    func scope(for authority: NativeAPIEnvironment) -> String {
        let key = "\(keyPrefix).\(authority.rawValue)"
        if let existing = defaults.string(forKey: key), !existing.isEmpty { return existing }
        let created = UUID().uuidString.lowercased()
        defaults.set(created, forKey: key)
        return created
    }

    /// A credential boundary (pair, revoke, rejected refresh) starts a new
    /// opaque scope, so no earlier session's snapshot can be read back or
    /// merged into the next session's totals.
    func rotate(for authority: NativeAPIEnvironment) {
        defaults.removeObject(forKey: "\(keyPrefix).\(authority.rawValue)")
    }
}

enum HomeWidgetSnapshotProjection {
    static func make(
        authority: NativeAPIEnvironment,
        accountScope: String,
        localDate: String,
        timeZone: TimeZone,
        logRows: [LoggedTodayRow],
        nutritionDay: NutritionDayRecord?,
        activityDay: ActivityDayRecord?,
        activeWorkout: TrainingLoggerDraft?,
        now: Date,
        refreshState: HomeWidgetRefreshState = .success,
        lastSuccessfulReadAt: Date? = nil
    ) -> HomeWidgetSnapshot {
        let trainingRow = logRows.first { $0.kind == .training }
        let training = trainingRow.map { row in
            let present = row.summary != "Nothing logged yet"
            return HomeWidgetTrainingSummary(
                summary: bounded(row.summary, limit: 150),
                lines: Array(row.displayLines.prefix(2)).map { bounded($0.summary, limit: 100) },
                // Source/provenance belongs in the app, not the widget.
                context: nil,
                isPresent: present
            )
        }
        let exactNutrition = nutritionDay?.date == localDate ? nutritionDay : nil
        let nutrition = exactNutrition.map {
            HomeWidgetNutritionSummary(
                calories: $0.totals.calories,
                proteinG: $0.totals.proteinG,
                carbsG: $0.totals.carbsG,
                fatG: $0.totals.fatG
            )
        }
        let exactActivity = activityDay?.date == localDate ? activityDay : nil
        let activity = exactActivity.map {
            HomeWidgetActivitySummary(
                activeCalories: $0.activeCalories,
                isPartialDay: $0.isInProgress || $0.coverage == "partial_day"
            )
        }
        let weightRow = logRows.first { $0.kind == .weight && $0.summary != "Nothing logged yet" }
        let weight = weightRow.map { HomeWidgetWeightSummary(displayValue: bounded($0.summary, limit: 40)) }
        let workout = workoutProjection(activeWorkout)
        let success = lastSuccessfulReadAt ?? (refreshState == .success ? now : nil)
        return HomeWidgetSnapshot(
            authority: authority.rawValue,
            accountScope: accountScope,
            localDate: localDate,
            timeZoneIdentifier: timeZone.identifier,
            writtenAt: HomeWidgetSnapshotClock.string(from: now),
            lastSuccessfulReadAt: success.map(HomeWidgetSnapshotClock.string),
            refreshState: refreshState,
            training: training,
            nutrition: nutrition,
            activity: activity,
            weight: weight,
            workout: workout
        )
    }

    static func workoutProjection(_ draft: TrainingLoggerDraft?) -> HomeWidgetWorkoutSummary {
        guard let draft else { return .none }
        let names = draft.exercises.prefix(2).map(\.name)
        let label = names.isEmpty ? "Workout in progress" : names.joined(separator: " + ")
        return HomeWidgetWorkoutSummary(
            state: .active,
            sessionId: draft.id,
            label: bounded(label, limit: 60),
            completedSets: draft.completedSetCount,
            totalSets: draft.totalSetCount
        )
    }

    private static func bounded(_ value: String, limit: Int) -> String {
        String(value.prefix(limit))
    }
}

@MainActor
final class HomeWidgetSnapshotCoordinator {
    private unowned let environment: AppEnvironment
    private let store: HomeWidgetSnapshotFileStore?
    private let accountScopes: HomeWidgetAccountScopeStore
    private let now: () -> Date
    private let timeZone: () -> TimeZone
    private let reload: () -> Void
    private let isProtectedDataAvailable: () -> Bool
    private var isRefreshing = false
    private var refreshPending = false
    private var reloadPending = false
    /// Incremented at every session boundary. A refresh that started under an
    /// earlier session never writes its (old-session) result afterwards.
    private var sessionGeneration = 0

    /// Production reads behind the widget that are served from the short-lived
    /// read cache. Activity already reads with `.reload`.
    static let reloadedProductionResources: Set<String> = ["evidence-review-queue", "weight", "nutrition"]

    init(
        environment: AppEnvironment,
        store: HomeWidgetSnapshotFileStore? = HomeWidgetSnapshotFileStore.shared(),
        accountScopes: HomeWidgetAccountScopeStore = HomeWidgetAccountScopeStore(),
        now: @escaping () -> Date = Date.init,
        timeZone: @escaping () -> TimeZone = { DailyDriverLocalDay.currentDeviceTimeZone() },
        reload: @escaping () -> Void = { WidgetCenter.shared.reloadTimelines(ofKind: HomeWidgetContract.kind) },
        isProtectedDataAvailable: @escaping () -> Bool = { UIApplication.shared.isProtectedDataAvailable }
    ) {
        self.environment = environment
        self.store = store
        self.accountScopes = accountScopes
        self.now = now
        self.timeZone = timeZone
        self.reload = reload
        self.isProtectedDataAvailable = isProtectedDataAvailable
    }

    func refreshCanonicalSnapshot(reloadingReads: Bool = false) async {
        if reloadingReads { reloadPending = true }
        if isRefreshing {
            refreshPending = true
            return
        }
        isRefreshing = true
        defer { isRefreshing = false }
        repeat {
            refreshPending = false
            let reloading = reloadPending
            reloadPending = false
            await performCanonicalRefresh(reloadingReads: reloading)
        } while refreshPending
    }

    private func performCanonicalRefresh(reloadingReads: Bool) async {
        guard let store else { return }
        let authority = environment.nativeAuthority
        // A locked background launch (HealthKit delivery, a notification or
        // Live Activity action) cannot read the when-unlocked credential.
        // That is not an offline Server: keep the last snapshot as written
        // and refresh again when protected data becomes available.
        if authority == .founderProduction, !isProtectedDataAvailable() {
            // Keep an owed cache bypass for the refresh after unlock.
            if reloadingReads { reloadPending = true }
            return
        }
        let generation = sessionGeneration
        let accountScope = accountScopes.scope(for: authority)
        let zone = timeZone()
        let instant = now()

        do {
            if reloadingReads, authority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(
                    Self.reloadedProductionResources,
                    retainingLastKnown: true
                )
            }
            let log = try await environment.logAPI.fetchLog()
            var nutritionDay: NutritionDayRecord?
            var activityDay: ActivityDayRecord?
            var nutritionFailed = false
            var activityFailed = false
            do {
                let landing = try await environment.nutritionAPI.fetchNutritionLanding(scope: .all)
                nutritionDay = landing.nutritionHistory.first { $0.date == log.localDate }
            } catch {
                nutritionFailed = true
            }
            do {
                activityDay = try await environment.activityAPI.fetchActivityDay(date: log.localDate)
            } catch {
                activityFailed = true
            }

            // An authority switch can happen while the Server reads are in
            // flight. The new authority clears the file and requests another
            // pass; the old pass must never repopulate it.
            guard environment.nativeAuthority == authority, sessionGeneration == generation else { return }
            let activeWorkout = environment.trainingSessionAuthority(for: authority).activeLiveSession(at: now())
            let previous = store.read(authority: authority.rawValue, accountScope: accountScope)
            let fullySuccessful = !nutritionFailed && !activityFailed
            var snapshot = HomeWidgetSnapshotProjection.make(
                authority: authority,
                accountScope: accountScope,
                localDate: log.localDate,
                timeZone: zone,
                logRows: log.loggedToday,
                nutritionDay: nutritionDay,
                activityDay: activityDay,
                activeWorkout: activeWorkout,
                now: instant,
                refreshState: fullySuccessful ? .success : .offline,
                lastSuccessfulReadAt: fullySuccessful ? instant : previous?.lastSuccessfulReadAt.flatMap(HomeWidgetSnapshotClock.date)
            )
            if let previous, previous.localDate == log.localDate {
                if nutritionFailed { snapshot.nutrition = previous.nutrition }
                if activityFailed { snapshot.activity = previous.activity }
            }
            try store.write(snapshot)
            reload()
        } catch {
            guard environment.nativeAuthority == authority, sessionGeneration == generation else { return }
            if Self.endsSession(error) {
                // No paired session: the previous session's totals must not
                // stay on the Home Screen as "offline".
                endSession(for: authority)
                return
            }
            let activeWorkout = environment.trainingSessionAuthority(for: authority).activeLiveSession(at: now())
            let previous = store.read(authority: authority.rawValue, accountScope: accountScope)
            if var previous {
                previous.writtenAt = HomeWidgetSnapshotClock.string(from: instant)
                previous.refreshState = .offline
                previous.workout = HomeWidgetSnapshotProjection.workoutProjection(activeWorkout)
                try? store.write(previous)
            } else {
                let day = DailyDriverLocalDay.resolve(at: instant, in: zone)
                let empty = HomeWidgetSnapshot(
                    authority: authority.rawValue,
                    accountScope: accountScope,
                    localDate: day.dateKey,
                    timeZoneIdentifier: zone.identifier,
                    writtenAt: HomeWidgetSnapshotClock.string(from: instant),
                    lastSuccessfulReadAt: nil,
                    refreshState: .failed,
                    training: nil,
                    nutrition: nil,
                    activity: nil,
                    weight: nil,
                    workout: HomeWidgetSnapshotProjection.workoutProjection(activeWorkout)
                )
                try? store.write(empty)
            }
            reload()
        }
    }

    func refreshWorkoutProjection() {
        guard let store else { return }
        let authority = environment.nativeAuthority
        let accountScope = accountScopes.scope(for: authority)
        let instant = now()
        let activeWorkout = environment.trainingSessionAuthority(for: authority).activeLiveSession(at: instant)
        guard var snapshot = store.read(authority: authority.rawValue, accountScope: accountScope) else {
            Task { await refreshCanonicalSnapshot() }
            return
        }
        let workout = HomeWidgetSnapshotProjection.workoutProjection(activeWorkout)
        // Set edits do not change the widget's projection; only a real change
        // rewrites the shared file and asks WidgetKit for a reload.
        guard snapshot.workout != workout else { return }
        snapshot.workout = workout
        snapshot.writtenAt = HomeWidgetSnapshotClock.string(from: instant)
        try? store.write(snapshot)
        reload()
    }

    func clear() {
        try? store?.clear()
        reload()
    }

    /// Pairing, revocation, or a rejected refresh credential for `authority`:
    /// remove the shared snapshot and start a new opaque account scope.
    func endSession(for authority: NativeAPIEnvironment) {
        accountScopes.rotate(for: authority)
        sessionGeneration += 1
        // The next refresh must not be served the ended session's cached
        // reads from the short-lived read cache.
        reloadPending = true
        guard environment.nativeAuthority == authority else { return }
        clear()
    }

    nonisolated static func endsSession(_ error: Error) -> Bool {
        switch error {
        case ProductionNativeError.notPaired, ProductionNativeError.reconnectRequired:
            return true
        case FounderServerError.notPaired, FounderServerError.deviceOrSessionRevoked:
            return true
        default:
            return false
        }
    }
}
