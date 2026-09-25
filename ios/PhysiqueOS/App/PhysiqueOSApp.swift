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
    @State private var environment: AppEnvironment
    @State private var notificationDelegate: PriorityNotificationDelegate
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // A notification action may be the process-launch event. Registering
        // the delegate in RootTabView.task was too late: iOS could deliver
        // Complete/Snooze before the delegate had its environment, losing the
        // specialized command before dispatch. Establish the response path
        // before SwiftUI creates the first scene.
        let environment = AppEnvironment(healthKitFeatureGate: .n1Automatic)
        let notificationDelegate = PriorityNotificationDelegate(environment: environment)
        UNUserNotificationCenter.current().delegate = notificationDelegate
        PriorityNotificationCategoryRegistrar.registerCategories()
        _environment = State(initialValue: environment)
        _notificationDelegate = State(initialValue: notificationDelegate)
    }

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
                    // Idempotent defensive refresh. The action-response path
                    // is already live from init; this is not its authority.
                    PriorityNotificationCategoryRegistrar.registerCategories()
                }
                // Cold launch and every foreground resume both surface here
                // as a transition into `.active`. `bootstrap()` is itself
                // idempotent (a second observer/background-delivery
                // registration is a no-op, and a redundant catch-up sync is
                // harmless), so calling it on every activation — rather than
                // only once at cold launch — is what gives relaunch-after-
                // termination its catch-up: a fully terminated app is not
                // guaranteed a background wake, so the next time the Founder
                // opens it is the only place that catch-up can happen.
                //
                // Gated to Founder Production, matching every other
                // production-backed feature's `nativeAuthority` switch
                // elsewhere in this codebase (see `AppEnvironment`'s
                // `evidenceReviewAPI`/`briefingAPI`/etc.): there is no real
                // Founder owner identity to canonicalize HealthKit facts
                // against in Sandbox, and firing a real authenticated
                // request there was a genuine bug this candidate had until
                // it broke `TrainingAcceptanceUITests`, which deliberately
                // launches pinned to `-physiqueos.native.authority-
                // selection.v1 sandbox` -- the automatic coordinator was
                // still reaching real Founder Production regardless,
                // including requesting the real HealthKit system
                // permission prompt on a fresh simulator, which blocks
                // XCUITest's element queries behind an alert outside the
                // app's accessibility hierarchy.
                .onChange(of: scenePhase, initial: true) { _, phase in
                    // Background -> foreground across local midnight or a zone
                    // change: a suspended app gets no day-change notification,
                    // so "Today" is recomputed from the system on every
                    // activation, under every authority.
                    if phase == .active { Task { await environment.reevaluateDailyDriverDay() } }
                    guard phase == .active, environment.nativeAuthority == .founderProduction else { return }
                    Task { await environment.healthKitAutomaticSynchronizationCoordinator.bootstrap() }
                }
                // Foregrounded across local midnight, a manual clock / DST /
                // carrier time change, or a zone change while running.
                .onReceive(DailyDriverDayTrigger.publisher()) { _ in
                    Task { await environment.reevaluateDailyDriverDay() }
                }
        }
    }
}
