import SwiftUI

/// Stage 1 top-level navigation shell.
///
/// Establishes the corrected five-tab information architecture — Home,
/// Goals, Log, Evidence, You, matching `src/fixtures/bottomNavigation.js`
/// exactly, with Log as the center tab. Home, Log, and Evidence are real
/// screens; Goals and You remain honest placeholders whose only job is to
/// prove the tab/navigation foundation until their own slices.
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
    @State private var logPath = NavigationPath()
    @State private var evidencePath = NavigationPath()
    #if DEBUG
    @State private var didApplyLoggingFixtureLaunch = false
    #endif

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack(path: $homePath) {
                HomeView(onNavigate: { homePath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog)
                    }
            }
            .tabItem { Label(AppTab.home.title, systemImage: AppTab.home.systemImageName) }
            .tag(AppTab.home)

            NavigationStack {
                GoalsPlaceholderView()
            }
            .tabItem { Label(AppTab.goals.title, systemImage: AppTab.goals.systemImageName) }
            .tag(AppTab.goals)

            NavigationStack(path: $logPath) {
                LogView(onNavigate: { logPath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog)
                    }
            }
            .tabItem { Label(AppTab.log.title, systemImage: AppTab.log.systemImageName) }
            .tag(AppTab.log)

            NavigationStack(path: $evidencePath) {
                EvidenceView(onNavigate: { evidencePath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog)
                    }
            }
            .tabItem { Label(AppTab.evidence.title, systemImage: AppTab.evidence.systemImageName) }
            .tag(AppTab.evidence)

            NavigationStack {
                YouPlaceholderView()
            }
            .tabItem { Label(AppTab.you.title, systemImage: AppTab.you.systemImageName) }
            .tag(AppTab.you)
        }
        .tint(PhysiqueOSTheme.accent)
        #if DEBUG
        .task { applyLoggingFixtureLaunchIfNeeded() }
        #endif
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

    #if DEBUG
    /// Simulator-only launch routing for deterministic visual acceptance.
    /// Normal app launches and Release/TestFlight builds never enter here.
    private func applyLoggingFixtureLaunchIfNeeded() {
        guard !didApplyLoggingFixtureLaunch else { return }
        didApplyLoggingFixtureLaunch = true
        guard let value = ProcessInfo.processInfo.environment["PHYSIQUEOS_LOGGING_FIXTURE"],
              !value.isEmpty else { return }

        selectedTab = .log
        logPath = NavigationPath()

        if value == "manual" {
            logPath.append(AppDestination.manualWeighIn)
            return
        }
        if value == "logger" {
            logPath.append(AppDestination.trainingLogger)
            return
        }

        let store = environment.loggingSandboxStore
        store.resetEvidenceDraft()
        store.evidenceDraft.details = "Synthetic fixture context for Simulator review."
        store.addAttachments([
            .init(id: "sim-photo", displayName: "meal-summary.png", source: .photos),
            .init(id: "sim-file", displayName: "supporting-report.pdf", source: .files),
        ])

        guard value != "intake", let scenario = EvidenceFixtureScenario(rawValue: value) else {
            logPath.append(AppDestination.evidenceIntake)
            return
        }

        store.evidenceDraft.scenario = scenario
        _ = store.submitEvidence()
        guard case .success(let reviewId) = store.finishInterpretation(), let reviewId else {
            logPath.append(AppDestination.evidenceIntake)
            return
        }
        logPath.append(AppDestination.localEvidenceReview(reviewId: reviewId))
    }
    #endif
}

#Preview {
    RootTabView()
        .environment(AppEnvironment())
}
