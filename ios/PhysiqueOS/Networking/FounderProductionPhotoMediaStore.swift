import Foundation
import ImageIO
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
    /// `failed` is a transient failure a Retry can act on (another authenticated
    /// media read); `unavailable` is a permanent one (an unsupported or undecodable
    /// image) where no retry operation exists, so no Retry is offered.
    enum ImageState: Equatable { case idle, loading, loaded(UIImage), failed, unavailable }

    private struct UndecodableImage: Error {}

    private(set) var imageStates: [String: ImageState] = [:]
    private let api: ProductionNativeAPI

    nonisolated init(api: ProductionNativeAPI) { self.api = api }

    func loadImage(mediaId: String) async {
        switch imageStates[mediaId] {
        case .loaded, .loading: return
        default: break
        }
        imageStates[mediaId] = .loading
        do {
            let media = try await api.readMedia(mediaId: mediaId)
            let image = try await Task.detached(priority: .userInitiated) {
                guard let source = CGImageSourceCreateWithData(media.data as CFData, nil),
                      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                        kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceCreateThumbnailWithTransform: true,
                        kCGImageSourceThumbnailMaxPixelSize: 1_600,
                      ] as CFDictionary)
                else { throw UndecodableImage() }
                return UIImage(cgImage: image)
            }.value
            imageStates[mediaId] = .loaded(image)
        } catch {
            // A view leaving the screen cancels the read; that is not a failure and
            // must not strand the tile behind a Retry.
            imageStates[mediaId] = Task.isCancelled ? .idle : Self.failureState(for: error)
        }
    }

    static func failureState(for error: Error) -> ImageState {
        if error is UndecodableImage { return .unavailable }
        if case ProductionNativeError.unsupportedMediaType = error { return .unavailable }
        return .failed
    }

    func retryImage(mediaId: String) async {
        imageStates[mediaId] = .idle
        await loadImage(mediaId: mediaId)
    }
}
