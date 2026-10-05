import Charts
import SwiftUI

// Shared locked Evidence components. Every length is the harness's CSS px
// passed through the page's `EvidenceFamily` scale; family-specific values
// follow each harness's own stylesheet.

// MARK: - Page scaffold

/// `.navbar` + `.scroll`: page canvas, flat text back label, optional
/// centered title, and the back trail. Training's bar has no rule; the
/// Nutrition/Activity and Weight bars draw a 1 px rule.
struct EvidencePageChrome: ViewModifier {
    @Environment(\.evidenceFamily) private var family
    @Environment(\.dismiss) private var dismiss
    @Environment(\.evidenceBackTrail) private var trail
    @State private var token = EvidenceTrailToken()

    /// This page's short title, recorded for the page above it.
    let trailTitle: String
    var centeredTitle: String?
    /// Training's root uses `←` exactly as locked T1; every other page `‹`.
    var arrowBack = false
    var backOverride: String?

    private var backLabel: String {
        if let backOverride { return backOverride }
        return trail?.parentTitle(of: token.id) ?? "Back"
    }

    func body(content: Content) -> some View {
        let m = EvidenceMetrics(family: family)
        content
            .background(m.c.page)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .restoresInteractivePopGesture()
            .toolbarBackground(m.c.page, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Text("\(arrowBack ? "←" : "‹") \(backLabel)")
                            .evidenceText(family == .training ? .normal(13, 750) : .normal(12, family == .record ? 700 : 750, jakarta: family.usesJakarta))
                            .foregroundStyle(m.c.muted)
                            .fixedSize()
                            .padding(.leading, m.pt(family == .training ? 1 : 3))
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(backLabel)
                    .accessibilityIdentifier("evidence.back")
                }
                .evidenceFlatToolbarItem()
                if let centeredTitle {
                    ToolbarItem(placement: .principal) {
                        Text(centeredTitle)
                            .evidenceText(family == .training ? .normal(13, 750) : .normal(12, 800, jakarta: family.usesJakarta))
                            .foregroundStyle(m.c.ink)
                            .accessibilityAddTraits(.isHeader)
                    }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                if family != .training {
                    // `.nav` border: the record harness mixes `--line` at 74%.
                    Rectangle().fill(m.c.line.opacity(family == .record ? 0.74 : 1)).frame(height: m.pt(1)).accessibilityHidden(true)
                }
            }
            .onAppear {
                token.trail = trail
                trail?.register(token.id, title: trailTitle)
            }
            .onChange(of: trailTitle) { _, title in
                trail?.register(token.id, title: title)
            }
    }
}

extension View {
    func evidencePageChrome(_ trailTitle: String, centeredTitle: String? = nil, arrowBack: Bool = false, back: String? = nil) -> some View {
        modifier(EvidencePageChrome(trailTitle: trailTitle, centeredTitle: centeredTitle, arrowBack: arrowBack, backOverride: back))
    }
}

extension ToolbarContent {
    /// Locked back labels are plain text on the flat bar, not Liquid Glass.
    @ToolbarContentBuilder
    func evidenceFlatToolbarItem() -> some ToolbarContent {
        if #available(iOS 26.0, *) {
            sharedBackgroundVisibility(.hidden)
        } else {
            self
        }
    }
}

/// The scrolling page body with the harness's `.scroll` padding.
struct EvidenceScrollPage<Content: View>: View {
    @Environment(\.evidenceFamily) private var family
    var spacing: CGFloat = 16
    /// `.scroll` top inset in px (Training 10; daily 16, `.tight` 10).
    var top: CGFloat?
    @ViewBuilder var content: Content

    var body: some View {
        let m = EvidenceMetrics(family: family)
        ScrollView {
            VStack(alignment: .leading, spacing: m.pt(spacing)) {
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, m.pt(16))
            .padding(.top, m.pt(top ?? (family == .training ? 10 : 16)))
            .padding(.bottom, m.pt(30))
        }
        .physiqueOSScrollBottomClearance()
        .defaultScrollAnchor(Self.reviewScrollAnchor)
    }

    private static var reviewScrollAnchor: UnitPoint? {
#if DEBUG
        EvidenceRedesignReview.scrollsToBottom ? .bottom : nil
#else
        nil
#endif
    }
}

// MARK: - Header

/// `.header`: optional 40 px mark, eyebrow, title, subtitle, breadcrumbs.
struct EvidencePageHeader: View {
    @Environment(\.evidenceFamily) private var family
    var symbol: String?
    let eyebrow: String
    let title: String
    var subtitle: String?
    var crumbs: [String] = []
    var dateTitle = false

