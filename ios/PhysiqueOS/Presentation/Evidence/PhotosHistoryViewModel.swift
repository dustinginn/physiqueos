import Foundation

@Observable
@MainActor
final class PhotosHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(PhotosLandingReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private(set) var scope: EvidenceScopeSelection = PhotosScopeDefault.selection
    private let api: PhotosAPI

    init(api: PhotosAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchPhotosLanding(scope: scope))
        } catch {
            state = .failed("Progress Photos could not be loaded.")
        }
    }

    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }
}
