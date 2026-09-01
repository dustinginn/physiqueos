import Foundation
import ImageIO
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum EvidenceAttachmentLoader {
    struct PhotoLoadRequest {
        var stableIdentifier: String?
        var contentTypeIdentifier: String?
        var loadData: @MainActor () async throws -> Data?
    }

    /// PhotosPicker can hand back several full-resolution assets at once. Loading
    /// them in a task group multiplies the transient memory cost and also sends
    /// PhotosPickerItem values across child tasks. Keep the picker boundary on the
    /// main actor and load one compressed original at a time. The original bytes
    /// remain attached; only transient loading/decoding is serialized.
    @MainActor
    static func photos(_ items: [PhotosPickerItem], startingAt index: Int) async -> [SandboxAttachment] {
        let requests = items.map { item in
            PhotoLoadRequest(
                stableIdentifier: item.itemIdentifier,
                contentTypeIdentifier: item.supportedContentTypes.first?.identifier,
                loadData: { try await item.loadTransferable(type: Data.self) }
            )
        }
        return await photos(requests, startingAt: index)
    }

    @MainActor
    static func photos(_ requests: [PhotoLoadRequest], startingAt index: Int) async -> [SandboxAttachment] {
        var loaded: [SandboxAttachment] = []
        loaded.reserveCapacity(requests.count)
        for (offset, request) in requests.enumerated() {
            let contentType = preferredMIMEType(for: request.contentTypeIdentifier)
            let id = request.stableIdentifier.map { "photo-\($0)" } ?? UUID().uuidString
            do {
                guard let data = try await request.loadData(), !data.isEmpty else {
                    loaded.append(failedPhoto(id: id, offset: offset, index: index, type: contentType, message: "The photo could not be loaded."))
                    continue
                }
                loaded.append(.init(
                    id: id,
                    displayName: "Photo \(index + offset + 1)",
                    source: .photos,
                    contentType: contentType,
                    data: data
                ))
            } catch {
                loaded.append(failedPhoto(id: id, offset: offset, index: index, type: contentType, message: error.localizedDescription))
            }
        }
        return loaded
    }

    static func files(_ urls: [URL]) -> [SandboxAttachment] {
        urls.map { url in
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            do {
                let values = try? url.resourceValues(forKeys: [.contentTypeKey])
                return .init(
                    id: UUID().uuidString,
                    displayName: url.lastPathComponent,
                    source: .files,
                    contentType: values?.contentType?.identifier,
                    data: try Data(contentsOf: url, options: .mappedIfSafe)
                )
            } catch {
                return .init(id: UUID().uuidString, displayName: url.lastPathComponent, source: .files, loadError: error.localizedDescription)
            }
        }
    }

    static func previewImage(data: Data, maximumPixelSize: Int = 1_200) -> UIImage? {
        guard let image = downsampledCGImage(data: data, maximumPixelSize: maximumPixelSize) else { return nil }
        return UIImage(cgImage: image)
    }

    static func downsampledCGImage(data: Data, maximumPixelSize: Int) -> CGImage? {
        guard maximumPixelSize > 0,
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maximumPixelSize,
            kCGImageSourceShouldCacheImmediately: false,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }

    private static func preferredMIMEType(for identifier: String?) -> String? {
        guard let identifier else { return nil }
        return UTType(identifier)?.preferredMIMEType ?? identifier
    }

    private static func failedPhoto(id: String, offset: Int, index: Int, type: String?, message: String) -> SandboxAttachment {
        .init(id: id, displayName: "Photo \(index + offset + 1)", source: .photos, contentType: type, loadError: message)
    }
}
