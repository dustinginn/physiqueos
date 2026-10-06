import SwiftUI
import UIKit

/// Founder-locked Evidence family design systems (Redesign Batch 3, B/C).
///
/// Each locked family was designed in its own HTML harness, so each keeps
/// its own palette, typeface and harness width. Lengths are written in the
/// harness's CSS px and scaled to the 402 pt iPhone 17 Pro:
///
/// - Training (`training-evidence-style-translation-20261004`, `33ea6491`):
///   Plus Jakarta Sans, 390 px phone.
/// - Nutrition + Activity (`nutrition-activity-evidence-style-translation-
///   20261004` + Founder correction `8e6bd94b`): Plus Jakarta Sans, 379 px
///   screen inside a 7 px bezel.
/// - Weight (`energy-weight-recovery-evidence-style-translation-20261004`,
///   `1f8ba1b9`): SF Pro, 372 px phone, the record palette shared with the
///   accepted Hub/Timeline.
///
/// Colors resolve through the global appearance trait only (System / Dark /
/// Mineral Light from `AppAppearanceStore`); nothing here is a local theme
/// switch.
enum EvidenceFamily {
    case training
    case daily
    case weight
    /// Progress Photos + DEXA (`photos-dexa-evidence-founder-parity-correction`):
    /// the 360-px SF Pro record harness shared with the Hub and Timeline.
    case record
    /// Evidence Intake + Review (`85ef2a6c`): the 402-px SF Pro workflow
    /// harness, so CSS px are points.
    case workflow

    var harnessWidth: CGFloat {
        switch self {
        case .training: 390
        case .daily: 379
        case .weight: 372
        case .record: 360
        case .workflow: 402
        }
    }

    var usesJakarta: Bool { self == .training || self == .daily }

    /// CSS px → pt for this family's harness.
    func pt(_ px: CGFloat) -> CGFloat { px * 402 / harnessWidth }

    var palette: EvidencePalette {
        switch self {
        case .training: .training
        case .daily: .daily
        case .weight: .weight
        case .record: .record
        case .workflow: .workflow
        }
    }
}

private struct EvidenceFamilyKey: EnvironmentKey {
    static let defaultValue: EvidenceFamily = .training
}

extension EnvironmentValues {
    var evidenceFamily: EvidenceFamily {
        get { self[EvidenceFamilyKey.self] }
        set { self[EvidenceFamilyKey.self] = newValue }
    }
}

// MARK: - Palettes

struct EvidencePalette {
    let page: Color
    let surface: Color
    let surface2: Color
    let surface3: Color
    let line: Color
    let ink: Color
    let muted: Color
    let quiet: Color
    /// The family's identity accent (Training purple, Nutrition/Activity
    /// teal, Weight lime).
    let accent: Color
    let accentSoft: Color
    let teal: Color
    let tealSoft: Color
    let purple: Color
    let purpleSoft: Color
    let green: Color
    let greenSoft: Color
    let amber: Color
    let amberSoft: Color
    let red: Color
    let redSoft: Color
    let blue: Color
    let protein: Color
    let carbs: Color
    let fat: Color
    let breakfast: Color
    let lunch: Color
    let dinner: Color
    let snacks: Color

