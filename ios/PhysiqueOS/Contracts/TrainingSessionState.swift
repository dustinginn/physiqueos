import Foundation

// Active Workout Logger session state owned by `TrainingSessionAuthority`:
// rest mode/state, per-set completion timestamps, and the explicit
// mutation outcome vocabulary. Everything here is local-only — none of it
// enters the `commitTrainingSession` payload or its idempotency signature.

/// How rest is tracked after a set is completed.
enum TrainingRestMode: String, Codable, Equatable, Sendable, CaseIterable {
    /// Counts up from 0:00 at `startedAt`.
    case stopwatch
    /// Counts down to `endsAt`; reaching zero changes nothing else.
    case countdown
    /// No rest state is ever created.
    case off

    /// Unknown future values decode as `.off` so a newer build's draft never
    /// makes an older build drop the whole draft collection.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? .off
    }
}

/// A rest preference: a mode plus, for Countdown, its duration.
struct TrainingRestConfiguration: Codable, Equatable, Sendable {
    static let countdownDurationRange = 5...3_600

    var mode: TrainingRestMode
    var countdownDurationSeconds: Int?

    static let off = Self(mode: .off, countdownDurationSeconds: nil)
    static let stopwatch = Self(mode: .stopwatch, countdownDurationSeconds: nil)
    static func countdown(seconds: Int) -> Self { .init(mode: .countdown, countdownDurationSeconds: seconds) }

    /// The mode actually used. A Countdown without a usable duration is
    /// treated as Off rather than inventing a duration.
    var effectiveMode: TrainingRestMode {
        guard mode == .countdown else { return mode }
        guard let seconds = countdownDurationSeconds, Self.countdownDurationRange.contains(seconds) else { return .off }
        return .countdown
    }
}

/// One rest interval. Absolute instants only, so any renderer (the Logger,
/// a future Live Activity) derives the clock without per-second updates:
/// Stopwatch = now - startedAt; Countdown = endsAt - now.
struct TrainingSessionRestState: Codable, Equatable, Sendable {
    var id: String
    var mode: TrainingRestMode
    var startedAt: String
    /// Countdown only.
    var endsAt: String?
    /// Countdown only.
    var durationSeconds: Int?
    var sourceExerciseId: String
    var sourceSetId: String
    /// Frozen clock values while the structured workout is paused. Anchors
    /// are re-created on resume so clocks never advance during the pause.
    var frozenElapsedSeconds: Double? = nil
    var frozenRemainingSeconds: Double? = nil

    var startedAtDate: Date? { TrainingSessionClock.date(from: startedAt) }
    var endsAtDate: Date? { endsAt.flatMap(TrainingSessionClock.date(from:)) }

    /// A Countdown whose `endsAt` has passed. Expiry is presentation only:
    /// it never completes or advances anything.
    func isExpired(at now: Date) -> Bool {
        guard mode == .countdown, let endsAtDate else { return false }
        return now >= endsAtDate
    }
}

/// Supplies rest preferences below the session override. The exercise id
/// lets a later per-exercise preference slot in without a schema change.
@MainActor
protocol TrainingRestPreferenceProviding: AnyObject {
    /// `nil` = no preference recorded at this level.
    func restConfiguration(canonicalExerciseId: String?) -> TrainingRestConfiguration?
}

/// No product-wide default is chosen yet: with nothing recorded, rest is
/// Off and no rest state is created (today's Logger behavior).
@MainActor
final class UnsetTrainingRestPreferences: TrainingRestPreferenceProviding {
    nonisolated init() {}
    func restConfiguration(canonicalExerciseId: String?) -> TrainingRestConfiguration? { nil }
}

/// The device-wide rest preference. Stopwatch until the user chooses
/// otherwise (Founder decision); Countdown and Off stay selectable, and
/// Countdown keeps its own duration. Observable so the Logger menu reflects
/// it. A change applies to the *next* completed set: a rest interval that is
/// already running keeps the mode it started with.
@MainActor
@Observable
final class UserDefaultsTrainingRestPreferences: TrainingRestPreferenceProviding {
    static let globalKey = "physiqueos.trainingLogger.restPreference.global.v1"
    static let defaultConfiguration = TrainingRestConfiguration.stopwatch
    static let defaultCountdownSeconds = 90
    /// Offered Countdown lengths, in seconds.
    static let countdownPresets = [30, 45, 60, 90, 120, 150, 180, 240, 300]

