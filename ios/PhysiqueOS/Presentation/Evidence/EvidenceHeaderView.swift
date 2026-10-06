import SwiftUI
import UIKit

/// The Founder-locked Evidence family design system (design commit
/// `f7d72f19`, `dexa-photos-timeline-evidence-style-translation-20261004`,
/// screens H1/T1/S1 and `source/evidence.css`).
///
/// The locked harness renders a 360-px-wide phone in SF Pro
/// (`-apple-system`). Every length here is that CSS pixel value scaled by
/// 402/360, so the iPhone 17 Pro (402 pt) reproduces the reference at
/// matched scale. Evidence keeps its own locked palette (deep slate with a
/// lime record accent in Dark; warm paper with olive ink in Mineral Light);
/// it is resolved through the global appearance trait, so System / Dark /
/// Mineral Light still come only from `AppAppearanceStore`.
enum EvidenceLockedStyle {
    /// CSS px → pt at the locked 360 → 402 scale.
    static func pt(_ px: CGFloat) -> CGFloat { px * 402 / 360 }

    // MARK: Palette (`:root` / `html[data-theme=light]`)

    static let canvas = dynamic(dark: 0x0A141E, light: 0xF7F3E9)
    static let surface = dynamic(dark: 0x101E2A, light: 0xEEE9DE)
    static let surface2 = dynamic(dark: 0x152633, light: 0xE4DED2)
    static let line = dynamic(dark: 0x263947, light: 0xC7C0B3)
    static let ink = dynamic(dark: 0xF4F1E9, light: 0x162028)
    static let sub = dynamic(dark: 0xBCC5C8, light: 0x46535B)
    static let muted = dynamic(dark: 0x87969D, light: 0x69767C)
    static let accent = dynamic(dark: 0xB9E467, light: 0x467221)
    static let green = dynamic(dark: 0x68D391, light: 0x28744A)
    static let blue = dynamic(dark: 0x6BB7FF, light: 0x246FAD)
    static let violet = dynamic(dark: 0xB68CFF, light: 0x7350AF)
    static let amber = dynamic(dark: 0xF4B860, light: 0xA75F18)
    static let red = dynamic(dark: 0xFF8177, light: 0xB94A42)
    /// `.nav` border: `color-mix(var(--line) 74%, transparent)`.
    static let navRule = dynamic(dark: 0x263947, light: 0xC7C0B3, opacity: 0.74)

    /// A server-authored tone rendered in the locked Evidence palette.
    static func tone(_ token: HomeColorToken) -> Color {
        switch token {
        case .primary: violet
        case .success: green
        case .evidence: blue
        case .effort, .warning: amber
        case .danger: red
        case .surface: accent
        case .muted, .plain: muted
        }
    }

