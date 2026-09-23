import Foundation

/// Abstracts exactly the `HealthKitSynchronizationEngine` operations the
/// automatic bootstrap needs, so it is testable against a fake rather than
/// the real Apple APIs, matching this codebase's existing canary-coordinator
/// convention.
protocol HealthKitAutomaticSynchronizing: Sendable {
    func startObserving(scope: HealthKitCursorScope) async throws
    func enableBackgroundDelivery(scope: HealthKitCursorScope) async throws
    func synchronize(scope: HealthKitCursorScope, stagingCompletion: (@Sendable () -> Void)?) async throws
}

extension HealthKitSynchronizationEngine: HealthKitAutomaticSynchronizing {}

/// The permanent, background-eligible Activity + Nutrition + Workouts
/// ingestion path. Workouts (`HKWorkout` samples) are floor-bounded: the
/// automatic path never sweeps a workout that ended before the Founder-local
/// activation date in `HealthKitWorkoutActivationFloor` (enforced twice --
/// in `SystemHealthKitQueryClient`'s anchor-less predicate and again in
/// `HealthKitSynchronizationEngine.synchronize`), so the first anchor-less
/// catch-up can never upload pre-activation history.
///
/// Independent of the Founder Production diagnostic screen and its local
/// `canaryEnabled` toggle -- neither is consulted here, and this coordinator
/// never touches the diagnostic screen's own cursor scope (a different
/// `predicateVersion`), so the two paths cannot collide or duplicate a batch.
///
/// `bootstrap()` is idempotent and safe to call on every foreground
/// transition (cold launch and resume both look the same to SwiftUI's
/// `scenePhase`):
///   1. If HealthKit authorization has not been asked *this process*, ask.
///      iOS silently no-ops a repeat request once the user has already
///      answered (grant or deny) -- this can never show a second prompt for
///      an already-decided Founder, and is the standard, documented pattern
///      for a HealthKit app to re-establish its authorization state after a
///      fresh launch (the OS grant is durable; this Swift wrapper's
///      `authorizationWasRequested` flag is not, since it is fresh in-memory
///      state on every launch).
///   2. Once available, register the local observer and iOS background
///      delivery for Activity, Nutrition, and Workouts (both idempotent; a duplicate
///      registration is a no-op, confirmed by reading
///      `HealthKitSynchronizationEngine.startObserving` and
///      `SystemHealthKitObserverClient.enableBackgroundDelivery`).
///   3. Run one immediate incremental sync per stream as relaunch/foreground
///      catch-up. This is the documented fallback, not merely a nicety: this
///      codebase has no `BGTaskScheduler`/app-delegate background-task
///      infrastructure, so whether `enableBackgroundDelivery` alone is
///      sufficient for iOS to relaunch a FULLY TERMINATED (not merely
///      suspended) PhysiqueOS process for a HealthKit change is Apple
///      background-execution behavior this candidate cannot verify without a
///      real device. Regardless of whether that proactive wake succeeds,
///      this foreground catch-up guarantees nothing is permanently missed:
///      worst case, a change is caught on the next time the Founder opens
///      the app rather than the moment it happened.
///
/// Every step degrades gracefully: no step throws out of `bootstrap()`, and a
/// failure (offline, HealthKit unavailable, server unreachable) is recorded
/// in the returned outcome for diagnostics rather than surfaced to the
/// Founder or retried aggressively in a loop. The next foreground transition
/// tries again.
///
/// Reentrancy: `bootstrap()` is called on every `scenePhase == .active`
/// transition, so an overlapping call (a quick app-switcher-and-back before
/// the first call finishes) is expected, not exceptional. A second call
/// while one is already running never starts concurrently. One request that
/// arrives during the initial pass queues a single sequential rerun; further
/// overlap coalesces into the active pass. This both avoids losing a fresh
/// foreground request behind a stale/stalled pass and prevents two identical
/// scopes from reading the same not-yet-advanced cursor concurrently.
/// `@unchecked Sendable`: every mutable stored property (`lastBootstrapOutcome`,
/// `cachedOwnerIdentity`, `inFlightTask`) is written only from inside
/// `bootstrap()`/`runBootstrap()`, both `@MainActor`-isolated, matching this
/// codebase's existing pattern for actor-adjacent coordinator classes (see
/// `KeychainHealthKitCanaryDeviceIdentityStore`). The `init` only assigns
/// immutable `let`s, so it is safe to call from a non-isolated context (as
/// `AppEnvironment`'s own synchronous init does). This conformance is what
/// lets `bootstrap()` be awaited from two overlapping child tasks (e.g. a
/// test's `async let`, or two quick `scenePhase` transitions), which the
/// in-flight-task guard above requires being able to express.
final class HealthKitAutomaticSynchronizationCoordinator: @unchecked Sendable {
    static let predicateVersion = "healthkit-automatic-v1"
    /// Source-observation identities of the permanent automatic path never
    /// share an external id with the Founder canary's validation-only
    /// uploads or the canonical-test-day's own `testday` namespace, exactly
    /// like those two are already kept apart from each other. Before this
    /// existed, the automatic path's daily-aggregate identities (Activity
    /// Summary, Nutrition daily total) were bare `activity-summary:<date>` /
    /// `nutrition-daily-total:<date>` strings -- identical to whatever the
    /// canary had already used for that same day. A real production
    /// collision (`HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE`, since the
    /// canary's purpose, `validation_only`, is permanently bound to that
    /// identity on the Server) is what made Build 51's Activity path get
    /// stuck: see `HealthKitSynchronizationEngine.deliverPending`'s
    /// abandon-on-rejection recovery, the other half of this fix.
    static let externalIDNamespace = "automatic"
    /// The two daily-aggregate streams first, then per-sample Workouts. The
    /// Workout stream is the only one here with a native HealthKit anchor,
    /// and therefore the only one whose first anchor-less run would
    /// otherwise return ALL history -- which is exactly what
    /// `HealthKitWorkoutActivationFloor` prevents.
    static let streams: [HealthKitSynchronizationStream] = [.activitySummary, .nutritionDailyTotal, .workouts]

