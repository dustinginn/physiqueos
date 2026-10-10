import Foundation

/// Abstracts exactly the `HealthKitSynchronizationEngine` operations the
/// automatic bootstrap needs, so it is testable against a fake rather than
/// the real Apple APIs, matching this codebase's existing canary-coordinator
/// convention.
/// The Founder's owner identity, persisted locally (it is an opaque id, not a
/// credential) so a HealthKit-launched background process can register its
/// observers immediately, without first waiting on an authenticated network
/// round trip that iOS may not give it time for.
protocol HealthKitOwnerIdentityCache: Sendable {
    func load() -> String?
    func save(_ identity: String)
}

struct UserDefaultsHealthKitOwnerIdentityCache: HealthKitOwnerIdentityCache, @unchecked Sendable {
    private let defaults: UserDefaults
    private let key = "physiqueos.healthkit.automatic.owner-identity.v1"
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    func load() -> String? {
        let value = defaults.string(forKey: key)
        return (value?.isEmpty ?? true) ? nil : value
    }
    func save(_ identity: String) { defaults.set(identity, forKey: key) }
}

protocol HealthKitAutomaticSynchronizing: Sendable {
    func startObserving(scope: HealthKitCursorScope) async throws
    func enableBackgroundDelivery(scope: HealthKitCursorScope) async throws
    func synchronize(scope: HealthKitCursorScope, stagingCompletion: (@Sendable () -> Void)?) async throws
    func synchronizeCurrentDay(scope: HealthKitCursorScope, calendar: Calendar) async throws
    func synchronizeHistoricalCatchUp(scope: HealthKitCursorScope, calendar: Calendar) async throws
    func deactivateSleepObservation(scope: HealthKitCursorScope) async throws
}

extension HealthKitAutomaticSynchronizing {
    func deactivateSleepObservation(scope: HealthKitCursorScope) async throws {}
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
///   1. Preflight the exact permanent read scope. A background launch only
///      checks status; consent UI is possible solely from a visible
///      foreground bootstrap when HealthKit reports that new consent is due.
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
    /// The existing Build 57 scope is deliberately retained for historical
    /// recovery so its durable cursor, pending batch, and per-day revision
    /// floors survive this architecture change.
    static let predicateVersion = "healthkit-automatic-v1"
    /// Current-day state is isolated from the legacy historical envelope.
    /// Both predicate versions map to the same Server `automatic` namespace;
    /// this string only separates protected local state and pending delivery.
    static let currentDayPredicateVersion = "healthkit-automatic-current-day-v1"
    /// Historical daily state is isolated one local date per envelope. The
    /// prefix is local-only; every derived scope still maps to the established
    /// Server `automatic` identity namespace.
    static let historicalDayPredicatePrefix = "healthkit-automatic-history-day-v1:"
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
    private let synchronizationStore: (any HealthKitSynchronizationStore)?
    private let ownerIdentityCache: any HealthKitOwnerIdentityCache
    private let stepTimeout: Duration
    private let calendar: Calendar
    private let now: @Sendable () -> Date
    /// Dormant Sleep lane. All three are `nil` unless the app wires them, and
    /// even then nothing Sleep-related runs unless the Server manifest's
    /// `healthKitSleepIngestion` capability is enabled with a valid floor.
    private let sleepActivation: HealthKitSleepActivationGate?
    private let sleepCapabilitySource: (any HealthKitSleepCapabilitySource)?
    private let sleepManifestSender: HealthKitSleepWindowManifestSender?
    private let trustedWorkoutCorrelationGate: HealthKitTrustedWorkoutCorrelationGate?
    private let trustedWorkoutCorrelationCapabilitySource: (any HealthKitTrustedWorkoutCorrelationCapabilitySource)?

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
    /// Monotonic request generations make every burst that arrives during an
    /// active pass demand one strictly newer pass. Calls within the same pass
    /// coalesce, while a pull during an already-queued rerun cannot be lost.
    private var requestedGeneration: UInt64 = 0
    private var activeGeneration: UInt64 = 0
    private var completedGeneration: UInt64 = 0
    /// A visible foreground request arriving during a background/recovery
    /// pass queues a newer pass that is allowed to present required consent.
    private var foregroundAuthorizationRequested = false

