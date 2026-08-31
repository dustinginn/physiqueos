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
    @State private var youPath = NavigationPath()

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack(path: $homePath) {
                HomeView(onNavigate: { homePath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onNavigate: { homePath.append($0) })
                    }
            }
            .tabItem { Label(AppTab.home.title, systemImage: AppTab.home.systemImageName) }
            .tag(AppTab.home)

            NavigationStack(path: $goalsPath) {
                GoalsView(onNavigate: { goalsPath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onNavigate: { goalsPath.append($0) })
                    }
            }
            .tabItem { Label(AppTab.goals.title, systemImage: AppTab.goals.systemImageName) }
            .tag(AppTab.goals)

            NavigationStack(path: $logPath) {
                LogView(onNavigate: { logPath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onNavigate: { logPath.append($0) })
                    }
            }
            .tabItem { Label(AppTab.log.title, systemImage: AppTab.log.systemImageName) }
            .tag(AppTab.log)

            NavigationStack(path: $evidencePath) {
                EvidenceView(onNavigate: { evidencePath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onNavigate: { evidencePath.append($0) })
                    }
            }
            .tabItem { Label(AppTab.evidence.title, systemImage: AppTab.evidence.systemImageName) }
            .tag(AppTab.evidence)

            NavigationStack(path: $youPath) {
                YouPlaceholderView(onNavigate: { youPath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onNavigate: { youPath.append($0) })
                    }
            }
            .tabItem { Label(AppTab.you.title, systemImage: AppTab.you.systemImageName) }
            .tag(AppTab.you)
        }
        .tint(PhysiqueOSTheme.accent)
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
}

#Preview {
    RootTabView()
        .environment(AppEnvironment())
}
