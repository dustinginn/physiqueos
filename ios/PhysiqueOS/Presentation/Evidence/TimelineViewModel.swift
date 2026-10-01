import Foundation

@Observable
@MainActor
final class TimelineViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(TimelineReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: TimelineAPI

    init(api: TimelineAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTimeline())
        } catch is NotAvailableTimelineAPI.NotAvailable {
            state = .failed("Timeline is not available in Sandbox.")
        } catch {
            state = .failed("Timeline could not be loaded.")
        }
    }
}
