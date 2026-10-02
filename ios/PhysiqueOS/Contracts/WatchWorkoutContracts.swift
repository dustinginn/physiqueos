import Foundation

/// Foundation-only, versioned Watch/phone wire vocabulary. It intentionally
/// imports neither WatchConnectivity nor HealthKit so both app targets can
/// compile/test the exact same deterministic contract.
enum WatchWorkoutContract {
    static let schemaVersion = 1
    static let maximumIdentifierLength = 96
    static let maximumRows = 2
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
    var issuedAt: Date

    var isBoundedAndSupported: Bool {
        schemaVersion == WatchWorkoutContract.schemaVersion
            && !commandId.isEmpty && commandId.count <= WatchWorkoutContract.maximumIdentifierLength
            && !mutationId.isEmpty && mutationId.count <= WatchWorkoutContract.maximumIdentifierLength
            && !sessionId.isEmpty && sessionId.count <= WatchWorkoutContract.maximumIdentifierLength
            && expectedRevision >= 0
            && exerciseId.map { !$0.isEmpty && $0.count <= WatchWorkoutContract.maximumIdentifierLength } ?? true
            && setId.map { !$0.isEmpty && $0.count <= WatchWorkoutContract.maximumIdentifierLength } ?? true
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
        case unavailable, prepared, active, paused, finishing, committed
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
