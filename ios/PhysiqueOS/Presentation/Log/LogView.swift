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
    /// See `HomeView`'s matching field: `.task(id:)` re-fires on ordinary
    /// tab-switch reappearance even without an authority change, so this
    /// guards against rebuilding (and blanking) an already-loaded view
    /// model just because the tab was revisited.
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @Environment(\.scenePhase) private var scenePhase
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
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = LogViewModel(api: environment.logAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
        // While a confirmed review is Processing, refresh on a bounded cadence so the
        // card clears when the Server finishes. `.task` is cancelled when the screen
        // leaves, the app backgrounds (scenePhase in the id), or nothing is processing.
        .task(id: "\(viewModel?.processingKey ?? "-"):\(scenePhase == .active)") {
            guard scenePhase == .active, let viewModel, viewModel.processingKey != nil else { return }
            await ProcessingRefresh.run { await viewModel.refreshWhileProcessing() }
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

                if !log.genericProcessingEvidenceReviews.isEmpty {
                    processingCard(log.genericProcessingEvidenceReviews)
                }

                TrainingLoggerCardView(onTap: onNavigate)

                UploadCardView(localDate: log.localDate, onNavigate: onNavigate)
            }
        }
    }

    private func processingCard(_ reviews: [ProcessingEvidenceReview]) -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    ProgressView().tint(PhysiqueOSTheme.accent)
                    Text("Processing")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                ForEach(reviews) { review in
                    Text("\(review.label) confirmation accepted · No action required")
                        .physiqueOSFont(PhysiqueOSTypography.body14Regular)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
