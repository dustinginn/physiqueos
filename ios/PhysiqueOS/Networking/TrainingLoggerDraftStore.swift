import Foundation

protocol TrainingLoggerDraftStore: AnyObject {
    func load() -> TrainingLoggerDraft?
    func save(_ draft: TrainingLoggerDraft)
    func discard()
}

final class UserDefaultsTrainingLoggerDraftStore: TrainingLoggerDraftStore {
    private let defaults: UserDefaults
    private let key: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults = .standard, key: String = "physiqueos.trainingLogger.localDraft.v1") {
        self.defaults = defaults
        self.key = key
    }

    func load() -> TrainingLoggerDraft? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? decoder.decode(TrainingLoggerDraft.self, from: data)
    }

    func save(_ draft: TrainingLoggerDraft) {
        guard let data = try? encoder.encode(draft) else { return }
        defaults.set(data, forKey: key)
    }

    func discard() {
        defaults.removeObject(forKey: key)
    }
}

final class MemoryTrainingLoggerDraftStore: TrainingLoggerDraftStore {
    private(set) var draft: TrainingLoggerDraft?

    init(draft: TrainingLoggerDraft? = nil) {
        self.draft = draft
    }

    func load() -> TrainingLoggerDraft? { draft }
    func save(_ draft: TrainingLoggerDraft) { self.draft = draft }
    func discard() { draft = nil }
}

protocol TrainingLoggerAttachmentStore: Sendable {
    func save(data: Data, draftId: String, assetId: String, displayName: String) throws -> String
    func load(reference: String) throws -> Data
    func remove(reference: String)
    func removeAll(draftId: String)
}

enum TrainingLoggerAttachmentStoreError: Error, Equatable {
    case invalidReference
    case unavailable
}

/// Keeps workout screenshots private in Application Support while a
/// Save & Leave draft is active. Only opaque relative references enter
/// UserDefaults; absolute paths and file bytes never enter a command.
final class FileTrainingLoggerAttachmentStore: TrainingLoggerAttachmentStore, @unchecked Sendable {
    private let root: URL

    init(root: URL? = nil) {
        if let root {
            self.root = root
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            self.root = base.appendingPathComponent("PhysiqueOS/TrainingAttachments", isDirectory: true)
        }
    }

    func save(data: Data, draftId: String, assetId: String, displayName: String) throws -> String {
        guard Self.isSafe(draftId), Self.isSafe(assetId) else { throw TrainingLoggerAttachmentStoreError.invalidReference }
        let directory = root.appendingPathComponent(draftId, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let ext = URL(fileURLWithPath: displayName).pathExtension.lowercased()
        let filename = ext.isEmpty ? assetId : "\(assetId).\(ext)"
        let url = directory.appendingPathComponent(filename, isDirectory: false)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return "\(draftId)/\(filename)"
    }

    func load(reference: String) throws -> Data {
        guard Self.isSafeReference(reference) else { throw TrainingLoggerAttachmentStoreError.invalidReference }
        do { return try Data(contentsOf: root.appendingPathComponent(reference)) }
        catch { throw TrainingLoggerAttachmentStoreError.unavailable }
    }

    func remove(reference: String) {
        guard Self.isSafeReference(reference) else { return }
        try? FileManager.default.removeItem(at: root.appendingPathComponent(reference))
    }

    func removeAll(draftId: String) {
        guard Self.isSafe(draftId) else { return }
        try? FileManager.default.removeItem(at: root.appendingPathComponent(draftId, isDirectory: true))
    }

    private static func isSafe(_ component: String) -> Bool {
        !component.isEmpty && component != "." && component != ".." && !component.contains("/")
    }

    private static func isSafeReference(_ value: String) -> Bool {
        let parts = value.split(separator: "/", omittingEmptySubsequences: false)
        return parts.count == 2 && parts.allSatisfy { isSafe(String($0)) }
    }
}

final class MemoryTrainingLoggerAttachmentStore: TrainingLoggerAttachmentStore, @unchecked Sendable {
    private var values: [String: Data] = [:]
    private let lock = NSLock()

    func save(data: Data, draftId: String, assetId: String, displayName: String) throws -> String {
        let reference = "\(draftId)/\(assetId)"
        lock.lock(); defer { lock.unlock() }
        values[reference] = data
        return reference
    }

    func load(reference: String) throws -> Data {
        lock.lock(); defer { lock.unlock() }
        guard let value = values[reference] else { throw TrainingLoggerAttachmentStoreError.unavailable }
        return value
    }

    func remove(reference: String) {
        lock.lock(); defer { lock.unlock() }
        values.removeValue(forKey: reference)
    }

    func removeAll(draftId: String) {
        lock.lock(); defer { lock.unlock() }
        values = values.filter { !$0.key.hasPrefix("\(draftId)/") }
    }
}

struct TrainingEvidenceBinding: Codable, Equatable, Sendable {
    var reviewId: String
    var reviewVersion: Int
}

final class TrainingEvidenceBindingStore: @unchecked Sendable {
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func load(draftId: String) -> TrainingEvidenceBinding? {
        guard let data = defaults.data(forKey: key(draftId)) else { return nil }
        return try? JSONDecoder().decode(TrainingEvidenceBinding.self, from: data)
    }

    func save(_ binding: TrainingEvidenceBinding, draftId: String) {
        if let data = try? JSONEncoder().encode(binding) { defaults.set(data, forKey: key(draftId)) }
    }

    func remove(draftId: String) { defaults.removeObject(forKey: key(draftId)) }
    private func key(_ draftId: String) -> String { "physiqueos.trainingEvidenceBinding.\(draftId)" }
}
