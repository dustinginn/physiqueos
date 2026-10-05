import SwiftUI

/// The bounded, cross-domain Timeline — a genuinely new Founder Production
/// feature (Patch 3 continuation) with no Sandbox precedent. Server
/// identity/chronology/ordering is authoritative; this view renders one
/// bounded page verbatim (newest-first, matching the server's own sort)
/// and never invents client-side pagination beyond it.
struct TimelineView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: TimelineViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 18)
                .padding(.top, 18)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.redesignCanvas)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.redesignCanvas, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { dismiss() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 13, weight: .black))
                        Text("Evidence Hub")
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                    }
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                }
            }
        }
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                #if DEBUG
                let api: any TimelineAPI = ProcessInfo.processInfo.arguments.contains("-physiqueos.redesign-review")
                    ? TimelineRedesignReviewAPI()
                    : environment.timelineAPI
                viewModel = TimelineViewModel(api: api)
                #else
                viewModel = TimelineViewModel(api: environment.timelineAPI)
                #endif
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStateView(symbol: "point.topleft.down.to.point.bottomright.curvepath", title: "Loading Timeline", message: "Reading the bounded canonical record.", showsProgress: true)
        case .failed(let message):
            EvidenceStateView(symbol: "exclamationmark.triangle", title: "Timeline unavailable", message: message)
        case .loaded(let timeline):
            VStack(alignment: .leading, spacing: 22) {
                header
                if timeline.items.isEmpty {
                    EvidenceStateView(symbol: "clock", title: "No Timeline entries yet", message: "Canonical events will appear here when they are captured.")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(timeline.items.enumerated()), id: \.element.id) { index, item in
                            TimelineRow(item: item, isLast: index == timeline.items.count - 1)
                        }
                    }
                    if timeline.hasMore {
                        Text("Showing \(timeline.items.count) of \(timeline.totalCount)")
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 13) {
            EvidenceGlyph(symbol: "point.topleft.down.to.point.bottomright.curvepath", size: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text("EVIDENCE")
                    .font(.system(size: 13, weight: .black, design: .rounded))
                    .tracking(2.1)
                    .foregroundStyle(EvidenceRedesignPalette.lime)
                Text("Timeline")
                    .font(.system(size: 33, weight: .black, design: .rounded))
                    .tracking(-1.25)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                Text("A chronological record of what PhysiqueOS has captured.")
                    .font(.system(size: 17, weight: .medium, design: .rounded))
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct TimelineRow: View {
    let item: TimelineItem
    let isLast: Bool

    private var color: Color {
        switch item.type.lowercased() {
        case let value where value.contains("weight") || value.contains("activity"): EvidenceRedesignPalette.blue
        case let value where value.contains("briefing") || value.contains("dexa"): EvidenceRedesignPalette.purple
        case let value where value.contains("photo"): EvidenceRedesignPalette.green
        case let value where value.contains("workout"): EvidenceRedesignPalette.amber
        case let value where value.contains("failed") || value.contains("upload"): EvidenceRedesignPalette.red
        default: EvidenceRedesignPalette.lime
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 13) {
            ZStack(alignment: .top) {
                if !isLast {
                    Rectangle()
                        .fill(EvidenceRedesignPalette.rail)
                        .frame(width: 1.5)
                        .padding(.top, 14)
                }
                Circle().fill(color.opacity(0.16)).frame(width: 22, height: 22)
                Circle().fill(color).frame(width: 10, height: 10).padding(.top, 6)
            }
            .frame(width: 25)
            .frame(minHeight: isLast ? 28 : 73)

            VStack(alignment: .leading, spacing: 3) {
                Text("\(item.type.uppercased()) · \(timelineDate(item.date).uppercased())")
                    .font(.system(size: 12, weight: .black, design: .rounded))
                    .tracking(1.15)
                    .foregroundStyle(color)
                Text(item.title)
                    .font(.system(size: 18, weight: .black, design: .rounded))
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                Text(item.detail)
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            }
            .padding(.bottom, isLast ? 0 : 14)
        }
        .accessibilityElement(children: .combine)
    }

    private func timelineDate(_ value: String) -> String {
        let raw = String(value.prefix(10))
        let input = DateFormatter()
        input.locale = Locale(identifier: "en_US_POSIX")
        input.dateFormat = "yyyy-MM-dd"
        guard let parsed = input.date(from: raw) else { return TrainingDateFormatting.short(value) }
        let output = DateFormatter()
        output.locale = Locale(identifier: "en_US_POSIX")
        output.dateFormat = "MMM d, yyyy"
        return output.string(from: parsed)
    }
}
