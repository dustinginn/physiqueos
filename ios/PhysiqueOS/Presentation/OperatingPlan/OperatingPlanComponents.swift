import SwiftUI

/// Presentation-only formatting shared by canonical and sandbox models.
/// This owns no schedules, membership, fixtures, or domain mutations.
enum OperatingPlanSchedulePresentation {
    static func formatSupportSchedule(_ model: OperatingPlanSupportScheduleReadModel) -> String {
        let cadence: String
        switch model.frequency {
        case .daily: cadence = "Daily"
        case .weekly: cadence = model.daysOfWeek.first.map { "\($0.label)s" } ?? "Weekly"
        case .specificDays: cadence = model.daysOfWeek.map(\.shortLabel).joined(separator: ", ")
        case .everyXDays: cadence = model.intervalDays == 2 ? "Every other day" : "Every \(model.intervalDays) days"
        }
        let time = model.timing == .specific ? formattedLocalTime(model.specificTime) : model.timing.label
        return [cadence, time].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    static func formattedLocalTime(_ value: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        guard let date = formatter.date(from: value) else { return value }
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }
}

/// Shared visual vocabulary for the Operating Plan vertical. Unlike Goals'
/// gradient "atmospheric" cards, the web Operating Plan screens
/// (`OperatingPlanScreen.jsx`, `ProtocolDetailScreen.jsx`,
/// `StrategyDomainScreen.jsx`) are built entirely from the plain
/// `Card.jsx` + `IconBadge.jsx` primitives — densely stacked rows, not
/// hero cards — so this file composes the existing shared `CardContainer`/
/// `IconBadge`/`SectionHeading` rather than introducing a second visual
/// language.
enum OperatingPlanIcon {
    /// `OperatingPlanScreen.jsx`'s icon map (`energy→Activity,
    /// nutrition→Salad, training→Dumbbell, recovery→Activity,
    /// peptide→Syringe, supplement→Dumbbell, tracking→Scale,
    /// coaching→MessageCircle`), translated to the closest SF Symbol per
    /// key — semantic equivalents, not a pixel copy of the lucide-react set.
    static func systemImage(for key: String) -> String {
        switch key {
        case "energy": "waveform.path.ecg"
        case "nutrition": "carrot.fill"
        case "training": "dumbbell.fill"
        case "recovery": "waveform.path.ecg"
        case "peptide": "syringe.fill"
        case "supplement": "dumbbell.fill"
        case "tracking": "scalemass.fill"
        case "coaching": "bubble.left.and.text.bubble.right.fill"
        default: "circle.grid.2x2.fill"
        }
    }
}

/// Mirrors `SectionTitle.jsx` + a card list — the recurring Operating Plan
/// section shape (eyebrow-style label, optional trailing action, stacked
/// rows underneath).
struct OperatingPlanSection<Content: View, Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing
    @ViewBuilder var content: Content

    init(_ title: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }, @ViewBuilder content: () -> Content) {
        self.title = title
        self.trailing = trailing()
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeading(title) { trailing }
            content
        }
    }
}

/// A single landing/domain-roll-up row: icon, title/detail, optional
/// trailing status pill or chevron. Hugs its content — no extra vertical
/// padding beyond the shared `CardContainer` scale, matching the web's
/// compact row density.
struct OperatingPlanRow: View {
    let iconKey: String
    let color: HomeColorToken
    let title: String
    let detail: String
    var status: String? = nil
    var isInteractive: Bool = true

