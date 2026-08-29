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
    @State private var homePath = NavigationPath()
    @State private var logPath = NavigationPath()
    @State private var evidencePath = NavigationPath()

    var body: some View {
        TabView {
            NavigationStack(path: $homePath) {
                HomeView(onNavigate: { homePath.append($0) })
                    .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
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
                    .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
            }
            .tabItem { Label(AppTab.log.title, systemImage: AppTab.log.systemImageName) }
            .tag(AppTab.log)

            NavigationStack(path: $evidencePath) {
                EvidenceView(onNavigate: { evidencePath.append($0) })
                    .navigationDestination(for: AppDestination.self) { AppDestinationRouterView(destination: $0) }
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
    }
}

#Preview {
    RootTabView()
        .environment(AppEnvironment())
}
