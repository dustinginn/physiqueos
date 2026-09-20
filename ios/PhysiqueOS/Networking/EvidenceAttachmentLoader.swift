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

    /// One accepted Progress Photo container. This registry is the only place
    /// a format is named: whether an original needs an analysis derivative
    /// (`directlyConsumable == false`) and which transport ceiling applies
    /// (`sizeClass`) are properties of the container, not branches elsewhere.
    /// Mirrors the Server's `ImageContainerDetection.PHOTO_CONTAINERS`.
    struct PhotoContainer: Equatable, Sendable {
        enum SizeClass: Equatable, Sendable { case compressed, raw }
        let mimeType: String
        let label: String
        let fileExtension: String
        let directlyConsumable: Bool
        let sizeClass: SizeClass
    }

    static let photoContainers: [PhotoContainer] = [
        .init(mimeType: "image/jpeg", label: "JPEG", fileExtension: "jpg", directlyConsumable: true, sizeClass: .compressed),
        .init(mimeType: "image/png", label: "PNG", fileExtension: "png", directlyConsumable: true, sizeClass: .compressed),
        .init(mimeType: "image/webp", label: "WebP", fileExtension: "webp", directlyConsumable: true, sizeClass: .compressed),
        .init(mimeType: "image/heic", label: "HEIC", fileExtension: "heic", directlyConsumable: false, sizeClass: .compressed),
        .init(mimeType: "image/heif", label: "HEIF", fileExtension: "heif", directlyConsumable: false, sizeClass: .compressed),
        .init(mimeType: "image/x-adobe-dng", label: "Apple ProRAW (DNG)", fileExtension: "dng", directlyConsumable: false, sizeClass: .raw),
    ]

    static func photoContainer(for mimeType: String?) -> PhotoContainer? {
        let type = (mimeType ?? "").lowercased()
        return photoContainers.first { $0.mimeType == type }
    }

    static var supportedPhotoContainerSummary: String {
        "JPEG, PNG, WebP, HEIC/HEIF, or Apple ProRAW (DNG)"
    }

    /// The staged Progress Photos contract preserves every accepted original
    /// byte for byte. Nothing is re-encoded, resized, or recompressed to
    /// satisfy transport: a photo larger than its container's ceiling is
    /// refused with a clear message rather than silently degraded. Any other
    /// representation is unsupported.
    ///
    /// The container is read from the bytes, never from a type label. The
    /// Server verifies the same signatures against every transferred
    /// artifact, so a declaration derived from anything else could disagree
    /// with what is actually sent; PhotosPicker's label in particular names
    /// the variant the system offered first, not necessarily the bytes.
    static func stagedPhotoRepresentation(data: Data) -> StagedPhotoRepresentation? {
        guard let container = photoContainer(for: detectImageContainer(data)) else { return nil }
        return .init(data: data, contentType: container.mimeType, fileExtension: container.fileExtension, requiresAnalysisDerivative: !container.directlyConsumable)
    }

    private static let heicBrands: Set<String> = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]
    private static let heifBrands: Set<String> = ["mif1", "msf1", "heif", "avif", "avis"]
    private static let tiffDNGVersionTag = 50706
    private static let tiffMaximumIFDEntries = 1024

    /// A faithful port of the Server's `ImageContainerDetection`, so Native
    /// never declares a container the Server would refuse and never refuses
    /// one the Server would accept: JPEG SOI; PNG signature; RIFF/WEBP; an
    /// ISO BMFF `ftyp` box with a validated size whose major *or compatible*
    /// brands name HEIC/HEIF; and a TIFF whose first IFD carries DNGVersion
    /// (Apple ProRAW). Plain TIFF, malformed boxes, and unknown brands are
    /// not photos this transport carries.
    static func detectImageContainer(_ data: Data) -> String? {
        guard data.count >= 12 else { return nil }
        let head = [UInt8](data.prefix(12))
        if head[0] == 0xff, head[1] == 0xd8, head[2] == 0xff { return "image/jpeg" }
        if Array(head[0..<8]) == [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] { return "image/png" }
        if Array(head[0..<4]) == [0x52, 0x49, 0x46, 0x46], Array(head[8..<12]) == [0x57, 0x45, 0x42, 0x50] { return "image/webp" }
        if Array(head[4..<8]) == [0x66, 0x74, 0x79, 0x70] { return detectIsoBaseMediaImage(data) }
        return detectTiffImage(data)
    }

    private static func detectIsoBaseMediaImage(_ data: Data) -> String? {
        let bytes = [UInt8](data.prefix(4096))
        let boxSize = Int(bytes[0]) << 24 | Int(bytes[1]) << 16 | Int(bytes[2]) << 8 | Int(bytes[3])
        guard boxSize >= 16, boxSize <= 4096, boxSize <= data.count else { return nil }
        var brands = [String(decoding: bytes[8..<12], as: UTF8.self)]
        var offset = 16
        while offset + 4 <= boxSize {
            brands.append(String(decoding: bytes[offset..<offset + 4], as: UTF8.self))
            offset += 4
        }
        if brands.contains(where: { heicBrands.contains($0) }) { return "image/heic" }
        if brands.contains(where: { heifBrands.contains($0) }) { return "image/heif" }
        return nil
    }

    /// TIFF header + a bounded walk of the first IFD looking for DNGVersion
    /// (tag 50706, four BYTEs, major version 1). Every offset is checked
    /// against the data before it is read; nothing beyond the IFD entries is
    /// touched, so a 46 MB ProRAW costs a few hundred bytes to classify.
    private static func detectTiffImage(_ data: Data) -> String? {
        let head = [UInt8](data.prefix(8))
        let little = head[0] == 0x49 && head[1] == 0x49 && head[2] == 0x2a && head[3] == 0x00
        let big = head[0] == 0x4d && head[1] == 0x4d && head[2] == 0x00 && head[3] == 0x2a
        guard little || big else { return nil }
        let start = data.startIndex
        func u16(_ offset: Int) -> Int? {
            guard offset >= 0, offset + 2 <= data.count else { return nil }
            let a = Int(data[start + offset]), b = Int(data[start + offset + 1])
            return little ? a | (b << 8) : (a << 8) | b
        }
        func u32(_ offset: Int) -> Int? {
            guard offset >= 0, offset + 4 <= data.count else { return nil }
            let p = (0..<4).map { Int(data[start + offset + $0]) }
            return little ? p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24) : (p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]
        }
        guard let ifd = u32(4), ifd >= 8, let count = u16(ifd), count >= 1, count <= tiffMaximumIFDEntries else { return nil }
        for index in 0..<count {
            let entry = ifd + 2 + index * 12
            guard entry + 12 <= data.count, let tag = u16(entry) else { return nil }
            guard tag == tiffDNGVersionTag else { continue }
            guard u16(entry + 2) == 1, u32(entry + 4) == 4 else { return nil }
            return data[start + entry + 8] == 1 ? "image/x-adobe-dng" : nil
        }
        return nil
    }

    /// Bounded, sanitized description of bytes that failed detection, for
    /// diagnostics only: signature family or brand, never content or names.
    /// Mirrors the Server's `describeUnsupportedImageBytes`.
    static func describeUnsupportedImageBytes(_ data: Data) -> String {
        guard data.count >= 12 else { return "too-short" }
        let head = [UInt8](data.prefix(12))
        if Array(head[4..<8]) == [0x66, 0x74, 0x79, 0x70] {
            let brand = String(decoding: head[8..<12], as: UTF8.self).map { $0.isASCII && !$0.isNewline && $0 != "\0" ? String($0) : "?" }.joined()
            return "iso-bmff:\(brand)"
        }
        if Array(head[0..<4]) == [0x49, 0x49, 0x2a, 0x00] || Array(head[0..<4]) == [0x4d, 0x4d, 0x00, 0x2a] { return "tiff:no-dng-version" }
        return "unknown:" + head[0..<4].map { String(format: "%02x", $0) }.joined()
    }

    /// Founder-facing name for what an unsupported classification means.
    static func unsupportedPhotoDescription(_ classification: String) -> String {
        if classification == "tiff:no-dng-version" { return "a TIFF image without Apple ProRAW information" }
        if classification.hasPrefix("iso-bmff:") { return "a media file of type \u{201C}\(classification.dropFirst("iso-bmff:".count))\u{201D}" }
        if classification == "too-short" { return "an empty or truncated file" }
        return "an unrecognized file"
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
