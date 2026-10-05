import SwiftUI
import UIKit

/// Shared pieces of the locked Progress Photos + DEXA record harness
/// (`photos-dexa-evidence-founder-parity-correction-20261004`,
/// `source/evidence.css`, 360-px SF Pro phone). Every length is a CSS px
/// value scaled through `EvidenceFamily.record`.
enum RecordText {
    static let sectionTitle = EvidenceTextStyle.normal(15, 800, jakarta: false, tracking: -0.225, relativeTo: .headline)
    static let eyebrow = EvidenceTextStyle.normal(11, 800, jakarta: false, tracking: 1.43, uppercase: true, relativeTo: .caption)
    static let action = EvidenceTextStyle.normal(10, 800, jakarta: false, relativeTo: .caption)
    static let rowLabel = EvidenceTextStyle.normal(12, 790, jakarta: false, relativeTo: .subheadline)
    static let rowCopy = EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.15, relativeTo: .caption2)
    static let tag = EvidenceTextStyle.normal(10, 760, jakarta: false, relativeTo: .caption)
    static let metricLabel = EvidenceTextStyle.normal(8, 850, jakarta: false, tracking: 0.64, uppercase: true, relativeTo: .caption2)
    static let metricValue = EvidenceTextStyle.normal(15, 820, jakarta: false, relativeTo: .headline)
    static let body = EvidenceTextStyle(size: 10, weight: 400, lineHeight: 14.5, relativeTo: .footnote)
    static let stateTitle = EvidenceTextStyle.normal(12, 800, jakarta: false, relativeTo: .subheadline)
    static let stateCopy = EvidenceTextStyle(size: 9, weight: 400, lineHeight: 12.6, relativeTo: .caption2)

    /// The CSS min-content width (longest word, tracking included) of
    /// `text` in a record style, in points at the current Dynamic Type size.
    static func minContentWidth(_ text: String, _ style: EvidenceTextStyle, scale: CGFloat = 1) -> CGFloat {
        let family = EvidenceFamily.record
        let font = UIFont.systemFont(ofSize: family.pt(style.size) * scale, weight: EvidenceLockedStyle.uiWeight(style.weight))
        let display = style.uppercase ? text.uppercased() : text
        return display.split(separator: " ").map { word in
            let attributed = NSAttributedString(string: String(word), attributes: [.font: font, .kern: family.pt(style.tracking) * scale])
            return ceil(attributed.size().width)
        }.max() ?? 0
    }
}

/// `.card`: 12-px padding inside a 1-px `--line` border (content inset 13),
/// 14-px radius, `--surface`.
struct RecordCard<Content: View>: View {
    var padding: CGFloat = 12
    var radius: CGFloat = 14
    @ViewBuilder var content: Content
    private let m = EvidenceMetrics(family: .record)

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(m.pt(padding + 1))
            .background(m.c.surface, in: RoundedRectangle(cornerRadius: m.pt(radius)))
            .overlay(RoundedRectangle(cornerRadius: m.pt(radius)).strokeBorder(m.c.line, lineWidth: m.pt(1)))
    }
}

/// Chrome's greedy line breaking for a short label: words fill a line
/// left to right and wrap only when the next word does not fit. (iOS
/// balances short multi-line labels, which breaks them elsewhere.)
struct RecordGreedyText: View {
    let text: String
    let style: EvidenceTextStyle
    let color: Color
    @ScaledMetric(relativeTo: .caption) private var scale: CGFloat = 1