    @ObservationIgnored private let defaults: UserDefaults
    /// The configuration in effect. Always valid: a Countdown without a
    /// usable duration is never stored.
    private(set) var configuration: TrainingRestConfiguration
    /// The last Countdown length chosen, kept while Stopwatch or Off is selected
    /// so switching back restores it.
    private(set) var countdownSeconds: Int

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let stored = defaults.data(forKey: Self.globalKey).flatMap { try? JSONDecoder().decode(TrainingRestConfiguration.self, from: $0) }
        let resolved = stored.flatMap { $0.effectiveMode == $0.mode ? $0 : nil } ?? Self.defaultConfiguration
        let remembered = (defaults.object(forKey: Self.globalKey + ".countdownSeconds") as? Int)
            .flatMap { TrainingRestConfiguration.countdownDurationRange.contains($0) ? $0 : nil }
        configuration = resolved
        countdownSeconds = resolved.countdownDurationSeconds ?? remembered ?? Self.defaultCountdownSeconds
    }

    func select(_ mode: TrainingRestMode) {
        switch mode {
        case .stopwatch: apply(.stopwatch)
        case .off: apply(.off)
        case .countdown: apply(.countdown(seconds: countdownSeconds))
        }
    }

    func selectCountdown(seconds: Int) {
        guard TrainingRestConfiguration.countdownDurationRange.contains(seconds) else { return }
        countdownSeconds = seconds
        defaults.set(seconds, forKey: Self.globalKey + ".countdownSeconds")
        apply(.countdown(seconds: seconds))
    }

    private func apply(_ configuration: TrainingRestConfiguration) {
        self.configuration = configuration
        if let data = try? JSONEncoder().encode(configuration) { defaults.set(data, forKey: Self.globalKey) }
    }

    func restConfiguration(canonicalExerciseId: String?) -> TrainingRestConfiguration? { configuration }

    /// "Stopwatch", "Countdown 1:30" or "Off".
    var summary: String { Self.summary(for: configuration) }

    static func summary(for configuration: TrainingRestConfiguration) -> String {
        switch configuration.effectiveMode {
        case .stopwatch: "Stopwatch"
        case .off: "Off"
        case .countdown: "Countdown \(clock(seconds: configuration.countdownDurationSeconds ?? 0))"
        }
    }

    static func clock(seconds: Int) -> String { String(format: "%d:%02d", seconds / 60, seconds % 60) }
}

/// Fixed preference, for tests and previews.
@MainActor
final class FixedTrainingRestPreferences: TrainingRestPreferenceProviding {
    var configuration: TrainingRestConfiguration?
    var exerciseOverrides: [String: TrainingRestConfiguration]

    nonisolated init(_ configuration: TrainingRestConfiguration?, exerciseOverrides: [String: TrainingRestConfiguration] = [:]) {
        self.configuration = configuration
        self.exerciseOverrides = exerciseOverrides
    }

    func restConfiguration(canonicalExerciseId: String?) -> TrainingRestConfiguration? {
        canonicalExerciseId.flatMap { exerciseOverrides[$0] } ?? configuration
    }
}

/// Timestamp encoding for session-local instants. Writes fractional
/// seconds so two completions in the same second still order; reads both
/// forms (the draft's older `startedAt`/`finishedAt` have none).
enum TrainingSessionClock {
    static func string(from date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    static func date(from string: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }
}

// MARK: - Mutation vocabulary

/// Who issued a mutation. Only `.ui` may use the general structural edit;
/// `.intent` (a future LiveActivityIntent) is limited to typed operations
/// on an in-progress live session.
enum TrainingSessionMutationOrigin: String, Equatable, Sendable {
    case ui
    case intent
    case system
}

struct TrainingSessionMutationContext: Equatable, Sendable {
    var origin: TrainingSessionMutationOrigin
    /// Caller-generated id. A replay of an already-applied id is reported as
    /// `.duplicate` and changes nothing.
    var mutationId: String?
    /// Compare-and-set guard. A mutation that would change state is refused
    /// with `.staleRevision` unless this equals the current revision. A
    /// request whose end state already holds is `.unchanged` regardless.
    var expectedRevision: Int?

