import Foundation
import os

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
