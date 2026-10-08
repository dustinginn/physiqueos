import SwiftUI
import UIKit

/// The Founder-locked Evidence Intake + Review workflow system (Final Design
/// Batch 1, `85ef2a6c`, `final-design-batch1-evidence-intake-review-20261004`,
/// `evidence-workflow-harness.html`). The harness phone is 402 px wide, so
/// every CSS px is one point (`EvidenceFamily.workflow`).
enum WorkflowColor {
    static let bg = d(0x06131E, 0xEFEEE7)
    static let text = d(0xF6F8F7, 0x0A1C2D)
    static let muted = d(0x91A4AD, 0x62737B)
    static let line = d(0x203640, 0xCBD5D0)
    static let surface = d(0x0E2230, 0xFBFAF6)
    static let surface2 = d(0x142C39, 0xDCEBE7)
    static let deep = d(0x091A27, 0xE5EAE4)
    static let teal = d(0x2CCDC0, 0x0C8F84)
    static let green = d(0x53DDA0, 0x13895E)
    static let cyan = d(0x49C8DC, 0x168B9C)
    static let amber = d(0xF2BD54, 0xB6750A)
    static let purple = d(0xA28AFF, 0x7255D7)
    static let red = d(0xED7182, 0xC34F64)

    /// `#rrggbb18` tints are fixed (not theme) colors in the harness.
    static let tealTint = fixed(0x2CCDC0, 0x18)
    static let greenTint = fixed(0x53DDA0, 0x18)
    static let amberTint = fixed(0xF2BD54, 0x18)
    static let redTint = fixed(0xED7182, 0x18)
    static let cyanTint = fixed(0x49C8DC, 0x1A)
    static let cyanNote = fixed(0x49C8DC, 0x0C)
    static let amberNote = fixed(0xF2BD54, 0x0C)
    static let redNote = fixed(0xED7182, 0x0C)
    static let confirm = fixed(0x2CCDC0, 0x22)
    static let confirmDone = fixed(0x53DDA0, 0x1A)

    /// `.surface.rich` in Mineral Light; Dark keeps `--surface`.
    static let richLight = LinearGradient(colors: [hex(0xD7EBE7), hex(0xEEF5EF)], startPoint: .topLeading, endPoint: .bottomTrailing)
    /// `.primary`: 135° teal → navy, white label.
    static let primary = LinearGradient(colors: [hex(0x1A9C90), hex(0x17456B)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let heroDark = LinearGradient(colors: [hex(0x0B8F87), hex(0x123E62)], startPoint: UnitPoint(x: 0.2, y: 0), endPoint: UnitPoint(x: 0.8, y: 1))
    static let heroLight = LinearGradient(colors: [hex(0xD3EAE5), hex(0xC7DDE8)], startPoint: UnitPoint(x: 0.2, y: 0), endPoint: UnitPoint(x: 0.8, y: 1))
    static let heroEyebrow = d(0xD7CEFF, 0x7255D7)
    static let heroText = d(0xFFFFFF, 0x0A1C2D)
    static let heroMeta = d(0xD6E2E4, 0x62737B)
    static let heroRing = fixed(0x58DDA0, 0x37)

    private static func hex(_ value: UInt32) -> Color {
        Color(red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255, blue: Double(value & 0xFF) / 255)
    }

    private static func fixed(_ value: UInt32, _ alpha: UInt32) -> Color {
        hex(value).opacity(Double(alpha) / 255)
    }

    private static func d(_ dark: UInt32, _ light: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255, blue: CGFloat(value & 0xFF) / 255, alpha: 1)
        })
    }
}

