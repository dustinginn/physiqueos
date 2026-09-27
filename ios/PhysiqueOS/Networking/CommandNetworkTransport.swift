import Foundation
import Network

/// A real Build 65 attempt (2026-09-27) proved that Founder Production's
/// bulk `/read/*` responses (Home and Goals run 4-5 MB; Log and the morning
/// check-in run 9-10 MB) and its command-submission POSTs were sharing
/// `URLSession.shared`'s one connection pool. When a bulk-read connection
/// idle-timed-out (`NSURLErrorTimedOut`, -1001) on a degraded network path,
/// an in-flight command multiplexed on the SAME connection was reported
/// cancelled (`NSURLErrorCancelled`, -999) with the app's own Swift Task
/// never touched -- a zero-write production correlation showed the timed-out
/// reads had actually reached and been served by the Server, repeatedly,
/// while the command left no trace anywhere upstream of the application.
///
/// This gives command submissions their OWN `URLSession`, with its own
/// connection pool, so a stalled bulk-read connection can no longer take a
/// write down with it -- and captures `URLSessionTaskMetrics` plus the
/// current `NWPath` on every command attempt, success or failure, so the
/// NEXT real failure (of any cause) can say what protocol (h2/h3),
/// interface (Wi-Fi/cellular), and connection-phase timings were actually in
/// play, instead of leaving that the one open question a generic error
/// capture (`NetworkFailureDiagnostics`) cannot answer.

// MARK: - Network path snapshot

/// What `NWPathMonitor` says about the network right now, reduced to the
/// small set of fields worth recording per attempt. Never throws, never
/// blocks: `NetworkPathObserver` keeps one long-lived monitor running and
/// this just reads its latest delivered update.
struct NetworkPathSnapshot: Equatable, Codable, Sendable {
    var status: String?
    var interface: String?
    var isConstrained: Bool?
    var isExpensive: Bool?

    static let unavailable = NetworkPathSnapshot()
}

protocol NetworkPathProviding: Sendable {
    func currentSnapshot() -> NetworkPathSnapshot
}

/// A single, process-wide `NWPathMonitor`. Starting a fresh monitor per
/// request would mean every request either waits for that monitor's first
/// update (adding latency to exactly the path this exists to protect) or
/// risks reading a monitor that hasn't delivered one yet -- keeping one
/// running for the process's lifetime means `currentSnapshot()` is always a
/// cheap, immediate read of whatever the OS most recently reported.
final class NetworkPathObserver: NetworkPathProviding, @unchecked Sendable {
    static let shared = NetworkPathObserver()

    private let monitor: NWPathMonitor
    private let lock = NSLock()
    private var latest: NetworkPathSnapshot = .unavailable

    init(monitor: NWPathMonitor = NWPathMonitor()) {
        self.monitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in
            let snapshot = NetworkPathSnapshot(
                status: Self.describe(path.status),
                interface: Self.describe(primaryInterface: path),
                isConstrained: path.isConstrained,
                isExpensive: path.isExpensive
            )
            self?.lock.lock()
            self?.latest = snapshot
            self?.lock.unlock()
        }
        monitor.start(queue: DispatchQueue(label: "physiqueos.network-path-observer"))
    }

    /// `.shared` is a permanent, process-wide singleton and this never runs
    /// for it in practice -- but a test-constructed instance (a fresh
    /// `NetworkPathObserver()`, not `.shared`) must not leak a live monitor
    /// and its dedicated queue past the scope that created it.
    deinit {
        monitor.cancel()
    }

    func currentSnapshot() -> NetworkPathSnapshot {
        lock.lock(); defer { lock.unlock() }
        return latest
    }

    private static func describe(_ status: NWPath.Status) -> String {
        switch status {
        case .satisfied: return "satisfied"
        case .unsatisfied: return "unsatisfied"
        case .requiresConnection: return "requiresConnection"
        @unknown default: return "unknown"
        }
    }

    private static func describe(primaryInterface path: NWPath) -> String? {
        if path.usesInterfaceType(.wifi) { return "wifi" }
        if path.usesInterfaceType(.cellular) { return "cellular" }
        if path.usesInterfaceType(.wiredEthernet) { return "wiredEthernet" }
        if path.usesInterfaceType(.loopback) { return "loopback" }
        if path.usesInterfaceType(.other) { return "other" }
        return nil
    }
}

