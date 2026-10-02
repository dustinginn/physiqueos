import Foundation

@MainActor
final class HomeWidgetBridge {
    let coordinator: HomeWidgetSnapshotCoordinator
    private unowned let environment: AppEnvironment
    private var observation: TrainingSessionObservation?
    private var attachedAuthority: NativeAPIEnvironment?
    /// Every trigger is inert until `install()` (never in a unit-test host).
    private var isInstalled = false

    init(environment: AppEnvironment, coordinator: HomeWidgetSnapshotCoordinator? = nil) {
        self.environment = environment
        self.coordinator = coordinator ?? HomeWidgetSnapshotCoordinator(environment: environment)
    }

    func install() {
        isInstalled = true
        HomeWidgetRefreshIntentRuntime.handler = { [weak self] _ in
            await self?.refreshCanonicalSnapshot(reloadingReads: true)
        }
        attachToSelectedAuthority()
        Task { [weak self] in
            guard let self else { return }
            await self.environment.homeWidgetRefreshRelay.install { [weak self] reloadingReads in
                await self?.refreshCanonicalSnapshot(reloadingReads: reloadingReads)
            }
            // Pairing, revocation, or a rejected refresh credential retires
            // Founder Production's shared snapshot with the session's other
            // last-known reads.
            await self.environment.productionNativeAPI.setSessionBoundaryObserver { [weak self] in
                Task { @MainActor in
                    guard let self else { return }
                    self.coordinator.endSession(for: .founderProduction)
                    // A same-authority re-pair changes no selection, so ask
                    // for the new session's totals here.
                    await self.refreshCanonicalSnapshot()
                }
            }
        }
    }

    func attachToSelectedAuthority() {
        guard isInstalled else { return }
        observation?.cancel()
        let selectedAuthority = environment.nativeAuthority
        if let attachedAuthority, attachedAuthority != selectedAuthority {
            // Never leave the other authority's daily totals visible while
            // the newly selected authority is being fetched.
            coordinator.clear()
        }
        attachedAuthority = selectedAuthority
        observation = environment.trainingSessionAuthority(for: selectedAuthority).observeChanges { [weak self] change in
            guard let self else { return }
            self.coordinator.refreshWorkoutProjection()
            if case .ended(.committed) = change.kind {
                Task { await self.refreshCanonicalSnapshot() }
            }
        }
        Task { await refreshCanonicalSnapshot() }
    }

    func refreshCanonicalSnapshot(reloadingReads: Bool = false) async {
        guard isInstalled else { return }
        await coordinator.refreshCanonicalSnapshot(reloadingReads: reloadingReads)
    }
}
