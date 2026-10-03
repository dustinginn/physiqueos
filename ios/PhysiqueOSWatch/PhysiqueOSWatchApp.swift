import SwiftUI

@main
struct PhysiqueOSWatchApp: App {
    @State private var store = WatchWorkoutStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            WatchWorkoutRootView(store: store)
                .preferredColorScheme(.dark)
                .task { store.install() }
                .onChange(of: scenePhase, initial: true) {
                    store.setDisplayActive(scenePhase == .active)
                }
        }
    }
}
