import Foundation
import ImageIO
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum EvidenceAttachmentLoader {
    /// A Progress Photo exactly as it will be staged: the original bytes,
    /// untouched, with the Server MIME type they travel under. HEIC/HEIF
    /// originals additionally need a bounded JPEG analysis derivative,
    /// produced separately from the same bytes.
    struct StagedPhotoRepresentation: Equatable {
        var data: Data
        var contentType: String
        var fileExtension: String
        var requiresAnalysisDerivative: Bool
    }
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
                    contentType: preferredMIMEType(for: values?.contentType?.identifier, filenameExtension: url.pathExtension),
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

    /// The staged Progress Photos contract accepts JPEG, PNG, WebP, HEIC, and
    /// HEIF originals and preserves every one of them byte for byte. Nothing
    /// is re-encoded, resized, or recompressed to satisfy transport: a photo
    /// larger than the per-photo ceiling is refused with a clear message
    /// rather than silently degraded. Any other representation is unsupported.
    static func stagedPhotoRepresentation(data: Data, contentType: String?) -> StagedPhotoRepresentation? {
        switch contentType?.lowercased() {
        case "image/jpeg", "image/jpg": return .init(data: data, contentType: "image/jpeg", fileExtension: "jpg", requiresAnalysisDerivative: false)
        case "image/png": return .init(data: data, contentType: "image/png", fileExtension: "png", requiresAnalysisDerivative: false)
        case "image/webp": return .init(data: data, contentType: "image/webp", fileExtension: "webp", requiresAnalysisDerivative: false)
        case "image/heic": return .init(data: data, contentType: "image/heic", fileExtension: "heic", requiresAnalysisDerivative: true)
        case "image/heif": return .init(data: data, contentType: "image/heif", fileExtension: "heif", requiresAnalysisDerivative: true)
        default: return nil
        }
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

    /// Converts a platform UTType identifier into an HTTP MIME type for the
    /// upload wire contract.
    ///
    /// A UTType identifier is NOT a MIME type, and the server uses this
    /// value verbatim as the stored object's HTTP Content-Type — so a
    /// platform identifier must never reach it. Many perfectly ordinary
    /// UTTypes have no `preferredMIMEType` at all (`public.data`,
    /// `public.content`, and every dynamic `dyn.…` type), which is exactly
    /// how the real Founder DEXA upload failed: a Files-provider URL whose
    /// `.contentTypeKey` resolved to such a type previously fell through to
    /// the raw identifier and was rejected server-side as
    /// PROVIDER_UPLOAD_CONTENT_TYPE_INVALID.
    ///
    /// Resolution order: the type's own MIME mapping, then the filename
    /// extension's, then `nil` — never the raw identifier. Callers treat
    /// `nil` as "unknown", which is honest and has a safe default; a
    /// platform identifier masquerading as a MIME type does not.
    static func preferredMIMEType(for identifier: String?, filenameExtension: String? = nil) -> String? {
        if let identifier, let mime = UTType(identifier)?.preferredMIMEType { return mime }
        let fileExtension = String(filenameExtension ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !fileExtension.isEmpty, let mime = UTType(filenameExtension: fileExtension)?.preferredMIMEType { return mime }
        return nil
    }

    private static func failedPhoto(id: String, offset: Int, index: Int, type: String?, message: String) -> SandboxAttachment {
        .init(id: id, displayName: "Photo \(index + offset + 1)", source: .photos, contentType: type, loadError: message)
    }
}
