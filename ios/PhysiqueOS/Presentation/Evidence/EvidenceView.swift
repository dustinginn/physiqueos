import SwiftUI

/// The real Stage 1 Evidence Hub — replaces the prior slice's Progress
/// placeholder. Mirrors `ProgressHubScreen.jsx` + `EvidenceHubIndex.jsx`
/// exactly: header, then every canonical evidence stream in
/// `EVIDENCE_HUB_CANONICAL_ORDER` order. Evidence is not a generic file
/// gallery — each row is a distinct canonical-evidence category (pending
/// review lives on Log; this is confirmed canonical evidence/history).
///
/// The web's client-side "Recently Used" section (localStorage-ranked
/// visit history, `EvidenceHubUsageService.js`) is intentionally not
/// ported: it is a personalization layer over the same canonical list
/// below, not additional product data, and this fixture-only slice has no
/// durable per-device usage store to rank against yet.
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

                VStack(spacing: 8) {
                    ForEach(hub.streams) { stream in
                        EvidenceStreamRowView(stream: stream, onTap: onNavigate)
                    }
                }
            }
        }
    }
}
