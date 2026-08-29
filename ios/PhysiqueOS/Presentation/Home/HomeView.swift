import SwiftUI

/// The real Stage 1 Home screen: the daily cockpit answering "Am I on
/// track?" and "What matters most today?" (docs/INFORMATION_ARCHITECTURE.md).
/// Composition and hierarchy mirror `HomeScreen.jsx` exactly: header, hero
/// (Trajectory/Confidence), next-best action, briefing cards, goals,
/// today's priorities — in that order, with the same "hide the section if
/// there's nothing to show" rule the web uses for briefing cards and
/// today's focus.
struct HomeView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: HomeViewModel?
    @State private var confidenceDetailPresentation: (confidence: Int, detail: ConfidenceDetail)?
    var onNavigate: (AppDestination) -> Void

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 32)
        }
        .background(PhysiqueOSTheme.background)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if viewModel == nil { viewModel = HomeViewModel(api: environment.homeAPI) }
            await viewModel?.load()
        }
        .sheet(item: Binding(
            get: { confidenceDetailPresentation.map(ConfidenceDetailPresentation.init) },
            set: { confidenceDetailPresentation = $0.map { ($0.confidence, $0.detail) } }
        )) { presentation in
            ConfidenceDetailSheet(confidence: presentation.confidence, detail: presentation.detail)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(let home):
            VStack(alignment: .leading, spacing: 10) {
                HomeHeaderView(header: home.header)

                HomeHeroCardView(hero: home.hero) {
                    if let confidence = home.hero.confidence, let detail = home.hero.confidenceDetail {
                        confidenceDetailPresentation = (confidence, detail)
                    }
                }

                NextBestActionView(action: home.nextBestAction, onTap: onNavigate)

                if home.hasBriefingCards {
                    VStack(spacing: 10) {
                        ForEach(home.briefingCards) { card in
                            BriefingCardView(card: card, onTap: onNavigate)
                        }
                    }
                }

                GoalsCardView(goals: home.goals, onTap: onNavigate)

                if home.hasTodaysFocus {
                    TodaysFocusCardView(items: home.todaysFocus, onTap: onNavigate)
                }
            }
        }
    }
}

private struct ConfidenceDetailPresentation: Identifiable {
    let confidence: Int
    let detail: ConfidenceDetail
    var id: String { detail.qualitativeLevel + String(confidence) }
}
