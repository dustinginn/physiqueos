import Foundation

enum HealthKitIngestionPurpose: String, Codable, Sendable {
    case operational
    case validationOnly = "validation_only"
}

struct HealthKitActivityValidationWindow: Equatable, Codable, Sendable {
    static let maximumInclusiveDays = 31

    let startDate: String
    let endDate: String

    init(startDate: String, endDate: String) throws {
        guard let start = Self.date(startDate), let end = Self.date(endDate) else {
            throw HealthKitCanaryError.invalidValidationWindow
        }
        guard start <= end else { throw HealthKitCanaryError.invalidValidationWindow }
        let days = Calendar.utcGregorian.dateComponents([.day], from: start, to: end).day ?? Int.max
        guard days + 1 <= Self.maximumInclusiveDays else {
            throw HealthKitCanaryError.validationWindowTooLarge
        }
        self.startDate = startDate
        self.endDate = endDate
    }

    func contains(localDate: String) -> Bool {
        localDate >= startDate && localDate <= endDate
    }

    func queryBounds(calendar: Calendar) throws -> HealthKitQueryBounds {
        guard let startComponents = Self.components(startDate),
              let endComponents = Self.components(endDate),
              let start = calendar.date(from: startComponents),
              let endStart = calendar.date(from: endComponents),
              let endExclusive = calendar.date(byAdding: .day, value: 1, to: endStart)
        else { throw HealthKitCanaryError.invalidValidationWindow }
        return HealthKitQueryBounds(
            startDateInclusive: start,
            endDateExclusive: endExclusive,
            startLocalDate: startDate,
            endLocalDate: endDate,
            timeZoneIdentifier: calendar.timeZone.identifier
        )
    }

    func isProvisional(now: Date, calendar: Calendar) -> Bool {
        endDate == Self.localDate(now, calendar: calendar)
    }

    var predicateVersion: String {
        "healthkit-activity-validation-only-v1:\(startDate):\(endDate)"
    }

    private static func date(_ value: String) -> Date? {
        guard let components = components(value),
              let date = Calendar.utcGregorian.date(from: components),
              localDate(date, calendar: .utcGregorian) == value
        else { return nil }
        return date
    }

    private static func components(_ value: String) -> DateComponents? {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2])
        else { return nil }
        // Keep components zone-neutral. Parsing supplies a UTC calendar,
        // while HealthKit query bounds supply the Founder's local calendar;
        // embedding GMT here would shift a Pacific local-day boundary into
        // the previous date.
        return DateComponents(year: year, month: month, day: day)
    }

    static func localDate(_ date: Date, calendar: Calendar) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }
}

/// One exact Founder-local day for the controlled canonical proving period.
/// It is deliberately a single date (never a range), it may not be in the
/// future, and it may not be older than a few days, so a foreground run can
/// only ever upload the day the Server was activated for.
struct HealthKitCanonicalTestDay: Equatable, Sendable {
    static let maximumAgeDays = 3
    static let streams: [HealthKitSynchronizationStream] = [.activitySummary, .nutritionDailyTotal]

    let localDate: String
    let window: HealthKitActivityValidationWindow

    init(localDate: String, now: Date = Date(), calendar: Calendar = .autoupdatingCurrent) throws {
        let window = try HealthKitActivityValidationWindow(startDate: localDate, endDate: localDate)
        let today = HealthKitActivityValidationWindow.localDate(now, calendar: calendar)
        guard let oldest = calendar.date(byAdding: .day, value: -Self.maximumAgeDays, to: calendar.startOfDay(for: now)) else {
            throw HealthKitCanaryError.invalidCanonicalTestDay
        }
        let oldestDate = HealthKitActivityValidationWindow.localDate(oldest, calendar: calendar)
        guard localDate <= today, localDate >= oldestDate else { throw HealthKitCanaryError.invalidCanonicalTestDay }
        self.localDate = localDate
        self.window = window
    }

