import Foundation
import UIKit

/// Founder Production's own authenticated opaque photo media loader —
/// deliberately separate from `FounderPhotoMediaStore` (the isolated
/// Sandbox photo-acceptance bridge, a different authority entirely). The
/// `photos` native resource embeds each photo's opaque `mediaId` directly
/// on the session payload itself, so unlike the Sandbox bridge this store
/// needs no separate manifest fetch — it only caches decoded images by
/// `mediaId`, fetched through `ProductionNativeAPI.readMedia(mediaId:)`.
@Observable
@MainActor
final class FounderProductionPhotoMediaStore {
    enum ImageState: Equatable { case idle, loading, loaded(UIImage), failed }

    private(set) var imageStates: [String: ImageState] = [:]
    private let api: ProductionNativeAPI

    nonisolated init(api: ProductionNativeAPI) { self.api = api }

    func loadImage(mediaId: String) async {
        if case .loaded = imageStates[mediaId] { return }
        imageStates[mediaId] = .loading
        do {
            let media = try await api.readMedia(mediaId: mediaId)
            guard let image = UIImage(data: media.data) else { throw ProductionNativeError.invalidResponse }
            imageStates[mediaId] = .loaded(image)
        } catch {
            imageStates[mediaId] = .failed
        }
    }

    func retryImage(mediaId: String) async {
        imageStates[mediaId] = .idle
        await loadImage(mediaId: mediaId)
    }
}
