import SwiftUI

@main
struct PhysiqueOSWatchApp: App {
    @State private var store = WatchWorkoutStore()

    var body: some Scene {
        WindowGroup {
            WatchWorkoutRootView(store: store)
                .preferredColorScheme(.dark)
                .task { store.install() }
        }
    }
}