    /// `.training` (`training-evidence.css` `:root` / `[data-theme=light]`).
    static let training = EvidencePalette(
        page: d(0x071416, 0xF1EEE6),
        surface: d(0x0D2325, 0xFAF8F2),
        surface2: d(0x102B2C, 0xE3ECE7),
        surface3: d(0x153737, 0xD4E5DE),
        line: d(0x294344, 0xC7D1CB),
        ink: d(0xF3F7F4, 0x14282A),
        muted: d(0xA9BAB6, 0x536765),
        quiet: d(0x748B87, 0x71807D),
        accent: d(0xAE8CFA, 0x6F4FB3),
        accentSoft: d(0xAE8CFA, 0x6F4FB3, 0.12, 0.10),
        teal: d(0x55D4C5, 0x177A72),
        tealSoft: d(0x55D4C5, 0x177A72, 0.12, 0.10),
        purple: d(0xAE8CFA, 0x6F4FB3),
        purpleSoft: d(0xAE8CFA, 0x6F4FB3, 0.12, 0.10),
        green: d(0x69D6A1, 0x187A4E),
        greenSoft: d(0x69D6A1, 0x187A4E, 0.12, 0.10),
        amber: d(0xE7B96C, 0x956317),
        amberSoft: d(0xE7B96C, 0x956317, 0.12, 0.10),
        red: d(0xF07D7D, 0xA63E42),
        redSoft: d(0xF07D7D, 0xA63E42, 0.12, 0.09),
        blue: d(0x6FCDF4, 0x176D92),
        protein: d(0xFB7185, 0xB83C57),
        carbs: d(0xFBBF24, 0x9D6808),
        fat: d(0x38BDF8, 0x14769F),
        breakfast: d(0xF7CF7B, 0x9D6709),
        lunch: d(0x7BD7C8, 0x19756B),
        dinner: d(0xB69CF3, 0x684DA0),
        snacks: d(0xFB9C8C, 0xA84B3E)
    )

    /// `.daily` — Nutrition + Activity (`evidence.css` of the N/A harness).
    static let daily = EvidencePalette(
        page: d(0x061219, 0xF3EFE6),
        surface: d(0x102A34, 0xF8F5ED),
        surface2: d(0x153641, 0xE6F0EC),
        surface3: d(0x0B222B, 0xE9E5DC),
        line: d(0x25444E, 0xC8D4CF),
        ink: d(0xF5F8F7, 0x13272F),
        muted: d(0x9FB2B7, 0x566C72),
        quiet: d(0x72878D, 0x74858A),
        accent: d(0x69D8CD, 0x0B766F),
        accentSoft: d(0x69D8CD, 0x0B766F, 0.13, 0.10),
        teal: d(0x69D8CD, 0x0B766F),
        tealSoft: d(0x69D8CD, 0x0B766F, 0.13, 0.10),
        purple: d(0xB99AF2, 0x6F55A7),
        purpleSoft: d(0xB99AF2, 0x6F55A7, 0.13, 0.11),
        green: d(0x7BDBA7, 0x277B51),
        greenSoft: d(0x7BDBA7, 0x277B51, 0.13, 0.11),
        amber: d(0xF5C467, 0x9A650D),
        amberSoft: d(0xF5C467, 0x9A650D, 0.13, 0.11),
        red: d(0xFB8E9C, 0xA83B50),
        redSoft: d(0xFB8E9C, 0xA83B50, 0.13, 0.11),
        blue: d(0x6FCDF4, 0x176D92),
        protein: d(0xFB7185, 0xB83C57),
        carbs: d(0xFBBF24, 0x9D6808),
        fat: d(0x38BDF8, 0x14769F),
        breakfast: d(0xF7CF7B, 0x9D6709),
        lunch: d(0x7BD7C8, 0x19756B),
        dinner: d(0xB69CF3, 0x684DA0),
        snacks: d(0xFB9C8C, 0xA84B3E)
    )

    /// `.weight` — the record palette of the Energy/Weight/Recovery harness.
    static let weight = EvidencePalette(
        page: d(0x0A141E, 0xF7F3E9),
        surface: d(0x101E2A, 0xEEE9DE),
        surface2: d(0x152633, 0xE5DFD2),
        surface3: d(0x101E2A, 0xEEE9DE),
        line: d(0x243746, 0xC9C2B5),
        ink: d(0xF4F1E9, 0x162028),
        muted: d(0xB6C0C5, 0x46535B),
        quiet: d(0x82929B, 0x6C777D),
        accent: d(0xB9E467, 0x467221),
        accentSoft: d(0xB9E467, 0x467221, 0.15, 0.15),
        teal: d(0x5DD5CF, 0x167D78),
        tealSoft: d(0x5DD5CF, 0x167D78, 0.13, 0.10),
        purple: d(0xB68CFF, 0x7350AF),
        purpleSoft: d(0xB68CFF, 0x7350AF, 0.14, 0.12),
        green: d(0xB9E467, 0x467221),
        greenSoft: d(0xB9E467, 0x467221, 0.14, 0.12),
        amber: d(0xF4B860, 0xAD641C),
        amberSoft: d(0xF4B860, 0xAD641C, 0.14, 0.12),
        red: d(0xFF8177, 0xB94A42),
        redSoft: d(0xFF8177, 0xB94A42, 0.14, 0.12),
        blue: d(0x6BB7FF, 0x246FAD),
        protein: d(0xFB7185, 0xB83C57),
        carbs: d(0xFBBF24, 0x9D6808),
        fat: d(0x38BDF8, 0x14769F),
        breakfast: d(0xF7CF7B, 0x9D6709),
        lunch: d(0x7BD7C8, 0x19756B),
        dinner: d(0xB69CF3, 0x684DA0),
        snacks: d(0xFB9C8C, 0xA84B3E)
    )

