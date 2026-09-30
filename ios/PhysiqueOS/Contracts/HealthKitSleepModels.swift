import Foundation

/// HealthKit Sleep (`HKCategoryTypeIdentifierSleepAnalysis`) against the
/// Server Phase A contract `healthkit-sleep-ingestion-v1`
/// (`healthkit.sleep.ingest.v1`). DORMANT by construction:
///
/// - Nothing queries, observes, stages, or uploads Sleep unless the Server's
///   Native manifest advertises `healthKitSleepIngestion.enabled == true` with
///   a valid prospective `activationFloor` (see `HealthKitSleepCapability`).
/// - The Server policy that would flip that flag is absent in production, so
///   every shipped build stays inert until a separately authorized activation.
/// - Native forwards source truth only. It never ranks or prefers a source
///   (Oura, Watch, Sleep Cycle, ...): canonical source preference is a Server
///   policy decision.
enum HealthKitSleepIngestionContract {
    static let commandType = "healthkit.sleep.ingest.v1"
    static let contractVersion = "healthkit-sleep-ingestion-v1"
    static let maximumSamplesPerBatch = 100
    static let maximumDeletionsPerBatch = 100
    static let maximumManifestLiveIDs = 1000
    static let maximumManifestWindow: TimeInterval = 96 * 60 * 60
    /// Dedicated local cursor namespace. It never shares state with the
    /// Activity/Nutrition/Workout automatic scopes.
    static let predicateVersion = "healthkit-automatic-sleep-v1"
    /// Server 409 when its activation policy is absent/off: temporary, never
    /// a permanent rejection. Staged changes are kept and the cursor holds.
    static let disabledProblemCode = "HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED"
    /// Local diagnostic code recorded for the 409 above.
    static let disabledDiagnosticCode = "healthkit_sleep_ingestion_not_enabled"
    static let notActivatedDiagnosticCode = "healthkit_sleep_not_activated"
    static let sampleTimeZoneSource = "sample_metadata"
    static let deviceTimeZoneSource = "device_at_ingest"
}

/// The resolved, fail-closed Sleep capability advertised by the Server
/// manifest (`healthKitSleepIngestion`). Persisted as last-known state so a
/// HealthKit background launch -- which has no time for a network round trip
/// -- can decide whether Sleep is active. A stale "enabled" can only ever lead
/// to a Server 409, which keeps staged data and latches the gate off.
struct HealthKitSleepCapability: Equatable, Codable, Sendable {
    enum Mode: String, Codable, Sendable {
        case operational
        case validationOnly = "validation_only"
    }

    let enabled: Bool
    let mode: Mode?
    let effectiveSleepDay: String?
    let endSleepDay: String?
    let activationFloor: Date?
    let resolvedAt: Date

    static func disabled(at date: Date) -> HealthKitSleepCapability {
        HealthKitSleepCapability(
            enabled: false, mode: nil, effectiveSleepDay: nil, endSleepDay: nil,
            activationFloor: nil, resolvedAt: date
        )
    }

    /// Parses the raw manifest block. Absent, malformed, or contract-drifted
    /// input resolves to disabled -- it never throws and never enables.
    static func resolve(manifestBlock: ProductionJSONValue?, at date: Date) -> HealthKitSleepCapability {
        guard case let .object(block)? = manifestBlock,
              block["commandType"]?.sleepString == HealthKitSleepIngestionContract.commandType,
              block["contractVersion"]?.sleepString == HealthKitSleepIngestionContract.contractVersion,
              case let .bool(enabled)? = block["enabled"]
        else { return .disabled(at: date) }
        guard enabled else { return .disabled(at: date) }
        guard let modeRaw = block["mode"]?.sleepString,
              let mode = Mode(rawValue: modeRaw),
              let effective = block["effectiveSleepDay"]?.sleepString,
              isCalendarDay(effective),
              let floorText = block["activationFloor"]?.sleepString,
              let floor = parseInstant(floorText)
        else { return .disabled(at: date) }
        var end: String?
        switch block["endSleepDay"] {
        case nil, .null?:
            end = nil
        case let .string(value)?:
            guard isCalendarDay(value), value >= effective else { return .disabled(at: date) }
            end = value
        default:
            return .disabled(at: date)
        }
        // The Server's own limits must match what this build was written
        // against; a drifted contract is not something to guess about.
        if let samples = block["maximumSamplesPerBatch"], samples != .number(Double(HealthKitSleepIngestionContract.maximumSamplesPerBatch)) {
            return .disabled(at: date)
        }
        if let ids = block["maximumManifestLiveIds"], ids != .number(Double(HealthKitSleepIngestionContract.maximumManifestLiveIDs)) {
            return .disabled(at: date)
        }
        return HealthKitSleepCapability(
            enabled: true, mode: mode, effectiveSleepDay: effective, endSleepDay: end,
            activationFloor: floor, resolvedAt: date
        )
    }