    static let ui = Self(origin: .ui, mutationId: nil, expectedRevision: nil)
    static let system = Self(origin: .system, mutationId: nil, expectedRevision: nil)
    /// Intents always carry the revision they were rendered from, so a
    /// replayed or delayed id can never re-apply after a newer change.
    static func intent(mutationId: String, expectedRevision: Int) -> Self {
        .init(origin: .intent, mutationId: mutationId, expectedRevision: expectedRevision)
    }
}

enum TrainingSessionMutationRejection: Error, Equatable, Sendable {
    case writesNotAuthorized
    case sessionNotFound
    /// The id belongs to a session that already ended in this process
    /// (cancelled, discarded, committed); it is never re-created.
    case sessionEnded
    /// An `.intent` mutation must name the revision it was rendered from.
    case revisionRequired
    case exerciseNotFound
    case setNotFound
    /// Refused by the compare-and-set guard; carries the current revision.
    case staleRevision(current: Int)
    /// Not an in-progress live session at the set-entry step, or a Finish
    /// is in flight.
    case sessionNotMutable
    /// The structured session is paused; mutations fail closed until resume.
    case sessionPaused
    /// The operation is not available to this origin.
    case originNotPermitted
    /// An intent may only complete a set whose entered values are valid.
    case setValuesIncomplete
    case restNotFound
    /// The draft store refused the write; memory still equals storage.
    case persistenceFailed
}

enum TrainingSessionMutationOutcome: Equatable, Sendable {
    case applied(revision: Int)
    /// Valid request whose end state already held; nothing was written.
    case unchanged(revision: Int)
    /// The mutation id was already applied; nothing was written.
    case duplicate(revision: Int)
    case rejected(TrainingSessionMutationRejection)

    var isAccepted: Bool {
        if case .rejected = self { return false }
        return true
    }
}

enum TrainingSessionSetField: String, Equatable, Sendable {
    case reps
    case load
    case durationSeconds

    /// The Logger's numeric edit-buffer key component (unchanged names).
    var bufferName: String {
        switch self {
        case .reps: "reps"
        case .load: "load"
        case .durationSeconds: "duration"
        }
    }

    var keyPath: WritableKeyPath<TrainingLoggerDraftSet, Double?> {
        switch self {
        case .reps: \.reps
        case .load: \.load
        case .durationSeconds: \.durationSeconds
        }
    }
}

/// Why a session left the authority.
enum TrainingSessionEndReason: String, Equatable, Sendable {
    /// Durable on the Server (Finish, or durability recovery).
    case committed
    case cancelled
    case discarded
}

/// The most recent accepted change, for observers such as a future Live
/// Activity coordinator.
struct TrainingSessionChange: Equatable, Sendable {
    enum Kind: Equatable, Sendable {
        case started
        case mutated
        /// A Finish commit began or ended for this session (the revision is
        /// unchanged; observers re-read `isSubmitting`).
        case submission
        case ended(TrainingSessionEndReason)
    }

    var sessionId: String
    var revision: Int
    var kind: Kind
}

// MARK: - Invariants

/// Pure rules applied by the authority to every accepted mutation.
enum TrainingSessionInvariants {
    static let mutationLedgerLimit = 32

