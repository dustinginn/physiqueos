import SwiftUI
import UIKit

/// Shared presentation pieces for the recurring-Briefing vertical
/// (`Presentation/Briefings/*`) — the cadence badge, the server-owned
/// Confidence card (built on the existing `ConfidenceRing`), the top-of-
/// Detail navigation header the Founder explicitly asked for (clear access
/// to Home and to Briefing History from every Briefing Detail), and the
/// revision-disclosure banner. Kept here rather than duplicated per
/// cadence-detail view, matching this codebase's existing `SharedUI`
/// convention (`ConfidenceRing`, `StatusChip`, `SectionHeading`, …).

// MARK: - Date formatting

/// Date-only (`"YYYY-MM-DD"`) and true-instant (ISO-8601 timestamp)
/// formatting for Briefing fields. Date-only fields are UTC-anchored so a
/// device timezone never shifts a reporting-window boundary to the
/// adjacent calendar day (mirrors `TrainingDateFormatting.short`'s
/// contract); `generatedAt`/`capturedAt`/`replacementTimestamp` are real
/// instants and are shown in the device's local timezone, which is the
/// correct behavior for an instant (not a shift, a genuine local-time
/// read).
enum BriefingDateFormatting {
    private static let dateKeyParser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func shortDate(_ dateKey: String) -> String {
        guard let date = dateKeyParser.date(from: String(dateKey.prefix(10))) else { return dateKey }
        let display = DateFormatter()
        display.calendar = Calendar(identifier: .gregorian)
        display.locale = Locale(identifier: "en_US_POSIX")
        display.timeZone = TimeZone(identifier: "UTC")
        display.dateFormat = "MMM d, yyyy"
        return display.string(from: date)
    }

    static func timestamp(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter.briefingTimestamp.date(from: iso) else { return iso }
        let display = DateFormatter()
        display.dateStyle = .medium
        display.timeStyle = .short
        return display.string(from: date)
    }

    /// History row publication: an instant as `"Sep 27, 2026 at 5:00 AM"`
    /// (device timezone); a date-only delivery date (Monthly's canonical
    /// `deliveryDate`) as `"Oct 1, 2026"` without inventing a time.
    static func historyTimestamp(_ value: String) -> String {
        if value.count == 10, dateKeyParser.date(from: value) != nil { return shortDate(value) }
        guard let date = ISO8601DateFormatter.briefingTimestamp.date(from: value) ?? ISO8601DateFormatter().date(from: value) else { return value }
        let display = DateFormatter()
        display.dateStyle = .medium
        display.timeStyle = .short
        return display.string(from: date)
    }

    /// `"2026-07-18"` → `"Jul 18"` (UTC-anchored date key).
    static func monthDay(_ dateKey: String) -> String {
        guard let date = dateKeyParser.date(from: String(dateKey.prefix(10))) else { return dateKey }
        return formatDate(date, pattern: "MMM d")
    }

    /// A true instant as `"Aug 30, 9:15 AM"` in the device's timezone.
    static func compactTimestamp(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter.briefingTimestamp.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return iso }
        let display = DateFormatter()
        display.locale = Locale(identifier: "en_US_POSIX")
        display.dateFormat = "MMM d, h:mm a"
        return display.string(from: date)
    }

    /// Converts machine date ranges embedded in server-owned hero labels
    /// into concise editorial copy without changing the canonical dates.
    /// Already-humanized labels pass through unchanged.
    static func humanizedPeriodLabel(_ label: String) -> String {
        let pattern = #"(\d{4}-\d{2}-\d{2})\s*[\-–—]\s*(\d{4}-\d{2}-\d{2})"#
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return collapseRepeatedMonth(in: label) }
        let sourceRange = NSRange(label.startIndex..<label.endIndex, in: label)
        let matches = expression.matches(in: label, range: sourceRange)

        var result = label
        for match in matches.reversed() {
            guard
                let matchRange = Range(match.range(at: 0), in: result),
                let startRange = Range(match.range(at: 1), in: result),
                let endRange = Range(match.range(at: 2), in: result)
            else { continue }
            let replacement = conciseDateRange(
                start: String(result[startRange]),
                end: String(result[endRange])
            )
            result.replaceSubrange(matchRange, with: replacement)
        }
        return collapseRepeatedMonth(in: result)
    }

    /// Hero range: machine `YYYY-MM-DD` ranges become concise editorial
    /// dates; an already-human canonical label is shown verbatim.
    static func heroRangeLabel(_ label: String) -> String {
        let pattern = #"(\d{4}-\d{2}-\d{2})\s*[\-–—]\s*(\d{4}-\d{2}-\d{2})"#
        guard let expression = try? NSRegularExpression(pattern: pattern),
              expression.firstMatch(in: label, range: NSRange(label.startIndex..<label.endIndex, in: label)) != nil
        else { return label }
        return humanizedPeriodLabel(label)
    }

    static func conciseDateRange(start: String, end: String) -> String {
        guard
            let startDate = dateKeyParser.date(from: String(start.prefix(10))),
            let endDate = dateKeyParser.date(from: String(end.prefix(10)))
        else { return start == end ? start : "\(start)–\(end)" }

        let calendar = dateKeyParser.calendar!
        let startComponents = calendar.dateComponents([.year, .month, .day], from: startDate)
        let endComponents = calendar.dateComponents([.year, .month, .day], from: endDate)

        if startComponents.year != endComponents.year {
            return "\(formatDate(startDate, pattern: "MMM d, yyyy"))–\(formatDate(endDate, pattern: "MMM d, yyyy"))"
        }
        if startComponents.month != endComponents.month {
            return "\(formatDate(startDate, pattern: "MMM d"))–\(formatDate(endDate, pattern: "MMM d"))"
        }
        if startComponents.day == endComponents.day {
            return formatDate(startDate, pattern: "MMM d")
        }
        return "\(formatDate(startDate, pattern: "MMM d"))–\(formatDate(endDate, pattern: "d"))"
    }

    private static func formatDate(_ date: Date, pattern: String) -> String {
        let display = DateFormatter()
        display.calendar = Calendar(identifier: .gregorian)
        display.locale = Locale(identifier: "en_US_POSIX")
        display.timeZone = TimeZone(identifier: "UTC")
        display.dateFormat = pattern
        return display.string(from: date)
    }

    private static func collapseRepeatedMonth(in label: String) -> String {
        let month = #"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"#
        let pattern = #"\#(month)\s+(\d{1,2})\s*[\-–—]\s*\#(month)\s+(\d{1,2})"#
        guard let expression = try? NSRegularExpression(pattern: pattern) else { return label }
        var result = label
        let matches = expression.matches(
            in: result,
            range: NSRange(result.startIndex..<result.endIndex, in: result)
        )
        for match in matches.reversed() {
            guard
                let matchRange = Range(match.range(at: 0), in: result),
                let startMonthRange = Range(match.range(at: 1), in: result),
                let startDayRange = Range(match.range(at: 2), in: result),
                let endMonthRange = Range(match.range(at: 3), in: result),
                let endDayRange = Range(match.range(at: 4), in: result)
            else { continue }
            let startMonth = String(result[startMonthRange])
            guard startMonth == String(result[endMonthRange]) else { continue }
            let startDay = String(result[startDayRange])
            let endDay = String(result[endDayRange])
            result.replaceSubrange(
                matchRange,
                with: "\(startMonth) \(startDay)–\(endDay)"
            )
        }
        return result
    }
}

extension ISO8601DateFormatter {
    nonisolated(unsafe) static let briefingTimestamp: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

// MARK: - Locked Briefing family kit (Overnight Lane B)

/// Founder-locked Briefing family design system (Oct 4 redesign program):
/// Weekly B-hero + C-dense-body (`weekly-ui-b-hero-c-body-hybrid-20261004`),
/// the final section alignment + mineral light
/// (`weekly-midweek-light-translation-final-20261004`), the accepted rich
/// mineral-light fields and Priority Muscle Group rail
/// (`briefing-light-log-density-final-polish-20261004`), Monthly
/// (`monthly-correction-dexa-photo-briefing-ui-20261004`) and the DEXA /
/// Photo event briefings (`dexa-photo-founder-flow-confirmation-20261004`).
///
/// Every harness is a 402 px Plus Jakarta Sans phone, so CSS px are points.
/// Colors resolve only through the global appearance trait (System / Dark /
/// Mineral Light); a "rich field" section keeps its dark field in Mineral
/// Light exactly as the accepted rich-field light appearance does.
struct BriefingPalette {
    let page: Color
    let surface: Color
    let ink: Color
    let secondary: Color
    let muted: Color
    let line: Color
    let purple: Color
    let green: Color
    let blue: Color
    let amber: Color
    let cyan: Color
    let track: Color

