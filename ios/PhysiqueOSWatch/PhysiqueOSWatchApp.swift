import SwiftUI

@main
struct PhysiqueOSWatchApp: App {
    @State private var store = WatchWorkoutStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            WatchWorkoutRootView(store: store)
                // The Founder's PhysiqueOS Watch appearance (Dark default).
                .preferredColorScheme(store.appearance == .mineralLight ? .light : .dark)
                .task { store.install() }
                .onChange(of: scenePhase, initial: true) {
                    store.setDisplayActive(scenePhase == .active)
                }
        }
    }
}