    var body: some View {
        let words = (style.uppercase ? text.uppercased() : text).split(separator: " ").map(String.init)
        GreedyWordsLayout(wordSpacing: spaceWidth) {
            ForEach(Array(words.enumerated()), id: \.offset) { _, word in
                Text(word).evidenceText(style).foregroundStyle(color).fixedSize()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(style.uppercase ? text.uppercased() : text)
    }

    private var spaceWidth: CGFloat {
        let family = EvidenceFamily.record
        let font = UIFont.systemFont(ofSize: family.pt(style.size) * scale, weight: EvidenceLockedStyle.uiWeight(style.weight))
        let tracking = family.pt(style.tracking) * scale
        return NSAttributedString(string: " ", attributes: [.font: font]).size().width + tracking * 2
    }
}

private struct GreedyWordsLayout: Layout {
    var wordSpacing: CGFloat

    private func lines(width: CGFloat, sizes: [CGSize]) -> [[Int]] {
        var result: [[Int]] = [[]]
        var x: CGFloat = 0
        for (index, size) in sizes.enumerated() {
            if !result[result.count - 1].isEmpty, x + wordSpacing + size.width > width + 0.5 {
                result.append([])
                x = 0
            }
            x += (result[result.count - 1].isEmpty ? 0 : wordSpacing) + size.width
            result[result.count - 1].append(index)
        }
        return result
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let natural = sizes.reduce(0) { $0 + $1.width } + wordSpacing * CGFloat(max(sizes.count - 1, 0))
        let width = proposal.width ?? natural
        let rows = lines(width: width, sizes: sizes)
        let lineHeight = sizes.map(\.height).max() ?? 0
        let used = rows.map { row in row.reduce(0) { $0 + sizes[$1].width } + wordSpacing * CGFloat(max(row.count - 1, 0)) }.max() ?? 0
        return CGSize(width: proposal.width == nil ? natural : min(width, max(used, 0)), height: lineHeight * CGFloat(rows.count))
    }

    func explicitAlignment(of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGFloat? {
        guard guide == .firstTextBaseline, let first = subviews.first else { return nil }
        return bounds.minY + first.dimensions(in: .unspecified)[.firstTextBaseline]
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let lineHeight = sizes.map(\.height).max() ?? 0
        for (lineIndex, row) in lines(width: bounds.width, sizes: sizes).enumerated() {
            var x = bounds.minX
            for index in row {
                subviews[index].place(at: CGPoint(x: x, y: bounds.minY + lineHeight * CGFloat(lineIndex)), proposal: .unspecified)
                x += sizes[index].width + wordSpacing
            }
        }
    }
}

/// `.tag`: accent text on a 14% accent capsule.
struct RecordTag: View {
    let text: String
    private let m = EvidenceMetrics(family: .record)

    var body: some View {
        Text(text)
            .evidenceText(RecordText.tag)
            .foregroundStyle(m.c.accent)
            .padding(.horizontal, m.pt(8))
            .padding(.vertical, m.pt(5))
            .background(m.c.accentSoft, in: RoundedRectangle(cornerRadius: m.pt(17), style: .continuous))
    }
}

/// A two-item flex row (`justify-content: space-between`, baseline aligned)
/// that, like CSS `flex-shrink: 1`, narrows both items in proportion to
/// their natural widths when they do not fit, so long labels wrap exactly
/// where the locked harness wraps them.
struct RecordShrinkRow: Layout {
    var spacing: CGFloat
    /// `.firstTextBaseline` (`.section-head`) or `.top` (`.disclosure-row`).
    var alignment: VerticalAlignment = .firstTextBaseline
    /// CSS `min-width: auto`: an item never shrinks below its longest word.
    var minimumWidths: [CGFloat] = [0, 0]

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? subviews.reduce(0) { $0 + $1.sizeThatFits(.unspecified).width } + spacing
        let frames = place(width: width, subviews: subviews)
        return CGSize(width: width, height: frames.map(\.maxY).max() ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (subview, frame) in zip(subviews, place(width: bounds.width, subviews: subviews)) {
            subview.place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), proposal: ProposedViewSize(frame.size))
        }
    }

    private func place(width: CGFloat, subviews: Subviews) -> [CGRect] {
        guard subviews.count == 2 else { return subviews.map { CGRect(origin: .zero, size: $0.sizeThatFits(.unspecified)) } }
        let natural = subviews.map { $0.sizeThatFits(.unspecified).width }
        let overflow = natural[0] + natural[1] + spacing - width
        // Any overflow narrows both items below their one-line width, so
        // both wrap — as CSS flex-shrink does. The 1-pt epsilon absorbs
        // CoreText's slightly tighter tracked runs.
        var widths = natural
        if overflow > -1 {
            let deficit = max(overflow, 0) + 1
            widths = natural.map { $0 - deficit * $0 / (natural[0] + natural[1]) }
            // Freeze an item clamped at its minimum and give the rest of the
            // deficit to the other one.
            for index in 0..<2 where widths[index] < minimumWidths[index] {
                let other = 1 - index
                widths[index] = minimumWidths[index]
                widths[other] = max(minimumWidths[other], natural[0] + natural[1] - deficit - widths[index])
            }
        }
        let sizes = zip(subviews, widths).map { subview, width in
            CGSize(width: width, height: subview.sizeThatFits(ProposedViewSize(width: width, height: nil)).height)
        }
        let baselines = zip(subviews, sizes).map { subview, size in
            alignment == .top ? 0 : subview.dimensions(in: ProposedViewSize(size))[VerticalAlignment.firstTextBaseline]
        }
        let top = baselines.max() ?? 0
        return [
            CGRect(origin: CGPoint(x: 0, y: top - baselines[0]), size: sizes[0]),
            CGRect(origin: CGPoint(x: width - sizes[1].width, y: top - baselines[1]), size: sizes[1]),
        ]
    }
}

/// `.disclosure-row`: the title block and a trailing accent action
/// (`Show All` / `Close`), top aligned with a 12-px gap. The whole row is
/// the control.
struct RecordDisclosureHead: View {
    @ScaledMetric(relativeTo: .caption) private var scale: CGFloat = 1
    let title: String
    var subtitle: String?
    let isExpanded: Bool
    let identifier: String
    let toggle: () -> Void
    private let m = EvidenceMetrics(family: .record)

