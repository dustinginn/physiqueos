import SwiftUI

/// Stage 1 top-level navigation shell.
///
/// Establishes the five-tab information architecture. Each tab's content is
/// a placeholder whose only job is to prove the tab/navigation foundation;
/// real screen composition arrives in later slices, one tab at a time,
/// starting with Home.
struct RootTabView: View {
    @Environment(AppEnvironment.self) private var environment

    var body: some View {
        TabView {
            ForEach(AppTab.allCases) { tab in
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
        case .home: HomePlaceholderView()
        case .log: LogPlaceholderView()
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