    var body: some View {
        CardContainer(padding: .sm) {
            HStack(spacing: 10) {
                IconBadge(systemImage: OperatingPlanIcon.systemImage(for: iconKey), color: color, size: .sm, isCircular: true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(detail)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                Spacer(minLength: 6)
                if let status {
                    StatusChip(text: status, color: .muted)
                } else if isInteractive {
                    Image(systemName: "chevron.right")
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
    }
}

/// Mirrors `composeOperatingPlanStrategyDetail`'s `field(label, value)`
/// rows — a plain label/value pair, not a card.
///
/// At accessibility Dynamic Type sizes the fixed 132pt label column would
/// wrap both sides into a narrow stack, so the label moves above the value
/// (layout only; the type and colours are unchanged). VoiceOver reads the
/// pair as one element.
struct OperatingPlanFieldRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let label: String
    let value: String

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 2) {
                    labelText
                    valueText
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(alignment: .top) {
                    labelText
                        .frame(width: 132, alignment: .leading)
                    valueText
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var labelText: some View {
        Text(label)
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            .foregroundStyle(PhysiqueOSTheme.textMuted)
    }

    private var valueText: some View {
        Text(value)
            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
            .foregroundStyle(PhysiqueOSTheme.textPrimary)
    }
}

struct OperatingPlanScreenHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(eyebrow)
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(subtitle)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Shared "this isn't available" state — mirrors `GoalUnavailableView`'s
/// role for the Goals vertical, kept as its own Operating-Plan-local type
/// so this vertical stays self-contained rather than importing Goals.
struct OperatingPlanUnavailableView: View {
    let message: String

    var body: some View {
        Text(message)
            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .frame(maxWidth: .infinity, minHeight: 240)
    }
}

/// A field-level editor error banner, matching the web's inline error copy
/// style used across the strategy/execution save actions.
struct OperatingPlanEditorErrorBanner: View {
    let message: String

    var body: some View {
        Text(message)
            .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
            .foregroundStyle(PhysiqueOSTheme.destructive)
    }
}

/// A single selectable pill, used for enum-valued pickers (progression
/// pace, dosing pattern, carbohydrate/fat approach) so every editor shares
/// one toggle control instead of five ad hoc ones.
struct OperatingPlanChoicePill: View {
    let title: String
    let isSelected: Bool
    /// The minimum hit height. Build 91: every pill is at least 44 pt (the
    /// audit's sub-44 pt choice targets); callers may ask for more.
    var minHeight: CGFloat? = nil
    let action: () -> Void

    init(title: String, isSelected: Bool, minHeight: CGFloat? = nil, action: @escaping () -> Void) {
        self.title = title
        self.isSelected = isSelected
        self.minHeight = minHeight
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(isSelected ? Color.white : OperatingPlanColor.ink)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .frame(minHeight: max(44, minHeight ?? 44))
                .background(isSelected ? OperatingPlanColor.navy : OperatingPlanColor.raised)
                .clipShape(Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - Build 91 Operating Plan family kit (Founder-locked Oct 4 translation)

/// The locked Operating Plan family shares the Priority Detail canvas and
/// tokens (`#06121D` / `#F0EEE6`, Founder D4: kept for Build 91 rather than
/// an app-wide token pass). Every Operating Plan page reads these roles.
enum OperatingPlanColor {
    static var canvas: Color { PhysiqueOSTheme.priorityCanvas }
    static var ink: Color { PhysiqueOSTheme.priorityInk }
    static var muted: Color { PhysiqueOSTheme.priorityMuted }
    static var rule: Color { PhysiqueOSTheme.priorityRule }
    static var surface: Color { PhysiqueOSTheme.prioritySurface }
    static var raised: Color { PhysiqueOSTheme.prioritySurfaceRaised }
    static var teal: Color { PhysiqueOSTheme.priorityTeal }
    static var green: Color { PhysiqueOSTheme.priorityGreen }
    static var amber: Color { PhysiqueOSTheme.priorityAmber }
    static var cyan: Color { PhysiqueOSTheme.priorityCyan }
    static var purple: Color { PhysiqueOSTheme.priorityPurple }
    static var red: Color { PhysiqueOSTheme.priorityRed }
    static var navy: Color { PhysiqueOSTheme.priorityNavy }
    static var fieldStart: Color { PhysiqueOSTheme.priorityEvidenceStart }
    static var fieldEnd: Color { PhysiqueOSTheme.priorityEvidenceEnd }
    static var fieldInk: Color { PhysiqueOSTheme.priorityEvidenceInk }

    static var field: LinearGradient {
        LinearGradient(colors: [fieldStart, fieldEnd], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// Domain tint by the Server's section icon key (landing, domain cards).
    static func tint(for key: String) -> Color {
        switch key {
        case "energy", "recovery", "tracking": cyan
        case "nutrition", "supplement": green
        case "training", "peptide", "coaching": purple
        default: teal
        }
    }
}

extension PhysiqueOSTypography {
    static let operatingPlanEyebrow = Style(size: 10, weight: .heavy, trackingEm: 0.13, uppercase: true)
    static let operatingPlanTitle = Style(size: 30, weight: .heavy, trackingEm: -0.033)
    static let operatingPlanSubtitle = Style(size: 14, weight: .medium)
    static let operatingPlanHeroTitle = Style(size: 26, weight: .heavy, trackingEm: -0.03)
    static let operatingPlanHeroCopy = Style(size: 13, weight: .medium)
    static let operatingPlanSectionTitle = Style(size: 16, weight: .heavy)
    static let operatingPlanCardTitle = Style(size: 16, weight: .heavy)
    static let operatingPlanCardDetail = Style(size: 12, weight: .medium)
    static let operatingPlanFieldLabel = Style(size: 10, weight: .heavy, trackingEm: 0.12, uppercase: true)
    static let operatingPlanFieldValue = Style(size: 14, weight: .bold)
    static let operatingPlanFieldDetail = Style(size: 12, weight: .medium)
    static let operatingPlanMetric = Style(size: 20, weight: .heavy, trackingEm: -0.02)
    static let operatingPlanAction = Style(size: 15, weight: .heavy)
    static let operatingPlanPill = Style(size: 11, weight: .heavy)
    static let operatingPlanBack = Style(size: 14, weight: .semibold)
    static let operatingPlanNoteTitle = Style(size: 13, weight: .heavy)
    static let operatingPlanCaption = Style(size: 11, weight: .medium)
}

// MARK: Navigation context (Native-only; no route or contract change)

/// Where an Operating Plan page was opened from, recorded by the pushing
/// page just before it navigates: the crumb title the next page shows, and
/// an optional section the next editor opens at. Keyed by the destination
/// value, so `AppDestination` and its Server contract stay unchanged.
@MainActor
enum OperatingPlanNavigationContext {
    enum EditorAnchor: String, Equatable { case dexa }

    private static var backTitles: [AppDestination: String] = [:]
    private static var anchors: [AppDestination: EditorAnchor] = [:]

    static func record(backTitle: String, for destination: AppDestination) {
        backTitles[destination] = backTitle
    }

    static func backTitle(for destination: AppDestination, default fallback: String) -> String {
        backTitles[destination] ?? fallback
    }

    static func requestAnchor(_ anchor: EditorAnchor, for destination: AppDestination) {
        anchors[destination] = anchor
    }

    /// Read once: a later plain visit to the same editor opens at the top.
    static func consumeAnchor(for destination: AppDestination) -> EditorAnchor? {
        anchors.removeValue(forKey: destination)
    }

    /// Records this page as the crumb for `destination`, then navigates.
    static func navigate(
        _ destination: AppDestination,
        from title: String,
        anchor: EditorAnchor? = nil,
        using onNavigate: (AppDestination) -> Void
    ) {
        record(backTitle: title, for: destination)
        if let anchor { requestAnchor(anchor, for: destination) }
        onNavigate(destination)
    }

#if DEBUG
    static func resetForTesting() {
        backTitles = [:]
        anchors = [:]
    }
#endif
}

// MARK: Page chrome

/// Locked chrome: the canvas, a flat "‹ Back title" crumb in place of the
/// system title (one title per page: the in-page header), and a hairline.
struct OperatingPlanPageChrome: ViewModifier {
    @Environment(\.dismiss) private var dismiss
    let backTitle: String
    var onBack: (() -> Void)?

    func body(content: Content) -> some View {
        content
            .background(OperatingPlanColor.canvas)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .restoresInteractivePopGesture()
            .toolbarBackground(OperatingPlanColor.canvas, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { if let onBack { onBack() } else { dismiss() } } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 13, weight: .bold))
                                .accessibilityHidden(true)
                            Text(backTitle)
                                .physiqueOSFont(PhysiqueOSTypography.operatingPlanBack)
                                .lineLimit(1)
                        }
                        .foregroundStyle(OperatingPlanColor.muted)
                        .fixedSize()
                        .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(backTitle)
                    .accessibilityIdentifier("operatingPlan.back")
                }
                .operatingPlanFlatToolbarItem()
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                Rectangle().fill(OperatingPlanColor.rule).frame(height: 1).accessibilityHidden(true)
            }
    }
}

extension View {
    func operatingPlanChrome(back backTitle: String, onBack: (() -> Void)? = nil) -> some View {
        modifier(OperatingPlanPageChrome(backTitle: backTitle, onBack: onBack))
    }
}

extension ToolbarContent {
    /// The crumb is plain text on the flat bar, not a Liquid Glass capsule.
    @ToolbarContentBuilder
    func operatingPlanFlatToolbarItem() -> some ToolbarContent {
        if #available(iOS 26.0, *) {
            sharedBackgroundVisibility(.hidden)
        } else {
            self
        }
    }
}

/// The scrolling page body: 18 pt gutters, 20 pt top, room at the bottom.
struct OperatingPlanScrollPage<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 18)
                .padding(.top, 20)
                .padding(.bottom, 36)
        }
        .physiqueOSScrollBottomClearance()
    }
}