    var body: some View {
        Button(action: toggle) {
            RecordShrinkRow(
                spacing: m.pt(12),
                alignment: .top,
                minimumWidths: [0, RecordText.minContentWidth(isExpanded ? "Close" : "Show All", RecordText.action, scale: scale)]
            ) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .evidenceText(RecordText.sectionTitle)
                        .foregroundStyle(m.c.ink)
                    if let subtitle {
                        Text(subtitle)
                            .evidenceText(RecordText.rowCopy)
                            .foregroundStyle(m.c.quiet)
                            .padding(.top, m.pt(3))
                    }
                }
                Text(isExpanded ? "Close" : "Show All")
                    .evidenceText(RecordText.action)
                    .foregroundStyle(m.c.accent)
            }
            .contentShape(Rectangle().inset(by: -m.pt(6)))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
        .accessibilityHint(isExpanded ? "Close" : "Show All")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier(identifier)
    }
}

/// Record-family date labels: `Aug 30, 2026`.
enum RecordDate {
    static func long(_ isoDate: String) -> String { TimelineDateFormatting.long(isoDate) }

    /// A canonical short label (`Aug 16`) shown in the long form, taking
    /// the year of `reference` — or the year before when that would place
    /// it after `reference`. Any other label (`No prior matching pose`) is
    /// returned verbatim.
    static func long(shortLabel: String, before reference: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(identifier: "UTC")
        parser.dateFormat = "MMM d"
        guard let partial = parser.date(from: shortLabel),
              let year = Int(reference.prefix(4)) else { return shortLabel }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let parts = calendar.dateComponents([.month, .day], from: partial)
        func iso(_ y: Int) -> String { String(format: "%04d-%02d-%02d", y, parts.month ?? 1, parts.day ?? 1) }
        let candidate = iso(year) <= String(reference.prefix(10)) ? iso(year) : iso(year - 1)
        return TimelineDateFormatting.long(candidate)
    }
}

/// The record family's neutral media art (`.thumb` / `.photo-tile` with
/// `.silhouette`): a 145° blue-tinted gradient and a soft standing figure.
/// Drawn only where no photo pixels exist; it never stands in for a pose
/// whose real media failed (that shows the failure state instead).
struct RecordSilhouetteArt: View {
    private let m = EvidenceMetrics(family: .record)

