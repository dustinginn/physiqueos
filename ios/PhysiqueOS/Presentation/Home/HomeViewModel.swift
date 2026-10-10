import Foundation
import os

/// Loads the Home read model through the injected `HomeAPI` seam and owns its
/// presentation state. The production transport owns authentication, request
/// coalescing and persistence; this model only arbitrates lifecycle results
/// and labels a persisted snapshot as last-known rather than authoritative.
@Observable
@MainActor
final class HomeViewModel {
    enum LoadTrigger: String, Sendable {
        case automatic
        case manualRefresh = "manual-refresh"
    }
    enum LoadState: Equatable {
        case loading
        case loaded(HomeReadModel)
        case failed(String)
        case reconnectRequired
    }

    private(set) var state: LoadState = .loading
    /// Non-nil while `state` shows the device's last-known Home (the
    /// Server's `generatedAt` of that snapshot) instead of an authoritative
    /// read from this session. Completion is disabled and notifications are
    /// not reconciled from it.
    private(set) var lastKnownGeneratedAt: String?
    private(set) var lastKnownGeneratedDate: Date?
    /// The authoritative refresh behind a last-known Home failed.
    private(set) var lastKnownRefreshFailed = false
    var isShowingLastKnown: Bool { lastKnownGeneratedAt != nil }
    /// Home can be asked to load by both view appearance and foreground
    /// activation during the same startup. Those requests are intentionally
    /// allowed to overlap, but only the newest request may publish state: an
    /// older cancellation/network result must not briefly replace a healthy
    /// startup that is still in flight.
    private var latestLoadRequestID = 0
    private let api: HomeAPI
    /// The shared Priority engine — `todaysFocus` is computed from here,
    /// not from the static Home fixture, so it can never drift from what
    /// the Priority detail screen and Morning Check-In show for the same
    /// occurrence ids (see `PriorityReadModel.swift`'s doc comment).
    private let priorityStore: LoggingSandboxStore
    /// The shared Goals engine — after a fixture Goal Transition, the
    /// active primary goal's identity can change (a new goal id replaces
    /// the completed one). Home's primary Goal row is projected from here
    /// rather than the static Home fixture so it never points at a goal
    /// id that no longer exists.
    private let goalsSandboxStore: GoalsSandboxStore
    /// The same Briefing fixture provider History and Detail read through —
    /// Home's briefing card is a *projection* over that one published
    /// collection (`latestForHome`), never a second Home-only Briefing
    /// fixture (see `BriefingSandboxStore.swift`'s doc comment).
    private let briefingStore: BriefingSandboxStore
    private let appliesSandboxProjections: Bool

    init(
        api: HomeAPI,
        priorityStore: LoggingSandboxStore,
        goalsSandboxStore: GoalsSandboxStore,
        briefingStore: BriefingSandboxStore,
        appliesSandboxProjections: Bool = true
    ) {
        self.api = api
        self.priorityStore = priorityStore
        self.goalsSandboxStore = goalsSandboxStore
        self.briefingStore = briefingStore
        self.appliesSandboxProjections = appliesSandboxProjections
    }

    /// Hand canonical reminders to iOS before unrelated speculative reads.
    /// Prefetch may take longer than a nearby reminder's remaining lead time.
    func loadAndReconcileBeforePrefetch(
        trigger: LoadTrigger = .automatic,
        reconcileNotifications: () async -> Void,
        prefetch: () async -> Void
    ) async {
        await load(trigger: trigger)
        await reconcileNotifications()
        await prefetch()
    }