    /// `.phone.dark` / `.phone.light` tokens.
    static let standard = BriefingPalette(
        page: d(0x06121C, 0xF1F1E9),
        surface: d(0x0D2030, 0xFBFBF7),
        ink: d(0xF4F7F8, 0x102638),
        secondary: d(0xC4D1D5, 0x4E6470),
        muted: d(0x91A5AD, 0x576B73),
        line: d(0x9BB3BB, 0x193848, 0x31 / 255, 0x24 / 255),
        purple: d(0xAA8CFF, 0x684AC7),
        green: d(0x55DF9A, 0x0B6B4D),
        blue: d(0x54C6E7, 0x0E607A),
        amber: d(0xF2BC4D, 0x875400),
        cyan: d(0x44D3DF, 0x0D6670),
        track: d(0x294A52, 0xD6DFDA)
    )

    /// `.light.rich [data-section…]` — the dark color field a rich section
    /// keeps in Mineral Light. Dark appearance is unchanged.
    static let richField = BriefingPalette(
        page: d(0x06121C, 0xF1F1E9),
        surface: d(0x0D2030, 0xFBFBF7),
        ink: d(0xF4F7F8, 0xF4F8F8),
        secondary: d(0xC4D1D5, 0xD2DDE0),
        muted: d(0x91A5AD, 0xADBEC3),
        line: d(0x9BB3BB, 0xD9E9EC, 0x31 / 255, 0x2E / 255),
        purple: d(0xAA8CFF, 0xB7A4FF),
        green: d(0x55DF9A, 0x55DF9A),
        blue: d(0x54C6E7, 0x54C6E7),
        amber: d(0xF2BC4D, 0xF2BC4D),
        cyan: d(0x44D3DF, 0x44D3DF),
        track: d(0x294A52, 0x294A52)
    )

    static func d(_ dark: UInt32, _ light: UInt32, _ darkAlpha: CGFloat = 1, _ lightAlpha: CGFloat = 1) -> Color {
        Color(uiColor: UIColor { traits in
            let isDark = traits.userInterfaceStyle == .dark
            let hex = isDark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: isDark ? darkAlpha : lightAlpha
            )
        })
    }

    /// A fixed (appearance-independent) CSS color.
    static func fixed(_ hex: UInt32, _ alpha: CGFloat = 1) -> Color {
        Color(uiColor: UIColor(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        ))
    }
}

private struct BriefingPaletteKey: EnvironmentKey {
    static let defaultValue = BriefingPalette.standard
}

extension EnvironmentValues {
    var briefingPalette: BriefingPalette {
        get { self[BriefingPaletteKey.self] }
        set { self[BriefingPaletteKey.self] = newValue }
    }
}

/// The section tones (`.tone-amber` … `.tone-cyan`).
enum BriefingTone {
    case amber, blue, purple, green, cyan, muted

    func color(_ c: BriefingPalette) -> Color {
        switch self {
        case .amber: c.amber
        case .blue: c.blue
        case .purple: c.purple
        case .green: c.green
        case .cyan: c.cyan
        case .muted: c.muted
        }
    }
}

// MARK: Typography

/// One harness text style: CSS px size / weight, the computed line box
/// (`line-height` × size; the phone's default is 1.42) and tracking.
struct BriefingTextStyle {
    var size: CGFloat
    var weight: CGFloat
    var lineHeight: CGFloat
    var tracking: CGFloat = 0
    var uppercase = false
    /// History and the shared app chrome use SF Pro (Final Design Batch 2).
    var jakarta = true
    var monospacedDigits = false
    var relativeTo: Font.TextStyle = .body

    /// `line-height` as a multiple of the size (CSS unitless).
    static func j(_ size: CGFloat, _ weight: CGFloat, _ lineHeight: CGFloat = 1.42, tracking em: CGFloat = 0, uppercase: Bool = false, relativeTo: Font.TextStyle = .body) -> BriefingTextStyle {
        BriefingTextStyle(size: size, weight: weight, lineHeight: (size * lineHeight * 100).rounded() / 100, tracking: em * size, uppercase: uppercase, relativeTo: relativeTo)
    }

    /// Plus Jakarta with Chrome's `line-height: normal` box (each of the
    /// face's ascent 1.038 / descent 0.222 rounded to whole px) — the
    /// event-briefing harness's default.
    static func jn(_ size: CGFloat, _ weight: CGFloat, tracking em: CGFloat = 0, uppercase: Bool = false, relativeTo: Font.TextStyle = .body) -> BriefingTextStyle {
        let normal = (size * 1.038).rounded() + (size * 0.222).rounded()
        return BriefingTextStyle(size: size, weight: weight, lineHeight: normal, tracking: em * size, uppercase: uppercase, relativeTo: relativeTo)
    }

    /// SF Pro with an explicit CSS line box (or Chrome's `normal`).
    static func sf(_ size: CGFloat, _ weight: CGFloat, lineHeight: CGFloat? = nil, tracking em: CGFloat = 0, uppercase: Bool = false, relativeTo: Font.TextStyle = .body) -> BriefingTextStyle {
        let normal = (size * 0.9668).rounded() + (size * 0.2109).rounded()
        return BriefingTextStyle(size: size, weight: weight, lineHeight: lineHeight ?? normal, tracking: em * size, uppercase: uppercase, jakarta: false, relativeTo: relativeTo)
    }
}

private struct BriefingTextModifier: ViewModifier {
    @ScaledMetric private var scale: CGFloat = 1
    let style: BriefingTextStyle

    init(_ style: BriefingTextStyle) {
        self.style = style
        _scale = ScaledMetric(wrappedValue: 1, relativeTo: style.relativeTo)
    }

    func body(content: Content) -> some View {
        let size = style.size * scale
        var font: UIFont = style.jakarta
            ? PlusJakartaSans.uiFont(size: size, weight: style.weight)
            : UIFont.systemFont(ofSize: size, weight: EvidenceLockedStyle.uiWeight(style.weight))
        if style.monospacedDigits {
            let descriptor = font.fontDescriptor.addingAttributes([
                .featureSettings: [[
                    UIFontDescriptor.FeatureKey.type: kNumberSpacingType,
                    UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector,
                ]],
            ])
            font = UIFont(descriptor: descriptor, size: size)
        }
        let lineBox = style.lineHeight * scale
        let leading = lineBox - font.lineHeight
        return content
            .font(Font(font))
            .tracking(style.tracking * scale)
            .textCase(style.uppercase ? .uppercase : nil)
            .modifier(BriefingLineBox(lineBox: lineBox, leading: leading))
    }
}

/// Reproduces the CSS line box. A box taller than the font's own line uses
/// spacing plus half-leading padding; a tighter box (hero headlines at
/// 1.06) uses the iOS 26 exact line height so wrapped lines keep the
/// locked rhythm.
private struct BriefingLineBox: ViewModifier {
    let lineBox: CGFloat
    let leading: CGFloat

    func body(content: Content) -> some View {
        if leading >= 0 {
            content
                .lineSpacing(leading)
                .padding(.vertical, leading / 2)
        } else if #available(iOS 26.0, *) {
            content.lineHeight(.exact(points: lineBox))
        } else {
            content.padding(.vertical, leading / 2)
        }
    }
}

extension View {
    func briefingText(_ style: BriefingTextStyle) -> some View {
        modifier(BriefingTextModifier(style))
    }

    /// An inline CSS span inside a block whose own font is `parentSize`
    /// (the 14 px phone default): the line box is the parent's strut
    /// (`parentSize × 1.42`) and the small text sits on the strut's
    /// baseline, below where a centered box would put it.
    func briefingStrutText(_ style: BriefingTextStyle, parentSize: CGFloat = 14, parentLineHeight: CGFloat? = nil) -> some View {
        let ascent: CGFloat = 1.038, descent: CGFloat = 0.222
        let strut = parentLineHeight ?? (parentSize * 1.42 * 100).rounded() / 100
        let parentBaseline = (strut - parentSize * (ascent + descent)) / 2 + parentSize * ascent
        let childBaseline = (strut - style.size * (ascent + descent)) / 2 + style.size * ascent
        var boxed = style
        boxed.lineHeight = strut
        return modifier(BriefingTextModifier(boxed)).offset(y: parentBaseline - childBaseline)
    }
}

extension String {
    /// Chrome wraps greedily; iOS pushes a lone last word down to avoid a
    /// widow. A trailing breakable space + zero-width word joiner gives the
    /// final line a second (invisible) word so CoreText keeps Chrome's
    /// greedy line breaks. Invisible to VoiceOver.
    var greedyWrap: String { isEmpty ? self : self + " \u{2060}" }
}

// MARK: CSS borders

extension View {
    /// A CSS 1 px border on one edge: like `border-top` / `border-bottom`
    /// it adds its own height to the box (unlike a plain overlay).
    func briefingRule(_ edge: VerticalEdge, _ color: Color) -> some View {
        padding(edge == .top ? .top : .bottom, 1)
            .overlay(alignment: edge == .top ? .top : .bottom) { Rectangle().fill(color).frame(height: 1) }
    }
}

