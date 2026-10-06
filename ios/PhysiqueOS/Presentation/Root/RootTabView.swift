import SwiftUI

/// Stage 1 top-level navigation shell.
///
/// Establishes the corrected five-tab information architecture — Home,
/// Goals, Log, Evidence, You, matching `src/fixtures/bottomNavigation.js`
/// exactly, with Log as the center tab. Home, Log, and Evidence are real
/// screens; Goals owns its source-grounded read/browse vertical. You
/// remains an honest placeholder for the rest of the web's Profile/"You"
/// screen, but now carries one real doorway — Operating Plan — matching
/// `YouScreen.jsx`'s own entry point into `/profile/operating-plan`, since
/// that is the current web's actual navigation path into this slice.
///
/// Every `NavigationStack` here resolves `AppDestination` pushes through
/// the same `AppDestinationRouterView`, so a destination that has a real
/// screen (Training history/day/session today) renders identically no
/// matter which tab pushed it — Home's Logged-Today training row, Log's
/// pending reviews, and Evidence's Training stream all share one router
/// instead of three independently-guessed switch statements.
struct RootTabView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var selectedTab: AppTab = .home
    @State private var homePath = NavigationPath()
    @State private var goalsPath = NavigationPath()
    @State private var logPath = NavigationPath()
    @State private var evidencePath = NavigationPath()
    @State private var evidenceBackTrail = EvidenceBackTrail()
    @State private var youPath = NavigationPath()

    init() {
#if DEBUG
        if FoamRollingPriorityPilotLaunchConfiguration.isEnabled {
            _homePath = State(initialValue: NavigationPath([
                AppDestination.priorityOccurrence(
                    priorityId: FoamRollingPriorityPilotLaunchConfiguration.priorityId,
                    occurrenceDate: FoamRollingPriorityPilotLaunchConfiguration.occurrenceDate
                )
            ]))
        } else if let review = AppearanceReviewLaunchConfiguration.route {
            _selectedTab = State(initialValue: review.tab)
            if let titles = AppearanceReviewLaunchConfiguration.evidenceTrail {
                _evidenceBackTrail = State(initialValue: EvidenceBackTrail(seed: titles))
            }
            switch review.tab {
            case .home:
                _homePath = State(initialValue: NavigationPath(review.destinations))
            case .goals:
                _goalsPath = State(initialValue: NavigationPath(review.destinations))
            case .log:
                _logPath = State(initialValue: NavigationPath(review.destinations))
            case .evidence:
                _evidencePath = State(initialValue: NavigationPath(review.destinations))
            case .you:
                _youPath = State(initialValue: NavigationPath(review.destinations))
            }
        }
#endif
    }

    var body: some View {
        TabView(selection: Binding(get: { selectedTab }, set: selectTab)) {
            NavigationStack(path: $homePath) {
                HomeView(onNavigate: { noteNavigation($0); homePath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onReturnToHome: returnToHome, onNavigate: { noteNavigation($0); homePath.append($0) })
                    }
            }
            .tabItem { Label(AppTab.home.title, systemImage: AppTab.home.systemImageName) }
            .tag(AppTab.home)

            NavigationStack(path: $goalsPath) {
                GoalsView(onNavigate: { noteNavigation($0); goalsPath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onReturnToHome: returnToHome, onNavigate: { noteNavigation($0); goalsPath.append($0) })
                    }
            }
            .tabItem { Label(AppTab.goals.title, systemImage: AppTab.goals.systemImageName) }
            .tag(AppTab.goals)

            NavigationStack(path: $logPath) {
                LogView(onNavigate: { noteNavigation($0); logPath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onReturnToHome: returnToHome, onNavigate: { noteNavigation($0); logPath.append($0) })
                    }
            }
            .tabItem { Label(AppTab.log.title, systemImage: AppTab.log.systemImageName) }
            .tag(AppTab.log)

            NavigationStack(path: $evidencePath) {
                EvidenceView(onNavigate: { noteNavigation($0); evidencePath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onReturnToHome: returnToHome, onNavigate: { noteNavigation($0); evidencePath.append($0) })
                    }
            }
            .environment(\.evidenceBackTrail, evidenceBackTrail)
            .tabItem { Label(AppTab.evidence.title, systemImage: AppTab.evidence.systemImageName) }
            .tag(AppTab.evidence)

            NavigationStack(path: $youPath) {
                YouPlaceholderView(
                    onNavigate: { noteNavigation($0); youPath.append($0) },
                    onSelectGoals: {
                        selectedTab = .goals
                        goalsPath = NavigationPath()
                    }
                )
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onReturnToHome: returnToHome, onNavigate: { noteNavigation($0); youPath.append($0) })
                    }
            }
            .tabItem { Label(AppTab.you.title, systemImage: AppTab.you.systemImageName) }
            .tag(AppTab.you)
        }
        .tint(PhysiqueOSTheme.accent)
        .onChange(of: environment.notificationDeepLinkCoordinator.pendingRequest) { _, request in
            guard request != nil else { return }
            consumeNotificationDestination()
        }
        .task {
            consumeNotificationDestination()
        }
        // Tapping the Workout Live Activity. Navigation only: the URL never
        // mutates a workout, and the session must exist on this device.
        .onOpenURL { openExternalURL($0) }
    }

    private func openExternalURL(_ url: URL) {
        if let route = HomeWidgetDeepLink.parse(url) {
            openFromHomeWidget(route)
        } else {
            openWorkoutFromLiveActivity(url)
        }
    }

    private func openFromHomeWidget(_ route: HomeWidgetDeepLink) {
        let authority = environment.trainingSessionAuthority(for: environment.nativeAuthority)
        switch HomeWidgetNavigationResolver.resolve(
            route,
            selectedAuthority: environment.nativeAuthority,
            sessionAuthority: authority
        ) {
        case .logRoot:
            selectedTab = .log
            logPath = NavigationPath()
        case .destination(let destination):
            selectedTab = .log
            Task { @MainActor in
                await Task.yield()
                logPath = NavigationPath()
                noteNavigation(destination)
                logPath.append(destination)
            }
        case .refreshTotals:
            // Refresh is not navigation: an open Logger or an owed Workout
            // Complete stays exactly where it is.
            Task { await environment.homeWidgetRefreshRelay.request(reloadingReads: true) }
        case .startWorkout:
            openWorkoutLogger(sessionId: nil)
        case .resumeWorkout(let sessionId):
            openWorkoutLogger(sessionId: sessionId)
        }
    }

    private func openWorkoutLogger(sessionId: String?) {
        selectedTab = .log
        Task { @MainActor in
            await Task.yield()
            logPath = NavigationPath()
            environment.pendingTrainingLoggerResumeDraftId = sessionId
            noteNavigation(.trainingLogger)
            logPath.append(AppDestination.trainingLogger)
        }
    }

    private func openWorkoutFromLiveActivity(_ url: URL) {
        guard let sessionId = WorkoutActivityDeepLink.sessionId(from: url) else { return }
        // Another app can fire this URL; a link for a workout that does not
        // exist here changes nothing at all (no tab switch, no popped stack).
        let authority = environment.trainingSessionAuthority(for: environment.nativeAuthority)
        guard authority.draft(id: sessionId) != nil else { return }
        selectedTab = .log
        Task { @MainActor in
            await Task.yield()
            logPath = NavigationPath()
            environment.pendingTrainingLoggerResumeDraftId = sessionId
            noteNavigation(.trainingLogger)
            logPath.append(AppDestination.trainingLogger)
        }
    }

    /// External notification destinations open on Home's shared stack — it
    /// owns priorities and already hosts exact published Briefing detail.
    /// Same tab-switch-then-clear-stack pattern as `returnToLog`/
    /// `returnToHome`, so a stale push from whatever the Founder was doing
    /// before the notification arrived is never left behind.
    private func openFromNotification(_ destination: AppDestination) {
        selectedTab = .home
        Task { @MainActor in
            await Task.yield()
            homePath = NavigationPath()
            homePath.append(destination)
        }
    }

    @MainActor
    private func consumeNotificationDestination() {
        guard let request = environment.notificationDeepLinkCoordinator.consume() else { return }
        openFromNotification(request.destination)
    }

    private func returnToLog() {
        selectedTab = .log
        // A completion can originate in Home, Log, or Evidence. Clear the
        // destination after the tab switch has entered Log's stack so an
        // older Log drill-down cannot briefly win the same update cycle.
        Task { @MainActor in
            await Task.yield()
            logPath = NavigationPath()
        }
    }

    /// Tab bar selection. Entering Log from another tab routes into the
    /// in-progress live session, or otherwise into an unacknowledged durable
    /// completion (so its Server-owned records cannot be lost behind a tab
    /// switch or relaunch), pushed on top of Log so Back returns to the
    /// ordinary Log page (`TrainingSessionAuthority.logTabRoutingTarget`).
    /// Re-tapping Log while already there, or a Log stack that is already
    /// somewhere, never redirects -- so the Founder can always reach Log.
    private func selectTab(_ newTab: AppTab) {
        let previous = selectedTab
        selectedTab = newTab
        guard newTab == .log, previous != .log, logPath.isEmpty,
              let session = environment.trainingSessionAuthority(for: environment.nativeAuthority).logTabRoutingTarget()
        else { return }
        environment.pendingTrainingLoggerResumeDraftId = session.id
        noteNavigation(.trainingLogger)
        logPath.append(AppDestination.trainingLogger)
    }

    private func noteNavigation(_ destination: AppDestination) {
#if DEBUG
        NativePerformanceDiagnostics.recordNavigationInitiated(surface: destination.serverDestinationId)
#endif
    }

    /// Briefing Detail's top-of-screen "Home" navigation (the Founder's
    /// explicit requirement) — same tab-switch-then-clear-stack pattern as
    /// `returnToLog()` above, so Home always opens at its own root rather
    /// than leaving a stale push behind on its stack.
    private func returnToHome() {
        selectedTab = .home
        Task { @MainActor in
            await Task.yield()
            homePath = NavigationPath()
        }
    }
}