    /// `.record` — Photos + DEXA (`source/evidence.css`). `muted` is the
    /// harness `--sub`, `quiet` its `--muted`; `purple` is `--violet`.
    static let record = EvidencePalette(
        page: d(0x0A141E, 0xF7F3E9),
        surface: d(0x101E2A, 0xEEE9DE),
        surface2: d(0x172733, 0xE4DED2),
        surface3: d(0x1D303E, 0xDAD3C6),
        line: d(0x263947, 0xC7C0B3),
        ink: d(0xF4F1E9, 0x162028),
        muted: d(0xBDC6C9, 0x46535B),
        quiet: d(0x87969D, 0x69767C),
        accent: d(0xB9E467, 0x467221),
        accentSoft: d(0xB9E467, 0x467221, 0.14, 0.14),
        teal: d(0x68D391, 0x28744A),
        tealSoft: d(0x68D391, 0x28744A, 0.14, 0.14),
        purple: d(0xB68CFF, 0x7350AF),
        purpleSoft: d(0xB68CFF, 0x7350AF, 0.14, 0.14),
        green: d(0x68D391, 0x28744A),
        greenSoft: d(0x68D391, 0x28744A, 0.14, 0.14),
        amber: d(0xF4B860, 0xA75F18),
        amberSoft: d(0xF4B860, 0xA75F18, 0.14, 0.14),
        red: d(0xFF8177, 0xB94A42),
        redSoft: d(0xFF8177, 0xB94A42, 0.14, 0.14),
        blue: d(0x6BB7FF, 0x246FAD),
        protein: d(0xFB7185, 0xB83C57),
        carbs: d(0xFBBF24, 0x9D6808),
        fat: d(0x38BDF8, 0x14769F),
        breakfast: d(0xF7CF7B, 0x9D6709),
        lunch: d(0x7BD7C8, 0x19756B),
        dinner: d(0xB69CF3, 0x684DA0),
        snacks: d(0xFB9C8C, 0xA84B3E)
    )

    /// `.workflow` — the Evidence Intake + Review harness tokens (the
    /// complete set lives in `WorkflowColor`).
    static let workflow = EvidencePalette(
        page: d(0x06131E, 0xEFEEE7),
        surface: d(0x0E2230, 0xFBFAF6),
        surface2: d(0x142C39, 0xDCEBE7),
        surface3: d(0x091A27, 0xE5EAE4),
        line: d(0x203640, 0xCBD5D0),
        ink: d(0xF6F8F7, 0x0A1C2D),
        muted: d(0x91A4AD, 0x62737B),
        quiet: d(0x91A4AD, 0x62737B),
        accent: d(0x2CCDC0, 0x0C8F84),
        accentSoft: d(0x2CCDC0, 0x0C8F84, 0.094, 0.094),
        teal: d(0x2CCDC0, 0x0C8F84),
        tealSoft: d(0x2CCDC0, 0x0C8F84, 0.094, 0.094),
        purple: d(0xA28AFF, 0x7255D7),
        purpleSoft: d(0xA28AFF, 0x7255D7, 0.094, 0.094),
        green: d(0x53DDA0, 0x13895E),
        greenSoft: d(0x53DDA0, 0x13895E, 0.094, 0.094),
        amber: d(0xF2BD54, 0xB6750A),
        amberSoft: d(0xF2BD54, 0xB6750A, 0.094, 0.094),
        red: d(0xED7182, 0xC34F64),
        redSoft: d(0xED7182, 0xC34F64, 0.094, 0.094),
        blue: d(0x49C8DC, 0x168B9C),
        protein: d(0xFB7185, 0xB83C57),
        carbs: d(0xFBBF24, 0x9D6808),
        fat: d(0x38BDF8, 0x14769F),
        breakfast: d(0xF7CF7B, 0x9D6709),
        lunch: d(0x7BD7C8, 0x19756B),
        dinner: d(0xB69CF3, 0x684DA0),
        snacks: d(0xFB9C8C, 0xA84B3E)
    )