    var body: some View {
        GeometryReader { proxy in
            let w = proxy.size.width, h = proxy.size.height
            let bodyW = w * 0.45, bodyH = h * 0.72
            let fill = LinearGradient(colors: [m.c.muted.opacity(0.44), m.c.quiet.opacity(0.28)], startPoint: .top, endPoint: .bottom)
            ZStack(alignment: .topLeading) {
                LinearGradient(
                    colors: [RecordSilhouetteArt.tint, m.c.surface2],
                    startPoint: UnitPoint(x: 0.15, y: 0.15), endPoint: UnitPoint(x: 0.85, y: 0.85)
                )
                ZStack(alignment: .topLeading) {
                    EllipticalCornerRectangle(top: 0.42, bottom: 0.24).fill(fill)
                        .frame(width: bodyW, height: bodyH)
                    Circle().fill(fill)
                        .frame(width: bodyW * 0.58, height: bodyW * 0.58)
                        .offset(x: bodyW * 0.21, y: -bodyH * 0.16)
                }
                .opacity(0.75)
                .offset(x: (w - bodyW) / 2, y: h * 0.95 - bodyH)
            }
        }
        .accessibilityHidden(true)
    }

    /// `color-mix(var(--blue) 18%, var(--surface3))`.
    static let tint = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x2B / 255, green: 0x45 / 255, blue: 0x5E / 255, alpha: 1)
            : UIColor(red: 0xBB / 255, green: 0xC1 / 255, blue: 0xC6 / 255, alpha: 1)
    })
}

/// CSS `border-radius: 42% 42% 24% 24%` — elliptical corners whose radii
/// are fractions of the box's own width and height.
struct EllipticalCornerRectangle: Shape {
    let top: CGFloat
    let bottom: CGFloat

    func path(in rect: CGRect) -> Path {
        let k: CGFloat = 0.5523
        let tx = rect.width * top, ty = rect.height * top
        let bx = rect.width * bottom, by = rect.height * bottom
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + tx, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - tx, y: rect.minY))
        p.addCurve(to: CGPoint(x: rect.maxX, y: rect.minY + ty),
                   control1: CGPoint(x: rect.maxX - tx + tx * k, y: rect.minY),
                   control2: CGPoint(x: rect.maxX, y: rect.minY + ty - ty * k))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - by))
        p.addCurve(to: CGPoint(x: rect.maxX - bx, y: rect.maxY),
                   control1: CGPoint(x: rect.maxX, y: rect.maxY - by + by * k),
                   control2: CGPoint(x: rect.maxX - bx + bx * k, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX + bx, y: rect.maxY))
        p.addCurve(to: CGPoint(x: rect.minX, y: rect.maxY - by),
                   control1: CGPoint(x: rect.minX + bx - bx * k, y: rect.maxY),
                   control2: CGPoint(x: rect.minX, y: rect.maxY - by + by * k))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + ty))
        p.addCurve(to: CGPoint(x: rect.minX + tx, y: rect.minY),
                   control1: CGPoint(x: rect.minX, y: rect.minY + ty - ty * k),
                   control2: CGPoint(x: rect.minX + tx - tx * k, y: rect.minY))
        p.closeSubpath()
        return p
    }
}

/// `.spinner`: a 22-px ring in `--line` with an accent leading arc.
struct RecordSpinner: View {
    @State private var spinning = false
    private let m = EvidenceMetrics(family: .record)

    var body: some View {
        ZStack {
            Circle().strokeBorder(m.c.line, lineWidth: m.pt(2))
            Circle().trim(from: 0, to: 0.25)
                .stroke(m.c.accent, style: StrokeStyle(lineWidth: m.pt(2)))
                .padding(m.pt(1))
                .rotationEffect(.degrees(spinning ? 225 : -135))
        }
        .frame(width: m.pt(22), height: m.pt(22))
        .onAppear {
            #if DEBUG
            // Review captures keep the ring still.
            guard !ProcessInfo.processInfo.arguments.contains("-physiqueos.evidence-review") else { return }
            #endif
            withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) { spinning = true }
        }
        .accessibilityHidden(true)
    }
}

/// `.retry`: accent label on a `surface2` 8-px pill.
struct RecordRetryLabel: View {
    var title = "Try again"
    private let m = EvidenceMetrics(family: .record)

    var body: some View {
        Text(title)
            .evidenceText(.normal(10, 800, jakarta: false))
            .foregroundStyle(m.c.accent)
            .padding(.horizontal, m.pt(10))
            .padding(.vertical, m.pt(7))
            .background(m.c.surface2, in: RoundedRectangle(cornerRadius: m.pt(8)))
            .evidenceHitTarget(visualHeight: m.pt(26))
    }
}