    init(
        authorization: any HealthKitCanaryAuthorizationCoordinating,
        synchronizer: any HealthKitAutomaticSynchronizing,
        server: any HealthKitFounderCanaryServer,
        deviceIdentityStore: any HealthKitCanaryDeviceIdentityStore = KeychainHealthKitCanaryDeviceIdentityStore(),
        synchronizationStore: (any HealthKitSynchronizationStore)? = nil,
        ownerIdentityCache: any HealthKitOwnerIdentityCache = UserDefaultsHealthKitOwnerIdentityCache(),
        stepTimeout: Duration = .seconds(30),
        calendar: Calendar = .autoupdatingCurrent,
        now: @escaping @Sendable () -> Date = Date.init,
        sleepActivation: HealthKitSleepActivationGate? = nil,
        sleepCapabilitySource: (any HealthKitSleepCapabilitySource)? = nil,
        sleepManifestSender: HealthKitSleepWindowManifestSender? = nil,
        trustedWorkoutCorrelationGate: HealthKitTrustedWorkoutCorrelationGate? = nil,
        trustedWorkoutCorrelationCapabilitySource: (any HealthKitTrustedWorkoutCorrelationCapabilitySource)? = nil
    ) {
        self.sleepActivation = sleepActivation
        self.sleepCapabilitySource = sleepCapabilitySource
        self.sleepManifestSender = sleepManifestSender
        self.trustedWorkoutCorrelationGate = trustedWorkoutCorrelationGate
        self.trustedWorkoutCorrelationCapabilitySource = trustedWorkoutCorrelationCapabilitySource
        self.ownerIdentityCache = ownerIdentityCache
        self.authorization = authorization
        self.synchronizer = synchronizer
        self.server = server
        self.deviceIdentityStore = deviceIdentityStore
        self.synchronizationStore = synchronizationStore
        self.stepTimeout = stepTimeout
        self.calendar = calendar
        self.now = now
    }

    /// Read-only Founder diagnostics for the permanent automatic scopes.
    /// This never starts a query or upload and exposes no HealthKit values or
    /// device identity; it only projects the protected local store's health
    /// and daily-revision recovery metadata.
    @MainActor
    func diagnosticSnapshot() async -> [HealthKitSynchronizationStream: HealthKitStreamDiagnostics] {
        guard let synchronizationStore else { return [:] }
        let ownerIdentity: String
        if let cachedOwnerIdentity {
            ownerIdentity = cachedOwnerIdentity
        } else if let fetched = try? await server.founderOwnerIdentity() {
            ownerIdentity = fetched
            cachedOwnerIdentity = fetched
        } else {
            return [:]
        }
        guard let deviceIdentity = try? deviceIdentityStore.stableIdentity() else { return [:] }
        var snapshot: [HealthKitSynchronizationStream: HealthKitStreamDiagnostics] = [:]
        for stream in Self.streams {
            let historicalScope = HealthKitCursorScope(
                ownerIdentity: ownerIdentity,
                enrolledDeviceIdentity: deviceIdentity,
                stream: stream,
                predicateVersion: Self.predicateVersion
            )
            guard stream == .activitySummary || stream == .nutritionDailyTotal else {
                snapshot[stream] = try? await synchronizationStore.diagnostics(for: historicalScope)
                continue
            }
            let currentScope = HealthKitCursorScope(
                ownerIdentity: ownerIdentity,
                enrolledDeviceIdentity: deviceIdentity,
                stream: stream,
                predicateVersion: Self.currentDayPredicateVersion
            )
            if let current = try? await synchronizationStore.diagnostics(for: currentScope),
               let historical = try? await synchronizationStore.diagnostics(for: historicalScope) {
                var diagnostics = [current, historical]
                if let dayBounds = try? HealthKitSynchronizationEngine.historicalCatchUpDayBounds(
                    at: now(), calendar: calendar
                ) {
                    for bounds in dayBounds {
                        let dayScope = HealthKitCursorScope(
                            ownerIdentity: ownerIdentity,
                            enrolledDeviceIdentity: deviceIdentity,
                            stream: stream,
                            predicateVersion: Self.historicalDayPredicatePrefix + bounds.startLocalDate
                        )
                        if let day = try? await synchronizationStore.diagnostics(for: dayScope) {
                            diagnostics.append(day)
                        }
                    }
                }
                snapshot[stream] = diagnostics.dropFirst().reduce(diagnostics[0]) {
                    Self.mergedDiagnostics(current: $0, historical: $1)
                }
            }
        }
        return snapshot
    }

