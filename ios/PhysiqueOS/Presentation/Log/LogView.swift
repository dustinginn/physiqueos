import SwiftUI
import UserNotifications

/// The Founder-locked Log Compact Command Center: header, Training Logger
/// execution field, Logged Today 2×2 status grid, pending review band,
/// quick actions and the collapsed bottom Sources disclosure. Every string,
/// destination and state still comes from `LogReadModel` and the existing
/// routes; only the composition changed.
struct LogView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: LogViewModel?
    /// See `HomeView`'s matching field: `.task(id:)` re-fires on ordinary
    /// tab-switch reappearance even without an authority change, so this
    /// guards against rebuilding (and blanking) an already-loaded view
    /// model just because the tab was revisited.
    @State private var viewModelAuthority: NativeAPIEnvironment?
    @State private var isSourcesExpanded = LogReviewLaunchConfiguration.sourcesExpanded
    @Environment(\.scenePhase) private var scenePhase
    var onNavigate: (AppDestination) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                content
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 18)
            }
            .physiqueOSScrollBottomClearance()
            .background(PhysiqueOSTheme.redesignCanvas)
            .toolbar(.hidden, for: .navigationBar)
            .task(id: environment.nativeAuthority) {
                if viewModelAuthority != environment.nativeAuthority {
                    viewModel = LogViewModel(api: environment.logAPI)
                    viewModelAuthority = environment.nativeAuthority
                }
                await viewModel?.load()
                await syncWorkoutReconciliationNotifications()
                await environment.homeWidgetRefreshRelay.request()
                if LogReviewLaunchConfiguration.scrollsToBottom {
                    proxy.scrollTo(LogSourcesDisclosureView.scrollAnchor, anchor: .bottom)
                }
            }
            // Logged Today is a daily-driver "Today" surface: it reloads when the
            // local day or zone changes (the environment invalidates the cached
            // read before publishing the new day) and whenever it is foregrounded
            // while visible. Before this, a retained Log kept showing the previous
            // day's rows after midnight until a tab switch or pull to refresh.
            .reloadsOnDailyDriverDayChangeWhenVisible(environment.dailyDriverDay) {
                await viewModel?.load()
                await syncWorkoutReconciliationNotifications()
            }
            // On a resume that crosses midnight the re-evaluation invalidates and
            // publishes the new day (which reloads above); this closure loads only
            // when its own re-evaluation saw no change. If the root scene's
            // re-evaluation published first, the visible Log may read once more.
            .refreshesOnForegroundWhenVisible {
                if await !environment.reevaluateDailyDriverDay() { await viewModel?.load() }
                await syncWorkoutReconciliationNotifications()
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
                await syncWorkoutReconciliationNotifications()
            }
        }
    }

    /// Reconciles locally-scheduled reconciliation-review notifications
    /// against the just-loaded canonical Log read. Mirrors `HomeView`'s
    /// `syncPriorityNotifications` exactly: authorization is requested here
    /// (a no-op after the Founder's first decision) rather than gated behind
    /// a separate settings screen, since this is the natural point
    /// scheduling first becomes possible for this surface too.
    private func syncWorkoutReconciliationNotifications() async {
        guard environment.nativeAuthority == .founderProduction,
              case .loaded(let log) = viewModel?.state
        else { return }
        let center = UNUserNotificationCenter.current()
        _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        await WorkoutReconciliationReviewReadyNotifier.reconcile(reviews: log.pendingEvidenceReviews, center: center)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            VStack(alignment: .leading, spacing: 0) {
                LogHeaderView()
                ProgressView()
                    .tint(PhysiqueOSTheme.redesignPurple)
                    .frame(maxWidth: .infinity, minHeight: 300)
                    .accessibilityLabel("Loading Log")
            }
        case .failed(let message):
            VStack(alignment: .leading, spacing: 0) {
                LogHeaderView()
                Text(message)
                    .logText(LogType.body14Strong)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .frame(maxWidth: .infinity, minHeight: 300)
            }
        case .loaded(let log):
            VStack(alignment: .leading, spacing: 0) {
                LogHeaderView()

                TrainingLoggerCardView(onTap: onNavigate)
                    .padding(.top, 6)

                LoggedTodayCardView(
                    rows: log.loggedToday,
                    localDate: log.localDate,
                    typedProvenance: log.usesTypedProvenance,
                    onTap: onNavigate
                )
                .padding(.top, 12)

                if log.hasPendingEvidenceReviews {
                    PendingEvidenceReviewsCardView(reviews: log.pendingEvidenceReviews, onTap: onNavigate)
                        .padding(.top, 8)
                }

                if !log.genericProcessingEvidenceReviews.isEmpty {
                    processingBand(log.genericProcessingEvidenceReviews)
                        .padding(.top, 8)
                }

                UploadCardView(localDate: log.localDate, onNavigate: onNavigate)
                    .padding(.top, 9)

                let sources = log.sources
                if !sources.isEmpty {
                    LogSourcesDisclosureView(entries: sources, isExpanded: $isSourcesExpanded)
                        .padding(.top, 7)
                }
            }
        }
    }

    /// Server-owned processing acknowledgement in the review-band grammar.
    /// It is informational only: no action, no chevron, not a button.
    private func processingBand(_ reviews: [ProcessingEvidenceReview]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                ProgressView()
                    .controlSize(.small)
                    .tint(PhysiqueOSTheme.redesignTeal)
                Text("Processing")
                    .logText(LogType.rowLabel)
                    .foregroundStyle(PhysiqueOSTheme.redesignTeal)
            }
            ForEach(reviews) { review in
                Text("\(review.label) confirmation accepted · No action required")
                    .logText(LogType.meta12)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .padding(.top, 4)
            }
        }
        .padding(.vertical, 11)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LogBandBackground(tone: PhysiqueOSTheme.redesignTeal))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Locked Log type scale

