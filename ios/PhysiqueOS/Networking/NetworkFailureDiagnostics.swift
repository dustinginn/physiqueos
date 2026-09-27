import Foundation

/// Generic, on-device, bounded diagnostic capture of the underlying error
/// `FounderServerAPI.perform(...)` collapses into `ProductionNativeError
/// .networkFailure` before throwing. That collapse is intentional and
/// unchanged here (callers across the app depend on `ProductionNativeError`'s
/// small, stable case set) -- but it means the ORIGINAL error's identity
/// (a genuine connection failure vs. a cooperative task cancellation vs. a
/// timeout vs. an ATS/certificate problem) is otherwise discarded at the
/// only point it still exists. This captures it, purely for later reading;
/// it changes no control flow, no thrown type, and no retry behavior.
///
/// Deliberately NOT actor-isolated: `perform()` runs inside `actor
/// ProductionNativeAPI`, and `UserDefaults` is documented thread-safe for
/// basic get/set, so this can be called synchronously inline in the catch
/// block with no actor hop and therefore no risk of reordering or delaying
/// the throw it sits beside. The read-decode-mutate-encode-write here is not
/// itself atomic, but `ProductionNativeAPI` has exactly one instance app-wide
/// (constructed once in `AppEnvironment`) and actor methods run
/// non-preemptively between suspension points, so two calls can't actually
/// interleave today. If that single-instance assumption ever changes, this
/// would need real synchronization.
enum NetworkFailureDiagnostics {
    struct Event: Codable {
        let capturedAt: Date
        let path: String
        let errorDomain: String
        let errorCode: Int
        // For an NSURLError, this can embed the failing request's URL (query
        // items included) via userInfo. Today every perform() call site's
        // query only ever carries internal IDs/dates/context strings, never
        // a secret -- but that isn't structurally enforced here, since this
        // fires for every network failure app-wide. A future caller putting
        // something sensitive in a query string would start leaking it here.
        let errorDescription: String
    }

    private static let eventKey = "physiqueos.network-failure.diagnostic-events.v1"

    static func recentEvents(defaults: UserDefaults = .standard) -> [Event] {
        guard let data = defaults.data(forKey: eventKey) else { return [] }
        return (try? JSONDecoder().decode([Event].self, from: data)) ?? []
    }

    static func record(path: String, error: Error, capturedAt: Date = Date(), defaults: UserDefaults = .standard) {
        let nsError = error as NSError
        let event = Event(
            capturedAt: capturedAt, path: path,
            errorDomain: nsError.domain, errorCode: nsError.code,
            errorDescription: String(describing: error)
        )
        var events = recentEvents(defaults: defaults)
        events.insert(event, at: 0)
        if let data = try? JSONEncoder().encode(Array(events.prefix(64))) {
            defaults.set(data, forKey: eventKey)
        }
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: eventKey)
    }
}
