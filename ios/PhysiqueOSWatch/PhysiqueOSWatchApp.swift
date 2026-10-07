import HealthKit
import SwiftUI
import WatchKit

@main
struct PhysiqueOSWatchApp: App {
    @WKApplicationDelegateAdaptor private var appDelegate: PhysiqueOSWatchAppDelegate
    @State private var store = WatchWorkoutStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            WatchWorkoutRootView(store: store)
                // The Founder's PhysiqueOS Watch appearance (Dark default).
                .preferredColorScheme(store.appearance == .mineralLight ? .light : .dark)
                .task {
                    store.install()
                    appDelegate.onWorkoutLaunchRequest = { [store] in store.handlePhoneWorkoutLaunchRequest() }
                }
                .onChange(of: scenePhase, initial: true) {
                    store.setDisplayActive(scenePhase == .active)
                }
        }
    }
}

/// Receives the iPhone's `HKHealthStore.startWatchApp` request (guided Watch
/// handoff). A request that arrives before the scene is ready is held and
/// delivered once the store is attached.
@MainActor
final class PhysiqueOSWatchAppDelegate: NSObject, WKApplicationDelegate {
    private var pendingLaunchRequest = false

    var onWorkoutLaunchRequest: (() -> Void)? {
        didSet {
            guard pendingLaunchRequest, let onWorkoutLaunchRequest else { return }
            pendingLaunchRequest = false
            onWorkoutLaunchRequest()
        }
    }

    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        if let onWorkoutLaunchRequest {
            onWorkoutLaunchRequest()
        } else {
            pendingLaunchRequest = true
        }
    }
}