// MARK: Header, status, icon

struct OperatingPlanStatusPill: View {
    enum Tone { case green, muted, amber, teal }
    let text: String
    var tone: Tone = .green

    private var color: Color {
        switch tone {
        case .green: OperatingPlanColor.green
        case .muted: OperatingPlanColor.muted
        case .amber: OperatingPlanColor.amber
        case .teal: OperatingPlanColor.teal
        }
    }

    /// Server status words: Active/Scheduled read green, Paused and
    /// Not scheduled muted, Review / Coming Soon amber.
    static func tone(for status: String) -> Tone {
        switch status.lowercased() {
        case "active", "scheduled", "on": .green
        case "paused", "not scheduled", "off", "completed": .muted
        default: .amber
        }
    }

    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 6, height: 6).accessibilityHidden(true)
            Text(text)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanPill)
                .foregroundStyle(color)
                .lineLimit(1)
        }
        .padding(.horizontal, 9)
        .frame(minHeight: 22)
        .background(color.opacity(0.12), in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

struct OperatingPlanIconTile: View {
    let systemImage: String
    var tint: Color = OperatingPlanColor.teal
    var size: CGFloat = 34

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.42, weight: .bold))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// Eyebrow (purple), one page title, optional subtitle and status pill.
struct OperatingPlanHeader: View {
    let eyebrow: String
    let title: String
    var subtitle: String? = nil
    var status: String? = nil
    var statusTone: OperatingPlanStatusPill.Tone? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 8) {
                Text(eyebrow)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanEyebrow)
                    .foregroundStyle(OperatingPlanColor.purple)
                Spacer(minLength: 8)
                if let status {
                    OperatingPlanStatusPill(text: status, tone: statusTone ?? OperatingPlanStatusPill.tone(for: status))
                }
            }
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanTitle)
                .foregroundStyle(OperatingPlanColor.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanSubtitle)
                    .foregroundStyle(OperatingPlanColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 18)
    }
}