    /// Process-launch registration. iOS relaunches a terminated app in the
    /// background for HealthKit background delivery, but only delivers the
    /// wake to an `HKObserverQuery` that is registered again by the new
    /// process. `bootstrap()` runs from `scenePhase == .active`, which never
    /// happens for a background launch -- so before this existed the wake
    /// found no observer and a Watch Strength workout waited until the
    /// Founder next opened the app.
    ///
    /// Registers the observers and background delivery ONLY: no query, no
    /// upload, no permission prompt beyond the silent no-op for an already-
    /// decided Founder, and no network (the owner identity comes from the
    /// local cache that `bootstrap()` fills). Observer wakes then drive the
    /// same sync as foreground. With no cached identity yet (first ever
    /// launch) it does nothing and the first foreground `bootstrap()` does
    /// the registration.
    @MainActor
    @discardableResult
    func registerObserversForBackgroundLaunch() async -> HealthKitAutomaticBootstrapOutcome {
        var outcome = HealthKitAutomaticBootstrapOutcome()
        let authorizationOutcome = await authorization.requestAuthorization(
            for: .automaticRead,
            presentation: .prohibited,
            reason: .backgroundLaunch
        )
        outcome.authorizationOutcome = authorizationOutcome
        guard authorizationOutcome == .completed else {
            outcome.skippedReason = "authorization_not_available"
            return outcome
        }
        guard let ownerIdentity = cachedOwnerIdentity ?? ownerIdentityCache.load() else {
            outcome.skippedReason = "owner_identity_unavailable"
            return outcome
        }
        guard let deviceIdentity = try? deviceIdentityStore.stableIdentity() else {
            outcome.skippedReason = "device_identity_unavailable"
            return outcome
        }
        for stream in Self.streams {
            let scope = HealthKitCursorScope(
                ownerIdentity: ownerIdentity,
                enrolledDeviceIdentity: deviceIdentity,
                stream: stream,
                predicateVersion: Self.predicateVersion
            )
            if case .failed = await boundedStep({ try await self.synchronizer.startObserving(scope: scope) }) {
                outcome.streamErrors[stream, default: []].append("observer_registration_failed")
            }
            if case .failed = await boundedStep({ try await self.synchronizer.enableBackgroundDelivery(scope: scope) }) {
                outcome.streamErrors[stream, default: []].append("background_delivery_registration_failed")
            }
        }
        // Sleep registers only from the persisted last-known capability (a
        // background launch has no network). Inactive -> no Sleep observer.
        if let sleepActivation {
            let scope = Self.sleepScope(ownerIdentity: ownerIdentity, deviceIdentity: deviceIdentity)
            if sleepActivation.activeFloor(at: now()) != nil {
                outcome.sleepActive = true
                let sleepAuthorization = await authorization.requestAuthorization(
                    for: .sleepRead,
                    presentation: .prohibited,
                    reason: .backgroundLaunch
                )
                if sleepAuthorization == .completed {
                    await registerSleep(scope: scope, gate: sleepActivation, outcome: &outcome)
                } else {
                    outcome.streamErrors[.sleepAnalysis, default: []].append("authorization_not_available")
                }
            } else {
                await teardownSleepIfRegistered(scope: scope, gate: sleepActivation, outcome: &outcome)
            }
        }
        return outcome
    }

