import Foundation

/// Foundation-only, versioned Watch/phone wire vocabulary. It intentionally
/// imports neither WatchConnectivity nor HealthKit so both app targets can
/// compile/test the exact same deterministic contract.
enum WatchWorkoutContract {
    static let schemaVersion = 2
    static let maximumIdentifierLength = 96
    static let maximumRows = 2
    // Keep the transport slot stable across schema revisions so the newest
    // authoritative payload replaces an older cached projection in place.
    static let applicationContextProjectionKey = "physiqueos.watchWorkout.projection.v1"
}

protocol WatchWorkoutSafeStringEnum: RawRepresentable, Codable where RawValue == String {
    static var fallback: Self { get }
}

extension WatchWorkoutSafeStringEnum {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? Self.fallback
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

struct WatchWorkoutCommand: Codable, Equatable, Sendable {
    enum Kind: String, WatchWorkoutSafeStringEnum, Sendable {
        case refreshProjection
        case startPreparedWorkout
        case completeSet
        case pause
        case resume
        case requestFinish
        case cancelFinish
        case confirmFinish
        case cancelWorkout
        case reportHealthSaved
        case reportHealthSaveFailed
        case unknown
        static let fallback: Self = .unknown
    }

    var schemaVersion: Int
    var commandId: String
    var mutationId: String
    var kind: Kind
    var sessionId: String
    var expectedRevision: Int
    var exerciseId: String?
    var setId: String?
    /// Stable saga identity. The confirm command's mutation id becomes this
    /// value; later HealthKit reports carry it across revision refreshes.
    var finishOperationId: String? = nil
    var issuedAt: Date

    var isBoundedAndSupported: Bool {
        schemaVersion == WatchWorkoutContract.schemaVersion
            && !commandId.isEmpty && commandId.count <= WatchWorkoutContract.maximumIdentifierLength
            && !mutationId.isEmpty && mutationId.count <= WatchWorkoutContract.maximumIdentifierLength
            && !sessionId.isEmpty && sessionId.count <= WatchWorkoutContract.maximumIdentifierLength
            && expectedRevision >= 0
            && exerciseId.map { !$0.isEmpty && $0.count <= WatchWorkoutContract.maximumIdentifierLength } ?? true
            && setId.map { !$0.isEmpty && $0.count <= WatchWorkoutContract.maximumIdentifierLength } ?? true
            && finishOperationId.map { !$0.isEmpty && $0.count <= WatchWorkoutContract.maximumIdentifierLength } ?? true
    }
}

struct WatchWorkoutAcknowledgement: Codable, Equatable, Sendable {
    enum Status: String, WatchWorkoutSafeStringEnum, Sendable {
        case applied, unchanged, stale, rejected
        static let fallback: Self = .rejected
    }
    enum Reason: String, WatchWorkoutSafeStringEnum, Sendable {
        case unsupportedContract
        case phoneUnreachable
        case invalidCommand
        case sessionUnavailable
        case staleRevision
        case sessionPaused
        case sessionNotMutable
        case persistenceFailed
        case finishConfirmationRequired
        static let fallback: Self = .unsupportedContract
    }

    var schemaVersion: Int
    var commandId: String
    var mutationId: String
    var status: Status
    var reason: Reason?
    var acknowledgedRevision: Int?
    /// Always the phone authority's latest compact state when available.
    var projection: WatchWorkoutProjection?
}

struct WatchWorkoutProjection: Codable, Equatable, Sendable {
    enum Phase: String, WatchWorkoutSafeStringEnum, Sendable {
        case unavailable, prepared, active, paused, finishing, committed, cancelled
        static let fallback: Self = .unavailable
    }

    enum StalenessReason: String, WatchWorkoutSafeStringEnum, Sendable {
        case phoneUnreachable, authorityUnavailable, revisionMismatch
        static let fallback: Self = .authorityUnavailable
    }

    enum FinishEligibility: String, WatchWorkoutSafeStringEnum, Sendable {
        case unavailable, confirmationRequired, confirmable
        static let fallback: Self = .unavailable
    }

    struct Row: Codable, Equatable, Sendable {
        var role: String
        var exerciseId: String
        var exerciseName: String
        var setId: String
        var setNumber: Int
        var setCount: Int
        var valueText: String?
        /// Split execution values. These stay presentation-only; Watch V1
        /// never edits them and only completes the exact set named here.
        var loadText: String? = nil
        var repsText: String? = nil
        var supersetLabel: String?
        var partnerName: String?
        var isCompletionTarget: Bool
    }

