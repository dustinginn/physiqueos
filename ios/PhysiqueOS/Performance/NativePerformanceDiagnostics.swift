import Foundation
import os

/// Release-visible engineering logs, not Founder UI. No bodies, query values,
/// headers, identifiers, credentials, enum values, or exception text are logged.
enum NativeReadFailureDiagnostics {
    private static let logger = Logger(subsystem: "com.physiqueos.native", category: "ProductionRead")
    private static let safeFields: Set<String> = [
        "data", "category", "title", "purpose", "methods", "name", "supportSummary",
        "editDestination", "parameters", "protocolId", "executionId", "executionRevision",
        "supportSchedule", "frequency", "daysOfWeek", "intervalDays", "timing", "specificTime",
        "startDate", "endDate", "dosing", "timeline", "state", "notes", "reminderPreference",
        "doseAmount", "doseUnit", "initialCanonicalExercises", "initialHistorySessions",
        "initialMyLibraryExerciseIds", "myLibraryExerciseIds", "primaryNavigationCategory",
    ]

    static func classification(_ error: Error) -> (kind: String, field: String) {
        let kind: String
        let key: String?
        switch error {
        case DecodingError.keyNotFound(let missing, _):
            kind = "missing-field"; key = missing.stringValue
        case DecodingError.typeMismatch(_, let context):
            kind = "wrong-type"; key = context.codingPath.last?.stringValue
        case DecodingError.valueNotFound(_, let context):
            kind = "unexpected-null"; key = context.codingPath.last?.stringValue
        case DecodingError.dataCorrupted(let context):
            kind = "invalid-value"; key = context.codingPath.last?.stringValue
        default:
            kind = "read-failed"; key = nil
        }
        return (kind, key.flatMap { safeFields.contains($0) ? $0 : nil } ?? "redacted")
    }

    static func recordDecode(resource: String, error: Error) {
        let result = classification(error)
        logger.error("decode_failed resource=\(resource, privacy: .public) kind=\(result.kind, privacy: .public) field=\(result.field, privacy: .public)")
    }

    static func recordHTTP(resource: String, status: Int) {
        logger.error("http_failed resource=\(resource, privacy: .public) status=\(status)")
    }
}

/// Development-only timing marks for separating cache, network, decode,
/// and view-shell costs without introducing production telemetry.
#if DEBUG
enum NativePerformanceDiagnostics {
    private static let logger = Logger(subsystem: "com.physiqueos.native", category: "Performance")
    @MainActor private static var navigationStartedAt: [String: ContinuousClock.Instant] = [:]

    static func recordRead(resource: String, milliseconds: Int, decodeMilliseconds: Int, bytes: Int, cacheHit: Bool) {
        logger.debug("read resource=\(resource, privacy: .public) duration_ms=\(milliseconds) decode_ms=\(decodeMilliseconds) bytes=\(bytes) cache_hit=\(cacheHit)")
    }

    @MainActor static func recordNavigationInitiated(surface: String) {
        navigationStartedAt[surface] = .now
        logger.debug("navigation_start surface=\(surface, privacy: .public)")
    }

    @MainActor static func recordShell(surface: String) {
        let milliseconds: Int
        if let startedAt = navigationStartedAt.removeValue(forKey: surface) {
            let components = startedAt.duration(to: .now).components
            milliseconds = max(0, Int(components.seconds * 1_000 + components.attoseconds / 1_000_000_000_000_000))
        } else {
            milliseconds = 0
        }
        logger.debug("shell surface=\(surface, privacy: .public) duration_ms=\(milliseconds)")
    }
}
#endif
