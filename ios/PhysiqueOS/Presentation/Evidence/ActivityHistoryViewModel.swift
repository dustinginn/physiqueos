import Foundation

@Observable
@MainActor
final class ActivityHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(ActivityLandingReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: ActivityAPI

    init(api: ActivityAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchActivityLanding())
        } catch {
            state = .failed("Activity could not be loaded.")
        }
    }
}
