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
/// while one is already running awaits and returns the SAME in-flight
/// result rather than starting a concurrent second execution -- without
/// this, two overlapping `synchronize()` calls for the identical scope
/// could each read the same not-yet-advanced cursor and each stage/upload a
/// redundant duplicate batch.
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

    init(
        authorization: any HealthKitCanaryAuthorizationCoordinating,
        synchronizer: any HealthKitAutomaticSynchronizing,
        server: any HealthKitFounderCanaryServer,
        deviceIdentityStore: any HealthKitCanaryDeviceIdentityStore = KeychainHealthKitCanaryDeviceIdentityStore()
    ) {
        self.authorization = authorization
        self.synchronizer = synchronizer
        self.server = server
        self.deviceIdentityStore = deviceIdentityStore
    }

    @MainActor
    @discardableResult
    func bootstrap() async -> HealthKitAutomaticBootstrapOutcome {
        if let inFlightTask {
            return await inFlightTask.value
        }
        let task = Task { @MainActor in
            await self.runBootstrap()
        }
        inFlightTask = task
        let outcome = await task.value
        inFlightTask = nil
        return outcome
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
            do { try await synchronizer.startObserving(scope: scope) } catch {
                outcome.streamErrors[stream, default: []].append("observer_registration_failed")
            }
            do { try await synchronizer.enableBackgroundDelivery(scope: scope) } catch {
                outcome.streamErrors[stream, default: []].append("background_delivery_registration_failed")
            }
            do {
                try await synchronizer.synchronize(scope: scope, stagingCompletion: nil)
                outcome.caughtUpStreams.insert(stream)
            } catch {
                outcome.streamErrors[stream, default: []].append("catch_up_sync_failed")
            }
        }
        lastBootstrapOutcome = outcome
        return outcome
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
