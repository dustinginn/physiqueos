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
                // PhysiqueOS's accepted native visual baseline is the web
                // app's dark theme (`.dark` in globals.css) — not merely
                // this app's own dark colors, but the OS-level appearance
                // system controls (DatePicker, keyboards, share sheets,
                // alerts) also render against. Without this, those
                // system-provided controls follow the simulator/device's
                // own light/dark setting instead, mismatching every
                // custom-drawn view.
                .preferredColorScheme(.dark)
        }
    }
}