    func load(now: Date = Date(), trigger: LoadTrigger = .automatic) async {
        latestLoadRequestID &+= 1
        let requestID = latestLoadRequestID
        let priorState = HomeLoadDiagnostics.describe(state)
        let startedAt = ContinuousClock.now

        // Cold launch only: paint the last authoritative Home immediately,
        // then replace it with this session's read below.
        if case .loading = state, !appliesSandboxProjections, let snapshot = await api.lastKnownHome() {
            guard requestID == latestLoadRequestID, !Task.isCancelled else { return }
            var home = snapshot.home
            for index in home.todaysFocus.indices { home.todaysFocus[index].completable = false }
            state = .loaded(home)
            lastKnownGeneratedAt = snapshot.generatedAt
            lastKnownGeneratedDate = snapshot.generatedDate
            HomeLoadDiagnostics.record(
                id: requestID, trigger: trigger, outcome: "last-known", category: nil,
                prior: priorState, startedAt: startedAt
            )
        }
        do {
            var home = try await api.fetchHome()
            if appliesSandboxProjections {
                home.todaysFocus = Self.visiblePriorities(priorityStore.todaysPriorities(now: now))
                if let activeGoal = goalsSandboxStore.hub.activeGoal {
                    home.goals = Self.projectGoals(home.goals, from: activeGoal)
                }
                home.briefingCards = Self.projectBriefingCards(from: briefingStore.latestForHome(now: now))
            }
            guard requestID == latestLoadRequestID, !Task.isCancelled else {
                HomeLoadDiagnostics.record(
                    id: requestID, trigger: trigger, outcome: "discarded", category: "superseded-or-cancelled",
                    prior: priorState, startedAt: startedAt
                )
                return
            }
            state = .loaded(home)
            lastKnownGeneratedAt = nil
            lastKnownGeneratedDate = nil
            lastKnownRefreshFailed = false
            HomeLoadDiagnostics.record(
                id: requestID, trigger: trigger, outcome: "authoritative", category: nil,
                prior: priorState, startedAt: startedAt
            )
        } catch {
            // SwiftUI cancels view-bound work during ordinary lifecycle
            // transitions. The transport deliberately collapses cancellation
            // into `networkFailure`, so consult the task itself before showing
            // a user-facing offline state. A newer overlapping load owns the
            // screen and will publish its own result.
            guard requestID == latestLoadRequestID, !Task.isCancelled else {
                HomeLoadDiagnostics.record(
                    id: requestID, trigger: trigger, outcome: "discarded", category: HomeLoadDiagnostics.category(error),
                    prior: priorState, startedAt: startedAt
                )
                return
            }
            if isShowingLastKnown {
                lastKnownRefreshFailed = true
            } else if error as? ProductionNativeError == .reconnectRequired {
                state = .reconnectRequired
            } else if error as? ProductionNativeError == .sessionRecoveryUnavailable {
                state = .failed("Recovering the secure session. Try again when the connection is available.")
            } else if error as? ProductionNativeError == .networkFailure {
                state = .failed("Temporarily offline. Reconnect and try again.")
            } else if case .temporaryServer = error as? ProductionNativeError {
                state = .failed("PhysiqueOS is temporarily unavailable. Try again.")
            } else if case .notPaired = error as? ProductionNativeError {
                state = .reconnectRequired
            } else if case .unauthenticated = error as? ProductionNativeError {
                state = .reconnectRequired
            } else {
                state = .failed("Home could not be loaded.")
            }
            HomeLoadDiagnostics.record(
                id: requestID, trigger: trigger,
                outcome: isShowingLastKnown ? "last-known-refresh-failed" : "failed",
                category: HomeLoadDiagnostics.category(error), prior: priorState, startedAt: startedAt
            )
        }
    }

    /// Re-reads only `todaysFocus` from the shared store — called after a
    /// Home inline completion so the tapped row's state updates without a
    /// full re-fetch of the rest of Home.
    func refreshTodaysFocus(now: Date = Date()) {
        guard case .loaded(var home) = state else { return }
        home.todaysFocus = Self.visiblePriorities(priorityStore.todaysPriorities(now: now))
        state = .loaded(home)
    }

    /// Once `priority.complete.v1` has durably committed, the successful
    /// write is authoritative. Remove that occurrence immediately, then
    /// reconcile Home in the background without turning a later read
    /// outage into a false "completion failed" state.
    func reconcileAfterConfirmedPriorityCompletion(occurrenceID: String) async {
        guard case .loaded(var current) = state else { return }
        current.todaysFocus.removeAll { $0.id == occurrenceID }
        state = .loaded(current)
        do {
            state = .loaded(try await api.fetchHome())
        } catch {
            // Preserve the acknowledged canonical success. Pull-to-refresh
            // remains available for later reconciliation.
        }
    }

    /// Completion and Skip are both terminal occurrence dispositions. This
    /// alias keeps the optimistic removal/re-read policy shared without
    /// implying that Skip is a completion or adherence success.
    func reconcileAfterConfirmedPriorityDisposition(occurrenceID: String) async {
        await reconcileAfterConfirmedPriorityCompletion(occurrenceID: occurrenceID)
    }

