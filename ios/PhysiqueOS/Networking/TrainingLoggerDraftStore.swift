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
