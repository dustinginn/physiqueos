import Foundation

/// Mirrors `HomeViewModel`/`LogViewModel`'s pattern: loads the read model
/// through the injected `EvidenceAPI` seam and holds it for `EvidenceView`.
/// Also owns the local "Recently Used" ranking (`EvidenceHubUsageService`),
/// recording a visit whenever a stream row is tapped — mirroring
/// `EvidenceHubIndex.jsx`'s own `onVisit`/`recordEvidenceHubVisit` call on
/// every row, not just the Recently Used ones.
@Observable
@MainActor
final class EvidenceViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(EvidenceHubReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    /// Ranked stream ids, most-recently-used first — at most 3, per
    /// `rankRecentlyUsedEvidence`'s own default `limit`.
    private(set) var recentlyUsedStreamIds: [String] = []

    private let api: EvidenceAPI
    private let usageStore: EvidenceHubUsageStore

    init(api: EvidenceAPI, usageStore: EvidenceHubUsageStore = UserDefaultsEvidenceHubUsageStore()) {
        self.api = api
        self.usageStore = usageStore
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchEvidenceHub())
            refreshRecentlyUsed()
        } catch {
            state = .failed("Evidence could not be loaded.")
        }
    }

    func recordVisit(streamId: String) {
        let updated = EvidenceHubUsageService.recordVisit(usage: usageStore.load(), evidenceType: streamId)
        usageStore.save(updated)
        refreshRecentlyUsed()
    }

    private func refreshRecentlyUsed() {
        recentlyUsedStreamIds = EvidenceHubUsageService.rankRecentlyUsed(usage: usageStore.load())
    }
}