    /// Replaces the identity (`id`/`title`/`destination`) of whichever
    /// Home goal row is presented as `.primary` with the Goals engine's
    /// current active goal — everything else about that row (icon, color,
    /// and the numeric current/target/unit display) stays as the Home
    /// fixture already renders it, since a brand-new transitioned goal
    /// has no evidence-derived numbers of its own yet and Home does not
    /// compute those independently.
    nonisolated static func projectGoals(_ goals: [HomeGoal], from activeGoal: GoalSummaryReadModel) -> [HomeGoal] {
        guard let index = goals.firstIndex(where: { if case .primary = $0.presentation { true } else { false } }) else { return goals }
        var updated = goals
        updated[index].id = activeGoal.id
        updated[index].title = activeGoal.title
        updated[index].destination = activeGoal.destination
        for candidateIndex in updated.indices {
            if case .supporting = updated[candidateIndex].presentation {
                updated[candidateIndex].destination = activeGoal.destination
            }
        }
        return updated
    }

    nonisolated static func visiblePriorities(_ priorities: [PriorityOccurrence]) -> [PriorityOccurrence] {
        priorities.filter { !$0.completed }
    }

    /// Home shows exactly one Briefing card — whichever artifact
    /// `latestForHome` selects (the same Monthly-collision-precedence
    /// projection History's own artifacts feed from), never a
    /// Home-specific duplicate. `nil` yields an empty list, matching
    /// `HomeReadModel.hasBriefingCards`'s existing "hide the section if
    /// there's nothing to show" contract.
    private static func projectBriefingCards(from briefing: BriefingReadModel?) -> [HomeBriefingCard] {
        guard let briefing else { return [] }
        // Verified real copy (`mapBriefingCard`, `HomeBriefingService.js`):
        // an active `.event` artifact's Home card always reads
        // "DEXA Analysis Ready" or "Progress Photo Analysis Ready" (by
        // trigger type) under an "Event Briefing" section label — fixed
        // copy, not the artifact's own hero title (unlike every other
        // cadence, which does use its own hero text on Home).
        let sectionLabel = briefing.cadence == .event ? "Event Briefing" : briefing.cadence.label
        let title: String = switch briefing.cadence {
        case .event: briefing.dexa != nil ? "DEXA Analysis Ready" : "Progress Photo Analysis Ready"
        default: briefing.historyTitle
        }
        let prompt: String = switch briefing.cadence {
        case .weekly: briefing.weekly?.heroBody ?? ""
        case .midweek: briefing.midweek?.heroSummary ?? ""
        case .monthly: briefing.monthly?.heroBody ?? ""
        case .event: briefing.dexa?.hero.body ?? briefing.photo?.heroBody ?? ""
        case .daily: ""
        }
        return [
            HomeBriefingCard(
                id: briefing.id,
                sectionLabel: sectionLabel,
                title: title,
                prompt: prompt,
                createdAt: briefing.generatedAt,
                destination: .briefingDetail(briefingId: briefing.id)
            )
        ]
    }
}

/// Release-visible, privacy-safe Home lifecycle evidence. This deliberately
/// records only a local load number, trigger, state/category and duration —
/// never dates, payloads, identifiers, URLs, credentials or Server text.
enum HomeLoadDiagnostics {
    private static let logger = Logger(subsystem: "com.physiqueos.native", category: "HomeLoad")

    static func category(_ error: Error) -> String {
        if error is CancellationError || (error as? URLError)?.code == .cancelled { return "cancelled" }
        switch error as? ProductionNativeError {
        case .networkFailure: return "network"
        case .temporaryServer, .server: return "server"
        case .sessionRecoveryUnavailable: return "session-recovering"
        case .reconnectRequired, .notPaired, .unauthenticated, .secureInstallationKeyUnavailable: return "session"
        case .invalidResponse, .incompatibleContractVersion, .resourceMismatch, .authorityMismatch: return "contract"
        case .none: return "other"
        default: return "request"
        }
    }

    @MainActor
    static func describe(_ state: HomeViewModel.LoadState) -> String {
        switch state {
        case .loading: "loading"
        case .loaded: "loaded"
        case .failed: "failed"
        case .reconnectRequired: "reconnect"
        }
    }

    static func record(
        id: Int,
        trigger: HomeViewModel.LoadTrigger,
        outcome: String,
        category: String?,
        prior: String,
        startedAt: ContinuousClock.Instant
    ) {
        let components = startedAt.duration(to: .now).components
        let milliseconds = max(0, Int(components.seconds * 1_000 + components.attoseconds / 1_000_000_000_000_000))
        logger.info("home_load id=\(id) trigger=\(trigger.rawValue, privacy: .public) outcome=\(outcome, privacy: .public) category=\(category ?? "none", privacy: .public) prior=\(prior, privacy: .public) duration_ms=\(milliseconds)")
    }
}