/// Harness type scale (CSS px = pt).
enum WorkflowText {
    static let eyebrow = EvidenceTextStyle(size: 10, weight: 900, lineHeight: 12.5, tracking: 1.2, uppercase: true, relativeTo: .caption2)
    static let h1 = EvidenceTextStyle(size: 30, weight: 700, lineHeight: 31.2, tracking: -1.35, relativeTo: .largeTitle)
    static let heroTitle = EvidenceTextStyle(size: 28, weight: 700, lineHeight: 29.12, tracking: -1.26, relativeTo: .largeTitle)
    static let h2 = EvidenceTextStyle(size: 17, weight: 700, lineHeight: 20.06, tracking: -0.34, relativeTo: .headline)
    static let h3 = EvidenceTextStyle(size: 14, weight: 700, lineHeight: 17.5, relativeTo: .subheadline)
    static let small = EvidenceTextStyle(size: 12, weight: 400, lineHeight: 16.56, relativeTo: .footnote)
    static let micro = EvidenceTextStyle(size: 10, weight: 800, lineHeight: 13, tracking: 0.6, uppercase: true, relativeTo: .caption2)
    static let label = EvidenceTextStyle(size: 13, weight: 760, lineHeight: 16.64, relativeTo: .subheadline)
    static let value = EvidenceTextStyle(size: 13, weight: 850, lineHeight: 16.64, relativeTo: .subheadline)
    static let secondary = EvidenceTextStyle(size: 12, weight: 400, lineHeight: 16.2, relativeTo: .footnote)
    static let recommend = EvidenceTextStyle(size: 10, weight: 900, lineHeight: 12.8, relativeTo: .caption2)
    static let button = EvidenceTextStyle.normal(13, 850, jakarta: false, relativeTo: .subheadline)
    static let primary = EvidenceTextStyle.normal(15, 900, jakarta: false, relativeTo: .headline)
    static let tag = EvidenceTextStyle.normal(10, 900, jakarta: false, relativeTo: .caption2)
    static let segment = EvidenceTextStyle.normal(12, 850, jakarta: false, relativeTo: .footnote)
    static let input = EvidenceTextStyle.normal(14, 400, jakarta: false, relativeTo: .body)
    static let heroMeta = EvidenceTextStyle.normal(11, 800, jakarta: false, relativeTo: .caption)
    static let check = EvidenceTextStyle.normal(13, 900, jakarta: false, relativeTo: .caption)
}

/// The workflow page body: `.page` padding 17 / 18 / 38 and the 17-px
/// header margin.
struct WorkflowPage<Content: View>: View {
    var top: CGFloat = 17
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 18)
                .padding(.top, top)
                .padding(.bottom, 38 + 12)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(WorkflowColor.bg)
        .evidenceFamily(.workflow)
    }
}

/// `.header`: eyebrow and the 30-px title.
struct WorkflowHeader: View {
    let eyebrow: String
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow.uppercased())
                .evidenceText(WorkflowText.eyebrow)
                .foregroundStyle(WorkflowColor.purple)
            Text(title)
                .evidenceText(WorkflowText.h1)
                .foregroundStyle(WorkflowColor.text)
                .padding(.top, 6)
                .accessibilityAddTraits(.isHeader)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 17)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("evidenceWorkflow.header")
    }
}

/// `.surface`: 14-px padding inside a 1-px border (content inset 15),
/// 18-px radius, 12-px gap below. `rich` is the Mineral Light gradient;
/// `soft` uses `--deep`.
struct WorkflowSurface<Content: View>: View {
    enum Tone { case plain, rich, soft }
    @Environment(\.colorScheme) private var scheme
    var tone: Tone = .plain
    var bottom: CGFloat = 12
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(15)
            .background {
                let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
                if tone == .rich && scheme == .light {
                    shape.fill(WorkflowColor.richLight)
                } else {
                    shape.fill(tone == .soft ? WorkflowColor.deep : WorkflowColor.surface)
                }
            }
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(WorkflowColor.line, lineWidth: 1))
            .padding(.bottom, bottom)
    }
}

/// A 54-px row with a 1-px rule below (suppressed on the last row).
struct WorkflowRow<Content: View>: View {
    var isLast = false
    var minHeight: CGFloat = 54
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, minHeight: minHeight - (isLast ? 0 : 1), alignment: .leading)
            .padding(.bottom, isLast ? 0 : 1)
            .overlay(alignment: .bottom) {
                if !isLast { Rectangle().fill(WorkflowColor.line).frame(height: 1) }
            }
    }
}

/// `.tag`: 10-px label on a tinted capsule.
struct WorkflowTag: View {
    enum Tone { case teal, green, amber, muted }
    let text: String
    var tone: Tone = .teal