    private let authorization: any HealthKitCanaryAuthorizationCoordinating
    private let synchronizer: any HealthKitAutomaticSynchronizing
    private let server: any HealthKitFounderCanaryServer
    private let deviceIdentityStore: any HealthKitCanaryDeviceIdentityStore
    private let stepTimeout: Duration

    private(set) var lastBootstrapOutcome: HealthKitAutomaticBootstrapOutcome?
    /// The Founder's owner identity almost never changes within one signed-in
    /// session; caching it avoids an authenticated server round trip on every
    /// single foreground transition and shrinks the window in which two
    /// bootstraps could ever observe different identity values.
    private var cachedOwnerIdentity: String?
    /// Coalesces overlapping `bootstrap()` calls into one execution. Without
    /// this, a quick app-switcher-and-back (two `scenePhase == .active`
    /// transitions before the first bootstrap finishes) could run two
    /// authorization requests concurrently, or two `synchronize()` calls for
    /// the identical scope that both read the same not-yet-advanced cursor
    /// and each stage/upload a redundant duplicate batch.
    private var inFlightTask: Task<HealthKitAutomaticBootstrapOutcome, Never>?
    /// A foreground/pull-to-refresh request that arrives during the initial
    /// pass is not satisfied by that potentially stale pass. It queues one
    /// fresh pass after the current one finishes. Calls arriving during that
    /// queued rerun coalesce into it rather than creating an unbounded loop.
    private var rerunRequested = false
    private var rerunInProgress = false

    init(
        authorization: any HealthKitCanaryAuthorizationCoordinating,
        synchronizer: any HealthKitAutomaticSynchronizing,
        server: any HealthKitFounderCanaryServer,
        deviceIdentityStore: any HealthKitCanaryDeviceIdentityStore = KeychainHealthKitCanaryDeviceIdentityStore(),
        stepTimeout: Duration = .seconds(30)
    ) {
        self.authorization = authorization
        self.synchronizer = synchronizer
        self.server = server
        self.deviceIdentityStore = deviceIdentityStore
        self.stepTimeout = stepTimeout
    }