    var streams: [HealthKitSynchronizationStream] { Self.streams }

    static let predicatePrefix = "healthkit-canonical-testday-v1:"
    /// Source-observation identities of the operational test day never share an
    /// external id with the validation-only canary, whose purpose is immutable.
    static let externalIDNamespace = "testday"

    var predicateVersion: String { "\(Self.predicatePrefix)\(localDate)" }

    func isProvisional(now: Date, calendar: Calendar) -> Bool {
        localDate == HealthKitActivityValidationWindow.localDate(now, calendar: calendar)
    }
}

/// Temporary, deliberately non-generic operational contract for repairing
/// the one stale September 23 Activity canonical day. It is separate from
/// automatic current-day synchronization and cannot be pointed at another
/// date or stream.
struct HealthKitSeptember23ActivityRepairContract: Equatable, Sendable {
    static let localDate = "2026-09-23"
    static let predicateVersion = "healthkit-automatic-sep23-activity-repair-v1:2026-09-23"
    static let contractVersion = "healthkit-sep23-activity-repair-v1"
    static let productionServerSHA = "07ed8230be28c2bc4989e2167b028d0bf425c6fa"
    static let dailyPolicyDigest = "d5f0b571b6c046be9710a0551a6d4d230b249eb4088f79878f2647d3b5c40586"
    static let expectedCanonicalDayCount = 1
    static let expectedCurrentRevision: UInt64 = 50
    static let expectedCurrentSourceRevision: UInt64 = 50
    static let expectedSourceObservationCount = 50
    static let expectedHistoryCount = 49
    static let expectedNextRevision: UInt64 = 51
    static let predictedSourceObservationCount = 51
    static let predictedHistoryCount = 50
    static let maximumApplyRequests = 2

    static func queryBounds(calendar: Calendar) throws -> HealthKitQueryBounds {
        try HealthKitActivityValidationWindow(startDate: localDate, endDate: localDate)
            .queryBounds(calendar: calendar)
    }
}

struct HealthKitSeptember23ActivityRepairPrediction: Equatable, Sendable {
    let canonicalLocalDate: String
    let canonicalRevisionBefore: UInt64
    let canonicalRevisionAfter: UInt64
    let sourceObservationCountBefore: Int
    let sourceObservationCountAfter: Int
    let historyCountBefore: Int
    let historyCountAfter: Int
    let maximumRequests: Int

    static let exact = HealthKitSeptember23ActivityRepairPrediction(
        canonicalLocalDate: HealthKitSeptember23ActivityRepairContract.localDate,
        canonicalRevisionBefore: HealthKitSeptember23ActivityRepairContract.expectedCurrentRevision,
        canonicalRevisionAfter: HealthKitSeptember23ActivityRepairContract.expectedNextRevision,
        sourceObservationCountBefore: HealthKitSeptember23ActivityRepairContract.expectedSourceObservationCount,
        sourceObservationCountAfter: HealthKitSeptember23ActivityRepairContract.predictedSourceObservationCount,
        historyCountBefore: HealthKitSeptember23ActivityRepairContract.expectedHistoryCount,
        historyCountAfter: HealthKitSeptember23ActivityRepairContract.predictedHistoryCount,
        maximumRequests: HealthKitSeptember23ActivityRepairContract.maximumApplyRequests
    )
}

struct HealthKitSeptember23ActivityRepairDryRun: Equatable, Sendable {
    let localDate: String
    let timeZoneIdentifier: String
    let coverage: HealthKitQueryActivitySummary.Coverage
    let dailyActivity: [String: Double]
    let aggregateDigest: String
    let predictedMutation: HealthKitSeptember23ActivityRepairPrediction
}