    @MainActor
    private func registerSleep(
        scope: HealthKitCursorScope,
        gate: HealthKitSleepActivationGate,
        outcome: inout HealthKitAutomaticBootstrapOutcome
    ) async {
        if case .failed = await boundedStep({ try await self.synchronizer.startObserving(scope: scope) }) {
            outcome.streamErrors[.sleepAnalysis, default: []].append("observer_registration_failed")
        }
        switch await boundedStep({ try await self.synchronizer.enableBackgroundDelivery(scope: scope) }) {
        case .succeeded:
            gate.markBackgroundDeliveryRegistered()
        case .failed, .timedOut:
            outcome.streamErrors[.sleepAnalysis, default: []].append("background_delivery_registration_failed")
        }
    }

    /// When Sleep is (or has become) inactive, turn off any Sleep background
    /// delivery this device previously registered. A device that never
    /// activated Sleep has no record and makes no HealthKit call at all.
    @MainActor
    private func teardownSleepIfRegistered(
        scope: HealthKitCursorScope,
        gate: HealthKitSleepActivationGate,
        outcome: inout HealthKitAutomaticBootstrapOutcome
    ) async {
        guard gate.consumeBackgroundDeliveryRegistration() else { return }
        switch await boundedStep({ try await self.synchronizer.deactivateSleepObservation(scope: scope) }) {
        case .succeeded:
            outcome.sleepDeactivated = true
        case .failed, .timedOut:
            // Keep the record so the next pass retries the teardown.
            gate.markBackgroundDeliveryRegistered()
            outcome.streamErrors[.sleepAnalysis, default: []].append("sleep_deactivation_failed")
        }
    }

    /// The dedicated Sleep cursor scope (`healthkit-automatic-sleep-v1`).
    static func sleepScope(ownerIdentity: String, deviceIdentity: String) -> HealthKitCursorScope {
        HealthKitCursorScope(
            ownerIdentity: ownerIdentity,
            enrolledDeviceIdentity: deviceIdentity,
            stream: .sleepAnalysis,
            predicateVersion: HealthKitSleepIngestionContract.predicateVersion
        )
    }

    /// Foreground Sleep step: re-read the manifest capability (a failed read
    /// keeps the last-known state; an absent or malformed block disables),
    /// then -- only if active -- register, catch up, and send the recent-window
    /// manifest at its cadence.
    @MainActor
    private func runSleepLane(
        ownerIdentity: String,
        deviceIdentity: String,
        allowsAuthorizationPrompt: Bool,
        authorizationReason: HealthKitAuthorizationReason,
        outcome: inout HealthKitAutomaticBootstrapOutcome
    ) async {
        guard let sleepActivation else { return }
        if let source = sleepCapabilitySource {
            let now = self.now
            switch await boundedStep({
                let block = try await source.healthKitSleepCapabilityBlock()
                sleepActivation.update(HealthKitSleepCapability.resolve(manifestBlock: block, at: now()))
            }) {
            case .succeeded: break
            case .failed, .timedOut:
                outcome.streamErrors[.sleepAnalysis, default: []].append("sleep_capability_refresh_failed")
            }
        }
        let scope = Self.sleepScope(ownerIdentity: ownerIdentity, deviceIdentity: deviceIdentity)
        guard sleepActivation.activeFloor(at: now()) != nil else {
            await teardownSleepIfRegistered(scope: scope, gate: sleepActivation, outcome: &outcome)
            return
        }
        outcome.sleepActive = true
        let authorizationOutcome = await authorization.requestAuthorization(
            for: .sleepRead,
            presentation: allowsAuthorizationPrompt ? .foreground : .prohibited,
            reason: authorizationReason
        )
        guard authorizationOutcome == .completed else {
            outcome.streamErrors[.sleepAnalysis, default: []].append("authorization_not_available")
            return
        }
        await registerSleep(scope: scope, gate: sleepActivation, outcome: &outcome)
        switch await boundedStep({ try await self.synchronizer.synchronize(scope: scope, stagingCompletion: nil) }) {
        case .succeeded:
            outcome.caughtUpStreams.insert(.sleepAnalysis)
        case let .failed(code):
            outcome.streamErrors[.sleepAnalysis, default: []].append(code ?? "catch_up_sync_failed")
        case .timedOut:
            outcome.streamErrors[.sleepAnalysis, default: []].append("catch_up_sync_timed_out")
        }
        if let sleepManifestSender {
            // Bounded like every other step: a hung HealthKit read or network
            // call can never hold the shared bootstrap task open.
            let box = HealthKitSleepManifestOutcomeBox()
            switch await boundedStep({ box.set(await sleepManifestSender.sendIfDue()) }) {
            case .succeeded: outcome.sleepManifest = box.value
            case .failed, .timedOut: outcome.sleepManifest = .failed(code: "healthkit_sleep_manifest_timed_out")
            }
        }
    }

