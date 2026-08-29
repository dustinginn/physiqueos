import SwiftUI

/// Application entry point and composition root.
///
/// This is the single place that constructs `AppEnvironment` and hands it
/// down to the presentation layer. Screens must depend on the environment
/// (and, later, on the protocols it exposes) rather than reaching for a
/// global or constructing their own dependencies.
@main
struct PhysiqueOSApp: App {
    @State private var environment = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(environment)
        }
    }
}
