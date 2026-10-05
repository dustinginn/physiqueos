import SwiftUI

/// The real Stage 1 Evidence Hub — replaces the prior slice's Progress
/// placeholder. Mirrors `ProgressHubScreen.jsx` + `EvidenceHubIndex.jsx`
/// exactly: header, an optional "Recently Used" section (at most 3 streams,
/// ranked by `EvidenceHubUsageService`'s access-recency scoring — never by
/// `stream.lastUpdated`), then "All Evidence" listing every canonical
/// stream in `EVIDENCE_HUB_CANONICAL_ORDER` order. Evidence is not a
/// generic file gallery — each row is a distinct canonical-evidence
/// category (pending review lives on Log; this is confirmed canonical
/// evidence/history). A stream may legitimately appear in both sections at
/// once, exactly as the web allows.
struct EvidenceView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: EvidenceViewModel?
    /// See `HomeView`'s matching field: `.task(id:)` re-fires on ordinary
    /// tab-switch reappearance even without an authority change, so this
    /// guards against rebuilding (and blanking) an already-loaded view
    /// model just because the tab was revisited.
    @State private var viewModelAuthority: NativeAPIEnvironment?
    var onNavigate: (AppDestination) -> Void

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 18)
                .padding(.top, 20)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.redesignCanvas)
        .navigationTitle("Evidence")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.redesignCanvas, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = EvidenceViewModel(api: environment.evidenceAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
        .reloadsOnDailyDriverDayChangeWhenVisible(environment.dailyDriverDay) { await viewModel?.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStateView(symbol: "diamond", title: "Loading Evidence", message: "Reading your canonical record.", showsProgress: true)
        case .failed(let message):
            EvidenceStateView(symbol: "exclamationmark.triangle", title: "Evidence unavailable", message: message)
        case .loaded(let hub):
            VStack(alignment: .leading, spacing: 25) {
                EvidenceHeaderView(title: "Evidence", subtitle: "What PhysiqueOS has captured.")

                if !recentlyUsedStreams(in: hub).isEmpty {
                    sectionList(title: "Recently Used", streams: recentlyUsedStreams(in: hub))
                }

                sectionList(title: "All Evidence", streams: visibleStreams(in: hub))
            }
        }
    }

    private func recentlyUsedStreams(in hub: EvidenceHubReadModel) -> [EvidenceStreamSummary] {
        guard let viewModel else { return [] }
        let streamsById = Dictionary(uniqueKeysWithValues: hub.streams.map { ($0.id, $0) })
        return viewModel.recentlyUsedStreamIds.compactMap { streamsById[$0] }.filter { $0.id != "health-metrics" }
    }

    private func visibleStreams(in hub: EvidenceHubReadModel) -> [EvidenceStreamSummary] {
        EvidenceHubRedesignPresentation.visibleStreams(from: hub.streams)
    }

    private func sectionList(title: String, streams: [EvidenceStreamSummary]) -> some View {
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
        }
    }
}

enum EvidenceHubRedesignPresentation {
    static func visibleStreams(from source: [EvidenceStreamSummary]) -> [EvidenceStreamSummary] {
        var streams = source.filter { $0.id != "health-metrics" && $0.id != "timeline" }
        streams.append(
            EvidenceStreamSummary(
                id: "timeline",
                title: "Timeline",
                metric: "A chronological record of what PhysiqueOS has captured",
                trend: "",
                lastUpdated: nil,
                status: .available,
                tone: .primary,
                destination: .progressStream(streamId: "timeline")
            )
        )
        return streams
    }
}