    var body: some View {
        Text(text)
            .evidenceText(WorkflowText.tag)
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(background, in: Capsule())
            .fixedSize()
    }

    private var foreground: Color {
        switch tone {
        case .teal: WorkflowColor.teal
        case .green: WorkflowColor.green
        case .amber: WorkflowColor.amber
        case .muted: WorkflowColor.muted
        }
    }

    private var background: Color {
        switch tone {
        case .teal: WorkflowColor.tealTint
        case .green: WorkflowColor.greenTint
        case .amber: WorkflowColor.amberTint
        case .muted: WorkflowColor.surface2
        }
    }
}

/// `.button`: 44-px outlined action; destructive uses `--red`.
struct WorkflowButtonLabel: View {
    let title: String
    var destructive = false
    var fullWidth = false

    var body: some View {
        Text(title)
            .evidenceText(WorkflowText.button)
            .foregroundStyle(destructive ? WorkflowColor.red : WorkflowColor.text)
            .padding(.horizontal, 14)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 44)
            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(WorkflowColor.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

struct WorkflowButton: View {
    let title: String
    var destructive = false
    var fullWidth = false
    var identifier: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            WorkflowButtonLabel(title: title, destructive: destructive, fullWidth: fullWidth)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier ?? "evidenceWorkflow.button.\(title)")
    }
}

/// `.primary`: the 52-px gradient action (7-px top margin); disabled is
/// `surface2` with the muted label.
struct WorkflowPrimaryButton: View {
    let title: String
    var isEnabled = true
    var identifier: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .evidenceText(WorkflowText.primary)
                .foregroundStyle(isEnabled ? Color.white : WorkflowColor.muted)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background {
                    let shape = RoundedRectangle(cornerRadius: 15, style: .continuous)
                    if isEnabled { shape.fill(WorkflowColor.primary) } else { shape.fill(WorkflowColor.surface2) }
                }
                .contentShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .padding(.top, 7)
        .accessibilityIdentifier(identifier ?? "evidenceWorkflow.primary")
    }
}

/// `.note`: a 3-px leading rule on a faint tint, square on the left.
struct WorkflowNote<Content: View>: View {
    enum Tone { case cyan, amber, red }
    var tone: Tone = .cyan
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 12)
            .padding(.leading, 13 + 3)
            .padding(.trailing, 13)
            .background(tint, in: UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 0, bottomTrailingRadius: 13, topTrailingRadius: 13))
            .overlay(alignment: .leading) { Rectangle().fill(rule).frame(width: 3) }
            .padding(.bottom, 12)
    }

    private var rule: Color {
        switch tone {
        case .cyan: WorkflowColor.cyan
        case .amber: WorkflowColor.amber
        case .red: WorkflowColor.red
        }
    }

    private var tint: Color {
        switch tone {
        case .cyan: WorkflowColor.cyanNote
        case .amber: WorkflowColor.amberNote
        case .red: WorkflowColor.redNote
        }
    }
}

/// `.spinner`: a 17-px ring with a teal leading arc.
struct WorkflowSpinner: View {
    @State private var spinning = false

    var body: some View {
        ZStack {
            Circle().strokeBorder(WorkflowColor.line, lineWidth: 2)
            Circle().trim(from: 0, to: 0.25)
                .stroke(WorkflowColor.teal, style: StrokeStyle(lineWidth: 2))
                .padding(1)
                .rotationEffect(.degrees(spinning ? 225 : -135))
        }
        .frame(width: 17, height: 17)
        .onAppear {
            #if DEBUG
            guard !ProcessInfo.processInfo.arguments.contains("-physiqueos.evidence-review") else { return }
            #endif
            withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) { spinning = true }
        }
        .accessibilityHidden(true)
    }
}

/// `.state-icon`: a 26-px rounded square glyph.
struct WorkflowStateIcon: View {
    enum Tone { case ok, error, muted, wait, question }
    let tone: Tone

