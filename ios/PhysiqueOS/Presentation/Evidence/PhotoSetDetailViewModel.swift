import Foundation

@Observable
@MainActor
final class PhotoSetDetailViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(PhotoSetRecord?)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: PhotosAPI
    let setId: String

    init(api: PhotosAPI, setId: String) {
        self.api = api
        self.setId = setId
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchPhotoSet(setId: setId))
        } catch is NotYetAvailablePhotosAPI.NotYetAvailable {
            state = .failed("Progress Photos reads are not yet available in Founder Production.")
        } catch {
            state = .failed("This photo set could not be loaded.")
        }
    }
}
