import Foundation

protocol TrainingLoggerDraftStore: AnyObject {
    func loadAll() -> [TrainingLoggerDraft]
    func save(_ draft: TrainingLoggerDraft)
    func discard(id: String)
}

extension TrainingLoggerDraftStore {
    /// Compatibility conveniences for tests and old call sites. Product
    /// code uses the exact-ID collection methods above.
    func load() -> TrainingLoggerDraft? { loadAll().first }
    func discard() { loadAll().forEach { discard(id: $0.id) } }
}

final class UserDefaultsTrainingLoggerDraftStore: TrainingLoggerDraftStore {
    private struct CollectionEnvelope: Codable {
        var schemaVersion: Int
        var drafts: [TrainingLoggerDraft]
    }
    private let defaults: UserDefaults
    private let key: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults = .standard, key: String = "physiqueos.trainingLogger.localDraft.v1") {
        self.defaults = defaults
        self.key = key
    }

    func loadAll() -> [TrainingLoggerDraft] {
        guard let data = defaults.data(forKey: key) else { return [] }
        if let envelope = try? decoder.decode(CollectionEnvelope.self, from: data) {
            return Self.sorted(envelope.drafts)
        }
        // Build 35/36 stored one complete draft directly at this key. Read
        // it losslessly and migrate only when the next exact-ID write occurs.
        if let legacy = try? decoder.decode(TrainingLoggerDraft.self, from: data) {
            return [legacy]
        }
        return []
    }

    func save(_ draft: TrainingLoggerDraft) {
        var drafts = loadAll().filter { $0.id != draft.id }
        drafts.append(draft)
        let envelope = CollectionEnvelope(schemaVersion: 2, drafts: Self.sorted(drafts))
        guard let data = try? encoder.encode(envelope) else { return }
        defaults.set(data, forKey: key)
    }

    func discard(id: String) {
        let remaining = loadAll().filter { $0.id != id }
        guard !remaining.isEmpty else {
            defaults.removeObject(forKey: key)
            return
        }
        guard let data = try? encoder.encode(CollectionEnvelope(schemaVersion: 2, drafts: Self.sorted(remaining))) else { return }
        defaults.set(data, forKey: key)
    }

    private static func sorted(_ drafts: [TrainingLoggerDraft]) -> [TrainingLoggerDraft] {
        drafts.sorted {
            let left = $0.startedAt ?? $0.workoutDate
            let right = $1.startedAt ?? $1.workoutDate
            return left == right ? $0.id < $1.id : left > right
        }
    }
}

final class MemoryTrainingLoggerDraftStore: TrainingLoggerDraftStore {
    private(set) var drafts: [TrainingLoggerDraft]
    var draft: TrainingLoggerDraft? { drafts.first }

    init(draft: TrainingLoggerDraft? = nil) {
        self.drafts = draft.map { [$0] } ?? []
    }

    init(drafts: [TrainingLoggerDraft]) { self.drafts = drafts }

    func loadAll() -> [TrainingLoggerDraft] { drafts }
    func save(_ draft: TrainingLoggerDraft) {
        drafts.removeAll { $0.id == draft.id }
        drafts.append(draft)
    }
    func discard(id: String) { drafts.removeAll { $0.id == id } }
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
