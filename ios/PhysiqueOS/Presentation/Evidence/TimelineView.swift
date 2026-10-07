import SwiftUI

/// The bounded, cross-domain Timeline (locked T1) — a genuinely new
/// Founder Production feature (Patch 3 continuation) with no Sandbox
/// precedent. Server identity/chronology/ordering is authoritative; this
/// view renders one bounded page verbatim (newest-first, matching the
/// server's own sort) as a single chronology rail, never invents
/// client-side pagination, filters or row navigation, and only states
/// `Showing N of M` when the Server says more entries exist.
struct TimelineView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: TimelineViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?

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
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbar { backToolbarItem }
        .evidenceLockedPageChrome()
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = TimelineViewModel(api: environment.timelineAPI)
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
    }

    private var backToolbarItem: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { dismiss() } label: {
                Text("‹ Evidence Hub")
                    .evidenceLockedText(S.navBack)
                    .foregroundStyle(S.sub)
                    .fixedSize()
                    .padding(.leading, S.pt(3.3))
                    .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Evidence Hub")
            .accessibilityHint("Returns to the Evidence Hub.")
            .accessibilityIdentifier("evidence.timeline.back")
        }
        .evidenceLockedFlatToolbarItem()
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStateCard(kind: .loading("Loading Timeline…"), identifier: "evidence.timeline.loading")
        case .failed(let message):
            EvidenceStateCard(kind: .message(title: message, detail: nil), identifier: "evidence.timeline.failure")
        case .loaded(let timeline):
            VStack(alignment: .leading, spacing: 0) {
                EvidenceHeaderView(
                    domain: .timeline,
                    eyebrow: "Evidence",
                    title: "Timeline",
                    subtitle: "A chronological record of what PhysiqueOS has captured."
                )
                if timeline.items.isEmpty {
                    EvidenceStateCard(
                        kind: .message(title: "No Timeline entries yet.", detail: nil),
                        identifier: "evidence.timeline.empty"
                    )
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(timeline.items.enumerated()), id: \.element.id) { index, item in
                            TimelineEventRow(item: item, isLast: index == timeline.items.count - 1)
                        }
                    }
                    .padding(.leading, S.pt(5))
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("evidence.timeline.events")

                    if timeline.hasMore {
                        Text("Showing \(timeline.items.count) of \(timeline.totalCount)")
                            .evidenceLockedText(S.note)
                            .foregroundStyle(S.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityIdentifier("evidence.timeline.count")
                    }
                }
            }
        }
    }
}

/// One T1 `.event` on the rail: the uppercase type · date eyebrow, the
/// title and the optional detail. A domain event (Workout, Daily Activity,
/// Weight, Progress Photo, DEXA) wears its domain icon and accent in the
/// 16-px node; a system event keeps the neutral 8-px dot with its 14% halo,
/// and a failure keeps its danger red. Rows are read-only; the rail and
/// node are decorative (the type label carries identity in text).
private struct TimelineEventRow: View {
    let item: TimelineItem
    let isLast: Bool

    private typealias S = EvidenceLockedStyle

    private var domain: EvidenceDomain? { EvidenceDomain(timelineType: item.type) }

    /// Timeline identity color (`TimelineIdentity`).
    private var tone: Color { TimelineIdentity.color(type: item.type, tone: item.tone) }
    private var dateText: String { TimelineDateFormatting.long(item.date) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(item.type) · \(dateText)")
                .evidenceLockedText(S.eventType)
                .foregroundStyle(tone)
            Text(item.title)
                .evidenceLockedText(S.eventTitle)
                .foregroundStyle(S.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, S.pt(2))
            if !item.detail.isEmpty {
                Text(item.detail)
                    .evidenceLockedText(S.eventCopy)
                    .foregroundStyle(S.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, S.pt(3))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, S.pt(26))
        .padding(.bottom, S.pt(16))
        .background(alignment: .topLeading) { rail }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.type), \(dateText). \(item.title)\(item.detail.isEmpty ? "" : ". \(item.detail)")")
        .accessibilityIdentifier("evidence.timeline.event.\(item.id)")
    }

    /// `.event:before` (node at 3,7) and `.event:after` (1-px rule at x 6,
    /// from 19 px below the row top to 2 px above its bottom).
    private var rail: some View {
        ZStack(alignment: .topLeading) {
            if !isLast {
                Rectangle()
                    .fill(S.line)
                    .frame(width: S.pt(1))
                    .padding(.top, S.pt(19))
                    .padding(.bottom, S.pt(2))
                    .frame(maxHeight: .infinity, alignment: .top)
                    .offset(x: S.pt(6))
            }
            node
                .offset(x: S.pt(-1), y: S.pt(3))
        }
        .accessibilityHidden(true)
    }
}

private extension TimelineEventRow {
    @ViewBuilder
    var node: some View {
        if let domain {
            Image(systemName: domain.systemImage)
                .font(.system(size: S.pt(8), weight: .bold))
                .foregroundStyle(domain.accent.color)
                .frame(width: S.pt(16), height: S.pt(16))
                .background(domain.accent.soft, in: Circle())
                .background(S.canvas, in: Circle())
        } else {
            Circle()
                .fill(tone)
                .frame(width: S.pt(8), height: S.pt(8))
                .padding(S.pt(4))
                .background(tone.opacity(0.14), in: Circle())
        }
    }
}

/// Timeline event identity: a domain event takes its domain accent; a
/// system event (Briefing, Check-In, Analysis, Protocol, Upload) is
/// neutral, except a failure, which keeps the danger red.
enum TimelineIdentity {
    enum Kind: Equatable {
        case domain(EvidenceDomain)
        case danger
        case neutral
    }

    static func kind(type: String, tone: HomeColorToken) -> Kind {
        if let domain = EvidenceDomain(timelineType: type) { return .domain(domain) }
        return tone == .danger ? .danger : .neutral
    }

    static func color(type: String, tone: HomeColorToken) -> Color {
        switch kind(type: type, tone: tone) {
        case .domain(let domain): domain.accent.color
        case .danger: EvidenceLockedStyle.red
        case .neutral: EvidenceLockedStyle.muted
        }
    }
}

enum TimelineDateFormatting {
    /// `Sep 10, 2026` from the Server's ISO day or timestamp.
    static func long(_ value: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(identifier: "UTC")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: String(value.prefix(10))) else { return value }
        let display = DateFormatter()
        display.locale = Locale(identifier: "en_US_POSIX")
        display.timeZone = TimeZone(identifier: "UTC")
        display.dateFormat = "MMM d, yyyy"
        return display.string(from: date)
    }
}

private extension ToolbarContent {
    /// The locked back affordance is plain text on the flat bar, not a
    /// Liquid Glass capsule.
    @ToolbarContentBuilder
    func evidenceLockedFlatToolbarItem() -> some ToolbarContent {
        if #available(iOS 26.0, *) {
            sharedBackgroundVisibility(.hidden)
        } else {
            self
        }
    }
}

private extension TimelineView {
    static var reviewScrollAnchor: UnitPoint? {
#if DEBUG
        EvidenceRedesignReview.scrollsToBottom ? .bottom : nil
#else
        nil
#endif
    }
}
