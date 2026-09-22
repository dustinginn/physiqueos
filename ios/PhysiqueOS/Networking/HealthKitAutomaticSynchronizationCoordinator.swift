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

/// The permanent, background-eligible Activity + Nutrition ingestion path.
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
///      delivery for Activity and Nutrition (both idempotent; a duplicate
///      registration is a no-op, confirmed by reading
///      `HealthKitSynchronizationEngine.startObserving` and
///      `SystemHealthKitObserverClient.enableBackgroundDelivery`).
///   3. Run one immediate incremental sync per stream as relaunch/foreground
///      catch-up. iOS does not guarantee a background wake for a fully
///      terminated app, so this foreground catch-up is the only way to
///      recover changes that happened while PhysiqueOS was not running.
///
/// Every step degrades gracefully: no step throws out of `bootstrap()`, and a
/// failure (offline, HealthKit unavailable, server unreachable) is recorded
/// in the returned outcome for diagnostics rather than surfaced to the
/// Founder or retried aggressively in a loop. The next foreground transition
/// tries again.
final class HealthKitAutomaticSynchronizationCoordinator {
    static let predicateVersion = "healthkit-automatic-v1"
    static let streams: [HealthKitSynchronizationStream] = [.activitySummary, .nutritionDailyTotal]

    private let authorization: any HealthKitCanaryAuthorizationCoordinating
    private let synchronizer: any HealthKitAutomaticSynchronizing
    private let server: any HealthKitFounderCanaryServer
    private let deviceIdentityStore: any HealthKitCanaryDeviceIdentityStore

    private(set) var lastBootstrapOutcome: HealthKitAutomaticBootstrapOutcome?

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
        var outcome = HealthKitAutomaticBootstrapOutcome()
        if !authorization.authorizationWasRequested {
            outcome.authorizationOutcome = await authorization.requestAuthorization(for: .initialRead)
        }
        guard case .available = authorization.currentAvailability else {
            outcome.skippedReason = "authorization_not_available"
            lastBootstrapOutcome = outcome
            return outcome
        }
        guard let ownerIdentity = try? await server.founderOwnerIdentity() else {
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
                outcome.streamErrors[stream] = "observer_registration_failed"
            }
            do { try await synchronizer.enableBackgroundDelivery(scope: scope) } catch {
                outcome.streamErrors[stream] = "background_delivery_registration_failed"
            }
            do {
                try await synchronizer.synchronize(scope: scope, stagingCompletion: nil)
                outcome.caughtUpStreams.insert(stream)
            } catch {
                outcome.streamErrors[stream] = "catch_up_sync_failed"
            }
        }
        lastBootstrapOutcome = outcome
        return outcome
    }
}

struct HealthKitAutomaticBootstrapOutcome: Equatable {
    var authorizationOutcome: HealthKitAuthorizationOutcome?
    var skippedReason: String?
    var caughtUpStreams: Set<HealthKitSynchronizationStream> = []
    var streamErrors: [HealthKitSynchronizationStream: String] = [:]
}
