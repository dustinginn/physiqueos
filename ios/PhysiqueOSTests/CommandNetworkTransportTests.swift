import Foundation
import XCTest
@testable import PhysiqueOS

final class CommandNetworkDiagnosticsTests: XCTestCase {
    private func freshDefaults(_ name: String) -> UserDefaults {
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    func testMakeEventCombinesPathSnapshotAndTransactionTimings() {
        let event = CommandNetworkDiagnostics.makeEvent(
            capturedAt: Date(timeIntervalSince1970: 1_000),
            path: "/api/v1/native/commands",
            succeeded: true,
            pathSnapshot: NetworkPathSnapshot(status: "satisfied", interface: "wifi", isConstrained: false, isExpensive: false),
            transaction: .init(
                protocolName: "h2", isReusedConnection: true, isMultipath: false, transactionCount: 1,
                domainLookupMs: 3, connectMs: 12, secureConnectionMs: 30, requestMs: 1, responseMs: 200, totalMs: 246
            )
        )
        XCTAssertEqual(event.path, "/api/v1/native/commands")
        XCTAssertTrue(event.succeeded)
        XCTAssertEqual(event.networkInterface, "wifi")
        XCTAssertEqual(event.pathStatus, "satisfied")
        XCTAssertEqual(event.isConstrained, false)
        XCTAssertEqual(event.protocolName, "h2")
        XCTAssertEqual(event.isReusedConnection, true)
        XCTAssertEqual(event.transactionCount, 1)
        XCTAssertEqual(event.totalMs, 246)
    }

    func testMakeEventWithNoTransactionStillRecordsThePathSnapshot() {
        // The realistic shape of a failure so early (e.g. a dead connection
        // before any bytes moved) that Foundation never delivered metrics --
        // the path snapshot must still make it into the event.
        let event = CommandNetworkDiagnostics.makeEvent(
            capturedAt: Date(), path: "/api/v1/native/commands", succeeded: false,
            pathSnapshot: NetworkPathSnapshot(status: "satisfied", interface: "cellular", isConstrained: true, isExpensive: true),
            transaction: nil
        )
        XCTAssertFalse(event.succeeded)
        XCTAssertEqual(event.networkInterface, "cellular")
        XCTAssertEqual(event.isConstrained, true)
        XCTAssertEqual(event.isExpensive, true)
        XCTAssertNil(event.protocolName)
        XCTAssertEqual(event.transactionCount, 0)
    }

    func testTransactionTimingsFromNilMetricsIsNil() {
        XCTAssertNil(CommandNetworkDiagnostics.TransactionTimings(metrics: nil))
    }

    @MainActor
    func testRecordAndReadBackNewestFirstAndCapAt64() {
        let defaults = freshDefaults("CommandNetworkDiagnosticsTests.order")
        for index in 0..<70 {
            CommandNetworkDiagnostics.record(
                .init(capturedAt: Date(timeIntervalSince1970: Double(index)), path: "/api/v1/native/commands", succeeded: true),
                defaults: defaults
            )
        }
        let events = CommandNetworkDiagnostics.recentEvents(defaults: defaults)
        XCTAssertEqual(events.count, 64)
        // Newest-first: the last one recorded (index 69) is first.
        XCTAssertEqual(events.first?.capturedAt, Date(timeIntervalSince1970: 69))
    }

    @MainActor
    func testClearRemovesAllEvents() {
        let defaults = freshDefaults("CommandNetworkDiagnosticsTests.clear")
        CommandNetworkDiagnostics.record(.init(capturedAt: Date(), path: "/api/v1/native/commands", succeeded: true), defaults: defaults)
        CommandNetworkDiagnostics.clear(defaults: defaults)
        XCTAssertTrue(CommandNetworkDiagnostics.recentEvents(defaults: defaults).isEmpty)
    }
}

final class CommandNetworkDiagnosticsTransportTests: XCTestCase {
    private struct FixedPathProvider: NetworkPathProviding {
        let snapshot: NetworkPathSnapshot
        func currentSnapshot() -> NetworkPathSnapshot { snapshot }
    }

