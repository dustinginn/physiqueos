import Foundation

/// A phone-owned allowlist of exact structured sessions that a trusted
/// PhysiqueOS Watch workout may claim. The registry is scoped to one owner;
/// arbitrary HealthKit metadata is never treated as join authority.
struct HealthKitTrustedWorkoutCorrelationContext: Sendable {
    struct SessionEnvelope: Equatable, Sendable {
        var sessionId: UUID
        var ownerKey: String
        var startedAt: Date
        var endedAt: Date?
    }

    var trustedSourceBundleIdentifiers: Set<String>
    var traditionalStrengthTrainingActivityTypes: Set<String>
    /// Server-owned prospective boundary. A delayed historical workout must
    /// never acquire exact authority after activation.
    var effectiveAt: Date?
    var ownerKey: String
    var sessions: [SessionEnvelope]
    var clockToleranceSeconds: TimeInterval

    static let disabled = Self(
        trustedSourceBundleIdentifiers: [],
        traditionalStrengthTrainingActivityTypes: [],
        effectiveAt: nil,
        ownerKey: "",
        sessions: [],
        clockToleranceSeconds: 0
    )
}

enum HealthKitTrustedWorkoutCorrelation {
    /// Returns the canonical lowercase UUID only when every trust check
    /// passes: configured source identity, UUID syntax and exact registry
    /// membership, traditional strength + indoor, owner scope, and temporal
    /// containment. Any ambiguity degrades to an ordinary uncorrelated
    /// HealthKit workout rather than guessing.
    static func extract(
        externalUUID: String?,
        sourceBundleIdentifier: String,
        activityType: String,
        isIndoorWorkout: Bool?,
        startedAt: Date?,
        endedAt: Date?,
        context: HealthKitTrustedWorkoutCorrelationContext
    ) -> String? {
        guard context.trustedSourceBundleIdentifiers.contains(sourceBundleIdentifier),
              context.traditionalStrengthTrainingActivityTypes.contains(activityType),
              isIndoorWorkout == true,
              let externalUUID,
              let sessionUUID = UUID(uuidString: externalUUID),
              let startedAt,
              let endedAt, endedAt >= startedAt,
              let effectiveAt = context.effectiveAt,
              startedAt >= effectiveAt
        else { return nil }
        let matches = context.sessions.filter { envelope in
            guard let envelopeEnd = envelope.endedAt else { return false }
            return envelope.sessionId == sessionUUID
                && envelope.ownerKey == context.ownerKey
                && startedAt >= envelope.startedAt.addingTimeInterval(-context.clockToleranceSeconds)
                && endedAt <= envelopeEnd.addingTimeInterval(context.clockToleranceSeconds)
        }
        guard matches.count == 1 else { return nil }
        return sessionUUID.uuidString.lowercased()
    }
}

enum HealthKitTrustedWorkoutCorrelationContract {
    static let contractVersion = "healthkit-trusted-watch-workout-correlation-v1"
}

/// Server-owned, prospective activation. Missing, malformed, or drifted
/// manifest data is OFF; Native never guesses a production source allowlist.
struct HealthKitTrustedWorkoutCorrelationCapability: Codable, Equatable, Sendable {
    var enabled: Bool
    var trustedSourceBundleIdentifiers: Set<String>
    var traditionalStrengthTrainingActivityTypes: Set<String>
    var clockToleranceSeconds: TimeInterval
    var effectiveAt: Date?
    var resolvedAt: Date

    static func disabled(at date: Date) -> Self {
        .init(
            enabled: false,
            trustedSourceBundleIdentifiers: [],
            traditionalStrengthTrainingActivityTypes: [],
            clockToleranceSeconds: 0,
            effectiveAt: nil,
            resolvedAt: date
        )
    }

    static func resolve(manifestBlock: ProductionJSONValue?, at date: Date) -> Self {
        guard case let .object(block)? = manifestBlock,
              block["contractVersion"]?.correlationString == HealthKitTrustedWorkoutCorrelationContract.contractVersion,
              case let .bool(enabled)? = block["enabled"], enabled,
              case let .bool(prospectiveOnly)? = block["prospectiveOnly"], prospectiveOnly,
              case let .array(bundleValues)? = block["trustedSourceBundleIdentifiers"],
              case let .array(activityValues)? = block["traditionalStrengthTrainingActivityTypes"],
              case let .number(tolerance)? = block["clockToleranceSeconds"],
              tolerance >= 0, tolerance <= 300,
              let effectiveText = block["effectiveAt"]?.correlationString,
              let effectiveAt = HealthKitSleepCapability.parseInstant(effectiveText)
        else { return .disabled(at: date) }
        let bundles = Set(bundleValues.compactMap(\.correlationString))
        let activities = Set(activityValues.compactMap(\.correlationString))
        guard bundles.count == bundleValues.count, bundles.count == 1,
              activities == Set(["50"]), effectiveAt <= date
        else { return .disabled(at: date) }
        return .init(
            enabled: true,
            trustedSourceBundleIdentifiers: bundles,
            traditionalStrengthTrainingActivityTypes: activities,
            clockToleranceSeconds: tolerance,
            effectiveAt: effectiveAt,
            resolvedAt: date
        )
    }
}

private extension ProductionJSONValue {
    var correlationString: String? {
        guard case let .string(value) = self else { return nil }
        return value
    }
}

