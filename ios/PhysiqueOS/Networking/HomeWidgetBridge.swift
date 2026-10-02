import Foundation

@MainActor
final class HomeWidgetBridge {
    let coordinator: HomeWidgetSnapshotCoordinator
    private unowned let environment: AppEnvironment
    private var observation: TrainingSessionObservation?
    private var attachedAuthority: NativeAPIEnvironment?

    init(environment: AppEnvironment, coordinator: HomeWidgetSnapshotCoordinator? = nil) {
        self.environment = environment
        self.coordinator = coordinator ?? HomeWidgetSnapshotCoordinator(environment: environment)
    }

    func install() {
        HomeWidgetRefreshIntentRuntime.handler = { [weak self] _ in
            await self?.refreshCanonicalSnapshot()
        }
        attachToSelectedAuthority()
        Task { [weak self] in
            guard let self else { return }
            await self.environment.homeWidgetRefreshRelay.install { [weak self] in
                await self?.refreshCanonicalSnapshot()
            }
        }
    }

    func attachToSelectedAuthority() {
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

    func refreshCanonicalSnapshot() async {
        await coordinator.refreshCanonicalSnapshot()
    }
}
