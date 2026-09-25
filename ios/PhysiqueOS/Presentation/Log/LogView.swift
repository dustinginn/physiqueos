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
        // Logged Today is a daily-driver "Today" surface: it reloads when the
        // local day or zone changes (the environment invalidates the cached
        // read before publishing the new day) and whenever it is foregrounded
        // while visible. Before this, a retained Log kept showing the previous
        // day's rows after midnight until a tab switch or pull to refresh.
        .reloadsOnDailyDriverDayChangeWhenVisible(environment.dailyDriverDay) { await viewModel?.load() }
        // On a resume that crosses midnight the re-evaluation invalidates and
        // publishes the new day (which reloads above); only a same-day resume
        // loads here, so the visible Log never reads twice.
        .refreshesOnForegroundWhenVisible {
            if await !environment.reevaluateDailyDriverDay() { await viewModel?.load() }
        }
        // While a confirmed review is Processing, refresh on a bounded cadence so the
        // card clears when the Server finishes. `.task` is cancelled when the screen
        // leaves, the app backgrounds (scenePhase in the id), or nothing is processing.
        .task(id: "\(viewModel?.processingKey ?? "-"):\(scenePhase == .active)") {
            guard scenePhase == .active, let viewModel, viewModel.processingKey != nil else { return }
            await ProcessingRefresh.run { await viewModel.refreshWhileProcessing() }
        }
        // A pull explicitly runs the same automatic HealthKit catch-up
        // foreground already triggers -- never the diagnostic canary/manual
        // test-day path -- so a Founder who doesn't want to wait for the
        // next ordinary foreground can force one. `bootstrap()` is itself
        // idempotent (in-flight-coalesced, and a day with nothing new to
        // ingest is a no-op against the existing cursor/partition state, so
        // this can never create a duplicate canonical day or touch Workout
        // activation). HealthKit unavailability/denial is swallowed here --
        // Log's other data (reviews, weight) must still refresh either way.
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                _ = await environment.healthKitAutomaticSynchronizationCoordinator.bootstrap()
                await environment.productionNativeAPI.invalidateReadResources(["evidence-review-queue", "weight"])
            }
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
