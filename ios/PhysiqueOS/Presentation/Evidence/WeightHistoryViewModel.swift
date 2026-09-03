import Foundation

/// Backs `WeightHistoryView` — named `...HistoryViewModel` for consistency
/// with the other Evidence view models even though Weight has no separate
/// landing/history split on the web (one single page covers both, see
/// `WeightReportReadModel`'s doc comment).
@Observable
@MainActor
final class WeightHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(WeightReportReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    /// Weight's own confirmed real default context ("build-lean-mass" —
    /// `WeightEvidenceContextService.js:22`, matching Nutrition/Activity).
    private(set) var scope: EvidenceScopeID = .buildLeanMass
    private let api: WeightEvidenceAPI

    init(api: WeightEvidenceAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchWeightReport(scope: scope))
        } catch {
            state = .failed("Weight could not be loaded.")
        }
    }

    func selectScope(_ scopeID: EvidenceScopeID) async {
        guard scopeID != scope else { return }
        scope = scopeID
        await load()
    }
}