    private static func d(_ dark: UInt32, _ light: UInt32, _ darkOpacity: CGFloat = 1, _ lightOpacity: CGFloat = 1) -> Color {
        Color(uiColor: UIColor { traits in
            let dk = traits.userInterfaceStyle == .dark
            let hex = dk ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: dk ? darkOpacity : lightOpacity
            )
        })
    }
}

// MARK: - Nutrition macro colors

/// The one Nutrition macro → color authority, taken from the accepted
/// Nutrition Evidence surface (Checkpoint C macro grid and reporting):
/// Calories green, Protein / Carbohydrates / Fat their macro tokens, all in
/// the `.daily` palette. Nutrition Evidence and generic Evidence Review both
/// resolve through it, so the two can never drift.
enum NutritionEvidenceMacro: CaseIterable, Equatable {
    case calories, protein, carbohydrates, fat

    init(_ key: NutritionMacroKey) {
        switch key {
        case .protein: self = .protein
        case .carbohydrates: self = .carbohydrates
        case .fat: self = .fat
        }
    }

    /// Server review metric labels ("Calories", "Protein", "Carbs", "Fat")
    /// and the Nutrition Evidence labels ("Carbohydrates") both resolve.
    init?(metricLabel: String) {
        switch metricLabel.lowercased() {
        case "calories": self = .calories
        case "protein": self = .protein
        case "carbs", "carbohydrates": self = .carbohydrates
        case "fat": self = .fat
        default: return nil
        }
    }

    var label: String {
        switch self {
        case .calories: "Calories"
        case .protein: "Protein"
        case .carbohydrates: "Carbohydrates"
        case .fat: "Fat"
        }
    }

    var paletteColor: KeyPath<EvidencePalette, Color> {
        switch self {
        case .calories: \.green
        case .protein: \.protein
        case .carbohydrates: \.carbs
        case .fat: \.fat
        }
    }

    var color: Color { EvidencePalette.daily[keyPath: paletteColor] }
}

// MARK: - Typography

/// One harness text style in CSS px / CSS weight. `lineHeight` is the CSS
/// line box (explicit, or Chrome's measured `normal` for the face).
struct EvidenceTextStyle {
    var size: CGFloat
    var weight: CGFloat
    var lineHeight: CGFloat
    var tracking: CGFloat = 0
    var uppercase = false
    var monospacedDigits = false
    var relativeTo: Font.TextStyle = .body

    /// Chrome's `normal` line box: the face's hhea ascent and descent are
    /// each rounded to whole px (Plus Jakarta Sans 1.038 / 0.222, SF Pro
    /// 0.967 / 0.211 of the em).
    static func normal(_ size: CGFloat, _ weight: CGFloat, jakarta: Bool = true, tracking: CGFloat = 0, uppercase: Bool = false, digits: Bool = false, relativeTo: Font.TextStyle = .body) -> EvidenceTextStyle {
        let ascent = jakarta ? 1.038 : 0.9668
        let descent = jakarta ? 0.222 : 0.2109
        let box = (size * ascent).rounded() + (size * descent).rounded()
        return EvidenceTextStyle(size: size, weight: weight, lineHeight: box, tracking: tracking, uppercase: uppercase, monospacedDigits: digits, relativeTo: relativeTo)
    }