    struct Rest: Codable, Equatable, Sendable {
        enum Mode: String, WatchWorkoutSafeStringEnum, Sendable {
            case stopwatch, countdown
            static let fallback: Self = .stopwatch
        }
        var id: String
        var mode: Mode
        var startedAt: Date
        var endsAt: Date?
        var frozenElapsedSeconds: Double?
        var frozenRemainingSeconds: Double?
    }

    var schemaVersion: Int
    var sessionId: String
    var revision: Int
    var phase: Phase
    var title: String
    var completedSets: Int
    var totalSets: Int
    var rows: [Row]
    var rest: Rest?
    var canCompleteSet: Bool
    var finishEligibility: FinishEligibility
    var isFinalPlannedSetTransition: Bool
    var startedAt: Date?
    var pausedAt: Date?
    var accumulatedPausedSeconds: Double
    var elapsedWorkoutSeconds: Double?
    var stalenessReason: StalenessReason?
    var lastAcknowledgedMutationId: String?
    var metrics: WatchWorkoutMetrics?
    var finish: WatchWorkoutFinishStatus? = nil
    var summary: WatchWorkoutSummary? = nil

    var isTerminalAuthorityState: Bool {
        phase == .cancelled || phase == .unavailable
    }

    static func terminal(
        sessionId: String,
        revision: Int,
        phase: Phase,
        stalenessReason: StalenessReason? = nil
    ) -> Self {
        precondition(phase == .cancelled || phase == .unavailable)
        return .init(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            sessionId: sessionId,
            revision: revision,
            phase: phase,
            title: "",
            completedSets: 0,
            totalSets: 0,
            rows: [],
            rest: nil,
            canCompleteSet: false,
            finishEligibility: .unavailable,
            isFinalPlannedSetTransition: false,
            startedAt: nil,
            pausedAt: nil,
            accumulatedPausedSeconds: 0,
            elapsedWorkoutSeconds: nil,
            stalenessReason: stalenessReason,
            lastAcknowledgedMutationId: nil,
            metrics: nil,
            finish: nil,
            summary: nil
        )
    }
}

struct WatchWorkoutFinishStatus: Codable, Equatable, Sendable {
    var operationId: String
    var healthSaved: Bool
    var healthFailed: Bool
    var serverCommitted: Bool
    var serverPending: Bool
    var correlationPending: Bool
}

struct WatchWorkoutSummary: Codable, Equatable, Sendable {
    var activeDurationSeconds: Double?
    var completedSets: Int
    var volume: Double?
    var authoritativePRCount: Int?
}

/// Small deterministic delivery gate shared by transport tests and the
/// Watch client. Only one interactive mutation can be in flight. A retry
/// reuses the exact command (and therefore mutation id); an out-of-order ack
/// can refresh authoritative state but cannot clear a newer command.
struct WatchWorkoutCommandDeliveryGate: Equatable, Sendable {
    private(set) var pending: WatchWorkoutCommand?

    mutating func begin(_ command: WatchWorkoutCommand) -> Bool {
        guard pending == nil else { return false }
        pending = command
        return true
    }

    mutating func acknowledge(_ acknowledgement: WatchWorkoutAcknowledgement) -> Bool {
        guard acknowledgement.commandId == pending?.commandId else { return false }
        pending = nil
        return true
    }

    mutating func reset() { pending = nil }
}

enum WatchWorkoutWireCodec {
    static func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(value)
    }

    static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(type, from: data)
    }
}

/// Metrics rendered by the Crown page. Total Calories is intentionally nil
/// unless both active and basal energy are real measurements.
struct WatchWorkoutMetrics: Codable, Equatable, Sendable {
    enum Availability: String, WatchWorkoutSafeStringEnum, Sendable {
        case acquiring, available, unavailable
        static let fallback: Self = .unavailable
    }

    var elapsedActiveSeconds: Double
    var rawHealthKitDurationSeconds: Double? = nil
    var currentHeartRateBPM: Double?
    var heartRateAvailability: Availability = .acquiring
    var activeCalories: Double?
    var basalCalories: Double?
    var energyAvailability: Availability = .acquiring

    var totalCalories: Double? {
        guard let activeCalories, let basalCalories else { return nil }
        return activeCalories + basalCalories
    }
}
