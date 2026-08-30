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

    init(api: TrainingAPI, reportId: String) {
        self.api = api
        self.reportId = reportId
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTrainingReporting(reportId: reportId))
        } catch {
            state = .failed("This report could not be loaded.")
        }
    }
}