    var body: some View {
        Text(glyph)
            .evidenceText(.normal(16, 900, jakarta: false))
            .foregroundStyle(tone == .error ? WorkflowColor.red : WorkflowColor.green)
            .frame(width: 26, height: 26)
            .background(tone == .error ? WorkflowColor.redTint : WorkflowColor.greenTint, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .accessibilityHidden(true)
    }

    private var glyph: String {
        switch tone {
        case .ok: "✓"
        case .error: "!"
        case .muted: "×"
        case .wait: "↻"
        case .question: "?"
        }
    }
}

/// `.state`: icon or spinner, title, optional copy and actions, ruled.
struct WorkflowStateRow<Actions: View>: View {
    enum Lead { case spinner, icon(WorkflowStateIcon.Tone) }
    let lead: Lead
    let title: String
    var copy: String?
    var progress: Double?
    var isLast = false
    var identifier: String?
    @ViewBuilder var actions: Actions

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 9) {
                switch lead {
                case .spinner: WorkflowSpinner()
                case .icon(let tone): WorkflowStateIcon(tone: tone)
                }
                Text(title)
                    .evidenceText(WorkflowText.h3)
                    .foregroundStyle(WorkflowColor.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.bottom, 5)
            if let progress {
                WorkflowProgress(fraction: progress)
            }
            if let copy {
                Text(copy)
                    .evidenceText(WorkflowText.small)
                    .foregroundStyle(WorkflowColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            actions
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 13)
        .overlay(alignment: .bottom) {
            if !isLast { Rectangle().fill(WorkflowColor.line).frame(height: 1) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier ?? "evidenceWorkflow.state")
    }
}

extension WorkflowStateRow where Actions == EmptyView {
    init(lead: Lead, title: String, copy: String? = nil, progress: Double? = nil, isLast: Bool = false, identifier: String? = nil) {
        self.init(lead: lead, title: title, copy: copy, progress: progress, isLast: isLast, identifier: identifier) { EmptyView() }
    }
}

/// `.status-actions`: 9-px top margin, 8-px gaps.
struct WorkflowActions<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        HStack(spacing: 8) { content }
            .padding(.top, 9)
    }
}

/// `.progress`: a 7-px track with a teal → green fill.
struct WorkflowProgress: View {
    let fraction: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(WorkflowColor.surface2)
                Capsule()
                    .fill(LinearGradient(colors: [WorkflowColor.teal, WorkflowColor.green], startPoint: .leading, endPoint: .trailing))
                    .frame(width: proxy.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: 7)
        .padding(.top, 2)
        .padding(.bottom, 8)
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue("\(Int(fraction * 100)) percent")
    }
}

/// `.select`: a 54-px labelled menu field on `--deep`.
struct WorkflowSelectField<Menu: View>: View {
    let label: String
    let value: String
    var valueColor: Color = WorkflowColor.text
    @ViewBuilder var menu: Menu

    var body: some View {
        SwiftUI.Menu {
            menu
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(label.uppercased())
                    .evidenceText(WorkflowText.micro)
                    .foregroundStyle(WorkflowColor.muted)
                HStack(spacing: 8) {
                    Text(value)
                        .evidenceText(WorkflowText.value)
                        .foregroundStyle(valueColor)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Text("⌄").evidenceText(WorkflowText.value).foregroundStyle(WorkflowColor.text)
                }
            }
            .padding(.vertical, 9)
            .padding(.horizontal, 11)
            .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
            .background(WorkflowColor.deep, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(WorkflowColor.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
        .accessibilityLabel(label)
        .accessibilityValue(value)
    }
}

/// `.metric`: a 59-px tile on `--deep` with a toned micro label.
struct WorkflowMetricTile: View {
    /// `nutrition` takes the shared Nutrition Evidence macro color, so a
    /// review's macros read exactly as they do on the Nutrition page.
    enum Tone: Equatable { case teal, amber, purple, nutrition(NutritionEvidenceMacro) }
    let label: String
    let value: String
    var tone: Tone = .teal

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .evidenceText(WorkflowText.micro)
                .foregroundStyle(tint)
            Text(value)
                .evidenceText(WorkflowText.value)
                .foregroundStyle(WorkflowColor.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 9)
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 59, alignment: .topLeading)
        .background(WorkflowColor.deep, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }

    private var tint: Color {
        switch tone {
        case .teal: WorkflowColor.teal
        case .amber: WorkflowColor.amber
        case .purple: WorkflowColor.purple
        case .nutrition(let macro): macro.color
        }
    }
}

/// A two-column grid with 8-px gaps whose rows take their tallest tile.
struct WorkflowGrid<Item, Cell: View>: View {
    let items: [Item]
    @ViewBuilder var cell: (Item) -> Cell

