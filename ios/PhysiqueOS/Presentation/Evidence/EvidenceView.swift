import SwiftUI

/// The locked Evidence Hub (H1): a flat "Evidence" navigation bar, the
/// YOUR RECORD header, an optional "Recently Used" list (at most 3
/// streams, ranked by `EvidenceHubUsageService`'s access-recency scoring —
/// never by `stream.lastUpdated`), then "All Evidence" listing every real
/// stream. Evidence is not a generic file gallery — each row is a distinct
/// canonical-evidence category (pending review lives on Log; this is
/// confirmed canonical evidence/history). A stream may legitimately appear
/// in both sections at once, exactly as the web allows.
struct EvidenceView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: EvidenceViewModel?
    /// See `HomeView`'s matching field: `.task(id:)` re-fires on ordinary
    /// tab-switch reappearance even without an authority change, so this
    /// guards against rebuilding (and blanking) an already-loaded view
    /// model just because the tab was revisited.
    @State private var viewModelAuthority: NativeAPIEnvironment?
    var onNavigate: (AppDestination) -> Void

    private typealias S = EvidenceLockedStyle

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, S.pt(16))
                .padding(.top, S.pt(14))
        }
        .physiqueOSScrollBottomClearance()
        .defaultScrollAnchor(Self.reviewScrollAnchor)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Evidence")
                    .evidenceLockedText(S.navTitle)
                    .foregroundStyle(S.ink)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .evidenceLockedPageChrome()
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = Self.makeViewModel(api: environment.evidenceAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
        .refreshable { await viewModel?.load(trigger: .pullToRefresh) }
        .refreshesOnForegroundWhenVisible { await viewModel?.retryAfterForegroundIfNeeded() }
        .reloadsOnDailyDriverDayChangeWhenVisible(environment.dailyDriverDay) { await viewModel?.load(trigger: .dayChange) }
    }

    private static func makeViewModel(api: EvidenceAPI) -> EvidenceViewModel {
#if DEBUG
        if let store = EvidenceRedesignReview.usageStore {
            return EvidenceViewModel(api: api, usageStore: store)
        }
#endif
        return EvidenceViewModel(api: api)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStateCard(kind: .loading("Loading Evidence…"), identifier: "evidence.hub.loading")
        case .failed(let message):
            VStack(spacing: S.pt(12)) {
                EvidenceStateCard(kind: .failure(title: message, detail: "Pull to refresh or try again."), identifier: "evidence.hub.failure")
                Button("Try Again") { Task { await viewModel?.load(trigger: .retry) } }
                    .buttonStyle(.bordered)
                    .tint(S.ink)
                    .accessibilityIdentifier("evidence.hub.retry")
            }
        case .loaded(let hub):
            VStack(alignment: .leading, spacing: 0) {
                if viewModel?.refreshFailed == true {
                    Text("Couldn't refresh. Showing Evidence loaded earlier — pull to refresh.")
                        .evidenceLockedText(S.stateCopy)
                        .foregroundStyle(S.muted)
                        .padding(.bottom, S.pt(8))
                        .accessibilityIdentifier("evidence.hub.refreshFailed")
                }
                EvidenceHeaderView(
                    domain: nil,
                    eyebrow: "Your record",
                    title: "Evidence",
                    subtitle: "What PhysiqueOS has captured."
                )

                let recent = recentlyUsedStreams(in: hub)
                if !recent.isEmpty {
                    section(title: "Recently Used", streams: recent, identifier: "evidence.hub.recentlyUsed")
                }

                section(title: "All Evidence", streams: EvidenceHubPresentation.lockedStreams(hub.streams), identifier: "evidence.hub.all")
            }
        }
    }

    private func recentlyUsedStreams(in hub: EvidenceHubReadModel) -> [EvidenceStreamSummary] {
        guard let viewModel else { return [] }
        let streamsById = Dictionary(uniqueKeysWithValues: EvidenceHubPresentation.lockedStreams(hub.streams).map { ($0.id, $0) })
        return viewModel.recentlyUsedStreamIds.compactMap { streamsById[$0] }
    }

    private func section(title: String, streams: [EvidenceStreamSummary], identifier: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            EvidenceSectionTitle(title: title)
            VStack(spacing: 0) {
                ForEach(streams) { stream in
                    EvidenceStreamRowView(stream: stream) { destination in
                        viewModel?.recordVisit(streamId: stream.id)
                        onNavigate(destination)
                    }
                }
            }
            .overlay(alignment: .top) {
                Rectangle().fill(S.line).frame(height: S.pt(1))
            }
            .padding(.top, S.pt(1))
        }
        .padding(.bottom, S.pt(17))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
    }
}

/// The locked Hub composition over the canonical stream list. Every real
/// stream keeps its Server order, availability, summary and destination;
/// the non-functional Health Metrics placeholder is not presented, and the
/// Timeline doorway (when the authority provides one) sits last, after
/// Recovery. Nothing is synthesized: an authority without a Timeline
/// stream (Sandbox) shows no Timeline row.
enum EvidenceHubPresentation {
    static let hiddenStreamIds: Set<String> = ["health-metrics"]

    static func lockedStreams(_ streams: [EvidenceStreamSummary]) -> [EvidenceStreamSummary] {
        let visible = streams.filter { !hiddenStreamIds.contains($0.id) }
        return visible.filter { $0.id != "timeline" } + visible.filter { $0.id == "timeline" }
    }
}

private extension EvidenceView {
    static var reviewScrollAnchor: UnitPoint? {
#if DEBUG
        EvidenceRedesignReview.scrollsToBottom ? .bottom : nil
#else
        nil
#endif
    }
}