// MARK: - Diagnostics storage

/// On-device, bounded diagnostic log of command-submission network
/// conditions -- deliberately separate from `NetworkFailureDiagnostics`
/// (which captures the generic error identity for EVERY `perform()` call,
/// read or write): this answers a different question that a bare
/// `NSError` cannot -- which protocol, which interface, and how the
/// connection's own phases split up -- for command submissions specifically,
/// on both success and failure, so a failure's neighboring successful
/// attempts give context too.
enum CommandNetworkDiagnostics {
    struct Event: Codable {
        let capturedAt: Date
        let path: String
        let succeeded: Bool
        var networkInterface: String? = nil
        var pathStatus: String? = nil
        var isConstrained: Bool? = nil
        var isExpensive: Bool? = nil
        var protocolName: String? = nil
        var isReusedConnection: Bool? = nil
        var isMultipath: Bool? = nil
        var transactionCount: Int = 0
        var domainLookupMs: Double? = nil
        var connectMs: Double? = nil
        var secureConnectionMs: Double? = nil
        var requestMs: Double? = nil
        var responseMs: Double? = nil
        var totalMs: Double? = nil
    }

    private static let eventKey = "physiqueos.command-network.diagnostic-events.v1"

    static func recentEvents(defaults: UserDefaults = .standard) -> [Event] {
        guard let data = defaults.data(forKey: eventKey) else { return [] }
        return (try? JSONDecoder().decode([Event].self, from: data)) ?? []
    }

    static func record(_ event: Event, defaults: UserDefaults = .standard) {
        var events = recentEvents(defaults: defaults)
        events.insert(event, at: 0)
        if let data = try? JSONEncoder().encode(Array(events.prefix(64))) {
            defaults.set(data, forKey: eventKey)
        }
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: eventKey)
    }

    /// Builds the `Event` from already-extracted plain values, independent
    /// of `URLSessionTaskMetrics`/`NetworkPathSnapshot` themselves, so the
    /// composition logic (which fields come from the path snapshot vs. the
    /// metrics, and how transaction timings become millisecond durations)
    /// is testable without a real network round trip.
    static func makeEvent(
        capturedAt: Date,
        path: String,
        succeeded: Bool,
        pathSnapshot: NetworkPathSnapshot,
        transaction: TransactionTimings?
    ) -> Event {
        Event(
            capturedAt: capturedAt, path: path, succeeded: succeeded,
            networkInterface: pathSnapshot.interface, pathStatus: pathSnapshot.status,
            isConstrained: pathSnapshot.isConstrained, isExpensive: pathSnapshot.isExpensive,
            protocolName: transaction?.protocolName, isReusedConnection: transaction?.isReusedConnection,
            isMultipath: transaction?.isMultipath, transactionCount: transaction?.transactionCount ?? 0,
            domainLookupMs: transaction?.domainLookupMs, connectMs: transaction?.connectMs,
            secureConnectionMs: transaction?.secureConnectionMs, requestMs: transaction?.requestMs,
            responseMs: transaction?.responseMs, totalMs: transaction?.totalMs
        )
    }

    /// The plain-value shape `makeEvent` needs from a real
    /// `URLSessionTaskMetrics` -- kept separate so tests can hand-build one
    /// without touching `URLSessionTaskMetrics` itself (which has no public
    /// initializer).
    struct TransactionTimings: Equatable {
        var protocolName: String?
        var isReusedConnection: Bool?
        var isMultipath: Bool?
        var transactionCount: Int
        var domainLookupMs: Double?
        var connectMs: Double?
        var secureConnectionMs: Double?
        var requestMs: Double?
        var responseMs: Double?
        var totalMs: Double?
    }
}

