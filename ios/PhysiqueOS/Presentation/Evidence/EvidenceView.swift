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
            if viewModel == nil { viewModel = EvidenceViewModel(api: environment.evidenceAPI) }
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
        case .loaded(let hub):
            VStack(alignment: .leading, spacing: 16) {
                EvidenceHeaderView(title: hub.title, subtitle: hub.subtitle)

                if !recentlyUsedStreams(in: hub).isEmpty {
                    sectionList(title: "Recently Used", streams: recentlyUsedStreams(in: hub))
                }

                sectionList(title: "All Evidence", streams: hub.streams)
            }
        }
    }

    private func recentlyUsedStreams(in hub: EvidenceHubReadModel) -> [EvidenceStreamSummary] {
        guard let viewModel else { return [] }
        let streamsById = Dictionary(uniqueKeysWithValues: hub.streams.map { ($0.id, $0) })
        return viewModel.recentlyUsedStreamIds.compactMap { streamsById[$0] }
    }

    private func sectionList(title: String, streams: [EvidenceStreamSummary]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.sheetTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            VStack(spacing: 8) {
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