/// The teal-to-navy strategy identity field (Goal / Started / Status).
struct OperatingPlanHeroField: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let eyebrow: String
    let title: String
    let copy: String
    var facts: [(label: String, value: String)] = []
    var status: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(eyebrow)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanEyebrow)
                .foregroundStyle(OperatingPlanColor.fieldInk.opacity(0.8))
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanHeroTitle)
                .foregroundStyle(OperatingPlanColor.fieldInk)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if !copy.isEmpty {
                Text(copy)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanHeroCopy)
                    .foregroundStyle(OperatingPlanColor.fieldInk.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !facts.isEmpty || status != nil {
                Rectangle().fill(OperatingPlanColor.fieldInk.opacity(0.2)).frame(height: 1).padding(.top, 4)
                    .accessibilityHidden(true)
                // Columns that wrap their values; stacked only at
                // accessibility text sizes.
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 10) { factViews }
                } else {
                    HStack(alignment: .top, spacing: 12) { factViews }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack(alignment: .bottomTrailing) {
                RoundedRectangle(cornerRadius: 20, style: .continuous).fill(OperatingPlanColor.field)
                Circle().stroke(OperatingPlanColor.fieldInk.opacity(0.10), lineWidth: 22)
                    .frame(width: 170, height: 170).offset(x: 60, y: 70)
                    .accessibilityHidden(true)
            }
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    @ViewBuilder private var factViews: some View {
        ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
            VStack(alignment: .leading, spacing: 3) {
                Text(fact.label)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldLabel)
                    .foregroundStyle(OperatingPlanColor.fieldInk.opacity(0.7))
                Text(fact.value)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                    .foregroundStyle(OperatingPlanColor.fieldInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
        if let status {
            VStack(alignment: .leading, spacing: 3) {
                Text("Status")
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldLabel)
                    .foregroundStyle(OperatingPlanColor.fieldInk.opacity(0.7))
                HStack(spacing: 5) {
                    Circle().fill(OperatingPlanColor.green).frame(width: 6, height: 6).accessibilityHidden(true)
                    Text(status)
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                        .foregroundStyle(OperatingPlanColor.fieldInk)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: Sections, lines, surfaces

struct OperatingPlanGroupTitle<Trailing: View>: View {
    let title: String
    var icon: String? = nil
    @ViewBuilder var trailing: Trailing

    init(_ title: String, icon: String? = nil, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.title = title
        self.icon = icon
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 8) {
            if let icon { OperatingPlanIconTile(systemImage: icon, size: 24) }
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanSectionTitle)
                .foregroundStyle(OperatingPlanColor.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            trailing
        }
        .padding(.top, 22)
        .padding(.bottom, 10)
    }
}

/// A line-based field: uppercase label column, value (+ detail), optional
/// trailing view; a hairline below. At accessibility sizes the label moves
/// above the value. VoiceOver reads it as one element.
struct OperatingPlanLine<Trailing: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let label: String
    let value: String
    var detail: String? = nil
    var valueColor: Color = OperatingPlanColor.ink
    var showsRule = true
    @ViewBuilder var trailing: Trailing

    init(_ label: String, _ value: String, detail: String? = nil, valueColor: Color = OperatingPlanColor.ink,
         showsRule: Bool = true, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.label = label
        self.value = value
        self.detail = detail
        self.valueColor = valueColor
        self.showsRule = showsRule
        self.trailing = trailing()
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 3) { labelText; valueStack }
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    labelText.frame(width: 112, alignment: .leading)
                    valueStack.frame(maxWidth: .infinity, alignment: .leading)
                }
                trailing
            }
            .padding(.vertical, 12)
            .frame(minHeight: 44)
            if showsRule {
                Rectangle().fill(OperatingPlanColor.rule).frame(height: 1).accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var labelText: some View {
        Text(label)
            .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldLabel)
            .foregroundStyle(OperatingPlanColor.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var valueStack: some View {
        VStack(alignment: .leading, spacing: 2) {
            if !value.isEmpty {
                Text(value)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                    .foregroundStyle(valueColor)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let detail, !detail.isEmpty {
                Text(detail)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldDetail)
                    .foregroundStyle(OperatingPlanColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct OperatingPlanChevron: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(OperatingPlanColor.muted)
            .accessibilityHidden(true)
    }
}

/// The shared surface: paper / navy-ink card with a hairline border, or the
/// teal-navy field for identity and plan cards.
struct OperatingPlanSurface<Content: View>: View {
    enum Tone { case paper, field, amber }
    var tone: Tone = .paper
    var horizontalPadding: CGFloat = 14
    var verticalPadding: CGFloat = 0
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, verticalPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                switch tone {
                case .paper: RoundedRectangle(cornerRadius: 16, style: .continuous).fill(OperatingPlanColor.surface)
                case .field: RoundedRectangle(cornerRadius: 16, style: .continuous).fill(OperatingPlanColor.field)
                case .amber: RoundedRectangle(cornerRadius: 16, style: .continuous).fill(OperatingPlanColor.amber.opacity(0.07))
                }
            }
            .overlay {
                switch tone {
                case .paper: RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(OperatingPlanColor.rule, lineWidth: 1)
                case .field: EmptyView()
                case .amber: RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(OperatingPlanColor.amber.opacity(0.35), lineWidth: 1.2)
                }
            }
    }
}

struct OperatingPlanMetricTile: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldLabel)
                .foregroundStyle(OperatingPlanColor.fieldInk.opacity(0.75))
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanMetric)
                .foregroundStyle(OperatingPlanColor.fieldInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
        .background(OperatingPlanColor.field, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: Actions

struct OperatingPlanButton: View {
    enum Style { case primary, navy, quiet, destructive, text }
    let title: String
    var systemImage: String? = nil
    var style: Style = .primary
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 13, weight: .bold)).accessibilityHidden(true)
                }
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanAction)
                    .multilineTextAlignment(.center)
            }
            .foregroundStyle(foreground)
            .padding(.horizontal, 12)
            .frame(maxWidth: style == .text ? nil : .infinity, minHeight: style == .text ? 44 : 50)
            .background { background }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.5)
    }

    @ViewBuilder private var background: some View {
        switch style {
        case .primary:
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(LinearGradient(colors: [OperatingPlanColor.teal, OperatingPlanColor.navy], startPoint: .leading, endPoint: .trailing))
        case .navy:
            RoundedRectangle(cornerRadius: 14, style: .continuous).fill(OperatingPlanColor.navy)
        case .quiet:
            RoundedRectangle(cornerRadius: 14, style: .continuous).fill(OperatingPlanColor.surface)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(OperatingPlanColor.rule, lineWidth: 1))
        case .destructive:
            RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(OperatingPlanColor.red.opacity(0.55), lineWidth: 1.2)
        case .text:
            Color.clear
        }
    }

    private var foreground: Color {
        switch style {
        case .primary, .navy: .white
        case .quiet, .text: OperatingPlanColor.teal
        case .destructive: OperatingPlanColor.red
        }
    }
}