/// Facts a future authorized apply must obtain from a fresh Server preflight.
/// Build 57 has no production API for these facts, so the shipped Founder UI
/// cannot construct this value and APPLY remains unavailable.
struct HealthKitSeptember23ActivityRepairServerFacts: Decodable, Equatable, Sendable {
    let contractVersion: String
    let localDate: String
    let authenticatedDeviceId: String
    let runtimeSHA: String
    let dailyPolicyDigest: String
    let canonicalDayCount: Int
    let canonicalRevision: UInt64
    let canonicalSourceRevision: UInt64
    let sourceObservationCount: Int
    let historyCount: Int
    let september24ActivityCanonicalDayCount: Int

    var matchesFrozenContract: Bool {
        contractVersion == "healthkit-sep23-activity-repair-preflight-v1" &&
            localDate == HealthKitSeptember23ActivityRepairContract.localDate &&
            !authenticatedDeviceId.isEmpty &&
            runtimeSHA == HealthKitSeptember23ActivityRepairContract.productionServerSHA &&
            dailyPolicyDigest == HealthKitSeptember23ActivityRepairContract.dailyPolicyDigest &&
            canonicalDayCount == HealthKitSeptember23ActivityRepairContract.expectedCanonicalDayCount &&
            canonicalRevision == HealthKitSeptember23ActivityRepairContract.expectedCurrentRevision &&
            canonicalSourceRevision == HealthKitSeptember23ActivityRepairContract.expectedCurrentSourceRevision &&
            sourceObservationCount == HealthKitSeptember23ActivityRepairContract.expectedSourceObservationCount &&
            historyCount == HealthKitSeptember23ActivityRepairContract.expectedHistoryCount &&
            september24ActivityCanonicalDayCount == 0
    }
}

/// Explicit capability value for the future, separately authorized apply.
/// No production factory or UI path creates one in this candidate.
struct HealthKitSeptember23ActivityRepairAuthorization: Equatable, Sendable {
    let contractVersion: String
    let approvedAggregateDigest: String

    init(
        contractVersion: String,
        approvedAggregateDigest: String
    ) {
        self.contractVersion = contractVersion
        self.approvedAggregateDigest = approvedAggregateDigest
    }
}

struct HealthKitSeptember23ActivityRepairApplyResult: Equatable, Sendable {
    let aggregateDigest: String
    let requestCount: Int
    let prediction: HealthKitSeptember23ActivityRepairPrediction
}

/// One exact Founder-local day for the dormant Workout canary. Same shape and
/// limits as the Activity + Nutrition test day: a single date, never a range,
/// not in the future, at most a few days old. The Server alone decides whether
/// a workout canonicalizes (its own separate Workout policy, OFF by default).
struct HealthKitWorkoutCanaryDay: Equatable, Sendable {
    static let maximumAgeDays = 3
    static let predicatePrefix = "healthkit-workout-canary-v1:"
    /// Registered in `HealthKitBatchBuilder.externalIDNamespace(for:)` for
    /// exhaustiveness/defense-in-depth even though it is a no-op today:
    /// every Workout observation currently carries a real HealthKit
    /// `healthKitUUID` (`HealthKitObservationNormalizer.normalize` uses it
    /// before ever reaching the namespace-dependent daily-aggregate
    /// branches), so this namespace is not yet load-bearing. It exists so a
    /// future Workout-canary change that emits a UUID-less aggregate falls
    /// through to a *registered* namespace instead of silently colliding
    /// with the canary's bare identity, the way Activity/Nutrition did
    /// before this fix.
    static let externalIDNamespace = "workoutcanary"

    let localDate: String
    let window: HealthKitActivityValidationWindow

    init(localDate: String, now: Date = Date(), calendar: Calendar = .autoupdatingCurrent) throws {
        let window = try HealthKitActivityValidationWindow(startDate: localDate, endDate: localDate)
        let today = HealthKitActivityValidationWindow.localDate(now, calendar: calendar)
        guard let oldest = calendar.date(byAdding: .day, value: -Self.maximumAgeDays, to: calendar.startOfDay(for: now)) else {
            throw HealthKitCanaryError.invalidCanonicalTestDay
        }
        let oldestDate = HealthKitActivityValidationWindow.localDate(oldest, calendar: calendar)
        guard localDate <= today, localDate >= oldestDate else { throw HealthKitCanaryError.invalidCanonicalTestDay }
        self.localDate = localDate
        self.window = window
    }

