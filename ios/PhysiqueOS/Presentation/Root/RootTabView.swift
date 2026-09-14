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
            .tabItem { Label(AppTab.evidence.title, systemImage: AppTab.evidence.systemImageName) }
            .tag(AppTab.evidence)

            NavigationStack(path: $youPath) {
                YouPlaceholderView(onNavigate: { noteNavigation($0); youPath.append($0) })
                    .navigationDestination(for: AppDestination.self) {
                        AppDestinationRouterView(destination: $0, onReturnToLog: returnToLog, onReturnToHome: returnToHome, onNavigate: { noteNavigation($0); youPath.append($0) })
                    }
            }
            .tabItem { Label(AppTab.you.title, systemImage: AppTab.you.systemImageName) }
            .tag(AppTab.you)
        }
        .tint(PhysiqueOSTheme.accent)
        .onChange(of: environment.pendingNotificationDestination) { _, destination in
            guard let destination else { return }
            openFromNotification(destination)
        }
        .task {
            if let destination = environment.pendingNotificationDestination {
                openFromNotification(destination)
            }
        }
    }

    /// A priority notification always opens on Home's stack — priorities
    /// are Home's own surface, and Home is where the underlying data (and
    /// its own completion animation, deep-link or not) already lives.
    /// Same tab-switch-then-clear-stack pattern as `returnToLog`/
    /// `returnToHome`, so a stale push from whatever the Founder was doing
    /// before the notification arrived is never left behind.
    private func openFromNotification(_ destination: AppDestination) {
        selectedTab = .home
        environment.pendingNotificationDestination = nil
        Task { @MainActor in
            await Task.yield()
            homePath = NavigationPath()
            homePath.append(destination)
        }
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

#Preview {
    RootTabView()
        .environment(AppEnvironment())
}