// MARK: Notes and states

struct OperatingPlanNote: View {
    let icon: String
    var tint: Color = OperatingPlanColor.cyan
    let title: String
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 18)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanNoteTitle)
                    .foregroundStyle(OperatingPlanColor.ink)
                Text(message)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldDetail)
                    .foregroundStyle(OperatingPlanColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(tint.opacity(0.22), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

struct OperatingPlanLoadingView: View {
    var body: some View {
        ProgressView()
            .tint(OperatingPlanColor.teal)
            .frame(maxWidth: .infinity, minHeight: 240)
            .accessibilityIdentifier("operatingPlan.loading")
    }
}

/// A page that could not load: what happened, that nothing changed, and
/// Try Again where a reload is possible (the audit's missing retry).
struct OperatingPlanFailureView: View {
    var title: String = "Couldn't load this page"
    let message: String
    var retry: (() -> Void)? = nil
    var retryIdentifier = "operatingPlan.retry"

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            OperatingPlanNote(icon: "exclamationmark.triangle", tint: OperatingPlanColor.amber, title: title, message: message)
            if let retry {
                OperatingPlanButton(title: "Try Again", systemImage: "arrow.clockwise", style: .navy, action: retry)
                    .accessibilityIdentifier(retryIdentifier)
            }
        }
        .accessibilityIdentifier("operatingPlan.failure")
    }
}