#if DEBUG
/// Screenshot-only navigation seam used to audit the shared appearance
/// infrastructure against real shipping views. It changes neither content
/// projection nor behavior and is absent from Release builds.
private enum AppearanceReviewLaunchConfiguration {
    struct Route {
        let tab: AppTab
        let destinations: [AppDestination]
    }

    /// `-physiqueos.evidence-review.trail "Training/Aug 26"`: the titles of
    /// the pages a deep-linked capture skips, so back labels read as they
    /// do after real navigation.
    static var evidenceTrail: [String]? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-physiqueos.evidence-review.trail"),
              arguments.indices.contains(flag + 1)
        else { return nil }
        return arguments[flag + 1].components(separatedBy: "/").filter { !$0.isEmpty }
    }

    static var route: Route? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-physiqueos.appearance-review.route"),
              arguments.indices.contains(flag + 1)
        else {
            return nil
        }
        let value = arguments[flag + 1]
        return switch value {
        case "home": Route(tab: .home, destinations: [])
        case "goals": Route(tab: .goals, destinations: [])
        case "goal-active": Route(tab: .goals, destinations: [.goalDetail(goalId: "goal_fixture_build_lean_mass")])
        case "goal-completed": Route(tab: .goals, destinations: [.goalDetail(goalId: "goal_visible_abs_at_rest")])
        case "goal-phase-active": Route(tab: .goals, destinations: [.goalPhase(goalId: "goal_fixture_build_lean_mass", phaseId: "phase_fixture_lean_mass_build")])
        case "goal-phase-completed": Route(tab: .goals, destinations: [.goalPhase(goalId: "goal_fixture_build_lean_mass", phaseId: "phase_fixture_maintenance")])
        case "log": Route(tab: .log, destinations: [])
        case "evidence": Route(tab: .evidence, destinations: [])
        case "evidence-timeline": Route(tab: .evidence, destinations: [.progressStream(streamId: "timeline")])
        case "you": Route(tab: .you, destinations: [])
        case "settings": Route(tab: .you, destinations: [.settings])
        case "appearance": Route(tab: .you, destinations: [.settings, .appearance])
        case "operating-plan": Route(tab: .you, destinations: [.operatingPlan])
        case "training-logger": Route(tab: .log, destinations: [.trainingLogger])
        case "manual-weight": Route(tab: .log, destinations: [.manualWeighIn])
        case "briefing": Route(
            tab: .home,
            destinations: [.briefingDetail(briefingId: "weekly_briefing_2026-08-23_2026-08-29")]
        )
        default: evidenceReviewPath(value)
        }
    }

    /// `evidence:<step>;<step>` — e.g. `evidence:stream=training;trainingDay=2026-08-26`.
    /// Opens any Evidence vertical deterministically for parity captures.
    private static func evidenceReviewPath(_ value: String) -> Route? {
        guard value.hasPrefix("evidence:") else { return nil }
        let steps = value.dropFirst("evidence:".count).split(separator: ";").compactMap { step -> AppDestination? in
            let parts = step.split(separator: "=", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { return nil }
            switch parts[0] {
            case "stream": return .progressStream(streamId: parts[1])
            case "trainingDay": return .trainingDay(date: parts[1])
            case "trainingSession": return .trainingSession(sessionId: parts[1])
            case "trainingExercise": return .trainingExercise(exerciseId: parts[1])
            case "trainingArea": return .trainingLibraryArea(areaId: parts[1], browseAll: false)
            case "activityDay": return .activityDay(date: parts[1])
            case "nutritionDay": return .nutritionDay(dayId: parts[1])
            case "intake": return parts[1] == "photos" ? .photoUpload : parts[1] == "dexa" ? .dexaUpload : .evidenceIntake
            case "review": return .evidenceReview(reviewId: parts[1])
            default: return nil
            }
        }
        return Route(tab: .evidence, destinations: steps)
    }
}
#endif

#Preview {
    RootTabView()
        .environment(AppEnvironment())
}