    func with(lineHeight: CGFloat) -> EvidenceTextStyle {
        var copy = self
        copy.lineHeight = lineHeight
        return copy
    }
}

private struct EvidenceTextModifier: ViewModifier {
    @Environment(\.evidenceFamily) private var family
    @ScaledMetric private var scale: CGFloat = 1
    let style: EvidenceTextStyle

    init(_ style: EvidenceTextStyle) {
        self.style = style
        _scale = ScaledMetric(wrappedValue: 1, relativeTo: style.relativeTo)
    }

    func body(content: Content) -> some View {
        let size = family.pt(style.size) * scale
        var font: UIFont = family.usesJakarta
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
        let lineBox = family.pt(style.lineHeight) * scale
        let leading = lineBox - font.lineHeight
        return content
            .font(Font(font))
            .tracking(family.pt(style.tracking) * scale)
            .textCase(style.uppercase ? .uppercase : nil)
            .lineSpacing(max(0, leading))
            .padding(.vertical, leading / 2)
    }
}

extension View {
    func evidenceText(_ style: EvidenceTextStyle) -> some View {
        modifier(EvidenceTextModifier(style))
    }

    /// Applies a locked family to a whole Evidence page.
    func evidenceFamily(_ family: EvidenceFamily) -> some View {
        environment(\.evidenceFamily, family)
    }
}

/// Reads the current family's px → pt scale and palette inside a view.
struct EvidenceMetrics {
    let family: EvidenceFamily
    func pt(_ px: CGFloat) -> CGFloat { family.pt(px) }
    var c: EvidencePalette { family.palette }
}

// MARK: - Back navigation label

/// The locked pages label their back control with the parent's title
/// (`‹ Aug 26`, `‹ Shoulders`). The Evidence tab's NavigationStack injects
/// one ordered trail. Each page appends its token when it appears and the
/// token removes itself when the page is popped (its state is released),
/// so a page's back label is the title of the entry directly before it.
/// A page with no recorded parent (Home, Log, Goals stacks) says `‹ Back`.
@MainActor
@Observable
final class EvidenceBackTrail {
    struct Entry: Equatable {
        let id: UUID
        var title: String
        var isSeed = false
    }

    private(set) var entries: [Entry]

    init(seed titles: [String] = []) {
        entries = [Entry(id: UUID(), title: "Evidence Hub")] + titles.map { Entry(id: UUID(), title: $0, isSeed: true) }
    }

    func register(_ id: UUID, title: String) {
        if let index = entries.firstIndex(where: { $0.id == id }) {
            entries[index].title = title
            return
        }
        // A DEBUG review seed stands in for a page that a deep link skipped;
        // the real page replaces it when it appears.
        if let last = entries.last, last.isSeed, last.title == title { entries.removeLast() }
        entries.append(Entry(id: id, title: title))
    }

    func remove(_ id: UUID) {
        entries.removeAll { $0.id == id }
    }

    func parentTitle(of id: UUID) -> String? {
        guard let index = entries.firstIndex(where: { $0.id == id }), index > 0 else {
            return entries.last.flatMap { $0.id == id ? nil : $0.title }
        }
        return entries[index - 1].title
    }
}

/// Lives in a page's `@State`; popping the page releases it.
final class EvidenceTrailToken {
    let id = UUID()
    weak var trail: EvidenceBackTrail?

    deinit {
        let id = id
        let trail = trail
        Task { @MainActor in trail?.remove(id) }
    }
}

private struct EvidenceBackTrailKey: EnvironmentKey {
    static let defaultValue: EvidenceBackTrail? = nil
}

extension EnvironmentValues {
    var evidenceBackTrail: EvidenceBackTrail? {
        get { self[EvidenceBackTrailKey.self] }
        set { self[EvidenceBackTrailKey.self] = newValue }
    }
}

extension View {
    /// Keeps the locked visual size but grows the hit region to >= 44 pt.
    func evidenceHitTarget(visualHeight: CGFloat) -> some View {
        contentShape(Rectangle().inset(by: -max(0, (44 - visualHeight) / 2)))
    }
}