    @MainActor
    @discardableResult
    func bootstrap() async -> HealthKitAutomaticBootstrapOutcome {
        if let inFlightTask {
            if !rerunInProgress { rerunRequested = true }
            return await inFlightTask.value
        }
        let task = Task { @MainActor in
            var outcome = await self.runBootstrap()
            if self.rerunRequested {
                self.rerunRequested = false
                self.rerunInProgress = true
                outcome = await self.runBootstrap()
                self.rerunInProgress = false
            }
            // Clear before completing the task. This closes the narrow actor-
            // reentrancy window where a caller could otherwise observe an
            // already-completed task and have its rerun request discarded by
            // an older waiter doing cleanup after `await task.value`.
            self.inFlightTask = nil
            self.rerunRequested = false
            self.rerunInProgress = false
            return outcome
        }
        inFlightTask = task
        return await task.value
    }

    @MainActor
    private func runBootstrap() async -> HealthKitAutomaticBootstrapOutcome {
        var outcome = HealthKitAutomaticBootstrapOutcome()
        if !authorization.authorizationWasRequested {
            // Known, reviewed tradeoff (not fixed here; a Founder decision):
            // `.initialRead` is the SAME full V1 read scope (Activity,
            // Nutrition, Workouts, Sleep) the diagnostic screen's button has
            // always requested -- this diff does not widen WHAT is asked for,
            // only WHEN, moving it from a deliberate Founder tap to the first
            // automatic foreground. For an already-decided Founder (the real
            // case today) this is a silent no-op; for a hypothetical fresh
            // install it would show the standard one-time HealthKit consent
            // prompt automatically rather than only after a screen visit.
            outcome.authorizationOutcome = await authorization.requestAuthorization(for: .initialRead)
        }
        guard case .available = authorization.currentAvailability else {
            outcome.skippedReason = "authorization_not_available"
            lastBootstrapOutcome = outcome
            return outcome
        }
        let ownerIdentity: String
        if let cachedOwnerIdentity {
            ownerIdentity = cachedOwnerIdentity
        } else if let fetched = try? await server.founderOwnerIdentity() {
            ownerIdentity = fetched
            cachedOwnerIdentity = fetched
        } else {
            outcome.skippedReason = "owner_identity_unavailable"
            lastBootstrapOutcome = outcome
            return outcome
        }
        guard let deviceIdentity = try? deviceIdentityStore.stableIdentity() else {
            outcome.skippedReason = "device_identity_unavailable"
            lastBootstrapOutcome = outcome
            return outcome
        }
        for stream in Self.streams {
            let scope = HealthKitCursorScope(
                ownerIdentity: ownerIdentity,
                enrolledDeviceIdentity: deviceIdentity,
                stream: stream,
                predicateVersion: Self.predicateVersion
            )
            switch await boundedStep({ try await self.synchronizer.startObserving(scope: scope) }) {
            case .succeeded: break
            case .failed:
                outcome.streamErrors[stream, default: []].append("observer_registration_failed")
            case .timedOut:
                outcome.streamErrors[stream, default: []].append("observer_registration_timed_out")
            }
            switch await boundedStep({ try await self.synchronizer.enableBackgroundDelivery(scope: scope) }) {
            case .succeeded: break
            case .failed:
                outcome.streamErrors[stream, default: []].append("background_delivery_registration_failed")
            case .timedOut:
                outcome.streamErrors[stream, default: []].append("background_delivery_registration_timed_out")
            }
            switch await boundedStep({ try await self.synchronizer.synchronize(scope: scope, stagingCompletion: nil) }) {
            case .succeeded:
                outcome.caughtUpStreams.insert(stream)
            case let .failed(code):
                outcome.streamErrors[stream, default: []].append(
                    code == "healthkit_query_timed_out" ? "catch_up_sync_timed_out" : "catch_up_sync_failed"
                )
            case .timedOut:
                outcome.streamErrors[stream, default: []].append("catch_up_sync_timed_out")
            }
        }
        lastBootstrapOutcome = outcome
        return outcome
    }

