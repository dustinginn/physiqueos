import SwiftUI

/// `/briefings/review/[artifactId]` — one router-level container for every
/// cadence, including DEXA and Photo Event Briefings. Looks the artifact up
/// through the authority-switching `BriefingAPI` (never a duplicate
/// fixture), renders the locked top-of-Detail navigation chips (Home and
/// Briefing History from every Briefing Detail), then dispatches directly
/// to the cadence hero and sections. Any revision disclosure follows the
/// briefing content so backend/history metadata never competes with the
/// hero. Weekly, Midweek, Monthly, DEXA and Photo are genuinely distinct
/// screens, not one reskinned template. DEXA Event Briefings reach this
/// same renderer from Home (`/briefings/dexa/[scanId]`) and History
/// (`/briefings/review/[artifactId]`) through the one `briefingId` lookup.
///
/// Presentation only: this view reads the published artifact; it issues
/// no Server command of any kind.
struct BriefingDetailView: View {
    /// Regression-visible declaration of the routing invariant: Home and
    /// History both enter this one artifact renderer; only the published
    /// cadence section body varies below.
    static let architectureInvariant = "shared-artifact-detail-renderer"

    @Environment(AppEnvironment.self) private var environment
    let briefingId: String
    var onNavigate: (AppDestination) -> Void = { _ in }
    var onReturnToHome: () -> Void = {}

    @State private var state: LoadState = .loading

    enum LoadState {
        case loading
        case loaded(BriefingReadModel?)
        /// The Server has not published this Briefing yet (a 404 read).
        case notReady
        case failed
    }

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, BriefingLayout.pageGutter)
                .padding(.bottom, 60)
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["briefing"])
            }
            await load(showLoading: false)
        }
        .physiqueOSScrollBottomClearance()
        .briefingReviewScrollOffset()
        .briefingPageChrome()
        .task(id: "\(environment.nativeAuthority.rawValue):\(briefingId)") {
            await load(showLoading: true)
        }
        .refreshesOnForegroundWhenVisible { await load(showLoading: false) }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingDetailPreHeroNavigation(onHome: onReturnToHome, onHistory: { onNavigate(.briefingList) })
            BriefingDetailBody(state: state, onNavigate: onNavigate, onRetry: { Task { await load(showLoading: true) } })
            #if DEBUG
            // Capture seam only: trailing room so the last band never clamps.
            if BriefingReviewScrollOffset.offset != nil { Color.clear.frame(height: 1400) }
            #endif
        }
    }

    @MainActor
    private func load(showLoading: Bool) async {
        #if DEBUG
        if let reviewState = BriefingReviewLaunchConfiguration.detailState {
            state = reviewState
            return
        }
        if let fileBriefing = BriefingReviewLaunchConfiguration.fixtureFileBriefing {
            state = .loaded(fileBriefing)
            return
        }
        #endif
        if showLoading { state = .loading }
        do {
            state = .loaded(try await environment.briefingAPI.fetchBriefing(artifactId: briefingId))
        } catch ProductionNativeError.notFound {
            state = .notReady
        } catch {
            state = .failed
        }
    }
}

/// Everything below the navigation chips for one load state. Split out so
/// presentation tests can render each state deterministically.
struct BriefingDetailBody: View {
    let state: BriefingDetailView.LoadState
    var onNavigate: (AppDestination) -> Void = { _ in }
    var onRetry: () -> Void = {}

    var body: some View {
        switch state {
        case .loading:
            BriefingStateView(kind: .loading, message: "Loading this Briefing", identifier: "briefing.detail.loading")
        case .loaded(let briefing?):
            VStack(alignment: .leading, spacing: 0) {
                BriefingCadenceBody(briefing: briefing, onNavigate: onNavigate)
                if let provenance = briefing.revisionProvenance {
                    BriefingRevisionBanner(provenance: provenance, replacedHistory: briefing.replacedHistory, eventStyle: briefing.cadence == .event)
                }
            }
        case .loaded(nil):
            BriefingStateView(kind: .glyph("▦"), message: "This Briefing is unavailable.", identifier: "briefing.detail.unavailable")
        case .notReady:
            BriefingStateView(
                kind: .glyph("◷"),
                message: "This Briefing isn't ready yet. It will be available here as soon as it is published. No action needed.",
                actionTitle: "Check Again",
                action: onRetry,
                identifier: "briefing.detail.notReady"
            )
        case .failed:
            BriefingStateView(
                kind: .glyph("!"),
                message: "Briefing could not be loaded.",
                actionTitle: "Try Again",
                action: onRetry,
                identifier: "briefing.detail.failed"
            )
        }
    }
}

