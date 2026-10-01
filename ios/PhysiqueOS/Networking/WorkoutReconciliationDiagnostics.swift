import Foundation

/// On-device, read-only diagnostic for the HealthKit workout-reconciliation
/// confirm flow ("Use Logger session N" / "No match").
///
/// Built after two independently-shipped, independently fresh-context-
/// reviewed network-retry fixes (aa165ca9, f72551be) both failed real
/// Founder acceptance, and a server-side zero-write forensic audit proved
/// that `workout-reconciliation.resolve.v1` has NEVER produced a single
/// `command_receipts` row for this account across its entire history --
/// while every other command type flowed normally through the same period.
/// That rules out ordinary transport/auth flakiness as the mechanism (it
/// would not explain a 100% failure rate across two different retry
/// strategies with zero other symptom). It does NOT, by itself, distinguish
/// between the remaining candidates a static code read surfaced:
///   1. `EvidenceReviewDetailView.resolveWorkoutReconciliation`'s
///      `guard let version = review.version else { return }` returns
///      silently with no error and no state change if the review's version
///      failed to decode -- the button tap would do nothing visible at all.
///   2. `FounderServerAPI.perform(...)`'s `catch { throw
///      ProductionNativeError.networkFailure }` is a blanket catch that
///      discards the underlying error's identity -- a genuine transport
///      failure, a cooperative task cancellation (e.g. `URLError.cancelled`
///      from a concurrent view/task lifecycle event), an ATS/certificate
///      issue, and a timeout are all indistinguishable from Native
///      telemetry alone once collapsed into `.networkFailure`.
///
/// This is instrumentation, not a fix: it changes no retry behavior and no
/// control flow. It exists to make the NEXT real attempt self-diagnosing,
/// without needing another round of speculation, a Native patch shipped on
/// a guess, or physical device log access -- the Founder can open Engineer
/// Diagnostics and read (or screenshot) exactly what happened.
///
/// Same bounded, device-local, `UserDefaults`-persisted pattern as
/// `NotificationDiagnostics` (never a second, divergent source of truth for
/// the decision logic it observes -- this only ever records what the real
/// confirm flow already does).
enum WorkoutReconciliationDiagnostics {
    struct Event: Codable {
        let capturedAt: Date
        let stage: String
        let reviewId: String
        let action: String
        var rawVersionValue: String? = nil
        var rawVersionType: String? = nil
        var expectedVersion: String? = nil
        var idempotencyKeyDigest: String? = nil
        var outcome: String? = nil
        var underlyingErrorDomain: String? = nil
        var underlyingErrorCode: Int? = nil
        var underlyingErrorDescription: String? = nil
        var httpStatusCode: Int? = nil
        /// `Task.isCancelled`, read at the exact `catch` site that produced
        /// this event. Disambiguates a -999 caused by the app's OWN
        /// enclosing Task being cancelled (Swift's URLSession bridging
        /// cancels the in-flight request when its owning Task is cancelled)
        /// from one caused by something external -- the underlying NSError
        /// alone cannot tell these apart.
        var taskWasCancelledAtCatch: Bool? = nil
    }

    // Bounded device-local diagnostic history, never read by the confirm
    // flow's own decision logic -- an after-the-fact capture must never be
    // able to influence the thing it observes.
    private static let eventKey = "physiqueos.workout-reconciliation.diagnostic-events.v1"

    @MainActor static func recentEvents(defaults: UserDefaults = .standard) -> [Event] {
        guard let data = defaults.data(forKey: eventKey) else { return [] }
        return (try? JSONDecoder().decode([Event].self, from: data)) ?? []
    }

    @MainActor static func record(_ event: Event, defaults: UserDefaults = .standard) {
        var events = recentEvents(defaults: defaults)
        events.insert(event, at: 0)
        if let data = try? JSONEncoder().encode(Array(events.prefix(64))) {
            defaults.set(data, forKey: eventKey)
        }
    }

    @MainActor static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: eventKey)
    }

    /// Best-effort classification of an underlying error for the record above.
    /// Never throws, never used by any decision logic -- display/log only.
    static func describe(_ error: Error) -> (domain: String, code: Int, description: String) {
        let nsError = error as NSError
        return (nsError.domain, nsError.code, String(describing: error))
    }
}
