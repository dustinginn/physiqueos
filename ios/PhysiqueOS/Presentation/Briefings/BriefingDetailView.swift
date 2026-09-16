import SwiftUI

/// `/briefings/review/[artifactId]` — one router-level container for every
/// cadence, including DEXA Event Briefings. Looks the artifact up through
/// the SAME `BriefingSandboxStore` History reads from (never a duplicate
/// fixture), renders the shared top-of-Detail navigation the Founder asked
/// for (clear access to Home and to Briefing History from every Briefing
/// Detail), then dispatches directly to the cadence hero and sections. Any
/// revision disclosure follows the briefing content so backend/history
/// metadata never competes with the hero.
/// cadence-specific section content — Weekly, Midweek, Monthly, and DEXA
/// Event are genuinely distinct screens on the real product (verified
/// per-cadence across this and a prior task's audit), not one reskinned
/// template. DEXA Event Briefings reach this exact same architecture from
/// either Home or History — the real product actually splits this across
/// two different URL shapes for the same underlying artifact
/// (`/briefings/dexa/[scanId]` from Home, `/briefings/review/[artifactId]`
/// from History); Native unifies both onto the one existing
/// `briefingId`-keyed lookup rather than building a second navigation
/// path.
struct BriefingDetailView: View {
    /// Regression-visible declaration of the routing invariant: Home and
    /// History both enter this one artifact renderer; only the published
    /// cadence section body varies below.
    static let architectureInvariant = "shared-artifact-detail-renderer"

    @Environment(AppEnvironment.self) private var environment
    @Environment(\.scenePhase) private var scenePhase
    let briefingId: String
    var onNavigate: (AppDestination) -> Void = { _ in }
    var onReturnToHome: () -> Void = {}

    @State private var state: LoadState = .loading

    private enum LoadState {
        case loading
        case loaded(BriefingReadModel?)
        case failed
    }

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 20)
                .padding(.top, 18)
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["briefing"])
            }
            await load(showLoading: false)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .task(id: "\(environment.nativeAuthority.rawValue):\(briefingId)") {
            await load(showLoading: true)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await load(showLoading: false) }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(let briefing?) :
            VStack(alignment: .leading, spacing: 24) {
                BriefingDetailPreHeroNavigation(
                    onHome: onReturnToHome,
                    onHistory: { onNavigate(.briefingList) }
                )

                switch briefing.cadence {
                case .weekly:
                    if let weekly = briefing.weekly {
                        WeeklyBriefingSections(content: weekly, confidence: briefing.confidence, onNavigate: onNavigate)
                    }
                case .midweek:
                    if let midweek = briefing.midweek {
                        MidweekBriefingSections(content: midweek, confidence: briefing.confidence)
                    }
                case .monthly:
                    if let monthly = briefing.monthly {
                        MonthlyBriefingSections(content: monthly, confidence: briefing.confidence, onNavigate: onNavigate)
                    }
                case .event:
                    if let dexa = briefing.dexa {
                        DEXABriefingSections(content: dexa, confidence: briefing.confidence, onNavigate: onNavigate)
                    } else if let photo = briefing.photo {
                        PhotoBriefingSections(content: photo, onNavigate: onNavigate)
                    }
                case .daily:
                    EmptyView()
                }

                if let provenance = briefing.revisionProvenance {
                    BriefingRevisionBanner(provenance: provenance, replacedHistory: briefing.replacedHistory)
                }
            }
        case .loaded(nil):
            VStack(spacing: 12) {
                BriefingDetailPreHeroNavigation(onHome: onReturnToHome, onHistory: { onNavigate(.briefingList) })
                Text("This Briefing is unavailable.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 200, alignment: .center)
            }
        case .failed:
            VStack(spacing: 16) {
                BriefingDetailPreHeroNavigation(onHome: onReturnToHome, onHistory: { onNavigate(.briefingList) })
                Text("Briefing could not be loaded.")
                Button("Try Again") { Task { await load(showLoading: true) } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    @MainActor
    private func load(showLoading: Bool) async {
        if showLoading { state = .loading }
        do {
            state = .loaded(try await environment.briefingAPI.fetchBriefing(artifactId: briefingId))
        } catch {
            state = .failed
        }
    }

}
