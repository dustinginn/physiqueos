import SwiftUI
import UserNotifications

/// Application entry point and composition root.
///
/// This is the single place that constructs `AppEnvironment` and hands it
/// down to the presentation layer. Screens must depend on the environment
/// (and, later, on the protocols it exposes) rather than reaching for a
/// global or constructing their own dependencies.
@main
struct PhysiqueOSApp: App {
    @State private var environment = AppEnvironment()
    @State private var notificationDelegate = PriorityNotificationDelegate()

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
                .task {
                    // The delegate is injected once, here, rather than
                    // captured at scheduling time — a notification response
                    // can arrive well after whatever scheduled it. Category
                    // registration is idempotent and cheap enough to redo on
                    // every launch rather than tracking whether it's needed.
                    notificationDelegate.environment = environment
                    UNUserNotificationCenter.current().delegate = notificationDelegate
                    PriorityNotificationCategoryRegistrar.registerCategories()
                }
        }
    }
}