    private func boundedStep(
        _ operation: @escaping @Sendable () async throws -> Void
    ) async -> HealthKitAutomaticStepOutcome {
        await withCheckedContinuation { continuation in
            let gate = HealthKitAutomaticStepGate(continuation: continuation)
            Task {
                do {
                    try await operation()
                    gate.resolve(.succeeded)
                } catch let error as HealthKitSyncError {
                    gate.resolve(.failed(code: error.diagnosticCode))
                } catch {
                    gate.resolve(.failed(code: nil))
                }
            }
            Task {
                do { try await Task.sleep(for: stepTimeout) }
                catch { return }
                gate.resolve(.timedOut)
            }
        }
    }
}

private enum HealthKitAutomaticStepOutcome: Sendable {
    case succeeded
    case failed(code: String?)
    case timedOut
}

/// Checked continuations are single-resume. HealthKit callbacks and the
/// timeout task race from different executors, so the winner is serialized
/// by this tiny lock and late results are deliberately ignored.
private final class HealthKitAutomaticStepGate: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<HealthKitAutomaticStepOutcome, Never>?

    init(continuation: CheckedContinuation<HealthKitAutomaticStepOutcome, Never>) {
        self.continuation = continuation
    }

    func resolve(_ outcome: HealthKitAutomaticStepOutcome) {
        lock.lock()
        let current = continuation
        continuation = nil
        lock.unlock()
        current?.resume(returning: outcome)
    }
}

/// The device-side floor under which the automatic path never uploads an
/// `HKWorkout`: the Founder-local calendar date 2026-09-23.
///
/// This mirrors the Server's prospective Strength-workout activation policy
/// (its `effectiveLocalDate`): the Server remains the authority and
/// independently refuses to canonicalize anything earlier, so this floor
/// is not what makes pre-activation history safe -- it is what keeps the
/// device from ever *sending* it. Without it, the very first anchor-less
/// `HKAnchoredObjectQuery` for the Workout stream (a fresh install, or any
/// cursor reset via `resetCursorForBoundedRecovery`) would sweep every
/// workout HealthKit has ever stored and upload years of history.
///
/// "Founder-local" is the device's current time zone (the same zone the
/// canary's `HealthKitActivityValidationWindow.queryBounds` resolves its
/// local-day bounds through): the floor instant is the start of that day in
/// that zone. Day arithmetic is pinned to the Gregorian calendar so a
/// non-Gregorian device calendar setting can never reinterpret the fixed
/// year/month/day.
///
/// Comparison is by END instant, on purpose: a session that started late on
/// 2026-09-22 and ended after local midnight is still delivered, and the
/// Server decides which local day it belongs to. Never compare
/// `occurrence.localDate`, which is start-based.
struct HealthKitWorkoutActivationFloor: Equatable, Sendable {
    static let localDate = "2026-09-23"
    private static let dateComponents = DateComponents(year: 2026, month: 9, day: 23)

    /// Start of the activation day in the floor's time zone.
    let startOfDay: Date
    let timeZoneIdentifier: String

    /// The production floor, resolved in the device's current time zone.
    static var current: HealthKitWorkoutActivationFloor { HealthKitWorkoutActivationFloor() }

    init(calendar: Calendar = .autoupdatingCurrent) {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        // A fixed, valid Gregorian date always resolves; the fallback fails
        // CLOSED (nothing ever passes a `.distantFuture` floor) rather than
        // open, so an impossible calendar failure can never widen the sweep.
        self.startOfDay = gregorian.date(from: Self.dateComponents) ?? .distantFuture
        self.timeZoneIdentifier = gregorian.timeZone.identifier
    }

    /// Whether a workout that ended at `endedAt` is on or after the floor.
    /// An unknown end instant cannot be proven post-activation and is
    /// refused (fail closed); every real `HKWorkout` carries an `endDate`.
    func admits(endedAt: Date?) -> Bool {
        guard let endedAt else { return false }
        return endedAt >= startOfDay
    }
}

struct HealthKitAutomaticBootstrapOutcome: Equatable {
    var authorizationOutcome: HealthKitAuthorizationOutcome?
    var skippedReason: String?
    var caughtUpStreams: Set<HealthKitSynchronizationStream> = []
    var streamErrors: [HealthKitSynchronizationStream: [String]] = [:]
}