    var body: some View {
        let m = EvidenceMetrics(family: family)
        let t = family == .training
        HStack(alignment: .top, spacing: m.pt(12)) {
            if let symbol {
                Text(symbol)
                    .evidenceText(.normal(19, 800))
                    .foregroundStyle(m.c.accent)
                    .frame(width: m.pt(40), height: m.pt(40))
                    .background(m.c.accentSoft, in: Circle())
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 0) {
                // Literal uppercase (not `textCase`): the shipping accessibility
                // label is the uppercase string, which journeys key on.
                Text(eyebrow.uppercased())
                    .evidenceText(t ? EvidenceTextStyle(size: 9, weight: 850, lineHeight: 10.8, tracking: 1.26, uppercase: true)
                                    : .normal(9, 900, tracking: 1.44, uppercase: true))
                    .foregroundStyle(m.c.accent)
                Text(title)
                    .evidenceText(titleStyle)
                    .foregroundStyle(m.c.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, m.pt(dateTitle ? 4 : 3))
                    .accessibilityAddTraits(.isHeader)
                if let subtitle {
                    Text(subtitle)
                        .evidenceText(t ? EvidenceTextStyle(size: 12, weight: 400, lineHeight: 17.04)
                                        : EvidenceTextStyle(size: 11, weight: 600, lineHeight: 15.62))
                        .foregroundStyle(m.c.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, m.pt(t ? 4 : 5))
                }
                if !crumbs.isEmpty {
                    HStack(spacing: m.pt(6)) {
                        ForEach(crumbs, id: \.self) { crumb in
                            Text(crumb)
                                .evidenceText(.normal(10, 700))
                                .foregroundStyle(m.c.muted)
                                .padding(.horizontal, m.pt(9 + 1))
                                .padding(.vertical, m.pt(7 + 1))
                                .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(9)))
                                .overlay(RoundedRectangle(cornerRadius: m.pt(9)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
                        }
                    }
                    .padding(.top, m.pt(8))
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(crumbs.joined(separator: ", "))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.top, m.pt(t ? 4 : 0))
        .padding(.bottom, m.pt(t ? 2 : (dateTitle ? 0 : 2)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("evidence.page.header")
    }

    private var titleStyle: EvidenceTextStyle {
        switch family {
        case .training: EvidenceTextStyle(size: 25, weight: 820, lineHeight: 27, tracking: -0.875)
        default:
            dateTitle ? EvidenceTextStyle(size: 24, weight: 820, lineHeight: 25.44, tracking: -0.72)
                      : EvidenceTextStyle(size: 26, weight: 820, lineHeight: 27.04, tracking: -0.91)
        }
    }
}

// MARK: - Scope

/// `TrainingTimelineSelector` in each family's locked treatment: Training
/// wraps it in a VIEWING card; Nutrition/Activity show bordered pills.
struct EvidenceScopePicker: View {
    @Environment(\.evidenceFamily) private var family
    let scope: TrainingScopeContext
    var onSelect: ((String) -> Void)?

    var body: some View {
        let m = EvidenceMetrics(family: family)
        if family == .record {
            // `.scope`: "Viewing Goal" and flat 9-px-radius pills; the
            // selected pill is `surface2` with an inset 34% accent ring.
            VStack(alignment: .leading, spacing: 0) {
                Text("VIEWING GOAL")
                    .evidenceText(.normal(9, 800, jakarta: false, tracking: 0.72, uppercase: true))
                    .foregroundStyle(m.c.quiet)
                    .padding(.bottom, m.pt(7))
                VStack(alignment: .leading, spacing: m.pt(5)) {
                    HStack(spacing: m.pt(5)) { ForEach(scope.options) { pill($0, m) } }
                    if !scope.phaseOptions.isEmpty {
                        HStack(spacing: m.pt(5)) { ForEach(scope.phaseOptions) { pill($0, m) } }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, m.pt(17))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("evidence.scope")
        } else if family == .training {
            VStack(alignment: .leading, spacing: 0) {
                Text("Viewing")
                    .evidenceText(.normal(9, 800, tracking: 1.08, uppercase: true))
                    .foregroundStyle(m.c.quiet)
                    .padding(.bottom, m.pt(7))
                pillRows(m)
                Text(scope.dateRangeLabel)
                    .evidenceText(.normal(10, 400))
                    .foregroundStyle(m.c.quiet)
                    .padding(.top, m.pt(7))
            }
            .padding(m.pt(11 + 1))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(m.c.surface, in: RoundedRectangle(cornerRadius: m.pt(14)))
            .overlay(RoundedRectangle(cornerRadius: m.pt(14)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("evidence.scope")
        } else {
            VStack(alignment: .leading, spacing: 0) {
                pillRows(m)
                Text(scope.dateRangeLabel)
                    .evidenceText(.normal(9, 650, jakarta: family.usesJakarta))
                    .foregroundStyle(m.c.quiet)
                    .padding(.top, m.pt(7))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, m.pt(2))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("evidence.scope")
        }
    }

    private func pillRows(_ m: EvidenceMetrics) -> some View {
        VStack(alignment: .leading, spacing: m.pt(6)) {
            HStack(spacing: m.pt(family == .training ? 5 : 6)) {
                ForEach(scope.options) { pill($0, m) }
            }
            if !scope.phaseOptions.isEmpty {
                HStack(spacing: m.pt(family == .training ? 5 : 6)) {
                    ForEach(scope.phaseOptions) { pill($0, m) }
                }
            }
        }
    }

    @ViewBuilder
    private func pill(_ option: TrainingScopeOption, _ m: EvidenceMetrics) -> some View {
        let t = family == .training
        let label = family == .record ? AnyView(recordPill(option, m)) : AnyView(Text(option.label)
            .evidenceText(EvidenceTextStyle(size: 9, weight: t ? 750 : 800, lineHeight: 9))
            .foregroundStyle(option.selected ? m.c.page : m.c.muted)
            .padding(.horizontal, m.pt(9 + (t ? 0 : 1)))
            .padding(.vertical, m.pt(7 + (t ? 0 : 1)))
            .background(option.selected ? m.c.ink : (t ? m.c.surface2 : .clear), in: Capsule())
            .overlay {
                if !t { Capsule().strokeBorder(option.selected ? m.c.ink : m.c.line, lineWidth: m.pt(1)) }
            }
            .evidenceHitTarget(visualHeight: m.pt(23)))
        if let onSelect {
            Button { onSelect(option.id) } label: { label }
                .buttonStyle(.plain)
                .accessibilityAddTraits(option.selected ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("evidence.scope.\(option.id)")
        } else {
            label.accessibilityAddTraits(option.selected ? .isSelected : [])
        }
    }

    private func recordPill(_ option: TrainingScopeOption, _ m: EvidenceMetrics) -> some View {
        Text(option.label)
            .evidenceText(.normal(9, 780, jakarta: false))
            .foregroundStyle(option.selected ? m.c.accent : m.c.quiet)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, m.pt(8))
            .padding(.vertical, m.pt(7))
            .background(option.selected ? m.c.surface2 : m.c.surface, in: RoundedRectangle(cornerRadius: m.pt(9)))
            .overlay {
                if option.selected {
                    RoundedRectangle(cornerRadius: m.pt(9)).strokeBorder(m.c.accent.opacity(0.34), lineWidth: m.pt(1))
                }
            }
            .evidenceHitTarget(visualHeight: m.pt(25))
    }
}

// MARK: - Sections

enum EvidenceSectionStyle {
    /// `.section` — bordered surface card, 13 px inset.
    case contained
    /// `.section.open` — no container.
    case open
    /// `.section.analytical` — teal-tinted field.
    case analytical
    /// Nutrition/Activity `.section.contained` (`--surface-3`).
    case containedDeep
}

struct EvidenceSection<Trailing: View, Content: View>: View {
    @Environment(\.evidenceFamily) private var family
    var title: String?
    var style: EvidenceSectionStyle = .contained
    var identifier: String?
    @ViewBuilder var trailing: Trailing
    @ViewBuilder var content: Content

    var body: some View {
        let m = EvidenceMetrics(family: family)
        VStack(alignment: .leading, spacing: 0) {
            if let title {
                HStack(alignment: family == .training ? .center : .firstTextBaseline, spacing: m.pt(10)) {
                    Text(title)
                        .evidenceText(family == .training ? .normal(14, 800, tracking: -0.14) : .normal(12, 850, tracking: -0.12))
                        .foregroundStyle(m.c.ink)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    trailing
                }
                .padding(.bottom, m.pt(9))
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(EvidenceSectionContainer(style: style))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier ?? "evidence.section")
    }
}

extension EvidenceSection where Trailing == EmptyView {
    init(title: String? = nil, style: EvidenceSectionStyle = .contained, identifier: String? = nil, @ViewBuilder content: () -> Content) {
        self.init(title: title, style: style, identifier: identifier, trailing: { EmptyView() }, content: content)
    }
}

private struct EvidenceSectionContainer: ViewModifier {
    @Environment(\.evidenceFamily) private var family
    let style: EvidenceSectionStyle

    func body(content: Content) -> some View {
        let m = EvidenceMetrics(family: family)
        switch style {
        case .open:
            content
        case .contained, .containedDeep:
            content
                .padding(m.pt(13 + 1))
                .background(style == .containedDeep ? m.c.surface3 : m.c.surface, in: RoundedRectangle(cornerRadius: m.pt(16)))
                .overlay(RoundedRectangle(cornerRadius: m.pt(16)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
        case .analytical:
            content
                .padding(m.pt(13 + 1))
                .background(m.c.tealSoft, in: RoundedRectangle(cornerRadius: m.pt(16)))
                .overlay(RoundedRectangle(cornerRadius: m.pt(16)).strokeBorder(m.c.teal.opacity(0.32), lineWidth: m.pt(1)))
        }
    }
}

/// `.section-action` (`Show All >`, `Browse >`, `View all →`).
struct EvidenceSectionAction: View {
    @Environment(\.evidenceFamily) private var family
    let label: String

    var body: some View {
        let m = EvidenceMetrics(family: family)
        Text(label)
            .evidenceText(family == .training ? .normal(10, 800) : .normal(9, 800))
            .foregroundStyle(m.c.accent)
            .evidenceHitTarget(visualHeight: m.pt(12))
    }
}

/// `.small-note` beside a section title (`2 sessions`, `read-only history`).
struct EvidenceSmallNote: View {
    @Environment(\.evidenceFamily) private var family
    let text: String

    var body: some View {
        let m = EvidenceMetrics(family: family)
        Text(text)
            .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 13.05))
            .foregroundStyle(m.c.quiet)
    }
}

// MARK: - Rows

enum EvidenceRailTone {
    case strength, cardio, walking, cooldown, neutral

    func color(_ c: EvidencePalette, family: EvidenceFamily) -> Color {
        switch self {
        case .strength: c.purple
        case .cardio, .walking: family == .training ? c.teal : c.green
        case .cooldown, .neutral: family == .training ? c.quiet : c.muted
        }
    }
}

/// Training `.row.rail`: a 3 px tone stripe, uppercase type, label, detail,
/// optional value and the accent chevron. Divider drawn by the list.
struct EvidenceRailRow: View {
    @Environment(\.evidenceFamily) private var family
    var type: String?
    let label: String
    var detail: String?
    var value: String?
    var tone: EvidenceRailTone = .strength
    var showsChevron = true

    var body: some View {
        let m = EvidenceMetrics(family: family)
        let toneColor = tone.color(m.c, family: family)
        HStack(spacing: m.pt(10)) {
            VStack(alignment: .leading, spacing: 0) {
                if let type {
                    Text(type)
                        .evidenceText(.normal(8, 850, tracking: 0.8, uppercase: true))
                        .foregroundStyle(tone == .strength ? m.c.purple : (tone == .cooldown || tone == .neutral ? m.c.quiet : m.c.teal))
                        .padding(.bottom, m.pt(3))
                }
                Text(label)
                    .evidenceText(EvidenceTextStyle(size: 12, weight: 760, lineHeight: 15.84))
                    .foregroundStyle(m.c.ink)
                if let detail, !detail.isEmpty {
                    Text(detail)
                        .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                        .foregroundStyle(m.c.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, m.pt(2))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let value {
                Text(value)
                    .evidenceText(.normal(11, 760))
                    .foregroundStyle(m.c.ink)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: m.pt(100), alignment: .trailing)
            }
            if showsChevron {
                Text("›")
                    .evidenceText(EvidenceTextStyle(size: 17, weight: 400, lineHeight: 17))
                    .foregroundStyle(m.c.purple)
            }
        }
        .padding(.leading, m.pt(11))
        .padding(.trailing, m.pt(5))
        .padding(.vertical, m.pt(9))
        .frame(minHeight: m.pt(48))
        .background(alignment: .leading) {
            RoundedRectangle(cornerRadius: m.pt(3))
                .fill(toneColor)
                .frame(width: m.pt(3))
                .padding(.vertical, m.pt(10))
        }
        .contentShape(Rectangle())
    }
}

/// Training `.row` without a rail: label + detail + chevron link row.
struct EvidenceLinkRow: View {
    @Environment(\.evidenceFamily) private var family
    let label: String
    var detail: String?
    var showsChevron = true

    var body: some View {
        let m = EvidenceMetrics(family: family)
        HStack(spacing: m.pt(10)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .evidenceText(EvidenceTextStyle(size: 12, weight: 760, lineHeight: 15.84))
                    .foregroundStyle(m.c.ink)
                if let detail, !detail.isEmpty {
                    Text(detail)
                        .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14))
                        .foregroundStyle(m.c.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, m.pt(2))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if showsChevron {
                Text("›")
                    .evidenceText(EvidenceTextStyle(size: 17, weight: 400, lineHeight: 17))
                    .foregroundStyle(m.c.purple)
            }
        }
        .padding(.horizontal, m.pt(5))
        .padding(.vertical, m.pt(9))
        .frame(minHeight: m.pt(48))
        .contentShape(Rectangle())
    }
}

/// Stacks rows with the harness's `.row + .row` 1 px top rule.
struct EvidenceDividedList<Data: RandomAccessCollection, Row: View>: View where Data.Element: Identifiable {
    @Environment(\.evidenceFamily) private var family
    let data: Data
    @ViewBuilder var row: (Data.Element) -> Row

    var body: some View {
        let m = EvidenceMetrics(family: family)
        VStack(spacing: 0) {
            ForEach(Array(data.enumerated()), id: \.element.id) { index, element in
                row(element)
                    .overlay(alignment: .top) {
                        if index > 0 { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
                    }
            }
        }
    }
}

// MARK: - Fields

/// `.disclosure`: surface-2 field, 11 px radius, 10 px inset.
struct EvidenceField<Content: View>: View {
    @Environment(\.evidenceFamily) private var family
    @ViewBuilder var content: Content

    var body: some View {
        let m = EvidenceMetrics(family: family)
        content
            .padding(m.pt(10))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(11)))
    }
}

/// `.metric-grid` / `.metric`.
struct EvidenceMetricGrid: View {
    @Environment(\.evidenceFamily) private var family
    struct Item: Identifiable {
        var id: String { label }
        let label: String
        let value: String
        var valueColor: Color?
    }

    let items: [Item]
    var columns = 3

    var body: some View {
        let m = EvidenceMetrics(family: family)
        let grid = Array(repeating: GridItem(.flexible(), spacing: m.pt(7), alignment: .top), count: columns)
        LazyVGrid(columns: grid, alignment: .leading, spacing: m.pt(7)) {
            ForEach(items) { item in
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.label)
                        .evidenceText(EvidenceTextStyle(size: 8, weight: 800, lineHeight: 10, tracking: 0.64, uppercase: true))
                        .foregroundStyle(m.c.quiet)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(item.value)
                        .evidenceText(EvidenceTextStyle(size: 14, weight: 820, lineHeight: 16.8, tracking: -0.28))
                        .foregroundStyle(item.valueColor ?? m.c.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, m.pt(4))
                }
                .padding(m.pt(9))
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(10)))
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// `.definition`: key/value rows with 1 px rules (none under the last).
struct EvidenceDefinitionList: View {
    @Environment(\.evidenceFamily) private var family
    let rows: [(key: String, value: String)]

    var body: some View {
        let m = EvidenceMetrics(family: family)
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                HStack(alignment: .top, spacing: m.pt(10)) {
                    Text(row.key)
                        .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 13.5))
                        .foregroundStyle(m.c.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(row.value)
                        .evidenceText(EvidenceTextStyle(size: 10, weight: 750, lineHeight: 13.5))
                        .foregroundStyle(m.c.ink)
                        .multilineTextAlignment(.trailing)
                }
                .padding(.vertical, m.pt(8))
                .padding(.horizontal, m.pt(1))
                .overlay(alignment: .bottom) {
                    if index < rows.count - 1 { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// `.provenance`: teal-tinted source field with a 3 px left rule.
struct EvidenceProvenance: View {
    @Environment(\.evidenceFamily) private var family
    let title: String
    var detail: String?
    var tint: Color?

    var body: some View {
        let m = EvidenceMetrics(family: family)
        let color = tint ?? m.c.teal
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .evidenceText(.normal(11, 800))
                .foregroundStyle(m.c.ink)
            if let detail {
                Text(detail)
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6))
                    .foregroundStyle(m.c.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, m.pt(2))
            }
        }
        .padding(.vertical, m.pt(10))
        .padding(.leading, m.pt(11) + m.pt(3))
        .padding(.trailing, m.pt(11))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: m.pt(11)))
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(topLeadingRadius: m.pt(11), bottomLeadingRadius: m.pt(11))
                .fill(color)
                .frame(width: m.pt(3))
        }
        .accessibilityElement(children: .combine)
    }
}

/// `.comparison` (green) and its amber/neutral counterparts.
struct EvidenceCallout: View {
    @Environment(\.evidenceFamily) private var family
    enum Tone { case success, stable, warning, neutral }
    let text: String
    var tone: Tone = .success

    var body: some View {
        let m = EvidenceMetrics(family: family)
        let color: Color = switch tone {
        case .success: m.c.green
        case .stable: m.c.teal
        case .warning: m.c.amber
        case .neutral: m.c.muted
        }
        Text(text)
            .evidenceText(EvidenceTextStyle(size: 10, weight: 720, lineHeight: 14))
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, m.pt(9))
            .padding(.horizontal, m.pt(10))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tone == .neutral ? m.c.surface2 : color.opacity(0.12), in: RoundedRectangle(cornerRadius: m.pt(10)))
    }
}

// MARK: - Set table

/// `.set-row` grid: 34 px label column, then two right-aligned columns.
struct EvidenceSetRow: View {
    @Environment(\.evidenceFamily) private var family
    let first: String
    let second: String
    let third: String
    var isHeader = false

    var body: some View {
        let m = EvidenceMetrics(family: family)
        let style: EvidenceTextStyle = isHeader
            ? .normal(8, 400, tracking: 0.72, uppercase: true)
            : .normal(10, 400)
        HStack(spacing: m.pt(8)) {
            Text(first)
                .evidenceText(style)
                .foregroundStyle(isHeader ? m.c.quiet : m.c.muted)
                .frame(width: m.pt(34), alignment: .leading)
            Text(second)
                .evidenceText(isHeader ? style : .normal(10, 680))
                .foregroundStyle(isHeader ? m.c.quiet : m.c.ink)
                .frame(maxWidth: .infinity, alignment: .trailing)
            Text(third)
                .evidenceText(isHeader ? style : .normal(10, 680))
                .foregroundStyle(isHeader ? m.c.quiet : m.c.ink)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .frame(minHeight: m.pt(28))
        .overlay(alignment: .bottom) {
            if isHeader { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
        }
        .accessibilityElement(children: .combine)
    }
}

/// `.superset`: purple relationship field with a 3 px rail.
struct EvidenceRelationshipGroup<Content: View>: View {
    @Environment(\.evidenceFamily) private var family
    let label: String
    @ViewBuilder var content: Content

    var body: some View {
        let m = EvidenceMetrics(family: family)
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .evidenceText(.normal(8, 850, tracking: 0.96, uppercase: true))
                .foregroundStyle(m.c.purple)
                .padding(.bottom, m.pt(4))
            content
        }
        .padding(.vertical, m.pt(10))
        .padding(.leading, m.pt(10) + m.pt(3))
        .padding(.trailing, m.pt(10))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(m.c.purpleSoft, in: RoundedRectangle(cornerRadius: m.pt(12)))
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(topLeadingRadius: m.pt(12), bottomLeadingRadius: m.pt(12))
                .fill(m.c.purple)
                .frame(width: m.pt(3))
        }
        .padding(.top, m.pt(3))
    }
}

// MARK: - States

/// `.state` / `.state-panel`: centered loading, empty and failure fields.
struct EvidenceStatePanel: View {
    @Environment(\.evidenceFamily) private var family
    enum Kind {
        case loading(String)
        case empty(String, String?)
        case failure(String, String?)
    }

    let kind: Kind
    let identifier: String

    var body: some View {
        let m = EvidenceMetrics(family: family)
        let t = family == .training
        VStack(spacing: 0) {
            switch kind {
            case .loading(let title):
                EvidenceKitSpinner()
                    .padding(.bottom, m.pt(8))
                Text(title)
                    .evidenceText(.normal(11, t ? 800 : 840))
                    .foregroundStyle(m.c.ink)
            case .empty(let title, let detail):
                if !t {
                    Text("◯")
                        .evidenceText(.normal(20, 400))
                        .foregroundStyle(m.c.teal)
                        .padding(.bottom, m.pt(7))
                        .accessibilityHidden(true)
                }
                Text(title)
                    .evidenceText(.normal(11, t ? 800 : 840))
                    .foregroundStyle(m.c.ink)
                detailText(detail, m)
            case .failure(let title, let detail):
                if !t {
                    Text("!")
                        .evidenceText(.normal(20, 400))
                        .foregroundStyle(m.c.teal)
                        .padding(.bottom, m.pt(7))
                        .accessibilityHidden(true)
                }
                Text(title)
                    .evidenceText(.normal(11, t ? 800 : 840))
                    .foregroundStyle(t ? m.c.red : m.c.ink)
                detailText(detail, m)
            }
        }
        .multilineTextAlignment(.center)
        .padding(m.pt((t ? 14 : 18) + 1))
        .frame(maxWidth: .infinity, minHeight: m.pt(t ? 118 : 126))
        .background(t ? m.c.surface : m.c.surface3, in: RoundedRectangle(cornerRadius: m.pt(t ? 14 : 15)))
        .overlay(RoundedRectangle(cornerRadius: m.pt(t ? 14 : 15)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }

    @ViewBuilder
    private func detailText(_ detail: String?, _ m: EvidenceMetrics) -> some View {
        if let detail {
            Text(detail)
                .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6))
                .foregroundStyle(m.c.muted)
                .padding(.top, m.pt(family == .training ? 3 : 4))
        }
    }
}

private struct EvidenceKitSpinner: View {
    @Environment(\.evidenceFamily) private var family
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spinning = false

    var body: some View {
        let m = EvidenceMetrics(family: family)
        let t = family == .training
        let width = m.pt(t ? 2 : 3)
        ZStack {
            Circle().stroke(m.c.line, lineWidth: width)
            Circle().trim(from: 0, to: 0.25).stroke(m.c.accent, lineWidth: width).rotationEffect(.degrees(-135))
        }
        .padding(width / 2)
        .frame(width: m.pt(t ? 20 : 25), height: m.pt(t ? 20 : 25))
        .rotationEffect(.degrees(spinning ? 360 : 0))
        .animation(reduceMotion ? nil : .linear(duration: 0.9).repeatForever(autoreverses: false), value: spinning)
        .onAppear { spinning = true }
        .accessibilityHidden(true)
    }
}

/// `.placeholder` — a stable informational destination (Foundation).
struct EvidencePlaceholder: View {
    @Environment(\.evidenceFamily) private var family
    let title: String
    let detail: String

    var body: some View {
        let m = EvidenceMetrics(family: family)
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .evidenceText(.normal(14, 700))
                .foregroundStyle(m.c.ink)
                .padding(.bottom, m.pt(7))
            Text(detail)
                .evidenceText(EvidenceTextStyle(size: 10, weight: 400, lineHeight: 15.5))
                .foregroundStyle(m.c.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, m.pt(18 + 1))
        .padding(.horizontal, m.pt(13 + 1))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(m.c.surface, in: RoundedRectangle(cornerRadius: m.pt(14)))
        .overlay(RoundedRectangle(cornerRadius: m.pt(14)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Nutrition / Activity ("daily") components

/// Daily `.metric-grid` / `.metric`: two columns, 8 px uppercase label over
/// a 12 px tabular value; optional teal accent fill and semantic value ink.
struct EvidenceDailyMetricGrid: View {
    @Environment(\.evidenceFamily) private var family
    struct Item: Identifiable {
        var id: String { label }
        let label: String
        let value: String
        var valueColor: Color?
        var accent = false
    }

    let items: [Item]

    var body: some View {
        let m = EvidenceMetrics(family: family)
        LazyVGrid(columns: [GridItem(.flexible(), spacing: m.pt(7), alignment: .top), GridItem(.flexible(), spacing: m.pt(7), alignment: .top)], alignment: .leading, spacing: m.pt(7)) {
            ForEach(items) { item in
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.label)
                        .evidenceText(EvidenceTextStyle(size: 8, weight: 900, lineHeight: 9.6, tracking: 0.8, uppercase: true))
                        .foregroundStyle(m.c.quiet)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(item.value)
                        .evidenceText(.normal(12, 850, digits: true))
                        .foregroundStyle(item.valueColor ?? m.c.ink)
                        .padding(.top, m.pt(4))
                }
                .padding(m.pt(9))
                .frame(maxWidth: .infinity, minHeight: m.pt(52), alignment: .topLeading)
                .background(item.accent ? m.c.tealSoft : m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(10)))
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// Daily `.area-grid` / `.area`: informational label/value tiles.
struct EvidenceDailyAreaGrid: View {
    @Environment(\.evidenceFamily) private var family
    let items: [(label: String, value: String)]

    var body: some View {
        let m = EvidenceMetrics(family: family)
        LazyVGrid(columns: [GridItem(.flexible(), spacing: m.pt(7), alignment: .top), GridItem(.flexible(), spacing: m.pt(7), alignment: .top)], alignment: .leading, spacing: m.pt(7)) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.label)
                        .evidenceText(.normal(9, 750))
                        .foregroundStyle(m.c.muted)
                        .lineLimit(1)
                    Text(item.value)
                        .evidenceText(.normal(11, 850))
                        .foregroundStyle(m.c.ink)
                        .padding(.top, m.pt(4))
                }
                .padding(m.pt(10))
                .frame(maxWidth: .infinity, minHeight: m.pt(52), alignment: .topLeading)
                .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(10)))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(item.label): \(item.value)")
            }
        }
    }
}

/// Daily `.hero-day`: the latest-day field (gradient, 1 px rule, 15 px radius).
struct EvidenceDailyHero<Content: View>: View {
    @Environment(\.evidenceFamily) private var family
    @ViewBuilder var content: Content

    var body: some View {
        let m = EvidenceMetrics(family: family)
        content
            .padding(m.pt(13 + 1))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(colors: [m.c.surface2, m.c.surface], startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: m.pt(15))
            )
            .overlay(RoundedRectangle(cornerRadius: m.pt(15)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
    }
}

/// Daily `.row` in an `.open-list`: label + copy, two-line trailing value,
/// accent chevron on the last trailing line. 1 px rule below every row.
struct EvidenceDailyRow: View {
    @Environment(\.evidenceFamily) private var family
    let label: String
    var copy: String?
    var trailing: [String] = []
    var showsChevron = true
    var railColor: Color?
    /// `.inline`: muted `›` on the last trailing line (Activity);
    /// `.stacked`: 20 px teal `›` below the value (Nutrition history);
    /// `.center`: 20 px teal `›` centered right (link rows).
    var chevron: EvidenceDailyChevron = .inline

    var body: some View {
        let m = EvidenceMetrics(family: family)
        HStack(alignment: .center, spacing: m.pt(10)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .evidenceText(.normal(11, 810))
                    .foregroundStyle(m.c.ink)
                if let copy, !copy.isEmpty {
                    Text(copy)
                        .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15))
                        .foregroundStyle(m.c.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, m.pt(2))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !trailing.isEmpty || (showsChevron && chevron == .inline) {
                VStack(alignment: .trailing, spacing: 0) {
                    ForEach(Array(trailing.enumerated()), id: \.offset) { index, line in
                        Text(index == trailing.count - 1 && showsChevron && chevron == .inline ? "\(line) ›" : line)
                            .evidenceText(.normal(10, 750, digits: true))
                            .foregroundStyle(m.c.muted)
                    }
                    if showsChevron && chevron == .stacked {
                        Text("›")
                            .evidenceText(EvidenceTextStyle(size: 20, weight: 750, lineHeight: 20))
                            .foregroundStyle(m.c.teal)
                    }
                }
                .multilineTextAlignment(.trailing)
            }
            if showsChevron && chevron == .center {
                Text("›")
                    .evidenceText(EvidenceTextStyle(size: 20, weight: 400, lineHeight: 20))
                    .foregroundStyle(m.c.teal)
            }
        }
        .padding(.vertical, m.pt(9))
        .padding(.leading, railColor == nil ? m.pt(2) : m.pt(10) + m.pt(3))
        .padding(.trailing, m.pt(2))
        .frame(minHeight: max(44, m.pt(49)))
        .overlay(alignment: .leading) {
            if let railColor { Rectangle().fill(railColor).frame(width: m.pt(3)) }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

enum EvidenceDailyChevron { case inline, stacked, center }

/// Daily `.open-list`: 1 px rule above the list and below every row.
struct EvidenceDailyOpenList<Data: RandomAccessCollection, Row: View>: View where Data.Element: Identifiable {
    @Environment(\.evidenceFamily) private var family
    let data: Data
    @ViewBuilder var row: (Data.Element) -> Row

    var body: some View {
        let m = EvidenceMetrics(family: family)
        VStack(spacing: 0) {
            ForEach(data) { element in
                row(element)
                    .padding(.bottom, m.pt(1))
                    .overlay(alignment: .bottom) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
            }
        }
        .padding(.top, m.pt(1))
        .overlay(alignment: .top) { Rectangle().fill(m.c.line).frame(height: m.pt(1)) }
    }
}

/// Daily `.provenance`: teal dot + bold source + copy on a teal tint.
struct EvidenceDailyProvenance: View {
    @Environment(\.evidenceFamily) private var family
    let title: String
    var detail: String?

    var body: some View {
        let m = EvidenceMetrics(family: family)
        HStack(alignment: .top, spacing: m.pt(8)) {
            Circle().fill(m.c.teal).frame(width: m.pt(7), height: m.pt(7)).padding(.top, m.pt(3)).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .evidenceText(EvidenceTextStyle(size: 9, weight: 700, lineHeight: 12.42))
                    .foregroundStyle(m.c.ink)
                if let detail {
                    Text(detail)
                        .evidenceText(EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.42))
                        .foregroundStyle(m.c.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, m.pt(9))
        .padding(.horizontal, m.pt(10))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(m.c.tealSoft, in: RoundedRectangle(cornerRadius: m.pt(10)))
        .accessibilityElement(children: .combine)
    }
}

/// Daily `.warning`: amber note (non-color cue: the leading glyph).
struct EvidenceDailyWarning: View {
    @Environment(\.evidenceFamily) private var family
    let text: String
    var provisional = false

    var body: some View {
        let m = EvidenceMetrics(family: family)
        HStack(alignment: .top, spacing: m.pt(8)) {
            Text(provisional ? "◷" : "!")
                .evidenceText(EvidenceTextStyle(size: 9, weight: 700, lineHeight: 12.78))
                .accessibilityHidden(true)
            Text(text)
                .evidenceText(EvidenceTextStyle(size: 9, weight: 700, lineHeight: 12.78))
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .foregroundStyle(provisional ? m.c.muted : m.c.amber)
        .padding(m.pt(10))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(provisional ? m.c.surface2 : m.c.amberSoft, in: RoundedRectangle(cornerRadius: m.pt(11)))
        .accessibilityElement(children: .combine)
    }
}

/// Daily section title + optional action (`Show All >`), 9 px gap.
struct EvidenceDailySectionHead<Trailing: View>: View {
    @Environment(\.evidenceFamily) private var family
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        let m = EvidenceMetrics(family: family)
        HStack(alignment: .firstTextBaseline, spacing: m.pt(10)) {
            Text(title)
                .evidenceText(.normal(12, 850, tracking: -0.12))
                .foregroundStyle(m.c.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            trailing
        }
        .padding(.bottom, m.pt(9))
    }
}

// MARK: - Scroll-friendly chart scrub

/// Evidence B/C chart selection that never captures a page scroll: a tap
/// selects the nearest observation and a horizontal pan scrubs, while a
/// vertical swipe that begins on the chart fails the pan and scrolls the
/// page (SwiftUI drag/long-press recognizers block the ScrollView here).
/// Selection resolution is the caller's existing nearest-point helper.
private struct EvidenceChartScrubOverlay: ViewModifier {
    let onScrub: (CGPoint, ChartProxy, GeometryProxy) -> Void

    func body(content: Content) -> some View {
        content.chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .onTapGesture(coordinateSpace: .local) { location in onScrub(location, proxy, geometry) }
                    .gesture(EvidenceHorizontalScrubGesture { location in onScrub(location, proxy, geometry) })
            }
        }
    }
}

extension View {
    func evidenceChartScrub(onScrub: @escaping (CGPoint, ChartProxy, GeometryProxy) -> Void) -> some View {
        modifier(EvidenceChartScrubOverlay(onScrub: onScrub))
    }
}

/// A UIKit pan that only begins when the motion is predominantly
/// horizontal (the shared 1.35 directional bias), so vertical swipes fall
/// through to the enclosing ScrollView.
private struct EvidenceHorizontalScrubGesture: UIGestureRecognizerRepresentable {
    let onChanged: (CGPoint) -> Void

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let recognizer = UIPanGestureRecognizer()
        recognizer.delegate = context.coordinator
        return recognizer
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        guard recognizer.state == .began || recognizer.state == .changed else { return }
        onChanged(context.converter.localLocation)
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return true }
            let velocity = pan.velocity(in: pan.view)
            return abs(velocity.x) >= abs(velocity.y) * ChartGestureArbitration.directionalBias
        }
    }
}