// MARK: Greedy paragraphs

/// Hosts the paragraph label at its own natural height: TextKit needs a
/// little extra room for the half-leading baseline shift, while SwiftUI
/// lays the paragraph out at the exact CSS box (line count × line box).
final class BriefingParagraphView: UIView {
    let label: UILabel = {
        let label = UILabel()
        label.numberOfLines = 0
        label.lineBreakMode = .byWordWrapping
        label.lineBreakStrategy = []
        label.adjustsFontForContentSizeCategory = false
        return label
    }()

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = false
        isAccessibilityElement = false
        addSubview(label)
        setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        setContentHuggingPriority(.defaultLow, for: .horizontal)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let natural = label.sizeThatFits(CGSize(width: bounds.width, height: .greatestFiniteMagnitude))
        label.frame = CGRect(x: 0, y: 0, width: bounds.width, height: max(bounds.height, ceil(natural.height)))
    }
}

/// Multi-line copy rendered with Chrome's greedy line breaking. SwiftUI
/// `Text` on iOS 26/27 pushes words down to avoid short last lines, which
/// changes the locked wraps; a `UILabel` with an empty line-break strategy
/// breaks greedily, and its CSS line box is reproduced with an exact line
/// height plus a half-leading baseline shift. Dynamic Type scales the style.
struct BriefingParagraph: UIViewRepresentable {
    let text: String
    let style: BriefingTextStyle
    let color: Color
    var alignment: NSTextAlignment = .natural
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(_ text: String, _ style: BriefingTextStyle, color: Color, alignment: NSTextAlignment = .natural) {
        self.text = text
        self.style = style
        self.color = color
        self.alignment = alignment
    }

    func makeUIView(context: Context) -> BriefingParagraphView {
        BriefingParagraphView()
    }

    func updateUIView(_ view: BriefingParagraphView, context: Context) {
        view.label.attributedText = attributed(traits: view.traitCollection)
        view.label.accessibilityLabel = style.uppercase ? text.uppercased() : text
        view.setNeedsLayout()
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView view: BriefingParagraphView, context: Context) -> CGSize? {
        let label = view.label
        let width = proposal.width ?? UIView.layoutFittingExpandedSize.width
        guard width.isFinite, width > 0 else { return nil }
        // Count lines with an unshifted copy (a baseline offset perturbs
        // TextKit's fragment heights), then size the CSS box exactly as
        // line count × line box.
        let measure = NSMutableAttributedString(attributedString: attributed(traits: label.traitCollection))
        measure.removeAttribute(.baselineOffset, range: NSRange(location: 0, length: measure.length))
        let measuring = Self.measuringLabel
        measuring.attributedText = measure
        let size = measuring.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        label.attributedText = attributed(traits: label.traitCollection)
        let lineBox = style.lineHeight * scale
        let lines = max(1, (size.height / lineBox).rounded())
        return CGSize(width: proposal.width ?? ceil(size.width), height: lines * lineBox)
    }

    /// TextKit puts a fixed line height's extra leading above the glyphs;
    /// measured against Chrome's half-leading, a positive leading needs
    /// the full difference as baseline offset and a negative (tight
    /// headline) leading a third of it.
    static func baselineOffset(lineBox: CGFloat, fontLineHeight: CGFloat) -> CGFloat {
        let leading = lineBox - fontLineHeight
        return leading * (leading >= 0 ? baselineFactor : baselineFactor / 3)
    }

    @MainActor private static let measuringLabel: UILabel = {
        let label = UILabel()
        label.numberOfLines = 0
        label.lineBreakMode = .byWordWrapping
        label.lineBreakStrategy = []
        return label
    }()

    static let baselineFactor: CGFloat = {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "-physiqueos.briefing-review.baseline-factor"),
           arguments.indices.contains(index + 1), let value = Double(arguments[index + 1]) {
            return CGFloat(value)
        }
        #endif
        return 1
    }()

    private var scale: CGFloat {
        UIFontMetrics(forTextStyle: style.relativeTo.uiTextStyle)
            .scaledValue(for: 1, compatibleWith: UITraitCollection(preferredContentSizeCategory: dynamicTypeSize.uiContentSizeCategory))
    }

    private func attributed(traits: UITraitCollection) -> NSAttributedString {
        let size = style.size * scale
        let font: UIFont = style.jakarta
            ? PlusJakartaSans.uiFont(size: size, weight: style.weight)
            : UIFont.systemFont(ofSize: size, weight: EvidenceLockedStyle.uiWeight(style.weight))
        let lineBox = style.lineHeight * scale
        let paragraph = NSMutableParagraphStyle()
        paragraph.minimumLineHeight = lineBox
        paragraph.maximumLineHeight = lineBox
        paragraph.lineBreakMode = .byWordWrapping
        paragraph.lineBreakStrategy = []
        paragraph.alignment = alignment
        let content = style.uppercase ? text.uppercased() : text
        return NSAttributedString(string: content, attributes: [
            .font: font,
            .foregroundColor: UIColor(color),
            .kern: style.tracking * scale,
            .paragraphStyle: paragraph,
            // CSS centers the glyph box in the line box (half-leading).
            .baselineOffset: Self.baselineOffset(lineBox: lineBox, fontLineHeight: font.lineHeight),
        ])
    }
}

private extension Font.TextStyle {
    var uiTextStyle: UIFont.TextStyle {
        switch self {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }
}

private extension DynamicTypeSize {
    var uiContentSizeCategory: UIContentSizeCategory {
        switch self {
        case .xSmall: .extraSmall
        case .small: .small
        case .medium: .medium
        case .large: .large
        case .xLarge: .extraLarge
        case .xxLarge: .extraExtraLarge
        case .xxxLarge: .extraExtraExtraLarge
        case .accessibility1: .accessibilityMedium
        case .accessibility2: .accessibilityLarge
        case .accessibility3: .accessibilityExtraLarge
        case .accessibility4: .accessibilityExtraExtraLarge
        case .accessibility5: .accessibilityExtraExtraExtraLarge
        @unknown default: .large
        }
    }
}

// MARK: CSS gradients

/// `linear-gradient(<angle>deg, …)` with CSS geometry: the gradient line
/// runs through the box center at `angle` (0° = to top) and its length is
/// `|w·sin a| + |h·cos a|`, so corners land exactly on the end stops.
struct BriefingCSSGradient: View {
    let angle: Double
    let stops: [Gradient.Stop]

    var body: some View {
        GeometryReader { geometry in
            let w = max(geometry.size.width, 1)
            let h = max(geometry.size.height, 1)
            let radians = angle * .pi / 180
            let length = abs(w * sin(radians)) + abs(h * cos(radians))
            let dx = sin(radians) * length / 2
            let dy = -cos(radians) * length / 2
            LinearGradient(
                stops: stops,
                startPoint: UnitPoint(x: (w / 2 - dx) / w, y: (h / 2 - dy) / h),
                endPoint: UnitPoint(x: (w / 2 + dx) / w, y: (h / 2 + dy) / h)
            )
        }
    }
}

/// Appearance-switched backgrounds (dark field vs Mineral Light field).
struct BriefingAppearanceBackground<Dark: View, Light: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    @ViewBuilder var dark: Dark
    @ViewBuilder var light: Light

    var body: some View {
        if colorScheme == .dark { dark } else { light }
    }
}

// MARK: Detail navigation (`.nav` / `.nav-chip`)

/// The Founder's explicit requirement: clear navigation to Home and to
/// Briefing History from the top of every Briefing Detail screen. Locked
/// as two 44 pt chips (`‹ Home`, `▦ Briefing History`).
struct BriefingDetailHeader: View {
    static let navigationLabels = ["Home", "Briefing History"]
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.briefingPalette) private var c
    var onHome: () -> Void
    var onHistory: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            chip(glyph: "‹", title: Self.navigationLabels[0], identifier: "briefing.nav.home", action: onHome)
            chip(glyph: "▦", title: Self.navigationLabels[1], identifier: "briefing.nav.history", action: onHistory)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 10)
    }

    private func chip(glyph: String, title: String, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(glyph).accessibilityHidden(true)
                Text(title)
            }
            .briefingText(.j(11, 700))
            .foregroundStyle(c.ink)
            .padding(.horizontal, 12)
            .frame(height: 44)
            .background(
                colorScheme == .dark ? BriefingPalette.fixed(0x0D2030, 0.72) : BriefingPalette.fixed(0xFFFFFF, 0.46),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(c.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityIdentifier(identifier)
    }
}

/// The complete pre-hero surface. Keeping this as a dedicated component
/// makes the navigation-only contract structural rather than a per-cadence
/// convention that can drift.
struct BriefingDetailPreHeroNavigation: View {
    static let contentRoles = ["navigation"]
    var onHome: () -> Void
    var onHistory: () -> Void