#if DEBUG
/// Review-only synthetic progress-photo media. Each image is a generated,
/// clearly labelled mannequin render (never a person) so public review
/// artifacts exercise the real image path — decode, aspect fill, crop,
/// pairing and full-screen inspection — without any Founder pixels.
/// Enabled only by `-physiqueos.evidence-review.synthetic-photos`.
enum SyntheticProgressPhoto {
    static var isEnabled: Bool {
        ProcessInfo.processInfo.arguments.contains("-physiqueos.evidence-review.synthetic-photos")
    }

    static func name(poseId: PhotoPoseID, date: String) -> String { "synthetic:\(poseId.rawValue):\(date)" }

    nonisolated(unsafe) private static var cache: [String: UIImage] = [:]

    static func image(named name: String) -> UIImage? {
        guard name.hasPrefix("synthetic:") else { return nil }
        if let cached = cache[name] { return cached }
        let parts = name.split(separator: ":").map(String.init)
        let pose = parts.count > 1 ? parts[1] : "front-relaxed"
        let date = parts.count > 2 ? parts[2] : ""
        let image = render(pose: pose, date: date)
        cache[name] = image
        return image
    }

    /// 1536 × 2048 (3:4), the camera's portrait aspect, so tile crops and
    /// inspector fitting match real captures.
    private static func render(pose: String, date: String) -> UIImage {
        let size = CGSize(width: 1536, height: 2048)
        let seed = CGFloat(abs(date.hashValue % 7)) / 70
        return UIGraphicsImageRenderer(size: size).image { context in
            let cg = context.cgContext
            let colors = [UIColor(red: 0.20 + seed, green: 0.24, blue: 0.29, alpha: 1).cgColor,
                          UIColor(red: 0.07, green: 0.09, blue: 0.11, alpha: 1).cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            cg.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
            let side = pose.contains("side")
            let flexed = pose.contains("flexed")
            let torsoW: CGFloat = side ? 330 : 520
            let mannequin = UIColor(red: 0.63, green: 0.66, blue: 0.69, alpha: 1)
            mannequin.setFill()
            UIBezierPath(ovalIn: CGRect(x: (size.width - 250) / 2, y: 300, width: 250, height: 300)).fill()
            UIBezierPath(roundedRect: CGRect(x: (size.width - torsoW) / 2, y: 640, width: torsoW, height: 760), cornerRadius: 180).fill()
            UIBezierPath(roundedRect: CGRect(x: size.width / 2 - 200, y: 1340, width: 170, height: 620), cornerRadius: 80).fill()
            UIBezierPath(roundedRect: CGRect(x: size.width / 2 + 30, y: 1340, width: 170, height: 620), cornerRadius: 80).fill()
            if !side {
                let armY: CGFloat = flexed ? 520 : 700
                UIBezierPath(roundedRect: CGRect(x: (size.width - torsoW) / 2 - 150, y: armY, width: 130, height: flexed ? 420 : 640), cornerRadius: 60).fill()
                UIBezierPath(roundedRect: CGRect(x: (size.width + torsoW) / 2 + 20, y: armY, width: 130, height: flexed ? 420 : 640), cornerRadius: 60).fill()
            }
            let label = "SYNTHETIC REVIEW MEDIA · \(pose.uppercased())" as NSString
            label.draw(at: CGPoint(x: 64, y: size.height - 120), withAttributes: [
                .font: UIFont.systemFont(ofSize: 44, weight: .bold),
                .foregroundColor: UIColor.white.withAlphaComponent(0.55),
            ])
        }
    }
}
#endif

extension PhotoMediaSource {
    /// Pixels available on this device without transport: a bundled asset,
    /// or (Debug review only) a synthetic render.
    var localImage: UIImage? {
        guard case .assetName(let name) = self else { return nil }
        if let bundled = UIImage(named: name) { return bundled }
        #if DEBUG
        return SyntheticProgressPhoto.image(named: name)
        #else
        return nil
        #endif
    }
}