    /// Applies completion-timestamp and rest rules to `next`, given the
    /// state it replaces.
    ///
    /// - completedAt: stamped only on an incomplete -> complete transition of
    ///   an existing set in a live session; preserved while the set stays
    ///   complete; cleared when it becomes incomplete. A set that appears
    ///   already complete keeps whatever it carries (no fabrication).
    /// - rest: a transition in a live session starts (or replaces) rest per
    ///   `restConfiguration`; Off clears it. Rest also ends when its source
    ///   set is no longer complete, and whenever the session is left,
    ///   awaiting durability, or complete (Finish itself clears it in
    ///   `markFinishing`). Countdown expiry changes nothing.
    static func normalize(
        _ next: inout TrainingLoggerDraft,
        previous: TrainingLoggerDraft,
        now: Date,
        restConfiguration: (TrainingLoggerDraftExercise) -> TrainingRestConfiguration
    ) {
        var previousCompletion: [String: (isCompleted: Bool, completedAt: String?)] = [:]
        for exercise in previous.exercises {
            for set in exercise.sets { previousCompletion[set.id] = (set.isCompleted, set.completedAt) }
        }
        let stamp = TrainingSessionClock.string(from: now)
        let isLive = next.mode == .live
        var lastTransition: (exercise: TrainingLoggerDraftExercise, setId: String)?

        for exerciseIndex in next.exercises.indices {
            for setIndex in next.exercises[exerciseIndex].sets.indices {
                let set = next.exercises[exerciseIndex].sets[setIndex]
                guard set.isCompleted else {
                    next.exercises[exerciseIndex].sets[setIndex].completedAt = nil
                    continue
                }
                guard let before = previousCompletion[set.id] else { continue }
                if before.isCompleted {
                    next.exercises[exerciseIndex].sets[setIndex].completedAt = before.completedAt
                } else if isLive {
                    next.exercises[exerciseIndex].sets[setIndex].completedAt = stamp
                    lastTransition = (next.exercises[exerciseIndex], set.id)
                } else {
                    next.exercises[exerciseIndex].sets[setIndex].completedAt = nil
                }
            }
        }

        if let lastTransition {
            let configuration = restConfiguration(lastTransition.exercise)
            switch configuration.effectiveMode {
            case .off:
                next.rest = nil
            case .stopwatch:
                next.rest = .init(
                    id: "rest|\(lastTransition.setId)|\(stamp)", mode: .stopwatch, startedAt: stamp,
                    endsAt: nil, durationSeconds: nil,
                    sourceExerciseId: lastTransition.exercise.id, sourceSetId: lastTransition.setId
                )
            case .countdown:
                let seconds = configuration.countdownDurationSeconds ?? 0
                next.rest = .init(
                    id: "rest|\(lastTransition.setId)|\(stamp)", mode: .countdown, startedAt: stamp,
                    endsAt: TrainingSessionClock.string(from: now.addingTimeInterval(TimeInterval(seconds))),
                    durationSeconds: seconds,
                    sourceExerciseId: lastTransition.exercise.id, sourceSetId: lastTransition.setId
                )
            }
        }

        if next.rest?.mode == .off { next.rest = nil } // e.g. an unknown future mode
        if let rest = next.rest {
            let sourceStillComplete = next.exercises
                .first { $0.id == rest.sourceExerciseId }?
                .sets.first { $0.id == rest.sourceSetId }?
                .isCompleted == true
            let sessionResting = isLive && next.leftAt == nil
                && next.submissionState == nil && next.step != .complete
            if !sourceStillComplete || !sessionResting { next.rest = nil }
        }
    }

    /// Whether a non-UI origin may change this session's content: an
    /// in-progress live session at set entry, not left and not awaiting
    /// durability. (A Finish in flight is refused separately by the
    /// authority's submission lock; returning to set entry after a failed
    /// Finish makes the session mutable again.)
    static func acceptsExternalContentMutation(_ draft: TrainingLoggerDraft) -> Bool {
        draft.mode == .live
            && (draft.step == .workout || draft.isAddingExercises)
            && draft.submissionState == nil
            && draft.leftAt == nil
            && draft.pausedAt == nil
    }

    /// Equality ignoring the bookkeeping the authority itself advances.
    static func contentEqual(_ lhs: TrainingLoggerDraft, _ rhs: TrainingLoggerDraft) -> Bool {
        var lhs = lhs, rhs = rhs
        lhs.revision = nil; rhs.revision = nil
        lhs.appliedMutationIds = nil; rhs.appliedMutationIds = nil
        return lhs == rhs
    }
}
