import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Abstracts iOS's background-execution assertion
/// (`UIApplication.begin`/`endBackgroundTask`) behind a narrow, testable
/// seam. A real app gets `UIKitBackgroundTaskScheduler`; tests inject a fake
/// that can deterministically simulate normal completion, a thrown error,
/// Swift Task cancellation, and the OS's own expiration handler firing --
/// none of which are reliably reproducible against the real API without
/// waiting out an actual background-time budget.
protocol BackgroundTaskScheduling: Sendable {
    /// Starts the assertion and returns an opaque identifier. `expirationHandler`
    /// may be invoked by the OS, on any queue, at any time after this call
    /// returns, if the background time budget runs out before `endTask` is
    /// called for this identifier -- it must be safe to call concurrently
    /// with, and possibly before, the eventual `endTask` call.
    func beginTask(named name: String, expirationHandler: @escaping @Sendable () -> Void) -> Int
    /// Ends the assertion for `identifier`. Safe to call more than once or
    /// with an identifier that was never actually started; real
    /// implementations must tolerate that the way `UIApplication.endBackgroundTask`
    /// tolerates being called on `.invalid`.
    func endTask(_ identifier: Int)
}

#if canImport(UIKit)
/// The real, production `BackgroundTaskScheduling` -- a thin wrapper over
/// `UIApplication`'s own background-task API. `UIBackgroundTaskIdentifier`'s
/// `rawValue` is already an `Int`, so this adds no representation of its own.
struct UIKitBackgroundTaskScheduler: BackgroundTaskScheduling {
    func beginTask(named name: String, expirationHandler: @escaping @Sendable () -> Void) -> Int {
        UIApplication.shared.beginBackgroundTask(withName: name, expirationHandler: expirationHandler).rawValue
    }

    func endTask(_ identifier: Int) {
        UIApplication.shared.endBackgroundTask(UIBackgroundTaskIdentifier(rawValue: identifier))
    }
}
#endif

/// Runs `operation` under an OS background-execution assertion, so a brief
/// app background/suspension transition during the call doesn't have its
/// in-flight work torn down by the OS before it can finish or fail cleanly.
///
/// The assertion ends EXACTLY ONCE, whichever of these happens first:
/// `operation` returns, `operation` throws (including a thrown
/// `CancellationError` from the enclosing Swift Task being cancelled), or
/// the OS's own expiration handler fires. It is never left open (a real
/// resource and App Review risk) and never ended twice (a hard UIKit
/// precondition failure) -- both are guarded by `BackgroundTaskEndGuard`
/// below regardless of which of those three orderings actually occurs.
nonisolated(nonsending) func withBackgroundExecutionAssertion<T>(
    named name: String,
    scheduler: any BackgroundTaskScheduling,
    operation: () async throws -> T
) async throws -> T {
    let endGuard = BackgroundTaskEndGuard(scheduler: scheduler)
    endGuard.begin(named: name)
    defer { endGuard.endIfNeeded() }
    return try await operation()
}

/// Serializes the "end exactly once" decision between two independent
/// callers that can race: the OS's expiration handler (called on an
/// arbitrary queue, possibly before `begin(named:)` has even finished
/// recording the identifier) and the normal completion path in
/// `withBackgroundExecutionAssertion`'s `defer`.
private final class BackgroundTaskEndGuard: @unchecked Sendable {
    private let scheduler: any BackgroundTaskScheduling
    private let lock = NSLock()
    private var identifier: Int?
    private var ended = false

    init(scheduler: any BackgroundTaskScheduling) {
        self.scheduler = scheduler
    }

    func begin(named name: String) {
        // Strong capture, deliberately: the OS (or, in tests, the fake
        // scheduler) is the only thing holding this closure, for exactly as
        // long as the assertion is open. `self` must stay alive for that
        // whole span so a late expiration firing after the normal
        // completion path has otherwise dropped its own reference can still
        // reach `endIfNeeded()` -- which is what makes it safe to call.
        let id = scheduler.beginTask(named: name) {
            self.endIfNeeded()
        }
        lock.lock()
        if ended {
            // The expiration handler already fired -- synchronously, on
            // this same call, or from another queue in the brief window
            // before this line -- before this function recorded `id`.
            // End it immediately rather than leaking it.
            lock.unlock()
            scheduler.endTask(id)
            return
        }
        identifier = id
        lock.unlock()
    }

    func endIfNeeded() {
        lock.lock()
        guard !ended else { lock.unlock(); return }
        ended = true
        let id = identifier
        lock.unlock()
        if let id { scheduler.endTask(id) }
    }
}