/// One text role of the locked Log harness, expressed the way its CSS is:
/// Plus Jakarta Sans at a numeric weight, a CSS line-height multiple and
/// em tracking. `logText` reproduces CSS half-leading so line boxes and
/// baselines land where the reference puts them, and scales with Dynamic Type.
struct LogType {
    var size: CGFloat
    var weight: CGFloat
    var lineHeight: CGFloat = 1.35
    var trackingEm: CGFloat = 0
    var uppercase = false

    static let eyebrow = LogType(size: 11, weight: 750, lineHeight: 1.2, trackingEm: 0.09, uppercase: true)
    static let rowLabel = LogType(size: 11, weight: 750, lineHeight: 1.2, trackingEm: 0.09, uppercase: true)
    static let title = LogType(size: 30, weight: 780, lineHeight: 1.04, trackingEm: -0.035)
    static let subtitle = LogType(size: 14, weight: 400, lineHeight: 1.4)
    static let actionTitle = LogType(size: 20, weight: 700)
    static let actionBody = LogType(size: 12, weight: 400)
    static let sectionTitle = LogType(size: 16, weight: 760)
    static let date = LogType(size: 12, weight: 400)
    static let tileSummary = LogType(size: 13, weight: 750, lineHeight: 1.3)
    static let tileContext = LogType(size: 12, weight: 700, lineHeight: 1.3)
    static let meta12 = LogType(size: 12, weight: 400)
    static let reviewTitle = LogType(size: 14, weight: 750)
    static let action12 = LogType(size: 12, weight: 750)
    static let quickAction = LogType(size: 12, weight: 750)
    static let details = LogType(size: 13, weight: 750)
    static let caption = LogType(size: 11, weight: 400)
    static let sourcesTitle = LogType(size: 12, weight: 800)
    static let sourcesCount = LogType(size: 11, weight: 700)
    static let sourceLabel = LogType(size: 11, weight: 750, lineHeight: 1.32)
    static let sourceScope = LogType(size: 11, weight: 400, lineHeight: 1.32)
    static let body14Strong = LogType(size: 14, weight: 600)
}

private struct LogTextModifier: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let style: LogType

    init(_ style: LogType) {
        self.style = style
        _size = ScaledMetric(wrappedValue: style.size)
    }

    func body(content: Content) -> some View {
        let font = PlusJakartaSans.uiFont(size: size, weight: style.weight)
        let lineBox = size * style.lineHeight
        let leading = lineBox - font.lineHeight
        let styled = content
            .font(Font(font))
            .tracking(size * style.trackingEm)
            .textCase(style.uppercase ? .uppercase : nil)
        // CSS half-leading: each line box is `lineBox` tall with the content
        // area centered in it. Tighter-than-natural roles (display titles,
        // labels) use negative leading, which also wraps correctly.
        styled
            .lineSpacing(leading)
            .padding(.vertical, leading / 2)
    }
}

extension View {
    func logText(_ style: LogType) -> some View {
        modifier(LogTextModifier(style))
    }
}

/// The locked band treatment shared by pending review and processing: a
/// 4 pt semantic rule on the leading edge over a 7% tint of the paper surface.
struct LogBandBackground: View {
    let tone: Color

    var body: some View {
        let shape = UnevenRoundedRectangle(bottomTrailingRadius: 12, topTrailingRadius: 12, style: .continuous)
        ZStack(alignment: .leading) {
            shape.fill(PhysiqueOSTheme.redesignPaper)
            shape.fill(tone.opacity(0.07))
            Rectangle().fill(tone).frame(width: 4)
        }
    }
}

// MARK: - DEBUG review seam

/// DEBUG-only launch flags for the Batch 2 visual parity captures. Release
/// builds compile every flag to its production default.
enum LogReviewLaunchConfiguration {
    static var state: String? {
#if DEBUG
        value(after: "-physiqueos.log-review.state")
#else
        nil
#endif
    }

    static var sourcesExpanded: Bool {
#if DEBUG
        value(after: "-physiqueos.log-review.sources") == "expanded"
#else
        false
#endif
    }

    static var scrollsToBottom: Bool {
#if DEBUG
        value(after: "-physiqueos.log-review.scroll") == "bottom"
#else
        false
#endif
    }

#if DEBUG
    private static func value(after flag: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }
#endif
}