    @MainActor
    @discardableResult
    func bootstrap(
        allowsAuthorizationPrompt: Bool = true,
        authorizationReason: HealthKitAuthorizationReason = .foregroundSynchronization
    ) async -> HealthKitAutomaticBootstrapOutcome {
        foregroundAuthorizationRequested = foregroundAuthorizationRequested || allowsAuthorizationPrompt
        if let inFlightTask {
            let currentOrScheduledGeneration = max(activeGeneration, completedGeneration + 1)
            if requestedGeneration <= currentOrScheduledGeneration {
                requestedGeneration = currentOrScheduledGeneration + 1
            }
            return await inFlightTask.value
        }
        requestedGeneration = max(requestedGeneration, completedGeneration) + 1
        let task = Task { @MainActor in
            var outcome = HealthKitAutomaticBootstrapOutcome()
            while self.completedGeneration < self.requestedGeneration {
                self.activeGeneration = self.completedGeneration + 1
                let permitsPrompt = self.foregroundAuthorizationRequested
                self.foregroundAuthorizationRequested = false
                outcome = await self.runBootstrap(
                    allowsAuthorizationPrompt: permitsPrompt,
                    authorizationReason: authorizationReason
                )
                self.completedGeneration = self.activeGeneration
            }
            // Clear before completing the task. This closes the narrow actor-
            // reentrancy window where a caller could otherwise observe an
            // already-completed task and have its rerun request discarded by
            // an older waiter doing cleanup after `await task.value`.
            self.inFlightTask = nil
            self.activeGeneration = 0
            return outcome
        }
        inFlightTask = task
        return await task.value
    }

