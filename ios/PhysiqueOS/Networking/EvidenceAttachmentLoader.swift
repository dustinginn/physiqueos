import Foundation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

enum EvidenceAttachmentLoader {
    static func photos(_ items: [PhotosPickerItem], startingAt index: Int) async -> [SandboxAttachment] {
        await withTaskGroup(of: (Int, SandboxAttachment).self) { group in
            for (offset, item) in items.enumerated() {
                group.addTask {
                    let type = item.supportedContentTypes.first?.identifier
                    do {
                        guard let data = try await item.loadTransferable(type: Data.self) else {
                            return (offset, failedPhoto(offset: offset, index: index, type: type, message: "The photo could not be loaded."))
                        }
                        return (offset, .init(id: UUID().uuidString, displayName: "Photo \(index + offset + 1)", source: .photos, contentType: type, data: data))
                    } catch {
                        return (offset, failedPhoto(offset: offset, index: index, type: type, message: error.localizedDescription))
                    }
                }
            }
            var loaded: [(Int, SandboxAttachment)] = []
            for await item in group { loaded.append(item) }
            return loaded.sorted { $0.0 < $1.0 }.map(\.1)
        }
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

    private static func failedPhoto(offset: Int, index: Int, type: String?, message: String) -> SandboxAttachment {
        .init(id: UUID().uuidString, displayName: "Photo \(index + offset + 1)", source: .photos, contentType: type, loadError: message)
    }
}
