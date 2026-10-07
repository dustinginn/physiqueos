import Foundation

/// Foundation-only, versioned Watch/phone wire vocabulary. It intentionally
/// imports neither WatchConnectivity nor HealthKit so both app targets can
/// compile/test the exact same deterministic contract.
enum WatchWorkoutContract {
    /// v3 (Build 83): explicit `finishConfirmation` phase, `finishedAt`,
    /// recently ended sessions and Daily Totals. A v2 Watch ignores v3
    /// projections (and a v3 phone refuses v2 commands), so a mismatched pair
    /// fails closed instead of misreading a new phase as terminal.
    static let schemaVersion = 3
    static let maximumIdentifierLength = 96
    static let maximumRows = 2
    /// Save-required sessions are listed first, then cancelled ones. Sixty-
    /// four compact records remain comfortably within application-context
    /// limits and prevent ordinary recent activity from crowding out a
    /// confirmed finish while the phone is unavailable.
    static let maximumRecentlyEndedSessions = 64
    // Keep the transport slot stable across schema revisions so the newest
    // authoritative payload replaces an older cached projection in place.
    static let applicationContextProjectionKey = "physiqueos.watchWorkout.projection.v1"
    /// Separate slot for the compact Daily Totals snapshot. Application
    /// context is replaced as a whole, so the phone always publishes both.
    static let applicationContextDailyTotalsKey = "physiqueos.watchWorkout.dailyTotals.v1"
    /// The Founder's Apple Watch appearance (independent of the iPhone's),
    /// a plain raw string. Absent (older phone) or unknown values leave the
    /// Watch on its last stored choice, which itself defaults to Dark.
    static let applicationContextAppearanceKey = "physiqueos.watch.appearance.v1"
}

/// The Apple Watch app's own appearance: a PhysiqueOS palette choice, not a
/// watchOS system mode (watchOS has no system light appearance to follow,
/// so there is deliberately no `system` case). Configured on the iPhone's
/// Appearance page, independent of the iPhone appearance.
enum WatchAppearancePreference: String, CaseIterable, Codable, Identifiable, Sendable {
    case dark
    case mineralLight

    /// Unset, missing or unrecognized preferences are Dark.
    static let fallback: Self = .dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dark: "Dark"
        case .mineralLight: "Mineral Light"
        }
    }

    /// Bounded decoding for an application-context value of any type.
    static func decode(_ value: Any?) -> Self? {
        guard let raw = value as? String, raw.count <= 32 else { return nil }
        return Self(rawValue: raw)
    }
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
        /// The Watch began its HealthKit workout for an already-running
        /// structured session (Build 86: phone-started sessions). Identified
        /// by session, never revision-guarded; idempotent.
        case reportHealthStarted
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
    /// `reportHealthStarted` only: the HealthKit workout's start instant.
    var healthStartedAt: Date? = nil
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
        case noCompletedSets
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
        /// `finishConfirmation`: Finish was requested and waits for the
        /// explicit Finish / Not Yet answer. Nothing is finishing yet.
        /// `finishing`: Finish was confirmed (one `finish.operationId`).
        case unavailable, prepared, active, paused, finishConfirmation, finishing, committed, cancelled
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
        /// Timed (duration-measured) sets: the entered seconds, so the Watch
        /// shows the set's real value instead of an empty reps tile. Optional
        /// and additive: an older Watch ignores it, an older phone omits it.
        var durationText: String? = nil
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
    /// The confirmed Finish instant (phone authority). The Watch ends its
    /// HealthKit workout at this instant so both records share one window.
    var finishedAt: Date? = nil
    /// Sessions the phone ended recently (newest first, bounded). Lets the
    /// Watch resolve a still-running HealthKit workout for a session that is
    /// no longer current: save it when the session was committed, discard it
    /// only when it was cancelled.
    var recentlyEnded: [WatchWorkoutEndedSession] = []
    /// When the phone authority recorded that the Watch owns a HealthKit
    /// workout for this session (Watch Start, or a reported automatic start).
    /// Absent on older phones and on sessions with no Watch Health workout.
    var watchHealthStartedAt: Date? = nil
    /// The phone Logger is on Workout Review / Final Confirmation: sets are
    /// read-only there, so the Watch shows why Complete Set is unavailable.
    /// Optional and additive (older phones omit it, older Watches ignore it).
    var isPhoneReviewing: Bool? = nil
    /// When the phone prepared this plan for the Watch (`readyForWatchAt`),
    /// sent only with `.prepared`. With `sessionId` it names one preparation
    /// lifecycle, so the Watch's single "ready" cue fires once per genuine
    /// Ready. Optional and additive (older phones omit it, older Watches
    /// ignore it); it is never a start authority (`watchStartedAt` is).
    var preparedAt: Date? = nil

    var isTerminalAuthorityState: Bool {
        phase == .cancelled || phase == .unavailable
    }

    /// The Watch's HealthKit workout must be ended and saved in these phases.
    var requiresHealthSave: Bool {
        (phase == .finishing || phase == .committed) && finish?.operationId != nil
    }

    static func terminal(
        sessionId: String,
        revision: Int,
        phase: Phase,
        stalenessReason: StalenessReason? = nil,
        recentlyEnded: [WatchWorkoutEndedSession] = []
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
            summary: nil,
            finishedAt: nil,
            recentlyEnded: recentlyEnded
        )
    }
}

/// How the phone authority ended a session that is no longer current.
struct WatchWorkoutEndedSession: Codable, Equatable, Sendable {
    enum Outcome: String, WatchWorkoutSafeStringEnum, Sendable {
        /// Structured session durable on the Server: save, never discard.
        case committed
        /// Canonical Cancel: discard the HealthKit workout.
        case cancelled
        /// A confirmed finish whose structured draft was later discarded on
        /// the phone: the HealthKit workout is still saved, never discarded.
        case discardedAfterFinish
        /// Unknown future outcome: never discard on it.
        case unknown
        static let fallback: Self = .unknown
    }
    var sessionId: String
    var outcome: Outcome
    var finishOperationId: String?
    var finishedAt: Date?
}

/// Compact, display-only daily totals for the Watch's third Crown page. The
/// phone derives it from the same canonical snapshot Home and the Home
/// Widget render; the Watch never computes daily totals itself.
struct WatchDailyTotals: Codable, Equatable, Sendable {
    static let schemaVersion = 1

    var schemaVersion: Int
    /// Local calendar day the values belong to ("yyyy-MM-dd").
    var localDate: String
    var activeCalories: Double?
    var nutritionCalories: Double?
    var isActivityPartialDay: Bool
    /// Last fully successful canonical read; nil when never refreshed.
    var refreshedAt: Date?
    var isOffline: Bool
    var writtenAt: Date
}

struct WatchWorkoutFinishStatus: Codable, Equatable, Sendable {
    var operationId: String
    var healthSaved: Bool
    var healthFailed: Bool
    var serverCommitted: Bool
    var serverPending: Bool
    var correlationPending: Bool
    /// A Watch HealthKit workout belongs to this finish (Watch-started).
    var healthExpected: Bool = true
    /// The phone's command transport is waiting for a network path.
    var serverWaitingForNetwork: Bool = false
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
