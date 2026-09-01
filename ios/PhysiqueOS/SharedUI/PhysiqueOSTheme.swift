import SwiftUI

/// Shared presentation tokens mirroring the web app's dark theme values
/// (`src/app/globals.css`, `.dark` block). This is deliberately still not a
/// design system — only the tokens Home actually needs are ported. Extend
/// this file, not ad hoc colors in a screen, as later screens need more of
/// the web's palette.
enum PhysiqueOSTheme {
    static let background = Color(hex: 0x080D18)
    static let surfaceElevated = Color(hex: 0x141F31)
    static let surfaceMuted = Color(hex: 0x172235)
    /// `--surface-accent` in the web dark theme — a distinct tinted
    /// surface for promotional/entry-point cards (e.g. Training Logger).
    static let surfaceAccent = Color(hex: 0x20264A)

    static let textPrimary = Color(hex: 0xF3F6FB)
    static let textSecondary = Color(hex: 0xCBD5E1)
    static let textMuted = Color(hex: 0x9AA8BA)

    static let divider = Color(hex: 0x94A3B8, opacity: 0.18)

    /// `--primary` in the web dark theme.
    static let accent = Color(hex: 0x8B8CFF)
    /// `--confidence` in the web dark theme.
    static let confidence = Color(hex: 0x4ADE80)
    static let confidenceTrack = Color(hex: 0x94A3B8, opacity: 0.22)
    static let destructive = Color(hex: 0xEF4444)

    /// `--chart-1` (success/green).
    static let chartSuccess = Color(hex: 0x4ADE80)
    /// `--chart-2` (evidence/blue).
    static let chartEvidence = Color(hex: 0x60A5FA)
    /// `--chart-3` (effort/amber).
    static let chartEffort = Color(hex: 0xFBBF24)

    /// Nutrition semantics mirror the current web dark-theme tokens in
    /// `src/app/globals.css`. Keeping these centralized preserves visual
    /// continuity across future Native Nutrition surfaces.
    static let macroProtein = Color(hex: 0xFB7185)
    static let macroCarbohydrates = Color(hex: 0xFBBF24)
    static let macroFat = Color(hex: 0x38BDF8)
    static let mealBreakfast = Color(hex: 0xFB923C)
    static let mealLunch = Color(hex: 0x34D399)
    static let mealDinner = Color(hex: 0xA78BFA)
    static let mealSnacks = Color(hex: 0xF472B6)
}

/// Semantic color slots mirroring `IconBadge.jsx`'s `colors` map, so icon
/// badges, status chips, and goal accents all draw from the same named set
/// instead of screens picking raw colors.
enum HomeColorToken: String, Codable {
    case primary, success, evidence, effort, warning, danger, muted, surface, plain

    var foreground: Color {
        switch self {
        case .primary: PhysiqueOSTheme.accent
        case .success: PhysiqueOSTheme.chartSuccess
        case .evidence: PhysiqueOSTheme.chartEvidence
        case .effort, .warning: PhysiqueOSTheme.chartEffort
        case .danger: PhysiqueOSTheme.destructive
        case .muted, .plain: PhysiqueOSTheme.textPrimary
        case .surface: PhysiqueOSTheme.accent
        }
    }

    var background: Color {
        switch self {
        case .muted: PhysiqueOSTheme.surfaceMuted
        case .surface: PhysiqueOSTheme.surfaceElevated
        case .plain: .clear
        default: foreground.opacity(0.16)
        }
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