    var body: some View {
        BriefingDetailHeader(onHome: onHome, onHistory: onHistory)
    }
}

// MARK: Hero field (`.hero`)

/// The immersive teal/navy (Mineral: pale teal) lead field shared by every
/// cadence. Full-bleed, with the locked decorative ring at lower right.
struct BriefingHeroField<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    var minHeight: CGFloat = 632
    var padding = EdgeInsets(top: 30, leading: 24, bottom: 28, trailing: 24)
    /// Monthly's zine lead: larger ring field, second disc, 54% mid stop.
    var monthly = false
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .topLeading)
            .background {
                BriefingAppearanceBackground {
                    BriefingCSSGradient(angle: 155, stops: [
                        .init(color: BriefingPalette.fixed(0x087F76), location: 0),
                        .init(color: BriefingPalette.fixed(0x0B4860), location: monthly ? 0.54 : 0.58),
                        .init(color: BriefingPalette.fixed(0x142A55), location: 1),
                    ])
                } light: {
                    BriefingCSSGradient(angle: 155, stops: [
                        .init(color: BriefingPalette.fixed(0xD9EEEA), location: 0),
                        .init(color: BriefingPalette.fixed(0xC7E3E3), location: monthly ? 0.54 : 0.58),
                        .init(color: BriefingPalette.fixed(0xD8E0EF), location: 1),
                    ])
                }
                // Decorations are overlays so they never size the field.
                .overlay(alignment: .topTrailing) {
                    if monthly {
                        // `.hero:after` — 280 px disc, right −90, top 158.
                        Circle()
                            .fill(colorScheme == .dark ? BriefingPalette.fixed(0x0C334A, 0.34) : BriefingPalette.fixed(0x6F99A4, 0.13))
                            .frame(width: 280, height: 280)
                            .offset(x: 90, y: 158)
                            .accessibilityHidden(true)
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    // `.hero:before` — recurring: 430 px circle, 62 px border,
                    // right −220, bottom −84; Monthly: 500 / 68, −250 / −120.
                    Circle()
                        .strokeBorder(
                            colorScheme == .dark ? BriefingPalette.fixed(0x55DF9A, monthly ? 0.21 : 0.22) : BriefingPalette.fixed(0x168963, 0.17),
                            lineWidth: monthly ? 68 : 62
                        )
                        .frame(width: monthly ? 500 : 430, height: monthly ? 500 : 430)
                        .offset(x: monthly ? 250 : 220, y: monthly ? 120 : 84)
                        .accessibilityHidden(true)
                }
                .clipped()
            }
            // `margin: 0 −15px` — the field is full-bleed across the 15 px page gutter.
            .padding(.horizontal, -BriefingLayout.pageGutter)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("briefing.hero")
    }
}

enum BriefingLayout {
    /// `.content { padding: 0 15px 60px }`.
    static let pageGutter: CGFloat = 15
}

/// `.topline`: eyebrow + right-aligned range.
struct BriefingHeroTopline: View {
    @Environment(\.briefingPalette) private var c
    @Environment(\.colorScheme) private var colorScheme
    let eyebrow: String
    let range: String
    /// Monthly's lavender eyebrow and translucent range (dark). In Mineral
    /// Light the eyebrow keeps the family purple: the harness's unchanged
    /// `#d0c4ff` would fall far below 4.5:1 on the pale field.
    var monthly = false

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Text(eyebrow.uppercased())
                .briefingText(.j(11, 800, tracking: 0.1))
                .foregroundStyle(monthly && colorScheme == .dark ? BriefingPalette.fixed(0xD0C4FF) : c.purple)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            if !range.isEmpty {
                Text(range)
                    .briefingText(.j(12, 400))
                    .foregroundStyle(monthly ? (colorScheme == .dark ? BriefingPalette.fixed(0xF4F7F8, 0.7) : BriefingPalette.fixed(0x102638, 0.64)) : c.muted)
                    .multilineTextAlignment(.trailing)
            }
        }
    }
}

/// The exact Confidence ring (`.ring`): a conic track with a 10 px band.
struct BriefingConfidenceRing: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.briefingPalette) private var c
    let score: Int
    var diameter: CGFloat = 188
    var scoreSize: CGFloat = 46

    var body: some View {
        ZStack {
            Circle().fill(colorScheme == .dark ? BriefingPalette.fixed(0x406F75, 0.62) : BriefingPalette.fixed(0x618489, 0.24))
            Circle()
                .trim(from: 0, to: CGFloat(min(max(score, 0), 100)) / 100)
                .rotation(.degrees(-90))
                .fill(c.green)
            Circle()
                .fill(colorScheme == .dark ? BriefingPalette.fixed(0x0C4252) : BriefingPalette.fixed(0xE5EFEB))
                .padding(10)
            VStack(spacing: 5) {
                Text("\(score)%")
                    .briefingText(.j(scoreSize, 800, 1))
                    .foregroundStyle(c.ink)
                    .monospacedDigit()
                Text("Confidence")
                    .briefingText(.j(10, 700, uppercase: true))
                    .foregroundStyle(c.secondary)
            }
        }
        .frame(width: diameter, height: diameter)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Confidence \(score) percent")
    }
}

/// `.confidence`: the ring at right with band, movement and reason copy
/// overlapping its lower left (`margin-top: −46px`).
struct BriefingHeroConfidence: View {
    @Environment(\.briefingPalette) private var c
    let score: Int
    let band: String
    let movement: String
    let reason: String
    var ringDiameter: CGFloat = 188
    var scoreSize: CGFloat = 46
    /// Monthly: `margin-top: 28`, `min-height: 202`, copy 205 wide, −55 overlap.
    var topMargin: CGFloat = 26
    var minHeight: CGFloat = 196
    var copyWidth: CGFloat = 210
    var overlap: CGFloat = 46
    var reasonColor: Color? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack { Spacer(minLength: 0); BriefingConfidenceRing(score: score, diameter: ringDiameter, scoreSize: scoreSize) }
            VStack(alignment: .leading, spacing: 5) {
                Text(band.uppercased())
                    .briefingText(.j(11, 800, tracking: 0.09))
                    .foregroundStyle(c.green)
                Text(movement)
                    .briefingText(.j(15, 700))
                    .foregroundStyle(c.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if !reason.isEmpty {
                    BriefingParagraph(reason, .j(12, 400, 1.48), color: reasonColor ?? c.secondary)
                }
            }
            .frame(width: copyWidth, alignment: .leading)
            .padding(.top, -overlap)
        }
        .padding(.top, topMargin)
        .frame(minHeight: minHeight + topMargin, alignment: .top)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("briefing.hero.confidence")
    }
}

/// `.hero-rule` + `h1` + `.meaning`.
struct BriefingHeroStatement: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.briefingPalette) private var c
    let headline: String
    let meaning: String
    var headlineSize: CGFloat = 40
    var headlineLineHeight: CGFloat = 1.06
    var showsRule = true
    var ruleTop: CGFloat = 20
    var meaningTop: CGFloat = 12
    var meaningColor: Color? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showsRule {
                BriefingHeroRule()
                    .padding(.top, ruleTop)
                    .padding(.bottom, 18)
            }
            BriefingParagraph(headline, .j(headlineSize, 700, headlineLineHeight, tracking: -0.025, relativeTo: .largeTitle), color: c.ink)
                .frame(maxWidth: 345, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("briefing.hero.headline")
            if !meaning.isEmpty {
                BriefingParagraph(meaning, .j(15, 400, 1.52), color: meaningColor ?? c.secondary)
                    .frame(maxWidth: 345, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, meaningTop)
            }
        }
    }
}

struct BriefingHeroRule: View {
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        Rectangle()
            .fill(colorScheme == .dark ? BriefingPalette.fixed(0xFFFFFF, 0.18) : BriefingPalette.fixed(0x102638, 0.14))
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

/// `.hero-footer`: labelled Strategy / Goal & Phase context columns.
struct BriefingHeroFooter: View {
    @Environment(\.briefingPalette) private var c
    let items: [(String, String)]
    /// CSS `grid-template-columns` fractions; one item spans the row.
    var fractions: [CGFloat] = [1.5, 0.55, 1.45]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingHeroRule()
            BriefingFractionRow(fractions: items.count == 1 ? [1] : Array(fractions.prefix(items.count)), spacing: 12) { index in
                VStack(alignment: .leading, spacing: 4) {
                    Text(items[index].0.uppercased())
                        .briefingText(.j(10, 800, tracking: 0.08))
                        .foregroundStyle(c.muted)
                    Text(items[index].1)
                        .briefingText(.j(12, 700))
                        .foregroundStyle(c.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.top, 14)
        }
        .padding(.top, 24)
        .accessibilityElement(children: .combine)
    }
}

/// A CSS `grid-template-columns: Xfr Yfr …` row (fractions of the space
/// left after gaps), top aligned.
struct BriefingFractionRow<Cell: View>: View {
    let fractions: [CGFloat]
    var spacing: CGFloat = 0
    @ViewBuilder var cell: (Int) -> Cell