    private static func dynamic(dark: UInt32, light: UInt32, opacity: CGFloat = 1) -> Color {
        Color(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: opacity
            )
        })
    }

    // MARK: Typography (CSS px, CSS weight, CSS line box)

    struct TextStyle {
        let size: CGFloat
        let weight: CGFloat
        /// CSS line box in px; the glyphs sit centered in it (half-leading).
        let lineHeight: CGFloat
        var tracking: CGFloat = 0
        var uppercase = false
        var relativeTo: Font.TextStyle = .body
    }

    static let navTitle = TextStyle(size: 12, weight: 800, lineHeight: 15, relativeTo: .headline)
    static let navBack = TextStyle(size: 12, weight: 700, lineHeight: 15, relativeTo: .headline)
    static let eyebrow = TextStyle(size: 11, weight: 800, lineHeight: 13, tracking: 1.43, uppercase: true, relativeTo: .caption)
    static let title = TextStyle(size: 29, weight: 780, lineHeight: 30.45, tracking: -1.16, relativeTo: .largeTitle)
    static let subtitle = TextStyle(size: 12, weight: 400, lineHeight: 16.2, relativeTo: .subheadline)
    static let sectionTitle = TextStyle(size: 15, weight: 800, lineHeight: 18, tracking: -0.225, relativeTo: .headline)
    static let rowLabel = TextStyle(size: 12, weight: 790, lineHeight: 15, relativeTo: .subheadline)
    static let rowCopy = TextStyle(size: 9, weight: 400, lineHeight: 12.15, relativeTo: .caption2)
    static let rowIcon = TextStyle(size: 12, weight: 900, lineHeight: 15, relativeTo: .subheadline)
    static let headerIcon = TextStyle(size: 16, weight: 900, lineHeight: 19, relativeTo: .headline)
    static let chevron = TextStyle(size: 16, weight: 400, lineHeight: 18, relativeTo: .subheadline)
    static let eventType = TextStyle(size: 8, weight: 850, lineHeight: 10, tracking: 0.64, uppercase: true, relativeTo: .caption2)
    static let eventTitle = TextStyle(size: 12, weight: 800, lineHeight: 15, relativeTo: .subheadline)
    static let eventCopy = TextStyle(size: 9, weight: 400, lineHeight: 12.6, relativeTo: .caption2)
    static let note = TextStyle(size: 9, weight: 400, lineHeight: 12.6, relativeTo: .caption2)
    static let stateTitle = TextStyle(size: 12, weight: 800, lineHeight: 15, relativeTo: .subheadline)
    static let stateCopy = TextStyle(size: 9, weight: 400, lineHeight: 12.6, relativeTo: .caption2)

    /// CSS numeric weight → SF Pro's continuous weight axis.
    static func uiWeight(_ css: CGFloat) -> UIFont.Weight {
        let stops: [(CGFloat, CGFloat)] = [
            (100, UIFont.Weight.ultraLight.rawValue), (200, UIFont.Weight.thin.rawValue),
            (300, UIFont.Weight.light.rawValue), (400, UIFont.Weight.regular.rawValue),
            (500, UIFont.Weight.medium.rawValue), (600, UIFont.Weight.semibold.rawValue),
            (700, UIFont.Weight.bold.rawValue), (800, UIFont.Weight.heavy.rawValue),
            (900, UIFont.Weight.black.rawValue),
        ]
        let clamped = min(max(css, 100), 900)
        for index in 1..<stops.count where clamped <= stops[index].0 {
            let (lowerCSS, lowerRaw) = stops[index - 1]
            let (upperCSS, upperRaw) = stops[index]
            let fraction = (clamped - lowerCSS) / (upperCSS - lowerCSS)
            return UIFont.Weight(lowerRaw + (upperRaw - lowerRaw) * fraction)
        }
        return .black
    }
}

private struct EvidenceLockedTextModifier: ViewModifier {
    @ScaledMetric private var scale: CGFloat = 1
    let style: EvidenceLockedStyle.TextStyle

    init(_ style: EvidenceLockedStyle.TextStyle) {
        self.style = style
        _scale = ScaledMetric(wrappedValue: 1, relativeTo: style.relativeTo)
    }

    func body(content: Content) -> some View {
        let size = EvidenceLockedStyle.pt(style.size) * scale
        let font = UIFont.systemFont(ofSize: size, weight: EvidenceLockedStyle.uiWeight(style.weight))
        let lineBox = EvidenceLockedStyle.pt(style.lineHeight) * scale
        let leading = lineBox - font.lineHeight
        content
            .font(Font(font))
            .tracking(EvidenceLockedStyle.pt(style.tracking) * scale)
            .textCase(style.uppercase ? .uppercase : nil)
            .lineSpacing(max(0, leading))
            .padding(.vertical, leading / 2)
    }
}

extension View {
    func evidenceLockedText(_ style: EvidenceLockedStyle.TextStyle) -> some View {
        modifier(EvidenceLockedTextModifier(style))
    }

    /// Locked Evidence page chrome: flat canvas navigation bar with the
    /// harness's 1-px rule beneath it.
    func evidenceLockedPageChrome() -> some View {
        background(EvidenceLockedStyle.canvas)
            .toolbarBackground(EvidenceLockedStyle.canvas, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) {
                Rectangle()
                    .fill(EvidenceLockedStyle.navRule)
                    .frame(height: EvidenceLockedStyle.pt(1))
                    .accessibilityHidden(true)
            }
    }
}

/// `.header`: 38-px record mark, eyebrow, title and subtitle.
struct EvidenceHeaderView: View {
    let symbol: String
    let eyebrow: String
    let title: String
    let subtitle: String
    /// Record pages (Photos, DEXA) keep the eyebrow, title and subtitle as
    /// separate readable texts (`EVIDENCE REPORT`, `DEXA`); the Hub and
    /// Timeline read the header as one combined element.
    var exposesTexts = false

