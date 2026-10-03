import CryptoKit
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
        /// The real HTTP status this attempt's `URLSession` call actually
        /// received, whenever one was received at all. `succeeded` alone
        /// cannot distinguish "the app's own server returned a 4xx/5xx
        /// business error" from "something ahead of the application
        /// returned an unexpected response" -- both are `succeeded: true`
        /// at this transport layer (no `URLSession` exception was thrown),
        /// but only the status code and body size can tell them apart from
        /// a device-side capture. `nil` only when the request never
        /// produced a response at all (a genuine `URLSession` exception).
        var httpStatusCode: Int? = nil
        /// The response body's byte count for the same reason: our own
        /// application always returns a structured JSON problem body on
        /// failure (never empty), so an unexpectedly small or absent body
        /// on a non-2xx status is itself evidence the response did not
        /// come from the application route handler.
        var responseBodyByteCount: Int? = nil
        /// Build 83: what this event records. `nil` (older events) and
        /// "attempt" are one finished request; the others are transport
        /// lifecycle facts: "waitingForConnectivity",
        /// "stuckWaitCancelled", "connectivityBudgetExceeded",
        /// "sessionRecreated", and "command" (one command call's outcome).
        var kind: String? = nil
        var errorDomain: String? = nil
        var errorCode: Int? = nil
        /// Which recreated command `URLSession` handled the attempt.
        var sessionGeneration: Int? = nil
        /// "command" events only: the command type (never a payload) and a
        /// short, non-reversible fingerprint of the idempotency key.
        var commandType: String? = nil
        var idempotencyFingerprint: String? = nil
        var durationMs: Double? = nil
    }

    private static let eventKey = "physiqueos.command-network.diagnostic-events.v1"
    /// Failures and waits only, so a burst of successful HealthKit ingests
    /// can never roll the evidence of a stall out of the ring.
    private static let failureEventKey = "physiqueos.command-network.failure-events.v1"
    static let eventLimit = 256
    static let failureEventLimit = 128

    static func recentEvents(defaults: UserDefaults = .standard) -> [Event] {
        guard let data = defaults.data(forKey: eventKey) else { return [] }
        return (try? JSONDecoder().decode([Event].self, from: data)) ?? []
    }

    static func recentFailureEvents(defaults: UserDefaults = .standard) -> [Event] {
        guard let data = defaults.data(forKey: failureEventKey) else { return [] }
        return (try? JSONDecoder().decode([Event].self, from: data)) ?? []
    }

    private static let lock = NSLock()

    static func record(_ event: Event, defaults: UserDefaults = .standard) {
        lock.lock(); defer { lock.unlock() }
        var events = recentEvents(defaults: defaults)
        events.insert(event, at: 0)
        if let data = try? JSONEncoder().encode(Array(events.prefix(eventLimit))) {
            defaults.set(data, forKey: eventKey)
        }
        guard !event.succeeded else { return }
        var failures = recentFailureEvents(defaults: defaults)
        failures.insert(event, at: 0)
        if let data = try? JSONEncoder().encode(Array(failures.prefix(failureEventLimit))) {
            defaults.set(data, forKey: failureEventKey)
        }
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: eventKey)
        defaults.removeObject(forKey: failureEventKey)
    }

    /// Short, non-reversible identity for correlating an idempotency key
    /// across attempts (and with a Server log fingerprint) without storing it.
    static func fingerprint(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    /// One command call's outcome (all of its transport attempts together).
    static func recordCommand(
        commandType: String, idempotencyKey: String, succeeded: Bool,
        durationMs: Double, error: Error? = nil, httpStatusCode: Int? = nil,
        capturedAt: Date = Date(), defaults: UserDefaults = .standard
    ) {
        var event = Event(capturedAt: capturedAt, path: "/api/v1/native/commands", succeeded: succeeded)
        event.kind = "command"
        event.commandType = commandType
        event.idempotencyFingerprint = fingerprint(idempotencyKey)
        event.durationMs = durationMs
        event.httpStatusCode = httpStatusCode
        if let error {
            let nsError = error as NSError
            event.errorDomain = nsError.domain
            event.errorCode = nsError.code
        }
        record(event, defaults: defaults)
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
        transaction: TransactionTimings?,
        httpStatusCode: Int? = nil,
        responseBodyByteCount: Int? = nil
    ) -> Event {
        Event(
            capturedAt: capturedAt, path: path, succeeded: succeeded,
            networkInterface: pathSnapshot.interface, pathStatus: pathSnapshot.status,
            isConstrained: pathSnapshot.isConstrained, isExpensive: pathSnapshot.isExpensive,
            protocolName: transaction?.protocolName, isReusedConnection: transaction?.isReusedConnection,
            isMultipath: transaction?.isMultipath, transactionCount: transaction?.transactionCount ?? 0,
            domainLookupMs: transaction?.domainLookupMs, connectMs: transaction?.connectMs,
            secureConnectionMs: transaction?.secureConnectionMs, requestMs: transaction?.requestMs,
            responseMs: transaction?.responseMs, totalMs: transaction?.totalMs,
            httpStatusCode: httpStatusCode, responseBodyByteCount: responseBodyByteCount
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
///
/// Build 83: also bounds the connectivity wait. A live Build 82 workout
/// proved a command session can sit "waiting for connectivity" for its full
/// 60 s resource timeout, attempt after attempt, while reads on the shared
/// session reached the same host in milliseconds. When a task starts
/// waiting this delegate (1) reports "Waiting for network", (2) cancels it at
/// once if the system path is already satisfied (this session is stuck, not
/// the network; nothing was sent, so an immediate retry on a fresh session
/// is safe), and otherwise (3) cancels it if it is still waiting with zero
/// bytes sent after the interactive connectivity budget.
final class MetricsCollectingDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    enum WaitOutcome: Equatable, Sendable {
        case none
        /// Waiting while the system path was satisfied: cancelled at once.
        case stuckPathSatisfied
        /// Still waiting, nothing sent, after the connectivity budget.
        case budgetExceeded
    }

    private let lock = NSLock()
    private var collected: URLSessionTaskMetrics?
    private var outcome: WaitOutcome = .none
    private var waited = false
    private let connectivityBudget: TimeInterval
    private let pathProvider: any NetworkPathProviding
    private let onWaiting: @Sendable (NetworkPathSnapshot) -> Void

    init(
        connectivityBudget: TimeInterval = CommandNetworkDiagnosticsTransport.interactiveConnectivityBudget,
        pathProvider: any NetworkPathProviding = NetworkPathObserver.shared,
        onWaiting: @escaping @Sendable (NetworkPathSnapshot) -> Void = { _ in }
    ) {
        self.connectivityBudget = connectivityBudget
        self.pathProvider = pathProvider
        self.onWaiting = onWaiting
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        lock.lock(); collected = metrics; lock.unlock()
    }

    func urlSession(_ session: URLSession, taskIsWaitingForConnectivity task: URLSessionTask) {
        let snapshot = pathProvider.currentSnapshot()
        lock.lock(); waited = true; lock.unlock()
        onWaiting(snapshot)
        handleWaiting(snapshot: snapshot, cancel: { [weak task] in task?.cancel() }, isStillWaiting: { [weak task] in
            guard let task else { return false }
            return task.state == .running && task.countOfBytesSent == 0 && task.countOfBytesReceived == 0
        })
    }

    /// Decision logic, testable without a real waiting task.
    func handleWaiting(
        snapshot: NetworkPathSnapshot,
        cancel: @escaping @Sendable () -> Void,
        isStillWaiting: @escaping @Sendable () -> Bool,
        schedule: (TimeInterval, @escaping @Sendable () -> Void) -> Void = { delay, work in
            DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + delay, execute: work)
        }
    ) {
        if snapshot.status == "satisfied" {
            setOutcome(.stuckPathSatisfied)
            cancel()
            return
        }
        schedule(connectivityBudget) { [weak self] in
            guard let self, isStillWaiting() else { return }
            self.setOutcome(.budgetExceeded)
            cancel()
        }
    }

    private func setOutcome(_ value: WaitOutcome) {
        lock.lock(); if outcome == .none { outcome = value }; lock.unlock()
    }

    var metrics: URLSessionTaskMetrics? {
        lock.lock(); defer { lock.unlock() }
        return collected
    }

    var waitOutcome: WaitOutcome {
        lock.lock(); defer { lock.unlock() }
        return outcome
    }

    var didWaitForConnectivity: Bool {
        lock.lock(); defer { lock.unlock() }
        return waited
    }
}

/// The command transport's own `URLSession`, replaceable. After a transport
/// failure (or a stuck connectivity wait) the session is recreated so the
/// next attempt gets a fresh connection pool and path evaluation instead of
/// inheriting a wedged one; in-flight tasks on the old session finish.
final class CommandURLSessionPool: @unchecked Sendable {
    private let lock = NSLock()
    private var session: URLSession
    private var currentGeneration = 0
    private let makeSession: @Sendable () -> URLSession

    init(makeSession: @escaping @Sendable () -> URLSession) {
        self.makeSession = makeSession
        self.session = makeSession()
    }

    /// A fixed session (tests): `recreate` is a no-op.
    convenience init(fixed session: URLSession) {
        self.init(makeSession: { session })
    }

    func current() -> (session: URLSession, generation: Int) {
        lock.lock(); defer { lock.unlock() }
        return (session, currentGeneration)
    }

    /// Replaces the session unless another caller already did after
    /// `generation`. Returns the new generation when a session was replaced.
    @discardableResult
    func recreate(after generation: Int) -> Int? {
        lock.lock()
        guard generation == currentGeneration else { lock.unlock(); return nil }
        let replacement = makeSession()
        guard replacement !== session else { lock.unlock(); return nil }
        let old = session
        session = replacement
        currentGeneration += 1
        let next = currentGeneration
        lock.unlock()
        old.finishTasksAndInvalidate()
        return next
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
    /// How long an interactive command may wait for a network path before
    /// it fails so the caller can show "Waiting for network" and retry with
    /// the same idempotency key. Was effectively 60 s in Build 82.
    static let interactiveConnectivityBudget: TimeInterval = 12

    let pool: CommandURLSessionPool
    let pathProvider: any NetworkPathProviding
    let now: @Sendable () -> Date
    let recordEvent: @Sendable (CommandNetworkDiagnostics.Event) -> Void
    let connectivityBudget: TimeInterval
    let reportWaiting: @Sendable (Bool) -> Void

    var session: URLSession { pool.current().session }

    init(
        session: URLSession,
        pathProvider: any NetworkPathProviding = NetworkPathObserver.shared,
        now: @escaping @Sendable () -> Date = Date.init,
        recordEvent: @escaping @Sendable (CommandNetworkDiagnostics.Event) -> Void = { CommandNetworkDiagnostics.record($0) },
        connectivityBudget: TimeInterval = Self.interactiveConnectivityBudget,
        reportWaiting: @escaping @Sendable (Bool) -> Void = { CommandConnectivityStatus.report(waiting: $0) }
    ) {
        self.init(
            pool: CommandURLSessionPool(fixed: session), pathProvider: pathProvider, now: now,
            recordEvent: recordEvent, connectivityBudget: connectivityBudget, reportWaiting: reportWaiting
        )
    }

    init(
        pool: CommandURLSessionPool,
        pathProvider: any NetworkPathProviding = NetworkPathObserver.shared,
        now: @escaping @Sendable () -> Date = Date.init,
        recordEvent: @escaping @Sendable (CommandNetworkDiagnostics.Event) -> Void = { CommandNetworkDiagnostics.record($0) },
        connectivityBudget: TimeInterval = Self.interactiveConnectivityBudget,
        reportWaiting: @escaping @Sendable (Bool) -> Void = { CommandConnectivityStatus.report(waiting: $0) }
    ) {
        self.pool = pool
        self.pathProvider = pathProvider
        self.now = now
        self.recordEvent = recordEvent
        self.connectivityBudget = connectivityBudget
        self.reportWaiting = reportWaiting
    }

    /// The dedicated session real command submissions use in production:
    /// its own connection pool (never shared with `.shared`, used for
    /// reads), `waitsForConnectivity` to ride out a brief connectivity gap
    /// instead of failing it immediately, and a 60-second
    /// `timeoutIntervalForResource` ceiling so that wait plus the actual
    /// transfer cannot run unbounded. Per-request idle timeouts
    /// (`URLRequest.timeoutInterval`, set by `FounderServerAPI.perform`) are
    /// unchanged.
    /// `waitsForConnectivity` still rides out a brief gap, but the wait is
    /// bounded per task by `interactiveConnectivityBudget` (see
    /// `MetricsCollectingDelegate`); the 60 s resource ceiling remains only
    /// for genuinely large uploads that are actually transferring.
    static func production() -> CommandNetworkDiagnosticsTransport {
        CommandNetworkDiagnosticsTransport(pool: CommandURLSessionPool {
            let configuration = URLSessionConfiguration.default
            configuration.waitsForConnectivity = true
            configuration.timeoutIntervalForResource = 60
            return URLSession(configuration: configuration)
        })
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try await attempt(request, allowStuckRetry: true)
    }

    private func attempt(_ request: URLRequest, allowStuckRetry: Bool) async throws -> (Data, HTTPURLResponse) {
        let path = request.url?.path ?? ""
        let (session, generation) = pool.current()
        let recordEvent = recordEvent
        let now = now
        let reportWaiting = reportWaiting
        let delegate = MetricsCollectingDelegate(connectivityBudget: connectivityBudget, pathProvider: pathProvider) { snapshot in
            reportWaiting(true)
            var event = CommandNetworkDiagnostics.makeEvent(
                capturedAt: now(), path: path, succeeded: false, pathSnapshot: snapshot, transaction: nil
            )
            event.kind = "waitingForConnectivity"
            event.sessionGeneration = generation
            recordEvent(event)
        }
        do {
            let (data, response) = try await session.data(for: request, delegate: delegate)
            let httpResponse = response as? HTTPURLResponse
            reportWaiting(false)
            record(
                path: path, succeeded: true, delegate: delegate, generation: generation,
                httpStatusCode: httpResponse?.statusCode, responseBodyByteCount: data.count
            )
            guard let httpResponse else { throw FounderServerError.invalidResponse }
            return (data, httpResponse)
        } catch {
            let waitOutcome = delegate.waitOutcome
            record(
                path: path, succeeded: false, delegate: delegate, generation: generation,
                httpStatusCode: nil, responseBodyByteCount: nil, error: error,
                kind: waitOutcome == .stuckPathSatisfied ? "stuckWaitCancelled"
                    : waitOutcome == .budgetExceeded ? "connectivityBudgetExceeded" : "attempt"
            )
            if waitOutcome != .none || Self.isTransportFailure(error) {
                if let next = pool.recreate(after: generation) {
                    var event = CommandNetworkDiagnostics.makeEvent(
                        capturedAt: now(), path: path, succeeded: false,
                        pathSnapshot: pathProvider.currentSnapshot(), transaction: nil
                    )
                    event.kind = "sessionRecreated"
                    event.sessionGeneration = next
                    recordEvent(event)
                }
            }
            // Nothing was sent while waiting on a satisfied path: retry once,
            // at once, on the fresh session (same request, same idempotency
            // key). A caller's own cancellation is never retried.
            if waitOutcome == .stuckPathSatisfied, allowStuckRetry, !Task.isCancelled {
                return try await attempt(request, allowStuckRetry: false)
            }
            // Only a wait that ran out its budget leaves "Waiting for
            // network" showing (until the next command gets through).
            if waitOutcome != .budgetExceeded { reportWaiting(false) }
            throw error
        }
    }

    /// Failures that say the connection or its path is bad (not the Server's
    /// answer, and not the caller's own cancellation).
    static func isTransportFailure(_ error: Error) -> Bool {
        guard let urlError = error as? URLError else { return false }
        switch urlError.code {
        case .timedOut, .networkConnectionLost, .notConnectedToInternet, .cannotConnectToHost,
             .cannotFindHost, .dnsLookupFailed, .secureConnectionFailed, .resourceUnavailable,
             .internationalRoamingOff, .dataNotAllowed, .callIsActive:
            return true
        default:
            return false
        }
    }

    private func record(
        path: String, succeeded: Bool, delegate: MetricsCollectingDelegate, generation: Int,
        httpStatusCode: Int?, responseBodyByteCount: Int?, error: Error? = nil, kind: String = "attempt"
    ) {
        var event = CommandNetworkDiagnostics.makeEvent(
            capturedAt: now(), path: path, succeeded: succeeded,
            pathSnapshot: pathProvider.currentSnapshot(),
            transaction: CommandNetworkDiagnostics.TransactionTimings(metrics: delegate.metrics),
            httpStatusCode: httpStatusCode, responseBodyByteCount: responseBodyByteCount
        )
        event.kind = kind
        event.sessionGeneration = generation
        if let error {
            let nsError = error as NSError
            event.errorDomain = nsError.domain
            event.errorCode = nsError.code
        }
        recordEvent(event)
    }
}
