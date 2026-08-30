import SwiftUI

/// The real Stage 1 Log screen — one of the Founder's highest-frequency
/// daily-driver surfaces. Composition and hierarchy mirror `LogHubScreen.jsx`
/// exactly: header, Logged Today, pending Evidence Reviews (when any
/// exist), Training Logger entry, Upload (with the nested direct weigh-in
/// entry) — in that order, with the same "hide the section if there's
/// nothing to show" rule the web uses for pending reviews.
struct LogView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: LogViewModel?
    var onNavigate: (AppDestination) -> Void

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if viewModel == nil { viewModel = LogViewModel(api: environment.logAPI) }
            await viewModel?.load()
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
        case .loaded(let log):
            VStack(alignment: .leading, spacing: 14) {
                LogHeaderView()

                LoggedTodayCardView(rows: log.loggedToday, onTap: onNavigate)

                if log.hasPendingEvidenceReviews {
                    PendingEvidenceReviewsCardView(reviews: log.pendingEvidenceReviews, onTap: onNavigate)
                }

                TrainingLoggerCardView(onTap: onNavigate)

                UploadCardView(localDate: log.localDate, onNavigate: onNavigate)
            }
        }
    }
}