extension CommandNetworkDiagnostics.TransactionTimings {
    /// Extracts timings from the LAST transaction in a real
    /// `URLSessionTaskMetrics` (the one that actually completed; earlier
    /// entries exist only if the session itself redirected or retried), so
    /// this is the one place actual Foundation/Network types get touched.
    init?(metrics: URLSessionTaskMetrics?) {
        guard let metrics, let transaction = metrics.transactionMetrics.last else { return nil }
        func ms(_ start: Date?, _ end: Date?) -> Double? {
            guard let start, let end else { return nil }
            return end.timeIntervalSince(start) * 1000
        }
        self.init(
            protocolName: transaction.networkProtocolName,
            isReusedConnection: transaction.isReusedConnection,
            isMultipath: transaction.isMultipath,
            transactionCount: metrics.transactionMetrics.count,
            domainLookupMs: ms(transaction.domainLookupStartDate, transaction.domainLookupEndDate),
            connectMs: ms(transaction.connectStartDate, transaction.connectEndDate),
            secureConnectionMs: ms(transaction.secureConnectionStartDate, transaction.secureConnectionEndDate),
            requestMs: ms(transaction.requestStartDate, transaction.requestEndDate),
            responseMs: ms(transaction.responseStartDate, transaction.responseEndDate),
            totalMs: ms(transaction.fetchStartDate, transaction.responseEndDate)
        )
    }
}

// MARK: - Metrics-capturing delegate

/// Collects the one `URLSessionTaskMetrics` Foundation delivers per task,
/// on whatever queue Foundation calls it back on -- success or failure, this
/// callback still fires as long as the task actually started.
private final class MetricsCollectingDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var collected: URLSessionTaskMetrics?

    func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        lock.lock(); collected = metrics; lock.unlock()
    }

    var metrics: URLSessionTaskMetrics? {
        lock.lock(); defer { lock.unlock() }
        return collected
    }
}

// MARK: - The command transport itself

/// `FounderHTTPTransport` for command submissions: its own `URLSession`
/// (own connection pool, isolated from bulk reads), `waitsForConnectivity`
/// so a brief connectivity gap is waited out rather than failing
/// immediately, and a bounded `timeoutIntervalForResource` so that wait (plus
/// the actual transfer) cannot run unbounded. Captures
/// `CommandNetworkDiagnostics` for every attempt via the metrics-collecting
/// delegate, regardless of outcome.
struct CommandNetworkDiagnosticsTransport: FounderHTTPTransport {
    let session: URLSession
    let pathProvider: any NetworkPathProviding
    let now: @Sendable () -> Date
    let recordEvent: @Sendable (CommandNetworkDiagnostics.Event) -> Void

    init(
        session: URLSession,
        pathProvider: any NetworkPathProviding = NetworkPathObserver.shared,
        now: @escaping @Sendable () -> Date = Date.init,
        recordEvent: @escaping @Sendable (CommandNetworkDiagnostics.Event) -> Void = { CommandNetworkDiagnostics.record($0) }
    ) {
        self.session = session
        self.pathProvider = pathProvider
        self.now = now
        self.recordEvent = recordEvent
    }

    /// The dedicated session real command submissions use in production:
    /// its own connection pool (never shared with `.shared`, used for
    /// reads), `waitsForConnectivity` to ride out a brief connectivity gap
    /// instead of failing it immediately, and a 60-second
    /// `timeoutIntervalForResource` ceiling so that wait plus the actual
    /// transfer cannot run unbounded. Per-request idle timeouts
    /// (`URLRequest.timeoutInterval`, set by `FounderServerAPI.perform`) are
    /// unchanged.
    static func production() -> CommandNetworkDiagnosticsTransport {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForResource = 60
        return CommandNetworkDiagnosticsTransport(session: URLSession(configuration: configuration))
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let delegate = MetricsCollectingDelegate()
        let path = request.url?.path ?? ""
        do {
            let (data, response) = try await session.data(for: request, delegate: delegate)
            record(path: path, succeeded: true, delegate: delegate)
            guard let httpResponse = response as? HTTPURLResponse else { throw FounderServerError.invalidResponse }
            return (data, httpResponse)
        } catch {
            record(path: path, succeeded: false, delegate: delegate)
            throw error
        }
    }

    private func record(path: String, succeeded: Bool, delegate: MetricsCollectingDelegate) {
        let event = CommandNetworkDiagnostics.makeEvent(
            capturedAt: now(), path: path, succeeded: succeeded,
            pathSnapshot: pathProvider.currentSnapshot(),
            transaction: CommandNetworkDiagnostics.TransactionTimings(metrics: delegate.metrics)
        )
        recordEvent(event)
    }
}