    private typealias S = EvidenceLockedStyle

    var body: some View {
        HStack(alignment: .top, spacing: S.pt(11)) {
            Text(symbol)
                .evidenceLockedText(S.headerIcon)
                .foregroundStyle(S.accent)
                .frame(width: S.pt(38), height: S.pt(38))
                .background(S.accent.opacity(0.15), in: Circle())
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 0) {
                Text(exposesTexts ? eyebrow.uppercased() : eyebrow)
                    .evidenceLockedText(S.eyebrow)
                    .foregroundStyle(S.accent)
                Text(title)
                    .evidenceLockedText(S.title)
                    .foregroundStyle(S.ink)
                    .accessibilityAddTraits(.isHeader)
                    // CoreText lays SF Pro Display into the tight 30.45-px
                    // title box 1 pt taller than Chrome (measured).
                    .padding(.bottom, -1)
                Text(subtitle)
                    .evidenceLockedText(S.subtitle)
                    .foregroundStyle(S.sub)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, S.pt(4))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.top, S.pt(3))
        .padding(.bottom, S.pt(17))
        .accessibilityElement(children: exposesTexts ? .contain : .combine)
        .accessibilityIdentifier("evidence.header.\(title.lowercased())")
    }
}

/// `.section-head` / `.section-title`.
struct EvidenceSectionTitle: View {
    let title: String

    var body: some View {
        Text(title)
            .evidenceLockedText(EvidenceLockedStyle.sectionTitle)
            .foregroundStyle(EvidenceLockedStyle.ink)
            // CoreText seats SF Pro 1 pt higher than Chrome in the 18-px
            // section line box (measured); draw-only, layout unchanged.
            .offset(y: 1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, EvidenceLockedStyle.pt(9))
            .accessibilityAddTraits(.isHeader)
    }
}

/// S1 `.state`: the locked loading / empty / failure card.
struct EvidenceStateCard: View {
    enum Kind: Equatable {
        case loading(String)
        case message(title: String, detail: String?)
    }

    let kind: Kind
    let identifier: String

    private typealias S = EvidenceLockedStyle

    var body: some View {
        VStack(spacing: 0) {
            switch kind {
            case .loading(let copy):
                EvidenceLockedSpinner()
                    .padding(.bottom, S.pt(8))
                Text(copy)
                    .evidenceLockedText(S.stateCopy)
                    .foregroundStyle(S.muted)
            case .message(let title, let detail):
                Text(title)
                    .evidenceLockedText(S.stateTitle)
                    .foregroundStyle(S.ink)
                if let detail {
                    Text(detail)
                        .evidenceLockedText(S.stateCopy)
                        .foregroundStyle(S.muted)
                        .padding(.top, S.pt(4))
                }
            }
        }
        .multilineTextAlignment(.center)
        .padding(S.pt(12))
        .frame(maxWidth: .infinity, minHeight: S.pt(108))
        .background(S.surface, in: RoundedRectangle(cornerRadius: S.pt(13)))
        .overlay(RoundedRectangle(cornerRadius: S.pt(13)).strokeBorder(S.line, lineWidth: S.pt(1)))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}

/// `.spinner`: a 22-px ring in the rule color with an accent top arc.
private struct EvidenceLockedSpinner: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spinning = false

    var body: some View {
        let width = EvidenceLockedStyle.pt(2)
        ZStack {
            Circle().stroke(EvidenceLockedStyle.line, lineWidth: width)
            Circle()
                .trim(from: 0, to: 0.25)
                .stroke(EvidenceLockedStyle.accent, lineWidth: width)
                .rotationEffect(.degrees(-135))
        }
        .padding(width / 2)
        .frame(width: EvidenceLockedStyle.pt(22), height: EvidenceLockedStyle.pt(22))
        .rotationEffect(.degrees(spinning ? 360 : 0))
        .animation(reduceMotion ? nil : .linear(duration: 0.9).repeatForever(autoreverses: false), value: spinning)
        .onAppear { spinning = true }
        .accessibilityHidden(true)
    }
}