    @MainActor
    private func runBootstrap(
        allowsAuthorizationPrompt: Bool,
        authorizationReason: HealthKitAuthorizationReason
    ) async -> HealthKitAutomaticBootstrapOutcome {
        var outcome = HealthKitAutomaticBootstrapOutcome()
        let authorizationOutcome = await authorization.requestAuthorization(
            for: .automaticRead,
            presentation: allowsAuthorizationPrompt ? .foreground : .prohibited,
            reason: authorizationReason
        )
        outcome.authorizationOutcome = authorizationOutcome
        guard authorizationOutcome == .completed else {
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
            ownerIdentityCache.save(fetched)
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
        // Refresh the prospective trust policy before querying Workouts. An
        // absent or malformed block resolves OFF. A transient failed read
        // keeps the last Server-resolved state, which the Server independently
        // enforces again on every ingest.
        if let gate = trustedWorkoutCorrelationGate,
           let source = trustedWorkoutCorrelationCapabilitySource {
            let now = self.now
            switch await boundedStep({
                let block = try await source.healthKitTrustedWorkoutCorrelationCapabilityBlock()
                gate.update(HealthKitTrustedWorkoutCorrelationCapability.resolve(manifestBlock: block, at: now()))
            }) {
            case .succeeded: break
            case .failed, .timedOut:
                outcome.streamErrors[.workouts, default: []].append("trusted_watch_correlation_capability_refresh_failed")
            }
        }
        let historicalScopes = Dictionary(uniqueKeysWithValues: Self.streams.map { stream in
            (stream, HealthKitCursorScope(
                ownerIdentity: ownerIdentity,
                enrolledDeviceIdentity: deviceIdentity,
                stream: stream,
                predicateVersion: Self.predicateVersion
            ))
        })
        let currentScopes = Dictionary(uniqueKeysWithValues: [
            HealthKitSynchronizationStream.activitySummary,
            .nutritionDailyTotal,
        ].map { stream in
            (stream, HealthKitCursorScope(
                ownerIdentity: ownerIdentity,
                enrolledDeviceIdentity: deviceIdentity,
                stream: stream,
                predicateVersion: Self.currentDayPredicateVersion
            ))
        })

        // Registration is unchanged and remains bound to the legacy scope.
        // Observer wakes entering the engine through that scope run the same
        // current-first orchestration as foreground bootstrap.
        for stream in Self.streams {
            guard let scope = historicalScopes[stream] else { continue }
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
        }

        // Every daily current-day attempt precedes every historical attempt.
        // This ordering is load-bearing: Activity history must not delay
        // Nutrition today, and neither history lane may poison today's ack.
        for stream in [HealthKitSynchronizationStream.activitySummary, .nutritionDailyTotal] {
            guard let scope = currentScopes[stream] else { continue }
            switch await boundedStep({ try await self.synchronizer.synchronizeCurrentDay(scope: scope, calendar: self.calendar) }) {
            case .succeeded:
                outcome.caughtUpStreams.insert(stream)
            case let .failed(code):
                outcome.streamErrors[stream, default: []].append(
                    code == "healthkit_query_timed_out" ? "current_day_sync_timed_out" : "current_day_sync_failed"
                )
            case .timedOut:
                outcome.streamErrors[stream, default: []].append("current_day_sync_timed_out")
            }
        }

        // Workout ingestion remains byte-for-byte on its prior automatic
        // scope and activation-floor path.
        if let workoutScope = historicalScopes[.workouts] {
            switch await boundedStep({ try await self.synchronizer.synchronize(scope: workoutScope, stagingCompletion: nil) }) {
            case .succeeded:
                outcome.caughtUpStreams.insert(.workouts)
            case let .failed(code):
                outcome.streamErrors[.workouts, default: []].append(
                    code == "healthkit_query_timed_out" ? "catch_up_sync_timed_out" : "catch_up_sync_failed"
                )
            case .timedOut:
                outcome.streamErrors[.workouts, default: []].append("catch_up_sync_timed_out")
            }
        }

        // Historical recovery is best-effort after all current work. A
        // historical failure remains visible but never revokes current-day
        // success or prevents the other scope's current-day attempt.
        for stream in [HealthKitSynchronizationStream.activitySummary, .nutritionDailyTotal] {
            guard let scope = historicalScopes[stream] else { continue }
            switch await boundedStep({ try await self.synchronizer.synchronizeHistoricalCatchUp(scope: scope, calendar: self.calendar) }) {
            case .succeeded: break
            case let .failed(code):
                outcome.streamErrors[stream, default: []].append(
                    code == "healthkit_query_timed_out" ? "historical_sync_timed_out" : "historical_sync_failed"
                )
            case .timedOut:
                outcome.streamErrors[stream, default: []].append("historical_sync_timed_out")
            }
        }
        // The dormant Sleep lane runs last, so every pre-existing step keeps
        // its exact prior ordering and timing whether or not Sleep is active.
        await runSleepLane(
            ownerIdentity: ownerIdentity,
            deviceIdentity: deviceIdentity,
            allowsAuthorizationPrompt: allowsAuthorizationPrompt,
            authorizationReason: authorizationReason,
            outcome: &outcome
        )
        lastBootstrapOutcome = outcome
        return outcome
    }

    private static func mergedDiagnostics(
        current: HealthKitStreamDiagnostics,
        historical: HealthKitStreamDiagnostics
    ) -> HealthKitStreamDiagnostics {
        let latestRecoveryIsCurrent = (current.lastDailyRevisionRecoveryAt ?? .distantPast) >=
            (historical.lastDailyRevisionRecoveryAt ?? .distantPast)
        return HealthKitStreamDiagnostics(
            enabled: current.enabled || historical.enabled,
            availability: current.availability,
            authorizationState: current.authorizationState,
            lastObserverWakeup: [current.lastObserverWakeup, historical.lastObserverWakeup].compactMap { $0 }.max(),
            lastSuccessfulAnchoredQuery: [current.lastSuccessfulAnchoredQuery, historical.lastSuccessfulAnchoredQuery].compactMap { $0 }.max(),
            cursorGeneration: current.cursorGeneration,
            cursorDigest: current.cursorDigest,
            pendingBatchCount: current.pendingBatchCount + historical.pendingBatchCount,
            lastUploadAttempt: [current.lastUploadAttempt, historical.lastUploadAttempt].compactMap { $0 }.max(),
            lastDurableAcknowledgement: [current.lastDurableAcknowledgement, historical.lastDurableAcknowledgement].compactMap { $0 }.max(),
            lastErrorCode: current.lastErrorCode ?? historical.lastErrorCode,
            boundedRecoveryCount: current.boundedRecoveryCount + historical.boundedRecoveryCount,
            lastAbandonedBatchCode: (current.lastAbandonedAt ?? .distantPast) >= (historical.lastAbandonedAt ?? .distantPast)
                ? current.lastAbandonedBatchCode : historical.lastAbandonedBatchCode,
            lastAbandonedAt: [current.lastAbandonedAt, historical.lastAbandonedAt].compactMap { $0 }.max(),
            abandonedBatchCount: (current.abandonedBatchCount ?? 0) + (historical.abandonedBatchCount ?? 0),
            dailyRevisionFloorCount: (current.dailyRevisionFloorCount ?? 0) + (historical.dailyRevisionFloorCount ?? 0),
            lastDailyRevisionRecoveryAt: latestRecoveryIsCurrent ? current.lastDailyRevisionRecoveryAt : historical.lastDailyRevisionRecoveryAt,
            lastDailyRevisionRecoveryCode: latestRecoveryIsCurrent ? current.lastDailyRevisionRecoveryCode : historical.lastDailyRevisionRecoveryCode,
            lastDailyRevisionRecoveryLocalDate: latestRecoveryIsCurrent ? current.lastDailyRevisionRecoveryLocalDate : historical.lastDailyRevisionRecoveryLocalDate,
            lastDailyRevisionNextExpected: latestRecoveryIsCurrent ? current.lastDailyRevisionNextExpected : historical.lastDailyRevisionNextExpected
        )
    }

    private func boundedStep(
        _ operation: @escaping @Sendable () async throws -> Void
    ) async -> HealthKitAutomaticStepOutcome {
        await withCheckedContinuation { continuation in
            let gate = HealthKitAutomaticStepGate(continuation: continuation)
            let operationTask = Task {
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
                if gate.resolve(.timedOut) { operationTask.cancel() }
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

    @discardableResult
    func resolve(_ outcome: HealthKitAutomaticStepOutcome) -> Bool {
        lock.lock()
        let current = continuation
        continuation = nil
        lock.unlock()
        current?.resume(returning: outcome)
        return current != nil
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
    /// Whether the dormant Sleep lane found an active capability this pass.
    var sleepActive = false
    var sleepDeactivated = false
    var sleepManifest: HealthKitSleepManifestOutcome?
}

private final class HealthKitSleepManifestOutcomeBox: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: HealthKitSleepManifestOutcome?
    var value: HealthKitSleepManifestOutcome? { lock.withLock { stored } }
    func set(_ outcome: HealthKitSleepManifestOutcome) { lock.withLock { stored = outcome } }
}