    private final class EventRecorder: @unchecked Sendable {
        private let lock = NSLock()
        private var events: [CommandNetworkDiagnostics.Event] = []
        func append(_ event: CommandNetworkDiagnostics.Event) { lock.lock(); events.append(event); lock.unlock() }
        var recorded: [CommandNetworkDiagnostics.Event] { lock.lock(); defer { lock.unlock() }; return events }
    }

    /// A real, connection-refused request: nothing listens on this loopback
    /// port, so this fails fast, deterministically, and entirely locally --
    /// no external network dependency -- exercising the transport's genuine
    /// failure path (a real `URLSessionTaskMetrics` delivered by Foundation
    /// for a task that never got past connect) rather than a mocked one.
    func testRecordsAFailureEventForAConnectionRefusedRequest() async throws {
        let recorder = EventRecorder()
        let transport = CommandNetworkDiagnosticsTransport(
            session: URLSession(configuration: .ephemeral),
            pathProvider: FixedPathProvider(snapshot: .init(status: "satisfied", interface: "wifi", isConstrained: false, isExpensive: false)),
            now: { Date(timeIntervalSince1970: 42) },
            recordEvent: { recorder.append($0) }
        )
        var request = URLRequest(url: URL(string: "http://127.0.0.1:1/api/v1/native/commands")!)
        request.timeoutInterval = 2

        do {
            _ = try await transport.data(for: request)
            XCTFail("expected the connection to be refused")
        } catch {
            // Expected -- nothing is listening on this port.
        }

        let recorded = recorder.recorded
        XCTAssertEqual(recorded.count, 1, "exactly one diagnostic event, for this one attempt")
        let event = try XCTUnwrap(recorded.first)
        XCTAssertFalse(event.succeeded)
        XCTAssertEqual(event.path, "/api/v1/native/commands")
        XCTAssertEqual(event.capturedAt, Date(timeIntervalSince1970: 42))
        XCTAssertEqual(event.networkInterface, "wifi")
    }

    // A prior version of this test made a real, external HTTPS request
    // against Founder Production's own health endpoint to prove the
    // transaction-timings extraction against a genuinely Foundation-
    // delivered `URLSessionTaskMetrics`, not a hand-built stand-in. That was
    // manually confirmed to work (protocol name, positive transaction count
    // and timings all populated) during development -- but a dependency on
    // live external-network reachability inside the automated unit suite is
    // exactly the kind of non-hermetic test this codebase otherwise has
    // none of, and it coincided with unrelated test-host instability
    // ("Restarting after unexpected exit, crash, or test timeout") the one
    // time it ran as part of the full suite rather than in isolation.
    // `testRecordsAFailureEventForAConnectionRefusedRequest` above already
    // exercises the same real Foundation networking/delegate machinery
    // purely locally (127.0.0.1, no external dependency), which is enough
    // to prove the wiring; it just cannot itself prove a POPULATED
    // `URLSessionTaskMetrics` since a connection that's refused immediately
    // has no completed transaction to report.
}

final class NetworkPathObserverTests: XCTestCase {
    /// This test machine has had verified internet access throughout this
    /// release lane (the live health-endpoint probes this same diagnosis
    /// used); a real `NWPathMonitor` should report a satisfied path with a
    /// concrete interface within a few seconds of starting.
    func testReportsARealSatisfiedPathWithAnInterface() {
        let observer = NetworkPathObserver()
        let expectation = XCTestExpectation(description: "a satisfied path is observed")
        let deadline = Date().addingTimeInterval(5)
        let timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { timer in
            let snapshot = observer.currentSnapshot()
            if snapshot.status == "satisfied" && snapshot.interface != nil {
                timer.invalidate()
                expectation.fulfill()
            } else if Date() > deadline {
                timer.invalidate()
            }
        }
        wait(for: [expectation], timeout: 6)
        timer.invalidate()
    }
}
