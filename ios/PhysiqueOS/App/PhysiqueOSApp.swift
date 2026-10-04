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
    @State private var appearance: AppAppearanceStore
    @State private var notificationDelegate: PriorityNotificationDelegate
    @State private var workoutLiveActivity: WorkoutLiveActivityBridge
    @State private var homeWidget: HomeWidgetBridge
    @State private var watchWorkoutConnectivity: PhoneWatchWorkoutConnectivityBridge
    @Environment(\.scenePhase) private var scenePhase

    /// Preserves the accepted Foam Rolling pilot's original DEBUG capture
    /// seam without persisting it as the Founder's real preference.
    private static var debugAppearanceOverride: AppAppearance? {
#if DEBUG
        if FoamRollingPriorityPilotLaunchConfiguration.isEnabled {
            return FoamRollingPriorityPilotLaunchConfiguration.appearance
                .flatMap(AppAppearance.init(rawValue:))
        }
#endif
        return nil
    }

    init() {
        // A notification action may be the process-launch event. Registering
        // the delegate in RootTabView.task was too late: iOS could deliver
        // Complete/Snooze before the delegate had its environment, losing the
        // specialized command before dispatch. Establish the response path
        // before SwiftUI creates the first scene.
        let environment = AppEnvironment(healthKitFeatureGate: .n1Automatic)
        let appearance = AppAppearanceStore(initialOverride: Self.debugAppearanceOverride)
        let notificationDelegate = PriorityNotificationDelegate(environment: environment)
        UNUserNotificationCenter.current().delegate = notificationDelegate
        PriorityNotificationCategoryRegistrar.registerCategories()
        _environment = State(initialValue: environment)
        _appearance = State(initialValue: appearance)
        _notificationDelegate = State(initialValue: notificationDelegate)
        // The Live Activity's Complete Set intent runs in this process, and a
        // background launch to run it still constructs the App, so the
        // handler and the coordinator are installed here, not on a view.
        // A unit-test host (XCTest configuration present) gets an inert client:
        // it must not start real activities, which launch the extension and
        // outlive the test run. UI tests and the shipping app use ActivityKit.
        let isUnitTestHost = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
        let liveActivity = WorkoutLiveActivityBridge(
            environment: environment,
            client: isUnitTestHost ? InertWorkoutLiveActivityClient() : ActivityKitWorkoutLiveActivityClient()
        )
        liveActivity.install()
        _workoutLiveActivity = State(initialValue: liveActivity)
        let homeWidget = HomeWidgetBridge(environment: environment)
        // A unit-test host must not read the Server, write the real App Group
        // file, or reload real widget timelines.
        if !isUnitTestHost { homeWidget.install() }
        _homeWidget = State(initialValue: homeWidget)
        let watchWorkoutConnectivity = PhoneWatchWorkoutConnectivityBridge(environment: environment)
        if !isUnitTestHost {
            // Daily Totals on the Watch are the canonical Home snapshot.
            homeWidget.coordinator.onSnapshotWritten = { [weak watchWorkoutConnectivity] snapshot in
                watchWorkoutConnectivity?.publishDailyTotals(WatchDailyTotals(snapshot: snapshot))
            }
            // Seed from the stored snapshot so the first publish already
            // carries today's totals (a locked launch cannot refresh them).
            watchWorkoutConnectivity.publishDailyTotals(WatchDailyTotals(snapshot: homeWidget.coordinator.storedSnapshot()))
            watchWorkoutConnectivity.install()
        }
        _watchWorkoutConnectivity = State(initialValue: watchWorkoutConnectivity)
        // HealthKit background delivery relaunches a terminated app WITHOUT
        // ever activating a scene, so the scenePhase-driven bootstrap below
        // cannot be what re-registers the observers. Do it here, in the
        // process-launch path a background launch also runs.
        Task { @MainActor in await environment.registerHealthKitObserversForLaunch() }
        // Installed at process launch (not on a view) so a background-launched
        // process with no scene still recovers after the device unlocks.
        // The environment is only ever touched on the main actor (the Task
        // below hops there), exactly like the launch registration above.
        nonisolated(unsafe) let recoveryEnvironment = environment
        nonisolated(unsafe) let recoveryWidget = homeWidget
        ProtectedDataRecoveryTrigger.install {
            Task { @MainActor in
                await recoveryEnvironment.recoverHealthKitAfterProtectedDataAvailable()
                // A locked launch skipped the widget refresh (the credential
                // was unreadable); refresh now that it is readable.
                await recoveryWidget.refreshCanonicalSnapshot()
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(environment)
                .environment(appearance)
                // nil for System is essential: it lets an iOS appearance
                // change propagate live. Explicit choices also govern
                // system controls, sheets, alerts, keyboards and forms.
                .preferredColorScheme(appearance.preferredColorScheme)
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
                    if phase == .active {
                        workoutLiveActivity.reconcile()
                        watchWorkoutConnectivity.reconcile()
                        Task {
                            _ = await environment.reevaluateDailyDriverDay()
                            await homeWidget.refreshCanonicalSnapshot()
                        }
                    } else {
                        // Leaving the foreground right after typing must not
                        // leave the first Lock Screen tap on a stale revision.
                        // Under a background-execution assertion so the process
                        // cannot suspend mid-update.
                        Task {
                            _ = try? await withBackgroundExecutionAssertion(
                                named: "workout-live-activity-flush", scheduler: UIKitBackgroundTaskScheduler()
                            ) { await workoutLiveActivity.coordinator.flush() }
                        }
                    }
                    guard phase == .active, environment.nativeAuthority == .founderProduction else { return }
                    Task {
                        await environment.healthKitAutomaticSynchronizationCoordinator.bootstrap()
                        await environment.dexaHealthKitWritebackCoordinator.reconcilePermanent()
                        await homeWidget.refreshCanonicalSnapshot()
                    }
                }
                // Switching Sandbox <-> Founder Production moves the Live
                // Activity to the other authority's workout (or ends it).
                .onChange(of: environment.nativeAuthority) { _, _ in
                    workoutLiveActivity.attachToSelectedAuthority()
                    homeWidget.attachToSelectedAuthority()
                    watchWorkoutConnectivity.attachToSelectedAuthority()
                }
                // Foregrounded across local midnight, a manual clock / DST /
                // carrier time change, or a zone change while running.
                .onReceive(DailyDriverDayTrigger.publisher()) { _ in
                    Task {
                        if await environment.reevaluateDailyDriverDay() {
                            await homeWidget.refreshCanonicalSnapshot()
                        }
                    }
                }
        }
    }
}
