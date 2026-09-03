import Foundation

@Observable
@MainActor
final class ActivityDayViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(ActivityDayRecord?)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: ActivityAPI
    private let date: String

    init(api: ActivityAPI, date: String) {
        self.api = api
        self.date = date
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchActivityDay(date: date))
        } catch {
            state = .failed("This activity day could not be loaded.")
        }
    }
}