struct OperatingPlanErrorText: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 13, weight: .bold))
                .accessibilityHidden(true)
            Text(message)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanNoteTitle)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(OperatingPlanColor.red)
        .accessibilityElement(children: .combine)
    }
}

/// A labelled switch row in the family grammar (editors).
struct OperatingPlanToggleLine: View {
    let title: String
    @Binding var isOn: Bool
    var showsRule = true

    var body: some View {
        VStack(spacing: 0) {
            Toggle(isOn: $isOn) {
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                    .foregroundStyle(OperatingPlanColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .tint(OperatingPlanColor.green)
            .padding(.vertical, 8)
            .frame(minHeight: 44)
            if showsRule {
                Rectangle().fill(OperatingPlanColor.rule).frame(height: 1).accessibilityHidden(true)
            }
        }
    }
}

/// The Operating Plan root's navigable domain card. Energy is the identity
/// field; every other domain is a paper card tinted by its icon.
struct OperatingPlanDomainCard: View {
    let eyebrow: String
    let iconKey: String
    let title: String
    let detail: String
    var status: String? = nil
    var isField = false
    var isInteractive = true

    var body: some View {
        let ink = isField ? OperatingPlanColor.fieldInk : OperatingPlanColor.ink
        HStack(alignment: .center, spacing: 12) {
            OperatingPlanIconTile(
                systemImage: OperatingPlanIcon.systemImage(for: iconKey),
                tint: isField ? OperatingPlanColor.fieldInk : OperatingPlanColor.tint(for: iconKey)
            )
            VStack(alignment: .leading, spacing: 3) {
                Text(eyebrow)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanEyebrow)
                    .foregroundStyle(isField ? ink.opacity(0.75) : OperatingPlanColor.muted)
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanCardTitle)
                    .foregroundStyle(ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanCardDetail)
                    .foregroundStyle(isField ? ink.opacity(0.8) : OperatingPlanColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let status {
                    OperatingPlanStatusPill(text: status, tone: OperatingPlanStatusPill.tone(for: status)).padding(.top, 5)
                }
            }
            Spacer(minLength: 4)
            if isInteractive {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(isField ? ink : OperatingPlanColor.muted)
                    .accessibilityHidden(true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .background {
            if isField {
                RoundedRectangle(cornerRadius: 16, style: .continuous).fill(OperatingPlanColor.field)
            } else {
                RoundedRectangle(cornerRadius: 16, style: .continuous).fill(OperatingPlanColor.surface)
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(OperatingPlanColor.rule, lineWidth: isField ? 0 : 1))
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// A titled group in the family grammar: the section title, then content.
struct OperatingPlanGroup<Content: View, Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing
    @ViewBuilder var content: Content

    init(_ title: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }, @ViewBuilder content: () -> Content) {
        self.title = title
        self.trailing = trailing()
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            OperatingPlanGroupTitle(title) { trailing }
            VStack(alignment: .leading, spacing: 8) { content }
        }
    }
}