    var body: some View {
        BriefingFractionLayout(fractions: fractions, spacing: spacing) {
            ForEach(fractions.indices, id: \.self) { index in cell(index) }
        }
    }
}

struct BriefingFractionLayout: Layout {
    /// `fr` fractions; a negative value is an `auto` (intrinsic) column.
    let fractions: [CGFloat]
    var spacing: CGFloat
    var centered = false

    private func widths(_ total: CGFloat, _ subviews: Subviews) -> [CGFloat] {
        let autos = fractions.indices.map { index -> CGFloat in
            guard fractions[index] < 0, index < subviews.count else { return 0 }
            return subviews[index].sizeThatFits(.unspecified).width
        }
        let sum = max(fractions.filter { $0 > 0 }.reduce(0, +), 0.0001)
        let free = max(total - spacing * CGFloat(max(fractions.count - 1, 0)) - autos.reduce(0, +), 0)
        return fractions.indices.map { fractions[$0] < 0 ? autos[$0] : free * max(fractions[$0], 0) / sum }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 360
        let w = widths(width, subviews)
        let height = subviews.indices.map { index in
            subviews[index].sizeThatFits(ProposedViewSize(width: index < w.count ? w[index] : 0, height: nil)).height
        }.max() ?? 0
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let w = widths(bounds.width, subviews)
        var x = bounds.minX
        for index in subviews.indices {
            let width = index < w.count ? w[index] : 0
            let size = subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil))
            let y = centered ? bounds.minY + (bounds.height - size.height) / 2 : bounds.minY
            subviews[index].place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(width: width, height: nil))
            x += width + spacing
        }
    }
}

// MARK: Body sections (`.section`)

/// How a section draws in Mineral Light. Dark is always the open canvas
/// with a bottom rule.
enum BriefingSectionField {
    case open
    /// Accepted rich-field Mineral Light surfaces.
    case energy, bodyComposition, training, recovery

    var isRich: Bool { self != .open }
}

/// `.section` — 20/4 px padding and a bottom rule on the open canvas; the
/// accepted Mineral Light rich fields carry their own dark color field.
struct BriefingSection<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    var field: BriefingSectionField = .open
    var verticalPadding: CGFloat = 20
    var identifier: String? = nil
    @ViewBuilder var content: Content

    var body: some View {
        let isRichLight = colorScheme == .light && field.isRich
        VStack(alignment: .leading, spacing: 0) { content }
            .environment(\.briefingPalette, isRichLight ? .richField : .standard)
            .padding(.vertical, verticalPadding)
            .padding(.horizontal, isRichLight ? 8 : 4)
            // CSS borders live inside the border-box: the rich Energy field's
            // 1 px frame and Body Composition's 3 px left rule narrow it.
            .padding(isRichLight && field == .energy ? 1 : 0)
            .padding(.leading, isRichLight && field == .bodyComposition ? 3 : 0)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background { if isRichLight { richBackground } }
            .padding(.bottom, isRichLight && field == .energy ? 0 : 1)
            .overlay(alignment: .bottom) {
                if !(isRichLight && field == .energy) {
                    Rectangle().fill(isRichLight ? BriefingPalette.richField.line : BriefingPalette.standard.line).frame(height: 1)
                }
            }
            .overlay { if isRichLight { richBorder } }
            .clipShape(RoundedRectangle(cornerRadius: isRichLight && field != .bodyComposition ? 18 : 0, style: .continuous))
            .shadow(color: isRichLight ? BriefingPalette.fixed(0x0F2A37, 0.12) : .clear, radius: 13, x: 0, y: 10)
            .padding(.horizontal, isRichLight ? -4 : 0)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(identifier ?? "")
    }

    @ViewBuilder
    private var richBackground: some View {
        switch field {
        case .energy:
            BriefingCSSGradient(angle: 145, stops: [
                .init(color: BriefingPalette.fixed(0x173746), location: 0),
                .init(color: BriefingPalette.fixed(0x1A3141), location: 0.70),
                .init(color: BriefingPalette.fixed(0x233647), location: 1),
            ])
        case .bodyComposition:
            BriefingCSSGradient(angle: 140, stops: [
                .init(color: BriefingPalette.fixed(0x352F57), location: 0),
                .init(color: BriefingPalette.fixed(0x243D55), location: 1),
            ])
        case .training:
            BriefingCSSGradient(angle: 145, stops: [
                .init(color: BriefingPalette.fixed(0x103D3B), location: 0),
                .init(color: BriefingPalette.fixed(0x143541), location: 0.76),
                .init(color: BriefingPalette.fixed(0x143541), location: 1),
            ])
        case .recovery:
            BriefingCSSGradient(angle: 135, stops: [
                .init(color: BriefingPalette.fixed(0x16394A), location: 0),
                .init(color: BriefingPalette.fixed(0x293052), location: 0.78),
                .init(color: BriefingPalette.fixed(0x293052), location: 1),
            ])
        case .open:
            EmptyView()
        }
    }

    @ViewBuilder
    private var richBorder: some View {
        switch field {
        case .energy:
            RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(BriefingPalette.fixed(0xF2BC4D, 0x55 / 255), lineWidth: 1)
        case .bodyComposition:
            HStack(spacing: 0) {
                Rectangle().fill(BriefingPalette.fixed(0xB7A4FF)).frame(width: 3)
                Spacer(minLength: 0)
            }
        default:
            EmptyView()
        }
    }
}

/// `.section-head`: 28 px icon tile, tracked label, optional trailing.
struct BriefingSectionHead<Trailing: View>: View {
    @Environment(\.briefingPalette) private var c
    let glyph: String
    let label: String
    let tone: BriefingTone
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 8) {
            Text(glyph)
                .briefingText(.j(14, 800))
                .foregroundStyle(tone.color(c))
                .frame(width: 28, height: 28)
                .background(tone.color(c).opacity(0.15), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .accessibilityHidden(true)
            Text(label.uppercased())
                .briefingText(.j(11, 800, tracking: 0.1))
                .foregroundStyle(tone.color(c))
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            trailing
        }
    }
}

extension BriefingSectionHead where Trailing == EmptyView {
    init(glyph: String, label: String, tone: BriefingTone) {
        self.init(glyph: glyph, label: label, tone: tone) { EmptyView() }
    }
}

/// `.section-title` (24 / 1.08) and `.statement` (27 / 800 / 1.06).
struct BriefingSectionTitle: View {
    @Environment(\.briefingPalette) private var c
    let text: String
    var size: CGFloat = 24
    var lineHeight: CGFloat = 1.08
    var top: CGFloat = 15

    var body: some View {
        BriefingParagraph(text, .j(size, 700, lineHeight, relativeTo: .title2), color: c.ink)
            .padding(.top, top)
    }
}

struct BriefingStatement: View {
    @Environment(\.briefingPalette) private var c
    let text: String

    var body: some View {
        BriefingParagraph(text, .j(27, 800, 1.06, relativeTo: .title), color: c.ink)
            .padding(.top, 10)
    }
}

/// `.body-copy`: 15 px secondary narrative.
struct BriefingBodyCopy: View {
    @Environment(\.briefingPalette) private var c
    let text: String
    var top: CGFloat = 9

    var body: some View {
        BriefingParagraph(text, .j(15, 400), color: c.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, top)
    }
}

/// `.metrics`: three equal label/value columns between two rules.
struct BriefingMetricsRow: View {
    @Environment(\.briefingPalette) private var c
    let items: [(String, String)]

    var body: some View {
        BriefingFractionRow(fractions: Array(repeating: 1, count: items.count), spacing: 8) { index in
            VStack(alignment: .leading, spacing: 4) {
                Text(items[index].0.uppercased())
                    .briefingText(.j(10, 800, tracking: 0.08))
                    .foregroundStyle(c.muted)
                Text(items[index].1)
                    .briefingText(.j(14, 800))
                    .foregroundStyle(c.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .accessibilityElement(children: .combine)
        }
        .padding(.vertical, 12)
        .briefingRule(.top, c.line)
        .briefingRule(.bottom, c.line)
        .padding(.top, 14)
    }
}

/// `.legend`: 9 px swatches.
struct BriefingLegend: View {
    @Environment(\.briefingPalette) private var c
    let items: [(String, Color)]

    var body: some View {
        HStack(spacing: 14) {
            ForEach(items.indices, id: \.self) { index in
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2).fill(items[index].1).frame(width: 9, height: 9)
                    Text(items[index].0)
                        .briefingText(.j(11, 400))
                        .foregroundStyle(c.muted)
                }
            }
        }
        .padding(.top, 11)
        .accessibilityElement(children: .combine)
    }
}