    var predicateVersion: String { "\(Self.predicatePrefix)\(localDate)" }
}

struct HealthKitWorkoutCanaryRunResult: Equatable, Sendable {
    let day: HealthKitWorkoutCanaryDay
    let synchronization: HealthKitCanarySyncSummary
    let diagnostics: HealthKitStreamDiagnostics
    var canonicalization: [HealthKitCanonicalizationReport] = []
}

struct HealthKitCanonicalTestDayRunResult: Equatable, Sendable {
    let testDay: HealthKitCanonicalTestDay
    let endDateIsProvisional: Bool
    let activity: HealthKitCanarySyncSummary
    let nutrition: HealthKitCanarySyncSummary
    let activityDiagnostics: HealthKitStreamDiagnostics
    let nutritionDiagnostics: HealthKitStreamDiagnostics
    /// What the Server reported for each uploaded observation (empty when the
    /// acknowledgement carried no detail).
    var canonicalization: [HealthKitCanonicalizationReport] = []
}

struct HealthKitQueryBounds: Equatable, Sendable {
    let startDateInclusive: Date
    let endDateExclusive: Date
    let startLocalDate: String
    let endLocalDate: String
    let timeZoneIdentifier: String

    func contains(localDate: String) -> Bool {
        localDate >= startLocalDate && localDate <= endLocalDate
    }
}

struct HealthKitCanaryServerContract: Equatable, Sendable {
    let commandType: String
    let contractVersion: String
    let maximumBatchSize: Int
    let observationTypes: Set<String>
    let ingestionPurposes: Set<String>
    let diagnosticEndpoint: String
    /// Present only on a Server that supports the controlled canonical test day.
    var additionalObservationTypes: Set<String> = []
    var hasCanonicalDailyActivation = false

    /// Present only on a Server that advertises the dormant Workout policy.
    var hasWorkoutCanonicalActivation = false

    var supportsWorkoutCanary: Bool { hasWorkoutCanonicalActivation }

    var supportsCanonicalTestDay: Bool {
        additionalObservationTypes.contains(HealthKitServerIngestionContract.nutritionDailyTotalObservationType) &&
        hasCanonicalDailyActivation
    }

    var isCompatible: Bool {
        commandType == HealthKitServerIngestionContract.commandType &&
        contractVersion == HealthKitServerIngestionContract.contractVersion &&
        maximumBatchSize == HealthKitServerIngestionContract.maximumObservationsPerBatch &&
        observationTypes == Set(["activity_summary", "workout", "quantity_sample"]) &&
        ingestionPurposes == Set([
            HealthKitIngestionPurpose.operational.rawValue,
            HealthKitIngestionPurpose.validationOnly.rawValue,
        ]) &&
        diagnosticEndpoint == HealthKitServerIngestionContract.activityCanaryDiagnosticEndpoint
    }
}

struct HealthKitCanarySyncSummary: Equatable, Sendable {
    let batchIdentity: String?
    let additionsDiscovered: Int
    let deletionsDiscovered: Int
    let additionsFilteredByWindow: Int
    let deletionsFilteredByWindow: Int
    let resumedPendingBatch: Bool
}

struct HealthKitActivityCanaryDiagnostic: Decodable, Equatable, Sendable {
    struct BoundedRange: Decodable, Equatable, Sendable {
        let startDate: String
        let endDate: String
        let inclusive: Bool
    }

    struct Item: Decodable, Equatable, Identifiable, Sendable {
        struct Occurrence: Decodable, Equatable, Sendable {
            let startedAt: String?
            let endedAt: String?
            let timeZone: String?
            let utcOffsetSeconds: Int?
        }