protocol HealthKitTrustedWorkoutCorrelationCapabilityStore: Sendable {
    func load() -> HealthKitTrustedWorkoutCorrelationCapability?
    func save(_ capability: HealthKitTrustedWorkoutCorrelationCapability)
}

struct UserDefaultsHealthKitTrustedWorkoutCorrelationCapabilityStore: HealthKitTrustedWorkoutCorrelationCapabilityStore, @unchecked Sendable {
    private let defaults: UserDefaults
    private let key = "physiqueos.healthkit.trusted-watch-correlation.capability.v1"

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func load() -> HealthKitTrustedWorkoutCorrelationCapability? {
        guard let data = defaults.data(forKey: key) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(HealthKitTrustedWorkoutCorrelationCapability.self, from: data)
    }

    func save(_ capability: HealthKitTrustedWorkoutCorrelationCapability) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(capability) else { return }
        defaults.set(data, forKey: key)
    }
}

final class HealthKitTrustedWorkoutCorrelationGate: @unchecked Sendable {
    static let production = HealthKitTrustedWorkoutCorrelationGate(
        store: UserDefaultsHealthKitTrustedWorkoutCorrelationCapabilityStore()
    )

    private let lock = NSLock()
    private let store: any HealthKitTrustedWorkoutCorrelationCapabilityStore
    private var capability: HealthKitTrustedWorkoutCorrelationCapability?

    init(store: any HealthKitTrustedWorkoutCorrelationCapabilityStore) {
        self.store = store
        self.capability = store.load()
    }

    func update(_ capability: HealthKitTrustedWorkoutCorrelationCapability) {
        lock.withLock {
            self.capability = capability
            store.save(capability)
        }
    }

    func current() -> HealthKitTrustedWorkoutCorrelationCapability? {
        lock.withLock { capability }
    }
}

protocol HealthKitTrustedWorkoutCorrelationCapabilitySource: Sendable {
    func healthKitTrustedWorkoutCorrelationCapabilityBlock() async throws -> ProductionJSONValue?
}

extension ProductionNativeAPI: HealthKitTrustedWorkoutCorrelationCapabilitySource {
    func healthKitTrustedWorkoutCorrelationCapabilityBlock() async throws -> ProductionJSONValue? {
        try await readContracts().healthKitTrustedWatchWorkoutCorrelation
    }
}

/// Rebuilds the exact allowlist from durable phone authority at staging time.
/// The terminal ledger carries committed sessions across app kill and delayed
/// HealthKit delivery; active drafts are included only after a durable commit
/// presentation exists. A confirmed Watch finish is included before the
/// independent Server commit completes because its HealthKit observer may
/// run first; its UUID, Watch start, finish operation and frozen end are
/// already durable phone authority at that point.
final class HealthKitTrustedWorkoutCorrelationRegistry: @unchecked Sendable {
    private let gate: HealthKitTrustedWorkoutCorrelationGate
    private let drafts: TrainingLoggerDraftStore
    private let terminalLedger: TrainingSessionTerminalLedgerStore
    private let now: @Sendable () -> Date

    init(
        gate: HealthKitTrustedWorkoutCorrelationGate,
        drafts: TrainingLoggerDraftStore,
        terminalLedger: TrainingSessionTerminalLedgerStore,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.gate = gate
        self.drafts = drafts
        self.terminalLedger = terminalLedger
        self.now = now
    }

    func context(ownerKey: String) -> HealthKitTrustedWorkoutCorrelationContext {
        guard let capability = gate.current(), capability.enabled,
              let effectiveAt = capability.effectiveAt, effectiveAt <= now()
        else { return .disabled }
        var byID: [UUID: HealthKitTrustedWorkoutCorrelationContext.SessionEnvelope] = [:]
        for draft in drafts.loadAll()
        where draft.watchStartedAt != nil && draft.watchFinishOperationId != nil && draft.finishedAt != nil {
            guard let id = UUID(uuidString: draft.id),
                  let start = (draft.watchStartedAt ?? draft.startedAt).flatMap(TrainingSessionClock.date(from:)),
                  let end = draft.finishedAt.flatMap(TrainingSessionClock.date(from:)),
                  start >= effectiveAt
            else { continue }
            byID[id] = .init(sessionId: id, ownerKey: ownerKey, startedAt: start, endedAt: end)
        }
        for record in TrainingSessionTerminalLedger.pruned(terminalLedger.loadRecords(), now: now())
            where record.outcome == .committed {
            guard let id = UUID(uuidString: record.sessionId),
                  let start = record.startedAt.flatMap(TrainingSessionClock.date(from:)),
                  let end = record.finishedAt.flatMap(TrainingSessionClock.date(from:)),
                  start >= effectiveAt
            else { continue }
            byID[id] = .init(sessionId: id, ownerKey: ownerKey, startedAt: start, endedAt: end)
        }
        return .init(
            trustedSourceBundleIdentifiers: capability.trustedSourceBundleIdentifiers,
            traditionalStrengthTrainingActivityTypes: capability.traditionalStrengthTrainingActivityTypes,
            effectiveAt: effectiveAt,
            ownerKey: ownerKey,
            sessions: byID.values.sorted { $0.sessionId.uuidString < $1.sessionId.uuidString },
            clockToleranceSeconds: capability.clockToleranceSeconds
        )
    }
}