// MARK: Energy bars (`.energy-chart`)

/// One categorical day of paired energy bars.
struct BriefingEnergyBar: Identifiable, Equatable {
    var id: String { date }
    let date: String
    let label: String
    let intake: Int?
    let expenditure: Int?
}

/// The locked grouped Intake / Estimated expenditure bars. Drawn directly
/// (not Swift Charts) so the bar geometry matches the harness exactly.
/// Interaction uses the corrected Evidence arbitration: a tap selects the
/// nearest day, a predominantly horizontal pan scrubs, and a vertical
/// swipe that starts on the chart scrolls the page. Selection only
/// replaces the chart title with that day's canonical values.
struct BriefingEnergyBars: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.briefingPalette) private var c
    let bars: [BriefingEnergyBar]
    var title: String
    var compact = false
    /// The light rich field draws the chart on its own inset plate.
    var richPlate = false
    @State private var selectedDate: String?

    static func nearestIndex(toX x: CGFloat, width: CGFloat, count: Int) -> Int? {
        guard count > 0, width > 0 else { return nil }
        let index = Int((x / width) * CGFloat(count))
        return min(max(index, 0), count - 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(selectedTitle ?? title)
                .briefingText(.j(13, 750))
                .foregroundStyle(c.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .padding(.top, 16)
                .padding(.bottom, 10)
                .accessibilityIdentifier("briefing.energy.chartTitle")
            chart
            BriefingLegend(items: [("Intake", c.amber), ("Estimated expenditure", c.blue)])
        }
    }

    private var selectedTitle: String? {
        guard let selectedDate, let bar = bars.first(where: { $0.date == selectedDate }) else { return nil }
        let intake = bar.intake.map { "Intake \($0.formatted()) kcal" } ?? "No intake"
        let expenditure = bar.expenditure.map { "Expenditure \($0.formatted()) kcal" } ?? "No expenditure"
        return "\(bar.label) · \(intake) · \(expenditure)"
    }

    private var maxValue: CGFloat {
        CGFloat(bars.flatMap { [$0.intake ?? 0, $0.expenditure ?? 0] }.max() ?? 1)
    }

    private var chart: some View {
        GeometryReader { geometry in
            let inset: CGFloat = compact ? 14 : (richPlate ? 8 : 0)
            let gap: CGFloat = compact ? 22 : 5
            let plot = max(geometry.size.width - inset * 2, 1)
            let dayWidth = (plot - gap * CGFloat(max(bars.count - 1, 0))) / CGFloat(max(bars.count, 1))
            let barHeight: CGFloat = 111
            ZStack(alignment: .topLeading) {
                ForEach(Array(bars.enumerated()), id: \.element.id) { index, bar in
                    let x = inset + CGFloat(index) * (dayWidth + gap)
                    let dim = selectedDate != nil && selectedDate != bar.date
                    let half = (dayWidth - 3) / 2
                    if let intake = bar.intake {
                        let h = max(4, CGFloat(intake) / maxValue * barHeight)
                        UnevenRoundedRectangle(topLeadingRadius: 1, topTrailingRadius: 1)
                            .fill(c.amber)
                            .frame(width: half, height: h)
                            .offset(x: x, y: 8 + barHeight - h)
                            .opacity(dim ? 0.35 : 1)
                    }
                    if let expenditure = bar.expenditure {
                        let h = max(4, CGFloat(expenditure) / maxValue * barHeight)
                        UnevenRoundedRectangle(topLeadingRadius: 1, topTrailingRadius: 1)
                            .fill(c.blue)
                            .frame(width: half, height: h)
                            .offset(x: x + half + 3, y: 8 + barHeight - h)
                            .opacity(dim ? 0.35 : 1)
                    }
                    if bar.intake == nil || bar.expenditure == nil {
                        Rectangle()
                            .fill(c.muted.opacity(0.5))
                            .frame(width: 2, height: barHeight)
                            .offset(x: x + dayWidth / 2 - 1, y: 8)
                    }
                    Text(bar.label)
                        .briefingText(.j(10, 700))
                        .foregroundStyle(c.muted)
                        .frame(width: dayWidth)
                        .offset(x: x, y: 8 + barHeight + 8 - 1.1)
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { location in select(at: location.x, width: geometry.size.width, inset: inset, toggle: true) }
            .gesture(EvidenceHorizontalScrubGesture { location in select(at: location.x, width: geometry.size.width, inset: inset, toggle: false) })
        }
        .frame(height: 145)
        .background {
            if richPlate {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(colorScheme == .dark ? Color.clear : BriefingPalette.fixed(0x081721, 0x5C / 255))
            }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(c.line).frame(height: 1) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Daily intake and estimated expenditure across \(bars.count) days")
        .accessibilityValue(bars.map { bar in
            "\(bar.label): intake \(bar.intake.map { "\($0) kcal" } ?? "none"), expenditure \(bar.expenditure.map { "\($0) kcal" } ?? "none")"
        }.joined(separator: "; "))
        .accessibilityIdentifier("briefing.energy.chart")
    }

    private func select(at x: CGFloat, width: CGFloat, inset: CGFloat, toggle: Bool) {
        guard let index = Self.nearestIndex(toX: x - inset, width: width - inset * 2, count: bars.count) else { return }
        let date = bars[index].date
        if toggle, selectedDate == date { selectedDate = nil } else { selectedDate = date }
    }
}

// MARK: States (`.state-center`)

/// Loading / unavailable / not-ready / failed — the locked History state
/// language (spinner or 64 px glyph disc + centered copy) on the Briefing
/// canvas, with an optional 44 pt action.
struct BriefingStateView: View {
    @Environment(\.briefingPalette) private var c
    enum Kind { case loading, glyph(String) }
    let kind: Kind
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?
    var jakarta = true
    var identifier: String

    var body: some View {
        VStack(spacing: 14) {
            switch kind {
            case .loading:
                ProgressView()
                    .controlSize(.regular)
                    .tint(c.cyan)
                    .frame(width: 30, height: 30)
            case .glyph(let glyph):
                Text(glyph)
                    .briefingText(jakarta ? .j(25, 700) : .sf(25, 700))
                    .foregroundStyle(c.cyan)
                    .frame(width: 64, height: 64)
                    .background(BriefingPalette.d(0x132B39, 0xE5F1EE), in: Circle())
                    .accessibilityHidden(true)
            }
            BriefingParagraph(
                message,
                isLoading ? (jakarta ? .j(15, 500) : .sf(15, 500)) : (jakarta ? .j(20, 780, 1.1, tracking: -0.02) : .sf(20, 780, lineHeight: 22, tracking: -0.02)),
                color: c.secondary,
                alignment: .center
            )
            .frame(maxWidth: 330)
            if let actionTitle, let action {
                Button(action: action) {
                    Text(actionTitle)
                        .briefingText(jakarta ? .j(15, 800) : .sf(15, 800))
                        .foregroundStyle(c.ink)
                        .padding(.horizontal, 22)
                        .frame(minHeight: 44)
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(c.line, lineWidth: 1))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("\(identifier).action")
            }
        }
        .frame(maxWidth: .infinity, minHeight: 560)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
    }

    private var isLoading: Bool { if case .loading = kind { return true } else { return false } }
}

// MARK: Weight (`.weight-grid`)

/// 112 px value column (27 px value + 13 px delta) beside the narrative.
struct BriefingWeightGrid: View {
    @Environment(\.briefingPalette) private var c
    let value: String
    let delta: String
    let note: String

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 0) {
                Text(value)
                    .briefingText(.j(27, 800, 1))
                    .foregroundStyle(c.ink)
                    .lineLimit(1)
                    .fixedSize()
                Text(delta)
                    .briefingText(.j(13, 800))
                    .foregroundStyle(c.blue)
                    .padding(.top, 7)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: 112, alignment: .leading)
            if !note.isEmpty {
                BriefingParagraph(note, .j(15, 400, 1.45), color: c.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // `p.weight-note` keeps the UA 1em block margins.
                    .padding(.vertical, 15)
            } else {
                Spacer(minLength: 0)
            }
        }
        .padding(.top, 14)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("briefing.weight")
    }
}

// MARK: Body Composition (`.body-metrics`)

struct BriefingBodyMetrics: View {
    @Environment(\.briefingPalette) private var c
    let items: [(String, String)]

    var body: some View {
        BriefingFractionRow(fractions: Array(repeating: 1, count: items.count)) { index in
            VStack(alignment: .leading, spacing: 4) {
                Text(items[index].0.uppercased())
                    .briefingText(.j(10, 800, tracking: 0.08))
                    .foregroundStyle(c.muted)
                Text(items[index].1)
                    .briefingText(.j(15, 700))
                    .foregroundStyle(c.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .leading) {
                if index > 0 { Rectangle().fill(c.line).frame(width: 1) }
            }
            .accessibilityElement(children: .combine)
        }
        .padding(.vertical, 1)
        .briefingRule(.top, c.line)
        .briefingRule(.bottom, c.line)
        .padding(.top, 14)
    }
}

/// Section head for Body Composition: icon + label with the scan date at
/// right (`.body-top`).
struct BriefingBodyCompositionSection: View {
    @Environment(\.briefingPalette) private var c
    let scanDate: String
    let bodyFat: String
    let leanMass: String
    let fatMass: String
    var narrative: String = ""
    var objective: String? = nil

    var body: some View {
        BriefingSection(field: .bodyComposition, identifier: "briefing.section.bodyComposition") {
            BriefingSectionHead(glyph: "◇", label: "Body Composition", tone: .purple) {
                Text(BriefingDateFormatting.monthDay(scanDate))
                    .briefingText(.j(12, 400))
                    .foregroundStyle(BriefingPaletteReader.muted)
            }
            BriefingBodyMetrics(items: [("Body Fat", bodyFat), ("Lean Mass", leanMass), ("Fat Mass", fatMass)])
            if !narrative.isEmpty {
                BriefingBodyCopy(text: narrative)
            }
            if let objective, !objective.isEmpty {
                BriefingObjectiveLine(text: "Current objective · \(objective)")
            }
        }
    }
}

/// Reads the section's resolved palette for a nested view.
enum BriefingPaletteReader {
    static var muted: some ShapeStyle { BriefingMutedStyle() }
}

private struct BriefingMutedStyle: ShapeStyle {
    func resolve(in environment: EnvironmentValues) -> Color {
        environment.briefingPalette.muted
    }
}

struct BriefingObjectiveLine: View {
    @Environment(\.briefingPalette) private var c
    let text: String

    var body: some View {
        BriefingParagraph(text, .j(11, 400), color: c.muted)
            .padding(.top, 10)
            // `p.body-objective` keeps the UA 1em bottom margin.
            .padding(.bottom, 11)
    }
}

// MARK: Training (`.training`)

/// The recurring Briefing Training composition shared by Weekly and
/// Midweek: title, narrative, coverage copy + rail, Highlights rows and
/// the 2×2 Priority Muscle Group rail. Every value is canonical.
struct BriefingTrainingResponseCard: View {
    static let presentationStyle = "dense-analytical-rows"
    let training: WeeklyTrainingSection
    /// Midweek joins a highlight's headline and detail on the detail line.
    var joinsHeadlineIntoDetail = false
    var showsCoverageLegend = false

    var body: some View {
        BriefingSection(field: .training, identifier: "briefing.section.training") {
            BriefingTrainingResponseContent(training: training, joinsHeadlineIntoDetail: joinsHeadlineIntoDetail, showsCoverageLegend: showsCoverageLegend)
        }
    }
}

/// The Training body, resolved inside the section so a Mineral Light rich
/// field reads its own (light-on-dark) palette.
private struct BriefingTrainingResponseContent: View {
    @Environment(\.briefingPalette) private var c
    let training: WeeklyTrainingSection
    let joinsHeadlineIntoDetail: Bool
    let showsCoverageLegend: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingSectionHead(glyph: "◆", label: "Training Response", tone: .green)
                .accessibilityIdentifier("briefing.trainingResponse")
            if let headline = training.headline, !headline.isEmpty {
                BriefingParagraph(headline, .j(25, 700, 1.08, relativeTo: .title2), color: c.ink)
                    .frame(maxWidth: 330, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 15)
            }
            if !training.narrative.isEmpty {
                BriefingBodyCopy(text: training.narrative)
            }
            BriefingParagraph(coverage, .j(12, 400), color: c.muted)
                .padding(.top, 10)
            if railTotal > 0 {
                coverageRail
                if showsCoverageLegend { coverageLegend }
            }
            if let highlights = training.highlights, !highlights.isEmpty {
                subLabel("🔥 Highlights", color: c.green)
                ForEach(highlights) { highlight in highlightRow(highlight) }
            }
            if let groups = training.priorityGroups, !groups.isEmpty {
                subLabel("🎯 Priority Muscle Groups", color: c.muted)
                priorityGrid(groups)
            }
            if let watch = training.watch, !watch.message.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    Text([watch.exercise, watch.status].compactMap { $0 }.joined(separator: " · ").uppercased())
                        .briefingText(.j(10, 800, tracking: 0.08))
                        .foregroundStyle(c.amber)
                    BriefingParagraph(watch.message, .j(12, 400), color: c.secondary)
                }
                .padding(.top, 14)
            }
        }
    }

    private var coverage: String {
        var parts: [String] = []
        if let trainingDayCount = training.trainingDayCount { parts.append("\(trainingDayCount) training days") }
        parts.append("\(training.comparableCategoryCount) reviewed categories")
        parts.append("\(training.improvingCount) improving")
        if training.steadyCount > 0 { parts.append("\(training.steadyCount) steady") }
        if let plateauing = training.plateauingCount, plateauing > 0 { parts.append("\(plateauing) plateauing") }
        if let regressing = training.regressingCount, regressing > 0 { parts.append("\(regressing) regressing") }
        return parts.joined(separator: " · ")
    }

    private var railSegments: [(Int, Color)] {
        [
            (training.improvingCount, c.green),
            (training.steadyCount, c.blue),
            (training.plateauingCount ?? 0, c.amber),
            (training.regressingCount ?? 0, BriefingPalette.d(0xFF7187, 0xC54157)),
            (training.insufficientCount ?? 0, c.muted),
        ].filter { $0.0 > 0 }
    }

    private var railTotal: Int { railSegments.reduce(0) { $0 + $1.0 } }

    /// `.coverage-rail`: proportional segments with 3 px gaps on the track.
    private var coverageRail: some View {
        GeometryReader { geometry in
            let segments = railSegments
            let gaps = CGFloat(max(segments.count - 1, 0)) * 3
            let free = max(geometry.size.width - gaps, 0)
            HStack(spacing: 3) {
                ForEach(segments.indices, id: \.self) { index in
                    Rectangle().fill(segments[index].1)
                        .frame(width: free * CGFloat(segments[index].0) / CGFloat(max(railTotal, 1)))
                }
            }
        }
        .frame(height: 9)
        .background(c.track)
        .padding(.top, 10)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(railSegments.isEmpty ? "No reviewed categories" : coverage)
    }

    private var coverageLegend: some View {
        HStack(spacing: 12) {
            Text("● \(training.improvingCount) improving")
            if training.steadyCount > 0 { Text("■ \(training.steadyCount) steady") }
            if let plateauing = training.plateauingCount, plateauing > 0 { Text("▲ \(plateauing) plateauing") }
        }
        .briefingText(.j(11, 400))
        .foregroundStyle(c.muted)
        .padding(.top, 7)
        .accessibilityHidden(true)
    }

    private func subLabel(_ text: String, color: Color) -> some View {
        Text(text)
            .briefingText(.j(11, 800, tracking: 0.08))
            .foregroundStyle(color)
            .padding(.top, 20)
            .padding(.bottom, 9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .briefingRule(.bottom, c.line)
            .accessibilityAddTraits(.isHeader)
    }

    /// `.highlight`: name + record | performance | ▲ delta, detail below.
    private func highlightRow(_ highlight: BriefingTrainingHighlight) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingFractionLayout(fractions: [1.2, 0.9, -1], spacing: 8, centered: true) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(highlight.exerciseName)
                        .briefingText(.j(13, 700))
                        .foregroundStyle(c.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(highlight.recordType.uppercased())
                        .briefingText(.j(10, 800))
                        .foregroundStyle(c.muted)
                }
                Text(highlight.performanceValue ?? highlight.headline)
                    .briefingText(.j(14, 800))
                    .foregroundStyle(c.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("▲ \(highlight.delta)")
                    .briefingText(.j(12, 800))
                    .foregroundStyle(c.green)
                    .fixedSize()
            }
            let detail = joinsHeadlineIntoDetail ? [highlight.headline, highlight.detail].filter { !$0.isEmpty }.joined(separator: " ") : highlight.detail
            if !detail.isEmpty {
                BriefingParagraph(detail, .j(11, 400), color: c.muted)
                    .padding(.top, 5)
            }
        }
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .briefingRule(.bottom, c.line)
        .accessibilityElement(children: .combine)
    }

    /// `.priority-list`: the accepted 2×2 analytical rail.
    private func priorityGrid(_ groups: [BriefingTrainingPriorityGroup]) -> some View {
        let rows = stride(from: 0, to: groups.count, by: 2).map { Array(groups[$0..<min($0 + 2, groups.count)]) }
        return VStack(alignment: .leading, spacing: 7) {
            ForEach(rows.indices, id: \.self) { row in
                HStack(alignment: .top, spacing: 10) {
                    ForEach(rows[row]) { group in priorityCell(group) }
                    if rows[row].count == 1 { Color.clear.frame(maxWidth: .infinity, maxHeight: 0) }
                }
            }
        }
        .padding(.top, 8)
    }

    private func priorityCell(_ group: BriefingTrainingPriorityGroup) -> some View {
        let tone = toneColor(group.tone)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(group.label)
                    .briefingText(.j(12, 700, 1.2))
                    .foregroundStyle(c.ink)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if let count = group.comparableExerciseCount {
                    Text("\(count) \(count == 1 ? "exercise" : "exercises")")
                        .briefingText(.j(11, 800))
                        .foregroundStyle(c.muted)
                        .fixedSize()
                }
            }
            HStack(spacing: 6) {
                Circle().fill(tone).frame(width: 7, height: 7)
                Text(group.statusLabel)
                    .briefingText(.j(11, 400))
                    .foregroundStyle(c.muted)
                    .fixedSize()
                if let count = group.comparableExerciseCount {
                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            Rectangle().fill(c.track)
                            Rectangle().fill(tone).frame(width: geometry.size.width * min(CGFloat(count) * 0.24, 1))
                        }
                    }
                    .frame(minWidth: 22, maxWidth: .infinity)
                    .frame(height: 3)
                } else {
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.top, 7)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .briefingRule(.bottom, c.line)
        .accessibilityElement(children: .combine)
    }

    private func toneColor(_ tone: String) -> Color {
        switch tone.lowercased() {
        case "success", "improving": c.green
        case "evidence", "steady": c.blue
        case "warning", "plateauing": c.amber
        case "danger", "error", "regressing": BriefingPalette.d(0xFF7187, 0xC54157)
        case "neutral", "insufficient", "insufficient_data", "building": c.muted
        default: c.green
        }
    }
}