/// Dispatches one published artifact to its cadence screen.
struct BriefingCadenceBody: View {
    let briefing: BriefingReadModel
    var onNavigate: (AppDestination) -> Void = { _ in }

    /// The section renderer a published artifact routes to (testable).
    enum Route: Equatable { case weekly, midweek, monthly, dexa, photo, none }

    static func route(for briefing: BriefingReadModel) -> Route {
        switch briefing.cadence {
        case .weekly: briefing.weekly == nil ? .none : .weekly
        case .midweek: briefing.midweek == nil ? .none : .midweek
        case .monthly: briefing.monthly == nil ? .none : .monthly
        case .event: briefing.dexa != nil ? .dexa : briefing.photo != nil ? .photo : .none
        case .daily: .none
        }
    }

    var body: some View {
        switch briefing.cadence {
        case .weekly:
            if let weekly = briefing.weekly {
                WeeklyBriefingSections(content: weekly, confidence: briefing.confidence, onNavigate: onNavigate)
            }
        case .midweek:
            if let midweek = briefing.midweek {
                MidweekBriefingSections(content: midweek, confidence: briefing.confidence, evidenceWindow: briefing.evidenceWindow)
            }
        case .monthly:
            if let monthly = briefing.monthly {
                MonthlyBriefingSections(content: monthly, confidence: briefing.confidence, onNavigate: onNavigate)
            }
        case .event:
            if let dexa = briefing.dexa {
                DEXABriefingSections(content: dexa, confidence: briefing.confidence, onNavigate: onNavigate, attribution: briefing.attribution)
            } else if let photo = briefing.photo {
                PhotoBriefingSections(content: photo, onNavigate: onNavigate)
            }
        case .daily:
            EmptyView()
        }
    }
}

extension View {
    /// The locked Briefing page canvas: no system navigation bar (the
    /// in-page chips own navigation), the page color behind the status
    /// bar, and the interactive back swipe preserved.
    func briefingPageChrome() -> some View {
        modifier(BriefingPageChrome())
    }
}

private struct BriefingPageChrome: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(BriefingPalette.standard.page)
            .overlay(alignment: .top) {
                // A zero-height strip whose background extends through the
                // top safe area paints the status-bar region while content
                // scrolls beneath it.
                Color.clear
                    .frame(height: 0)
                    .background(BriefingPalette.standard.page.ignoresSafeArea(edges: .top))
                    .allowsHitTesting(false)
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationBarBackButtonHidden(true)
            .restoresInteractivePopGesture()
    }
}

extension View {
    /// DEBUG-only capture seam: `-physiqueos.briefing-review.scroll-y <pt>`
    /// scrolls a Briefing page to an exact content offset once it loads so
    /// long pages can be captured band by band. A no-op in Release.
    func briefingReviewScrollOffset() -> some View {
        #if DEBUG
        modifier(BriefingReviewScrollOffset())
        #else
        self
        #endif
    }
}

#if DEBUG
struct BriefingReviewScrollOffset: ViewModifier {
    @State private var position = ScrollPosition(edge: .top)

    static var offset: CGFloat? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-physiqueos.briefing-review.scroll-y"),
              arguments.indices.contains(index + 1),
              let value = Double(arguments[index + 1]) else { return nil }
        return CGFloat(value)
    }

    func body(content: Content) -> some View {
        if let offset = Self.offset {
            content
                .scrollPosition($position)
                .task {
                    try? await Task.sleep(for: .milliseconds(900))
                    position.scrollTo(y: offset)
                }
        } else {
            content
        }
    }
}
#endif