    var body: some View {
        VStack(spacing: 8) {
            ForEach(Array(stride(from: 0, to: items.count, by: 2)), id: \.self) { index in
                HStack(alignment: .top, spacing: 8) {
                    cell(items[index])
                    if index + 1 < items.count {
                        cell(items[index + 1])
                    } else {
                        Color.clear.frame(maxWidth: .infinity, maxHeight: 1)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// `.review-hero`: 20-px radius gradient band with the decorative ring.
struct WorkflowReviewHero: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    let date: String?
    let version: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("EVIDENCE REVIEW")
                .evidenceText(WorkflowText.eyebrow)
                .foregroundStyle(WorkflowColor.heroEyebrow)
            Text(title)
                .evidenceText(WorkflowText.heroTitle)
                .foregroundStyle(WorkflowColor.heroText)
                .padding(.top, 6)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 12) {
                if let date { Text(date).accessibilityIdentifier("evidenceReviewDetail.occurrenceDate") }
                if let version { Text(version) }
            }
            .evidenceText(WorkflowText.heroMeta)
            .foregroundStyle(WorkflowColor.heroMeta)
            .padding(.top, 10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(17)
        .background {
            if scheme == .light { WorkflowColor.heroLight } else { WorkflowColor.heroDark }
        }
        // The decorative ring never takes part in layout.
        .overlay(alignment: .bottomTrailing) {
            Circle()
                .strokeBorder(WorkflowColor.heroRing, lineWidth: 28)
                .frame(width: 140, height: 140)
                .offset(x: 70, y: 98)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.bottom, 14)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("evidenceReview.generic.hero")
    }
}

/// `.check`: the 24-px selected-choice mark.
struct WorkflowCheck: View {
    var body: some View {
        Text("✓")
            .evidenceText(WorkflowText.check)
            .foregroundStyle(WorkflowColor.bg)
            .frame(width: 24, height: 24)
            .background(WorkflowColor.teal, in: Circle())
            .accessibilityHidden(true)
    }
}

/// `.file-icon`: the 38-px tinted file mark.
struct WorkflowFileIcon: View {
    var glyph = "▧"
    var size: CGFloat = 38

    var body: some View {
        Text(glyph)
            .evidenceText(.normal(16, 900, jakarta: false))
            .foregroundStyle(WorkflowColor.cyan)
            .frame(width: size, height: size)
            .background(WorkflowColor.cyanTint, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// `.input`: the 114 × 44 right-aligned numeric field on `--deep`.
struct WorkflowNumericField: View {
    let label: String
    @Binding var text: String
    var width: CGFloat = 114
    var keyboard: UIKeyboardType = .decimalPad

    var body: some View {
        TextField("", text: $text)
            .keyboardType(keyboard)
            .multilineTextAlignment(.trailing)
            .evidenceText(WorkflowText.input)
            .foregroundStyle(WorkflowColor.text)
            .padding(.horizontal, 11)
            .frame(width: width, height: 44)
            .background(WorkflowColor.deep, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(WorkflowColor.line, lineWidth: 1))
            .accessibilityLabel(label)
    }
}

/// The flat workflow navigation: a `‹ Title` leading control on the page
/// canvas with the 1-px rule beneath.
struct WorkflowChrome: ViewModifier {
    @Environment(\.dismiss) private var dismiss
    let backTitle: String
    var onBack: (() -> Void)?

    func body(content: Content) -> some View {
        content
            .background(WorkflowColor.bg)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .restoresInteractivePopGesture()
            .toolbarBackground(WorkflowColor.bg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { if let onBack { onBack() } else { dismiss() } } label: {
                        Text("‹ \(backTitle)")
                            .evidenceText(.normal(14, 780, jakarta: false))
                            .foregroundStyle(WorkflowColor.muted)
                            .fixedSize()
                            .padding(.leading, 2)
                            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Back")
                    .accessibilityIdentifier("evidenceWorkflow.back")
                }
                .evidenceFlatToolbarItem()
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                Rectangle().fill(WorkflowColor.line).frame(height: 1).accessibilityHidden(true)
            }
            .evidenceFamily(.workflow)
    }
}

extension View {
    func workflowChrome(back: String, onBack: (() -> Void)? = nil) -> some View {
        modifier(WorkflowChrome(backTitle: back, onBack: onBack))
    }
}

/// `.date-row`: `Date` and `Sep 23, 2026 ›`; the row opens the same
/// system graphical date sheet `DateField` uses (Today + Done).
struct WorkflowDateRow: View {
    @Binding var date: Date
    var maximumDate: Date = Date()
    var isLast = true
    @State private var isPresented = false

    var body: some View {
        Button { isPresented = true } label: {
            WorkflowRow(isLast: isLast) {
                HStack(spacing: 12) {
                    Text("Date").evidenceText(WorkflowText.label).foregroundStyle(WorkflowColor.text)
                    Spacer(minLength: 0)
                    Text("\(Self.formatter.string(from: date)) ›").evidenceText(WorkflowText.value).foregroundStyle(WorkflowColor.text)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Date")
        .accessibilityValue(Self.formatter.string(from: date))
        .accessibilityHint("Opens a date picker")
        .accessibilityIdentifier("evidenceWorkflow.date")
        .sheet(isPresented: $isPresented) {
            NavigationStack {
                VStack(alignment: .leading, spacing: 12) {
                    Text("EVIDENCE DATE")
                        .evidenceText(WorkflowText.eyebrow)
                        .foregroundStyle(WorkflowColor.purple)
                        .padding(.horizontal, 18)
                    DatePicker("Date", selection: $date, in: Date.distantPast...maximumDate, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .tint(WorkflowColor.teal)
                        .padding(10)
                        .background(WorkflowColor.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(WorkflowColor.line, lineWidth: 1))
                        .padding(.horizontal, 18)
                }
                .padding(.top, 12)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(WorkflowColor.bg)
                .navigationTitle("Choose Date")
                .navigationBarTitleDisplayMode(.inline)
                .toolbarBackground(WorkflowColor.bg, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Today") {
                            if let today = DateField.selectableToday(minimumDate: nil, maximumDate: maximumDate) { date = today }
                        }
                        .tint(WorkflowColor.teal)
                        .accessibilityIdentifier("datePicker.today")
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { isPresented = false }
                            .fontWeight(.bold)
                            .tint(WorkflowColor.teal)
                    }
                }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
            .presentationBackground(WorkflowColor.bg)
        }
    }

    static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "MMM d, yyyy"
        return formatter
    }()
}

/// `.toggle-row` with the locked 48 × 29 switch (green on, line off).
struct WorkflowToggleRow: View {
    let title: String
    @Binding var isOn: Bool

    var body: some View {
        Button { isOn.toggle() } label: {
            HStack(spacing: 12) {
                Text(title).evidenceText(WorkflowText.label).foregroundStyle(WorkflowColor.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                ZStack(alignment: isOn ? .trailing : .leading) {
                    Capsule().fill(isOn ? WorkflowColor.green : WorkflowColor.line)
                    Circle().fill(Color.white).frame(width: 23, height: 23).padding(3)
                }
                .frame(width: 48, height: 29)
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(isOn ? "On" : "Off")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("evidenceWorkflow.toggle")
    }
}

/// `.seg`: two equal 44-px segments on `--deep` inside a 1-px border.
struct WorkflowSegmented<Value: Hashable>: View {
    let options: [(Value, String)]
    @Binding var selection: Value

    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, option in
                let selected = option.0 == selection
                Button { selection = option.0 } label: {
                    Text(option.1)
                        .evidenceText(WorkflowText.segment)
                        .foregroundStyle(selected ? WorkflowColor.text : WorkflowColor.muted)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(selected ? WorkflowColor.surface2 : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("evidenceWorkflow.segment.\(option.1)")
            }
        }
        .padding(4)
        .background(WorkflowColor.deep, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(WorkflowColor.line, lineWidth: 1))
        .padding(.bottom, 12)
    }
}
