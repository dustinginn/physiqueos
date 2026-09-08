import Foundation

@Observable
@MainActor
final class TrainingReportingViewModel {
    enum LoadState {
        case loading
        case loaded(TrainingReportingReadModel?)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: TrainingAPI
    private let reportId: String
    private(set) var scope: EvidenceScopeSelection = TrainingScopeDefault.selection

    init(api: TrainingAPI, reportId: String) {
        self.api = api
        self.reportId = reportId
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTrainingReporting(reportId: reportId, scope: scope))
        } catch {
            state = .failed("This report could not be loaded.")
        }
    }

    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }
}
