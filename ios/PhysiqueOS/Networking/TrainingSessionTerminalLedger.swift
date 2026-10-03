import Foundation

/// How a Workout Logger session left `TrainingSessionAuthority`, kept after
/// the draft itself is gone. The paired Watch may still hold a running
/// HealthKit workout (or a late command) for a session the phone already
/// ended; this record is what lets the phone answer "committed: save it"
/// versus "cancelled: discard it" across a phone relaunch, instead of
/// treating every unknown session as cancelled.
struct TrainingSessionTerminalRecord: Codable, Equatable, Sendable {
    enum Outcome: String, Codable, Equatable, Sendable {
        /// Durable on the Server.
        case committed
        /// Canonical Cancel or a saved-draft discard: nothing was committed.
        case cancelled
    }

    var sessionId: String
    var outcome: Outcome
    var finishOperationId: String?
    var finishedAt: String?
    var healthSaveState: WatchWorkoutFinishComponentState?
    /// The Cancel mutation id, so a lost Watch Cancel acknowledgement replays
    /// idempotently even after a relaunch.
    var cancelMutationId: String?
    var recordedAt: String
    var acknowledgedAt: String?
}

/// Persistence for the terminal ledger. Small and bounded; one per Native
/// authority.
protocol TrainingSessionTerminalLedgerStore: AnyObject {
    func loadRecords() -> [TrainingSessionTerminalRecord]
    func saveRecords(_ records: [TrainingSessionTerminalRecord])
}

final class MemoryTrainingSessionTerminalLedgerStore: TrainingSessionTerminalLedgerStore {
    private var records: [TrainingSessionTerminalRecord]
    init(_ records: [TrainingSessionTerminalRecord] = []) { self.records = records }
    func loadRecords() -> [TrainingSessionTerminalRecord] { records }
    func saveRecords(_ records: [TrainingSessionTerminalRecord]) { self.records = records }
}

final class UserDefaultsTrainingSessionTerminalLedgerStore: TrainingSessionTerminalLedgerStore {
    private let defaults: UserDefaults
    private let key: String

    init(key: String, defaults: UserDefaults = .standard) {
        self.key = key
        self.defaults = defaults
    }

    func loadRecords() -> [TrainingSessionTerminalRecord] {
        guard let data = defaults.data(forKey: key) else { return [] }
        // One undecodable record (e.g. a future outcome after a downgrade)
        // drops only itself, never the whole ledger.
        return ((try? JSONDecoder().decode([LossyRecord].self, from: data)) ?? []).compactMap(\.record)
    }

    private struct LossyRecord: Decodable {
        let record: TrainingSessionTerminalRecord?
        init(from decoder: Decoder) throws {
            record = try? TrainingSessionTerminalRecord(from: decoder)
        }
    }

    func saveRecords(_ records: [TrainingSessionTerminalRecord]) {
        guard let data = try? JSONEncoder().encode(records) else { return }
        defaults.set(data, forKey: key)
    }
}

enum TrainingSessionTerminalLedger {
    static let maximumRecords = 16
    /// Longer than the 12 h live-session window, so a Watch that reconnects
    /// the next morning still learns how its workout ended.
    static let retention: TimeInterval = 48 * 60 * 60

    /// Newest first, bounded by count and age.
    static func pruned(_ records: [TrainingSessionTerminalRecord], now: Date) -> [TrainingSessionTerminalRecord] {
        let fresh = records.filter { record in
            guard let recorded = TrainingSessionClock.date(from: record.recordedAt) else { return false }
            let age = now.timeIntervalSince(recorded)
            return age >= -5 * 60 && age <= retention
        }
        let date = { (record: TrainingSessionTerminalRecord) in
            TrainingSessionClock.date(from: record.recordedAt) ?? .distantPast
        }
        return Array(fresh.sorted { date($0) > date($1) }.prefix(maximumRecords))
    }
}