        struct Activity: Decodable, Equatable, Sendable {
            struct Metric: Decodable, Equatable, Sendable {
                let value: Double
                let unit: String
            }
            let metrics: [String: Metric]
            let coverage: String?
            let sourceRevision: UInt64?
            let aggregationScope: String?
            let workoutActiveCaloriesAdditive: Bool
        }

        struct Source: Decodable, Equatable, Sendable {
            let bundleIdentifier: String?
            let sourceName: String?
            let sourceRevision: String?
            let productType: String?
            let privacySafeDeviceProvenance: String?
        }

        struct Reconciliation: Decodable, Equatable, Sendable {
            let state: String?
            let reason: String?
            let canonicalized: Bool
            let canonicalizationPermanentBar: Bool
        }

        let sourceObservationId: String
        let ingestionPurpose: String
        let observationType: String
        let frozenLocalDate: String
        let occurrence: Occurrence
        let activity: Activity
        let source: Source
        let deliveryDeviceId: String?
        let reconciliation: Reconciliation
        let evidenceEligibility: String?

        var id: String { sourceObservationId }
    }

    let purpose: String
    let boundedRange: BoundedRange
    let canonicalAuthority: String
    let strategicAuthority: String
    let items: [Item]
}

struct HealthKitFounderCanaryRunResult: Equatable, Sendable {
    let window: HealthKitActivityValidationWindow
    let endDateIsProvisional: Bool
    let synchronization: HealthKitCanarySyncSummary
    let diagnostics: HealthKitStreamDiagnostics
    let readback: HealthKitActivityCanaryDiagnostic
}

enum HealthKitCanaryError: Error, Equatable, Sendable, LocalizedError {
    case disabled
    case authorizationRequired
    case invalidValidationWindow
    case validationWindowTooLarge
    case serverContractMismatch
    case diagnosticBoundaryViolation
    case stableDeviceIdentityUnavailable
    case invalidCanonicalTestDay
    case canonicalTestDayUnsupported
    case workoutCanaryUnsupported
    case september23RepairBoundaryViolation
    case september23RepairAggregateMissing
    case september23RepairApplyNotAuthorized
    case september23RepairAuthorityDrift
    case september23RepairAggregateDrift
    case september23RepairRevisionMismatch

    var errorDescription: String? {
        switch self {
        case .disabled: "Enable the Founder HealthKit canary before reading Apple Health."
        case .authorizationRequired: "Complete the explicit Apple Health authorization step first."
        case .invalidValidationWindow: "Choose an explicit valid start and end local date."
        case .validationWindowTooLarge: "The validation window can contain at most 31 local dates."
        case .serverContractMismatch: "Founder Production does not advertise the required validation-only HealthKit contract."
        case .diagnosticBoundaryViolation: "The Server diagnostic response did not preserve the validation-only boundary."
        case .stableDeviceIdentityUnavailable: "A stable enrolled-device identity could not be established."
        case .invalidCanonicalTestDay: "Choose today or one of the last three local days for the canonical test day."
        case .canonicalTestDayUnsupported: "Founder Production does not advertise the controlled canonical test-day contract."
        case .workoutCanaryUnsupported: "Founder Production does not advertise the Workout canary contract."
        case .september23RepairBoundaryViolation: "The one-shot repair is bound to September 23 Activity in the automatic namespace."
        case .september23RepairAggregateMissing: "Apple Health did not return exactly one September 23 Activity aggregate."
        case .september23RepairApplyNotAuthorized: "September 23 Activity repair APPLY is not authorized in this build."
        case .september23RepairAuthorityDrift: "Server authority or frozen September 23 repair facts changed; apply was refused."
        case .september23RepairAggregateDrift: "The September 23 Apple Health aggregate changed after dry-run; apply was refused."
        case .september23RepairRevisionMismatch: "The Server revision recovery facts did not match the exact 50-to-51 repair contract."
        }
    }
}

private extension Calendar {
    static var utcGregorian: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.timeZone = .gmt
        return calendar
    }
}