    /// Whether Sleep may be queried/uploaded at `date`. A bounded policy is
    /// honored with one day of slack past its last sleep day (the Server
    /// accepts samples through `endSleepDay + 1`); an open-ended one has no end.
    func activeFloor(at date: Date) -> Date? {
        guard enabled, let activationFloor, mode != nil else { return nil }
        if let endSleepDay {
            guard let end = Self.utcDayStart(endSleepDay)?.addingTimeInterval(3 * 86_400), date < end else { return nil }
        }
        return activationFloor
    }

    static func isCalendarDay(_ value: String) -> Bool {
        guard let start = utcDayStart(value) else { return false }
        return dayFormatter.string(from: start) == value
    }

    private static func utcDayStart(_ value: String) -> Date? {
        guard value.count == 10 else { return nil }
        return dayFormatter.date(from: value)
    }

    static func parseInstant(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        return ISO8601DateFormatter().date(from: value)
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

private extension ProductionJSONValue {
    var sleepString: String? {
        guard case let .string(value) = self else { return nil }
        return value
    }
}

protocol HealthKitSleepCapabilityStore: Sendable {
    func load() -> HealthKitSleepCapability?
    func save(_ capability: HealthKitSleepCapability)
}

/// The capability holds no health data: an on/off flag, a mode, calendar
/// dates of the Server policy, and the floor instant.
struct UserDefaultsHealthKitSleepCapabilityStore: HealthKitSleepCapabilityStore, @unchecked Sendable {
    private let defaults: UserDefaults
    private let key = "physiqueos.healthkit.sleep.capability.v1"

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func load() -> HealthKitSleepCapability? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? Self.decoder.decode(HealthKitSleepCapability.self, from: data)
    }

    func save(_ capability: HealthKitSleepCapability) {
        guard let data = try? Self.encoder.encode(capability) else { return }
        defaults.set(data, forKey: key)
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

/// The single Native switch every Sleep path consults: the observer
/// registration, the engine (before any pending delivery or query), the query
/// client's predicate, and the window manifest sender. Absent persisted state
/// is OFF. A Server 409 `HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED` latches it OFF
/// until the next manifest read says otherwise.
final class HealthKitSleepActivationGate: @unchecked Sendable {
    /// App wiring shares one gate between the query client, the engine, the
    /// uploader callback, and the coordinator.
    static let production = HealthKitSleepActivationGate(store: UserDefaultsHealthKitSleepCapabilityStore())

    private let lock = NSLock()
    private let store: any HealthKitSleepCapabilityStore
    private var capability: HealthKitSleepCapability?

    init(store: any HealthKitSleepCapabilityStore) {
        self.store = store
        self.capability = store.load()
    }

    /// The prospective floor when Sleep is active at `date`, else `nil`.
    func activeFloor(at date: Date) -> Date? {
        lock.withLock { capability?.activeFloor(at: date) }
    }

    func currentCapability() -> HealthKitSleepCapability? {
        lock.withLock { capability }
    }

    /// Replaces the last-known state with a freshly resolved manifest block.
    func update(_ resolved: HealthKitSleepCapability) {
        lock.withLock { capability = resolved }
        store.save(resolved)
    }

    /// The Server said Sleep is not enabled. Stop querying and uploading now;
    /// the next successful manifest read decides again.
    func markServerDisabled(at date: Date) {
        let disabled = HealthKitSleepCapability.disabled(at: date)
        lock.withLock { capability = disabled }
        store.save(disabled)
    }
}

/// Reads the Server manifest's Sleep block. `ProductionNativeAPI` conforms.
protocol HealthKitSleepCapabilitySource: Sendable {
    func healthKitSleepCapabilityBlock() async throws -> ProductionJSONValue?
}

extension ProductionNativeAPI: HealthKitSleepCapabilitySource {
    func healthKitSleepCapabilityBlock() async throws -> ProductionJSONValue? {
        try await readContracts().healthKitSleepIngestion
    }
}

// MARK: - Wire

/// Exactly the Phase A privacy-safe sample fields. There is deliberately no
/// field for a source display name, device name, HKDevice, local/UDI device
/// identifiers, firmware, or a metadata dictionary.
struct HealthKitSleepWireSample: Encodable, Equatable, Sendable {
    struct Source: Encodable, Equatable, Sendable {
        let bundleIdentifier: String
        let sourceVersion: String?
        let productType: String?
    }

    let externalId: String
    let categoryValue: Int
    let startedAt: String
    let endedAt: String
    let timeZone: String
    let timeZoneSource: String
    let wasUserEntered: Bool
    let source: Source
}

struct HealthKitSleepWireDeletion: Encodable, Equatable, Sendable {
    let externalId: String
}

struct HealthKitSleepWireWindowManifest: Encodable, Equatable, Sendable {
    let windowStart: String
    let windowEnd: String
    let liveExternalIds: [String]
}

struct HealthKitSleepWirePayload: Encodable, Equatable, Sendable {
    let batchId: String
    let samples: [HealthKitSleepWireSample]?
    let deletions: [HealthKitSleepWireDeletion]?
    let windowManifest: HealthKitSleepWireWindowManifest?
}

enum HealthKitSleepWireMapper {
    static let sleepObjectTypeIdentifier = HealthKitSynchronizationStream.sleepAnalysis.objectTypeIdentifier

    static func canDeliver(_ observation: NormalizedHealthKitObservation) -> Bool {
        (try? sample(observation)) != nil
    }

    /// A staged partition belongs to the Sleep command when it carries only
    /// Sleep samples/deletions. Everything else keeps the original S1 path.
    static func isSleepPartition(_ partition: HealthKitStagedPartition) -> Bool {
        guard !(partition.additions.isEmpty && partition.deletions.isEmpty) else { return false }
        return partition.additions.allSatisfy { $0.objectTypeIdentifier == sleepObjectTypeIdentifier } &&
            partition.deletions.allSatisfy { $0.objectTypeIdentifier == sleepObjectTypeIdentifier }
    }

    static func payload(for partition: HealthKitStagedPartition) throws -> HealthKitSleepWirePayload {
        guard case .serverRequired = partition.disposition,
              isSleepPartition(partition),
              partition.additions.count <= HealthKitSleepIngestionContract.maximumSamplesPerBatch,
              partition.deletions.count <= HealthKitSleepIngestionContract.maximumDeletionsPerBatch
        else { throw HealthKitSyncError.operational(code: "healthkit_partition_not_sleep_deliverable") }
        let samples = try partition.additions.map(sample)
        let deletions = partition.deletions.map { HealthKitSleepWireDeletion(externalId: $0.healthKitUUID.uuidString.lowercased()) }
        return HealthKitSleepWirePayload(
            batchId: partition.identity,
            samples: samples.isEmpty ? nil : samples,
            deletions: deletions.isEmpty ? nil : deletions,
            windowManifest: nil
        )
    }

    static func sample(_ observation: NormalizedHealthKitObservation) throws -> HealthKitSleepWireSample {
        guard observation.objectTypeIdentifier == sleepObjectTypeIdentifier,
              let uuid = observation.healthKitUUID,
              case let .sleep(sleep) = observation.payload,
              let startedAt = observation.occurrence.startedAt,
              let endedAt = observation.occurrence.endedAt,
              endedAt >= startedAt,
              !observation.source.bundleIdentifier.isEmpty,
              TimeZone(identifier: observation.occurrence.timeZoneIdentifier) != nil
        else { throw HealthKitSyncError.operational(code: "healthkit_sleep_sample_not_deliverable") }
        return HealthKitSleepWireSample(
            externalId: uuid.uuidString.lowercased(),
            categoryValue: sleep.stageValue,
            startedAt: instant(startedAt),
            endedAt: instant(endedAt),
            timeZone: observation.occurrence.timeZoneIdentifier,
            timeZoneSource: sleep.timeZoneSource ?? HealthKitSleepIngestionContract.deviceTimeZoneSource,
            wasUserEntered: sleep.wasUserEntered ?? false,
            source: .init(
                bundleIdentifier: observation.source.bundleIdentifier,
                sourceVersion: observation.source.sourceRevision,
                productType: observation.source.productType
            )
        )
    }

    /// ISO-8601 with an explicit `Z` and millisecond precision (Phase A
    /// refuses zone-less instants).
    static func instant(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date)
    }
}

/// The Server's Phase A result. Only codes and counts are ever retained
/// locally; per-sample outcomes are validated, not stored.
struct HealthKitSleepIngestResult: Decodable, Sendable {
    struct Item: Decodable, Sendable {
        let externalId: String
        let outcome: String
    }
    struct WindowManifest: Decodable, Sendable {
        let examined: Int
        let markedDeleted: Int
    }
    let contractVersion: String
    let batchId: String
    let samples: [Item]
    let deletions: [Item]
    let windowManifest: WindowManifest?
    let strategicEvidenceEligibility: String?

    static let sampleOutcomes: Set<String> = [
        "stored", "replayed", "refused_identity_conflict", "refused_before_activation_floor",
        "refused_after_activation_window", "deleted_before_arrival",
    ]
    static let deletionOutcomes: Set<String> = ["deleted", "already_deleted", "tombstoned"]

    /// Every submitted identity must come back exactly once with a known
    /// Phase A outcome; anything else is not a durable acknowledgement.
    func acknowledges(_ payload: HealthKitSleepWirePayload) -> Bool {
        guard contractVersion == HealthKitSleepIngestionContract.contractVersion,
              batchId == payload.batchId,
              samples.allSatisfy({ Self.sampleOutcomes.contains($0.outcome) }),
              deletions.allSatisfy({ Self.deletionOutcomes.contains($0.outcome) })
        else { return false }
        let sentSamples = (payload.samples ?? []).map(\.externalId)
        let sentDeletions = (payload.deletions ?? []).map(\.externalId)
        return samples.map(\.externalId).sorted() == sentSamples.sorted() &&
            deletions.map(\.externalId).sorted() == sentDeletions.sorted() &&
            (payload.windowManifest == nil) == (windowManifest == nil)
    }
}

// MARK: - Recent-window live-ID manifest

/// A bounded re-read of recent Sleep so the Server can retire samples whose
/// `HKDeletedObject` was purged or missed (e.g. after an anchor reset). This
/// is not a backfill: it only lists UUIDs that are live in HealthKit now, for
/// a window that never starts before the prospective activation floor.
enum HealthKitSleepWindowManifestPlan: Equatable, Sendable {
    static let cadence: TimeInterval = 12 * 60 * 60
    static let lookback: TimeInterval = 72 * 60 * 60

    case send(windowStart: Date, windowEnd: Date)
    case skip(reason: String)

    static func plan(now: Date, activationFloor: Date?, lastSentAt: Date?) -> HealthKitSleepWindowManifestPlan {
        guard let activationFloor else { return .skip(reason: HealthKitSleepIngestionContract.notActivatedDiagnosticCode) }
        if let lastSentAt, now.timeIntervalSince(lastSentAt) < cadence, lastSentAt <= now {
            return .skip(reason: "healthkit_sleep_manifest_cadence")
        }
        let start = max(now.addingTimeInterval(-lookback), activationFloor)
        guard start < now else { return .skip(reason: "healthkit_sleep_manifest_window_empty") }
        return .send(windowStart: start, windowEnd: now)
    }

    /// The HealthKit read is widened by a minute on both sides so a sample
    /// ending exactly on a boundary is never missing from the live list.
    /// Extra live identifiers are harmless: the Server only retires samples
    /// it holds, inside the window it was sent, that are NOT listed.
    static let readSlack: TimeInterval = 60
}

protocol HealthKitSleepWindowReader: Sendable {
    /// UUIDs of every Sleep sample (all sources) whose end lies in the range.
    func liveSleepSampleIdentifiers(endingFrom start: Date, to end: Date) async throws -> [UUID]
}

enum HealthKitSleepManifestSubmitResult: Equatable, Sendable {
    case accepted(markedDeleted: Int)
    case disabled
    case failed(code: String)
}

protocol HealthKitSleepManifestSubmitting: Sendable {
    func submitSleepWindowManifest(_ manifest: HealthKitSleepWireWindowManifest) async -> HealthKitSleepManifestSubmitResult
}

protocol HealthKitSleepManifestCadenceStore: Sendable {
    func lastSentAt() -> Date?
    func recordSent(at date: Date)
}

struct UserDefaultsHealthKitSleepManifestCadenceStore: HealthKitSleepManifestCadenceStore, @unchecked Sendable {
    private let defaults: UserDefaults
    private let key = "physiqueos.healthkit.sleep.window-manifest.last-sent.v1"
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    func lastSentAt() -> Date? { defaults.object(forKey: key) as? Date }
    func recordSent(at date: Date) { defaults.set(date, forKey: key) }
}

enum HealthKitSleepManifestOutcome: Equatable, Sendable {
    case sent(liveCount: Int, markedDeleted: Int)
    case skipped(reason: String)
    case failed(code: String)
}

/// Sends the window manifest at most once per `cadence`. Fails closed: a read
/// error, an empty live list (which a revoked Sleep read permission would
/// also produce), or more than 1000 identifiers never sends anything, and a
/// failed or disabled submission is not recorded as sent.
actor HealthKitSleepWindowManifestSender {
    private let gate: HealthKitSleepActivationGate
    private let reader: any HealthKitSleepWindowReader
    private let submitter: any HealthKitSleepManifestSubmitting
    private let cadenceStore: any HealthKitSleepManifestCadenceStore
    private let now: @Sendable () -> Date
    private var inFlight = false

    init(
        gate: HealthKitSleepActivationGate,
        reader: any HealthKitSleepWindowReader,
        submitter: any HealthKitSleepManifestSubmitting,
        cadenceStore: any HealthKitSleepManifestCadenceStore = UserDefaultsHealthKitSleepManifestCadenceStore(),
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.gate = gate
        self.reader = reader
        self.submitter = submitter
        self.cadenceStore = cadenceStore
        self.now = now
    }

    func sendIfDue() async -> HealthKitSleepManifestOutcome {
        guard !inFlight else { return .skipped(reason: "healthkit_sleep_manifest_in_progress") }
        inFlight = true
        defer { inFlight = false }
        let current = now()
        let plan = HealthKitSleepWindowManifestPlan.plan(
            now: current,
            activationFloor: gate.activeFloor(at: current),
            lastSentAt: cadenceStore.lastSentAt()
        )
        guard case let .send(windowStart, windowEnd) = plan else {
            if case let .skip(reason) = plan { return .skipped(reason: reason) }
            return .skipped(reason: "healthkit_sleep_manifest_skipped")
        }
        let identifiers: [UUID]
        do {
            identifiers = try await reader.liveSleepSampleIdentifiers(
                endingFrom: windowStart.addingTimeInterval(-HealthKitSleepWindowManifestPlan.readSlack),
                to: windowEnd.addingTimeInterval(HealthKitSleepWindowManifestPlan.readSlack)
            )
        } catch {
            return .failed(code: "healthkit_sleep_manifest_read_failed")
        }
        let live = Array(Set(identifiers.map { $0.uuidString.lowercased() })).sorted()
        guard !live.isEmpty else { return .skipped(reason: "healthkit_sleep_manifest_no_live_samples") }
        guard live.count <= HealthKitSleepIngestionContract.maximumManifestLiveIDs else {
            return .failed(code: "healthkit_sleep_manifest_too_many_ids")
        }
        let manifest = HealthKitSleepWireWindowManifest(
            windowStart: HealthKitSleepWireMapper.instant(windowStart),
            windowEnd: HealthKitSleepWireMapper.instant(windowEnd),
            liveExternalIds: live
        )
        switch await submitter.submitSleepWindowManifest(manifest) {
        case let .accepted(markedDeleted):
            cadenceStore.recordSent(at: current)
            return .sent(liveCount: live.count, markedDeleted: markedDeleted)
        case .disabled:
            gate.markServerDisabled(at: current)
            return .failed(code: HealthKitSleepIngestionContract.disabledDiagnosticCode)
        case let .failed(code):
            return .failed(code: code)
        }
    }
}
