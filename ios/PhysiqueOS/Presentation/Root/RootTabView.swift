import SwiftUI

/// Stage 1 top-level navigation shell.
///
/// Establishes the five-tab information architecture. Home and Log are now
/// real screens; Progress, Coach, and Profile remain placeholders whose
/// only job is to prove the tab/navigation foundation until their own
/// slices.
struct RootTabView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var homePath = NavigationPath()
    @State private var logPath = NavigationPath()

    var body: some View {
        TabView {
            NavigationStack(path: $homePath) {
                HomeView(onNavigate: { homePath.append($0) })
                    .navigationDestination(for: AppDestination.self) { DestinationPlaceholderView(destination: $0) }
            }
            .tabItem { Label(AppTab.home.title, systemImage: AppTab.home.systemImageName) }
            .tag(AppTab.home)

            NavigationStack(path: $logPath) {
                LogView(onNavigate: { logPath.append($0) })
                    .navigationDestination(for: AppDestination.self) { DestinationPlaceholderView(destination: $0) }
            }
            .tabItem { Label(AppTab.log.title, systemImage: AppTab.log.systemImageName) }
            .tag(AppTab.log)

            ForEach([AppTab.progress, .coach, .profile]) { tab in
                NavigationStack {
                    placeholder(for: tab)
                }
                .tabItem {
                    Label(tab.title, systemImage: tab.systemImageName)
                }
                .tag(tab)
            }
        }
        .tint(PhysiqueOSTheme.accent)
    }

    @ViewBuilder
    private func placeholder(for tab: AppTab) -> some View {
        switch tab {
        case .home, .log: EmptyView()
        case .progress: ProgressPlaceholderView()
        case .coach: CoachPlaceholderView()
        case .profile: ProfilePlaceholderView()
        }
    }
}

#Preview {
    RootTabView()
        .environment(AppEnvironment())
}