// MARK: Coach's Take finale (`.coach`)

/// The authored navy close shared by Weekly and Midweek: Biggest Takeaway,
/// What To Do, then the cadence close (Into Next Week / What To Watch).
struct BriefingCoachFinale: View {
    @Environment(\.colorScheme) private var colorScheme
    let takeaway: String
    let recommendation: String
    /// Server-owned "What To Watch" text (Midweek).
    let watch: String?
    let actionTitle: String
    let actions: [String]

    init(takeaway: String, recommendation: String, watch: String? = nil, actionTitle: String = "", actions: [String] = []) {
        self.takeaway = takeaway
        self.recommendation = recommendation
        self.watch = watch
        self.actionTitle = actionTitle
        self.actions = actions
    }

    /// A slot with no distinct Server content is omitted entirely — heading
    /// and body together — never rendered with an empty body.
    private var hasTakeaway: Bool { !takeaway.isEmpty }
    private var hasRecommendation: Bool { !recommendation.isEmpty }
    private var hasWatch: Bool { (watch?.isEmpty == false) }

    /// Exactly which slot headings this instance renders, in order.
    var renderedSectionTitles: [String] {
        [
            hasTakeaway ? "Biggest Takeaway" : nil,
            hasRecommendation ? "What To Do" : nil,
            hasWatch ? "What To Watch" : nil,
            !actions.isEmpty ? actionTitle : nil,
        ].compactMap { $0 }
    }

