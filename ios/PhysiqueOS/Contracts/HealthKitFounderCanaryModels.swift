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

    var errorDescription: String? {
        switch self {
        case .disabled: "Enable the Founder HealthKit canary before reading Apple Health."
        case .authorizationRequired: "Complete the explicit Apple Health authorization step first."
        case .invalidValidationWindow: "Choose an explicit valid start and end local date."
        case .validationWindowTooLarge: "The validation window can contain at most 31 local dates."
        case .serverContractMismatch: "Founder Production does not advertise the required validation-only HealthKit contract."
        case .diagnosticBoundaryViolation: "The Server diagnostic response did not preserve the validation-only boundary."
        case .stableDeviceIdentityUnavailable: "A stable enrolled-device identity could not be established."
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
