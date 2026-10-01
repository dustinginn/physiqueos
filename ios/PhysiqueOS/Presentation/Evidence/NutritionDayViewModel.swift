import Foundation

@Observable
@MainActor
final class NutritionDayViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(NutritionDayRecord?)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: NutritionAPI
    let dayId: String

    init(api: NutritionAPI, dayId: String) {
        self.api = api
        self.dayId = dayId
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchNutritionDay(dayId: dayId))
        } catch {
            state = .failed("Nutrition day could not be loaded.")
        }
    }
}