    var body: some View {
        if !renderedSectionTitles.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text("COACH'S TAKE")
                    .briefingText(.j(11, 800, tracking: 0.1))
                    .foregroundStyle(colorScheme == .dark ? Color.white.opacity(0.8) : BriefingPalette.fixed(0xC1B4FF))
                    .accessibilityAddTraits(.isHeader)
                    .padding(.bottom, 14)
                if hasTakeaway { block("💡 Biggest Takeaway") { paragraph(takeaway) } }
                if hasRecommendation { block("🧠 What To Do") { paragraph(recommendation) } }
                if let watch, hasWatch { block("👀 What To Watch") { paragraph(watch) } }
                if !actions.isEmpty {
                    block("🎯 \(actionTitle)") {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(actions.enumerated()), id: \.offset) { index, action in
                                HStack(alignment: .top, spacing: 12) {
                                    Text("\(index + 1)")
                                        .briefingText(.j(14, 800))
                                        .foregroundStyle(BriefingPalette.fixed(0xDDD6FE))
                                        .frame(width: 28, height: 28)
                                        .background(Color.white.opacity(colorScheme == .dark ? 0.12 : 0x1F / 255), in: Circle())
                                    paragraph(action, top: 7)
                                }
                                .padding(.vertical, 10)
                            }
                        }
                    }
                }
            }
            .padding(EdgeInsets(top: 24, leading: 18, bottom: 26, trailing: 18))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                BriefingAppearanceBackground {
                    BriefingCSSGradient(angle: 120, stops: [
                        .init(color: BriefingPalette.fixed(0x15354B), location: 0),
                        .init(color: BriefingPalette.fixed(0x172F59), location: 1),
                    ])
                } light: {
                    BriefingCSSGradient(angle: 125, stops: [
                        .init(color: BriefingPalette.fixed(0x103743), location: 0),
                        .init(color: BriefingPalette.fixed(0x172F59), location: 1),
                    ])
                }
            }
            .shadow(color: colorScheme == .dark ? .clear : BriefingPalette.fixed(0x0F2A37, 0.14), radius: 13, x: 0, y: 10)
            .padding(.horizontal, -4)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("briefing.coachTake")
        }
    }

    private func block<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .briefingText(.j(15, 700))
                .foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            content()
        }
        .padding(.vertical, 15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .briefingRule(.top, Color.white.opacity(colorScheme == .dark ? 0.16 : 0x29 / 255))
    }

    private func paragraph(_ text: String, top: CGFloat = 7) -> some View {
        BriefingParagraph(text, .j(15, 400, 1.5), color: colorScheme == .dark ? Color.white.opacity(0.92) : BriefingPalette.fixed(0xE7EFF1))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, top)
    }
}

// MARK: Revision disclosure (`.revision`)

/// Rendered only when the artifact replaced an earlier version — discloses
/// it honestly rather than presenting the revised content as original.
struct BriefingRevisionBanner: View {
    @Environment(\.briefingPalette) private var c
    let provenance: BriefingRevisionProvenance
    let replacedHistory: [BriefingRevisionSnapshot]
    /// Event briefings (Photo / DEXA) use the locked amber-ruled `.revision` note.
    var eventStyle = false

    var body: some View {
        if eventStyle { eventBody } else { recurringBody }
    }

    private var eventBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("This Briefing was revised")
                .briefingText(.j(10, 700, 1.45))
                .foregroundStyle(BriefingEventPalette.ink)
            BriefingParagraph(provenance.reason, .j(10, 400, 1.45), color: BriefingEventPalette.muted)
            if let original = replacedHistory.first {
                BriefingParagraph("Replaced: \u{201C}\(original.headline)\u{201D}\n\(BriefingDateFormatting.compactTimestamp(original.generatedAt)) → \(BriefingDateFormatting.compactTimestamp(provenance.replacementTimestamp))", .j(10, 400, 1.45), color: BriefingEventPalette.muted)
                    .padding(.top, 14.5)
            }
        }
        .padding(.vertical, 14)
        .padding(.leading, 14 + 2)
        .padding(.trailing, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BriefingPalette.fixed(0xF5BD4F, 0.06))
        .overlay(alignment: .leading) { Rectangle().fill(BriefingPalette.d(0xF5BD4F, 0xB97912)).frame(width: 2) }
        .padding(.top, 24)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("briefing.revision")
    }

    private var recurringBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("This Briefing was revised")
                .briefingText(.j(14, 700))
                .foregroundStyle(c.ink)
            BriefingParagraph(provenance.reason, .j(12, 400), color: c.secondary)
                .padding(.top, 5)
            if let original = replacedHistory.first {
                BriefingParagraph("First published \(BriefingDateFormatting.compactTimestamp(original.generatedAt)) · \(original.headline)", .j(12, 400), color: c.secondary)
                    .padding(.top, 5)
            }
        }
        .padding(.vertical, 18)
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .briefingRule(.bottom, c.line)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("briefing.revision")
    }
}

// MARK: - Uncertainty (not mounted by the locked family)

/// Server-authored uncertainty filter (kept for its tested presentable-text
/// rules). The locked Briefing family renders no "Still Unresolved"
/// section, so no cadence mounts this view.
/// Server-authored uncertainty, shown verbatim. The Server decides what is
/// surfaced (`surfaced` / high materiality); Native writes no uncertainty
/// copy and never lets it alter Confidence. Renders nothing when the Server
/// supplied no presentable text.
struct BriefingUncertaintyCard: View {
    static let title = "Still Unresolved"
    let texts: [String]

    init(items: [BriefingUncertaintyItem]?) {
        var seen = Set<String>()
        texts = (items ?? []).presentableTexts.filter { seen.insert($0).inserted }
    }

    /// Never mounted by the locked family; kept inert.
    var body: some View { EmptyView() }
}

