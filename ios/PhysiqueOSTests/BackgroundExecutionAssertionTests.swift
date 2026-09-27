import Foundation
import XCTest
@testable import PhysiqueOS

/// A `BackgroundTaskScheduling` that never talks to the real OS, so these
/// tests can deterministically simulate every ordering `withBackgroundExecutionAssertion`
/// must survive without waiting out a real background-time budget: normal
/// completion, a thrown error, the OS's own expiration handler firing before
/// the operation finishes, and that same handler firing again afterward.
private final class FakeBackgroundTaskScheduling: BackgroundTaskScheduling, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var beginNames: [String] = []
    private(set) var endedIdentifiers: [Int] = []
    private var nextIdentifier = 1
    private var storedExpirationHandlers: [Int: @Sendable () -> Void] = [:]

    /// When true, the expiration handler fires synchronously, inside
    /// `beginTask` itself, before that call even returns an identifier to
    /// the caller -- the tightest possible race with `BackgroundTaskEndGuard`
    /// recording that identifier.
    var expiresImmediately = false

    func beginTask(named name: String, expirationHandler: @escaping @Sendable () -> Void) -> Int {
        let id: Int = lock.withLock {
            beginNames.append(name)
            let id = nextIdentifier
            nextIdentifier += 1
            storedExpirationHandlers[id] = expirationHandler
            return id
        }
        if expiresImmediately { expirationHandler() }
        return id
    }

    func endTask(_ identifier: Int) {
        lock.withLock { endedIdentifiers.append(identifier) }
    }

    /// Simulates the OS calling the expiration handler for the most recently
    /// started task, from whatever queue -- possibly well after the
    /// protected operation has already finished normally.
    func fireLatestExpirationHandler() {
        let handler: (@Sendable () -> Void)? = lock.withLock {
            guard let latest = storedExpirationHandlers.keys.max() else { return nil }
            return storedExpirationHandlers[latest]
        }
        handler?()
    }
}

private extension NSLock {
    func withLock<T>(_ body: () -> T) -> T {
        lock(); defer { unlock() }
        return body()
    }
}

private struct TestFailure: Error, Equatable {}

final class BackgroundExecutionAssertionTests: XCTestCase {
    func testBeginsBeforeTheOperationRunsAndEndsExactlyOnceOnSuccess() async throws {
        let scheduler = FakeBackgroundTaskScheduling()
        var operationRanWithBeginAlreadyRecorded = false

        let result = try await withBackgroundExecutionAssertion(named: "physiqueos.test", scheduler: scheduler) {
            operationRanWithBeginAlreadyRecorded = scheduler.beginNames == ["physiqueos.test"]
            return 42
        }

        XCTAssertEqual(result, 42)
        XCTAssertTrue(operationRanWithBeginAlreadyRecorded, "the assertion must begin before the protected operation runs")
        XCTAssertEqual(scheduler.beginNames, ["physiqueos.test"])
        XCTAssertEqual(scheduler.endedIdentifiers, [1], "the assertion must end exactly once, for the identifier it began")
    }

    func testEndsExactlyOnceWhenTheOperationThrows() async throws {
        let scheduler = FakeBackgroundTaskScheduling()

        await XCTAssertThrowsErrorAsync(
            try await withBackgroundExecutionAssertion(named: "physiqueos.test", scheduler: scheduler) {
                throw TestFailure()
            }
        ) { error in
            XCTAssertTrue(error is TestFailure)
        }

        XCTAssertEqual(scheduler.endedIdentifiers, [1], "a thrown error must still end the assertion exactly once")
    }

    func testEndsExactlyOnceEvenWhenExpirationFiresBeforeTheOperationCompletes() async throws {
        // The tightest possible race: the OS decides the assertion has no
        // time left and fires the expiration handler synchronously, before
        // `beginTask` has even returned an identifier to `BackgroundTaskEndGuard`.
        // The still-running operation must not cause a second `endTask` call
        // once it finishes.
        let scheduler = FakeBackgroundTaskScheduling()
        scheduler.expiresImmediately = true

        let result = try await withBackgroundExecutionAssertion(named: "physiqueos.test", scheduler: scheduler) {
            "completed after expiration already fired"
        }

        XCTAssertEqual(result, "completed after expiration already fired", "the operation still runs to completion")
        XCTAssertEqual(scheduler.endedIdentifiers, [1], "expiration firing first must not prevent, or duplicate, the end call")
    }

    func testExpirationFiringAfterNormalCompletionDoesNotEndTwice() async throws {
        // The OS can call the expiration handler on any queue, at any time --
        // including well after the protected operation, and the assertion it
        // was guarding, have already completed and ended normally.
        let scheduler = FakeBackgroundTaskScheduling()

        _ = try await withBackgroundExecutionAssertion(named: "physiqueos.test", scheduler: scheduler) {
            "done"
        }
        XCTAssertEqual(scheduler.endedIdentifiers, [1])

        scheduler.fireLatestExpirationHandler()

        XCTAssertEqual(scheduler.endedIdentifiers, [1], "a late expiration callback must not end an already-ended assertion again")
    }

    func testEndsExactlyOnceWhenTheEnclosingTaskIsCancelled() async throws {
        let scheduler = FakeBackgroundTaskScheduling()
        let started = XCTestExpectation(description: "operation started")

        let task = Task {
            try await withBackgroundExecutionAssertion(named: "physiqueos.test", scheduler: scheduler) {
                started.fulfill()
                // Cooperative cancellation: keep checking, the way a real
                // network call's async bridging observes Task cancellation
                // rather than being force-killed.
                while !Task.isCancelled {
                    try await Task.sleep(nanoseconds: 1_000_000)
                }
                throw CancellationError()
            }
        }

        await fulfillment(of: [started], timeout: 2)
        task.cancel()

        await XCTAssertThrowsErrorAsync(try await task.value) { error in
            XCTAssertTrue(error is CancellationError)
        }
        XCTAssertEqual(scheduler.endedIdentifiers, [1], "a cancelled enclosing Task must still end the assertion exactly once")
    }

    func testDistinctCallsGetDistinctIdentifiersAndEachEndsExactlyOnce() async throws {
        let scheduler = FakeBackgroundTaskScheduling()

        _ = try await withBackgroundExecutionAssertion(named: "physiqueos.test.one", scheduler: scheduler) { 1 }
        _ = try await withBackgroundExecutionAssertion(named: "physiqueos.test.two", scheduler: scheduler) { 2 }

        XCTAssertEqual(scheduler.beginNames, ["physiqueos.test.one", "physiqueos.test.two"])
        XCTAssertEqual(scheduler.endedIdentifiers, [1, 2])
    }
}

/// XCTest has no built-in async `XCTAssertThrowsError`; this mirrors its
/// synchronous counterpart's shape (message-free, error-inspecting closure)
/// for the async throwing calls above.
private func XCTAssertThrowsErrorAsync<T>(
    _ expression: @autoclosure () async throws -> T,
    _ errorHandler: (Error) -> Void = { _ in },
    file: StaticString = #filePath,
    line: UInt = #line
) async {
    do {
        _ = try await expression()
        XCTFail("expected an error to be thrown", file: file, line: line)
    } catch {
        errorHandler(error)
    }
}
