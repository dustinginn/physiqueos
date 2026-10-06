import Foundation
import os

/// Mirrors `HomeViewModel`/`LogViewModel`'s pattern: loads the read model
/// through the injected `EvidenceAPI` seam and holds it for `EvidenceView`.
/// Also owns the local "Recently Used" ranking (`EvidenceHubUsageService`),
/// recording a visit whenever a stream row is tapped — mirroring
/// `EvidenceHubIndex.jsx`'s own `onVisit`/`recordEvidenceHubVisit` call on
/// every row, not just the Recently Used ones.
///
/// A failed load is never terminal: the view offers Try Again and pull to
/// refresh, and retries on foreground. Only the newest load may change
/// `state`, a cancelled load changes nothing, and a failed refresh keeps
/// this session's last successful hub on screen (in memory only — nothing
/// here is persisted or served as a read result).
@Observable
@MainActor
final class EvidenceViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(EvidenceHubReadModel)
        case failed(String)
    }

    /// What started a load. Diagnostic only; it never changes behavior.
    enum LoadTrigger: String, Sendable {
        case appearance
        case foreground
        case dayChange = "day-change"
        case pullToRefresh = "pull-to-refresh"
        case retry
    }

    nonisolated static let genericFailureMessage = "Evidence could not be loaded."
    nonisolated static let unreachableMessage = "PhysiqueOS couldn't be reached. Pull to refresh or try again."
    nonisolated static let sessionRecoveringMessage = "Recovering the secure session. Try again when the connection is available."

    private(set) var state: LoadState = .loading
    /// True while `state` still shows the hub this session last loaded
    /// because the newest refresh behind it failed.
    private(set) var refreshFailed = false
    /// Ranked stream ids, most-recently-used first — at most 3, per
    /// `rankRecentlyUsedEvidence`'s own default `limit`.
    private(set) var recentlyUsedStreamIds: [String] = []

    private let api: EvidenceAPI
    private let usageStore: EvidenceHubUsageStore
    private var latestLoadID = 0
    private var consecutiveFailures = 0

    init(api: EvidenceAPI, usageStore: EvidenceHubUsageStore = UserDefaultsEvidenceHubUsageStore()) {
        self.api = api
        self.usageStore = usageStore
    }

    var needsRetry: Bool {
        if refreshFailed { return true }
        if case .failed = state { return true }
        return false
    }

    func load(trigger: LoadTrigger = .appearance) async {
        latestLoadID += 1
        let loadID = latestLoadID
        let prior = EvidenceHubLoadDiagnostics.describe(state)
        let startedAt = ContinuousClock.now
        // A retry from a failure shows progress instead of the old message.
        if case .failed = state { state = .loading }
        do {
            let hub = try await api.fetchEvidenceHub()
            guard loadID == latestLoadID else {
                EvidenceHubLoadDiagnostics.record(id: loadID, trigger: trigger, outcome: "superseded", category: nil, prior: prior, startedAt: startedAt, failures: consecutiveFailures)
                return
            }
            state = .loaded(hub)
            refreshFailed = false
            consecutiveFailures = 0
            refreshRecentlyUsed()
            EvidenceHubLoadDiagnostics.record(id: loadID, trigger: trigger, outcome: "loaded", category: nil, prior: prior, startedAt: startedAt, failures: 0)
        } catch {
            let category = EvidenceHubLoadDiagnostics.category(error)
            guard loadID == latestLoadID else {
                EvidenceHubLoadDiagnostics.record(id: loadID, trigger: trigger, outcome: "superseded", category: category, prior: prior, startedAt: startedAt, failures: consecutiveFailures)
                return
            }
            if Task.isCancelled || Self.isCancellation(error) {
                // The view went away mid-read; its next appearance reloads.
                // Loaded content stays, and a cancelled first load stays
                // `.loading` instead of becoming a terminal failure.
                EvidenceHubLoadDiagnostics.record(id: loadID, trigger: trigger, outcome: "cancelled", category: category, prior: prior, startedAt: startedAt, failures: consecutiveFailures)
                return
            }
            consecutiveFailures += 1
            if case .loaded = state {
                refreshFailed = true
            } else {
                state = .failed(Self.message(for: error))
            }
            EvidenceHubLoadDiagnostics.record(id: loadID, trigger: trigger, outcome: "failed", category: category, prior: prior, startedAt: startedAt, failures: consecutiveFailures)
        }
    }

    /// Foreground resume retries only a failed load. A loaded hub keeps
    /// its normal `.task`/day-change refresh rules, so resuming onto a
    /// healthy Evidence tab never adds a full hub read burst.
    func retryAfterForegroundIfNeeded() async {
        guard needsRetry else { return }
        await load(trigger: .foreground)
    }

    func recordVisit(streamId: String) {
        let updated = EvidenceHubUsageService.recordVisit(usage: usageStore.load(), evidenceType: streamId)
        usageStore.save(updated)
        refreshRecentlyUsed()
    }

    nonisolated static func message(for error: Error) -> String {
        switch error as? ProductionNativeError {
        case .networkFailure, .temporaryServer: unreachableMessage
        case .sessionRecoveryUnavailable: sessionRecoveringMessage
        case .reconnectRequired: ProductionNativeError.reconnectRequired.errorDescription ?? genericFailureMessage
        default: genericFailureMessage
        }
    }

    private nonisolated static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }

    private func refreshRecentlyUsed() {
        recentlyUsedStreamIds = EvidenceHubUsageService.rankRecentlyUsed(usage: usageStore.load())
    }
}

/// Release-visible engineering log for the Evidence root load, in the
/// style of `NativeReadFailureDiagnostics`: load id, trigger, outcome,
/// error category, prior state, duration and consecutive-failure count
/// only — never payloads, identifiers, credentials or error text. The
/// underlying transport error identity (e.g. NSURLErrorDomain -1003) is
/// already captured per request by `NetworkFailureDiagnostics`.
enum EvidenceHubLoadDiagnostics {
    private static let logger = Logger(subsystem: "com.physiqueos.native", category: "EvidenceHubLoad")

    static func category(_ error: Error) -> String {
        if error is CancellationError || (error as? URLError)?.code == .cancelled { return "cancelled" }
        switch error as? ProductionNativeError {
        case .networkFailure: return "network"
        case .temporaryServer, .server: return "server"
        case .sessionRecoveryUnavailable: return "session-recovering"
        case .reconnectRequired, .notPaired, .unauthenticated: return "session-ended"
        case .invalidResponse, .incompatibleContractVersion, .resourceMismatch, .authorityMismatch: return "contract"
        case .none: return "other"
        default: return "request"
        }
    }

    @MainActor
    static func describe(_ state: EvidenceViewModel.LoadState) -> String {
        switch state {
        case .loading: "loading"
        case .loaded: "loaded"
        case .failed: "failed"
        }
    }

    static func record(
        id: Int,
        trigger: EvidenceViewModel.LoadTrigger,
        outcome: String,
        category: String?,
        prior: String,
        startedAt: ContinuousClock.Instant,
        failures: Int
    ) {
        let components = startedAt.duration(to: .now).components
        let milliseconds = max(0, Int(components.seconds * 1_000 + components.attoseconds / 1_000_000_000_000_000))
        logger.info("evidence_hub_load id=\(id) trigger=\(trigger.rawValue, privacy: .public) outcome=\(outcome, privacy: .public) category=\(category ?? "none", privacy: .public) prior=\(prior, privacy: .public) duration_ms=\(milliseconds) consecutive_failures=\(failures)")
    }
}
