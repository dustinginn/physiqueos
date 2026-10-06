import SwiftUI
import UIKit

/// The one device-local appearance choice owned by the iPhone app.
/// `system` maps to no preferred scheme so iOS changes keep propagating.
enum AppAppearance: String, CaseIterable, Codable, Identifiable {
    case system
    case dark
    case light

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "System"
        case .dark: "Dark"
        case .light: "Mineral Light"
        }
    }

    var detail: String {
        switch self {
        case .system: "Matches this iPhone and changes automatically."
        case .dark: "Deep navy surfaces with bright semantic accents."
        case .light: "Mineral Light surfaces with dark readable type."
        }
    }

    var preferredColorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .dark: .dark
        case .light: .light
        }
    }
}

/// App-level observable preferences with injectable persistence for tests.
/// The iPhone appearance and the Apple Watch appearance are independent:
/// separate keys, separate setters, and neither is ever derived from the
/// other. iPhone System removes its key, so fresh install and an explicit
/// reset are equal; an unset Watch appearance is Dark.
@MainActor
@Observable
final class AppAppearanceStore {
    static let persistenceKey = "physiqueos.appearance.preference.v1"
    static let watchPersistenceKey = "physiqueos.appearance.watch.v1"

    private let defaults: UserDefaults
    private let key: String
    private let watchKey: String
    private let initialOverride: AppAppearance?
    private let initialWatchOverride: WatchAppearancePreference?
    private(set) var selection: AppAppearance
    private(set) var watchSelection: WatchAppearancePreference

    init(
        defaults: UserDefaults = .standard,
        key: String = AppAppearanceStore.persistenceKey,
        watchKey: String = AppAppearanceStore.watchPersistenceKey,
        initialOverride: AppAppearance? = nil,
        initialWatchOverride: WatchAppearancePreference? = nil
    ) {
        self.defaults = defaults
        self.key = key
        self.watchKey = watchKey
        self.initialOverride = initialOverride
        self.initialWatchOverride = initialWatchOverride
        watchSelection = initialWatchOverride
            ?? WatchAppearancePreference.decode(defaults.string(forKey: watchKey))
            ?? .fallback
        if let initialOverride {
            selection = initialOverride
        } else if let rawValue = defaults.string(forKey: key),
                  let stored = AppAppearance(rawValue: rawValue.lowercased()) {
            selection = stored
        } else {
            selection = .system
            if defaults.object(forKey: key) != nil {
                defaults.removeObject(forKey: key)
            }
        }
    }

    var preferredColorScheme: ColorScheme? { selection.preferredColorScheme }

    /// The Apple Watch appearance. Never touches the iPhone selection.
    func selectWatch(_ appearance: WatchAppearancePreference) {
        watchSelection = appearance
        guard initialWatchOverride == nil else { return }
        defaults.set(appearance.rawValue, forKey: watchKey)
    }

    func select(_ appearance: AppAppearance) {
        selection = appearance
        guard initialOverride == nil else { return }
        if appearance == .system {
            defaults.removeObject(forKey: key)
        } else {
            defaults.set(appearance.rawValue, forKey: key)
        }
    }

    /// Deterministic cleanup seam; shipping Settings uses `select(.system)`.
    func resetForTesting() {
        defaults.removeObject(forKey: key)
        selection = initialOverride ?? .system
    }
}

/// Shared semantic product tokens. Dark preserves the current shipping
/// baseline; light uses the locked Mineral Light palette. Dynamic UIKit
/// providers migrate existing token-based screens without per-screen flags.
enum PhysiqueOSTheme {
    static let background = dynamic(dark: 0x080D18, light: 0xF0EEE6)
    static let surfaceElevated = dynamic(dark: 0x141F31, light: 0xFBFAF6)
    static let trajectorySurface = dynamic(dark: 0x142D38, light: 0xDCEBE8)
    static let surfaceMuted = dynamic(dark: 0x172235, light: 0xE5EBE7)
    static let surfaceAccent = dynamic(dark: 0x20264A, light: 0xDDE8F1)

    static let textPrimary = dynamic(dark: 0xF3F6FB, light: 0x0A1B2C)
    static let textSecondary = dynamic(dark: 0xCBD5E1, light: 0x495E68)
    static let textMuted = dynamic(dark: 0x9AA8BA, light: 0x65767D)
    static let divider = dynamic(dark: 0x94A3B8, light: 0xCAD4CF, darkOpacity: 0.18)

    static let accent = dynamic(dark: 0x8B8CFF, light: 0x7655DC)
    static let confidence = dynamic(dark: 0x4ADE80, light: 0x138C60)
    static let confidenceTrack = dynamic(dark: 0x94A3B8, light: 0xBFCBC7, darkOpacity: 0.22)
    static let destructive = dynamic(dark: 0xEF4444, light: 0xB42345)

    static let chartSuccess = dynamic(dark: 0x4ADE80, light: 0x138C60)
    static let chartEvidence = dynamic(dark: 0x60A5FA, light: 0x167BA8)
    static let chartEffort = dynamic(dark: 0xFBBF24, light: 0xB9780D)

    static let sleepTotal = dynamic(dark: 0x5EEAD4, light: 0x0E9186)
    static let sleepDeep = dynamic(dark: 0x6366F1, light: 0x4F46B8)
    static let sleepCore = dynamic(dark: 0x60A5FA, light: 0x167BA8)
    static let sleepREM = dynamic(dark: 0xA78BFA, light: 0x7655DC)
    static let sleepAwake = dynamic(dark: 0xCBD5E1, light: 0x65767D)
    static let sleepUnspecified = dynamic(dark: 0x5EEAD4, light: 0x0E9186, darkOpacity: 0.7, lightOpacity: 0.72)
    static let sleepInBed = dynamic(dark: 0x94A3B8, light: 0xCAD4CF, darkOpacity: 0.16, lightOpacity: 0.72)

    static let macroProtein = dynamic(dark: 0xFB7185, light: 0xB83E5B)
    static let nutritionCalories = dynamic(dark: 0x4ADE80, light: 0x138C60)
    static let macroCarbohydrates = dynamic(dark: 0xFBBF24, light: 0xB9780D)
    static let macroFat = dynamic(dark: 0x38BDF8, light: 0x167BA8)
    static let mealBreakfast = dynamic(dark: 0xFB923C, light: 0xB65E16)
    static let mealLunch = dynamic(dark: 0x34D399, light: 0x138C60)
    static let mealDinner = dynamic(dark: 0xA78BFA, light: 0x7655DC)
    static let mealSnacks = dynamic(dark: 0xF472B6, light: 0xA83B78)

    static let dexaMarker = dynamic(dark: 0xA78BFA, light: 0x7655DC)
    static let weightTrendLine = dynamic(dark: 0x0EA5E9, light: 0x167BA8)
    static let energyIntake = dynamic(dark: 0xFBBF24, light: 0xB9780D)
    static let energyExpenditure = dynamic(dark: 0x60A5FA, light: 0x167BA8)
    static let monthlyEnergy = dynamic(dark: 0x22D3EE, light: 0x168D9D)

    /// Intentional fixed dark action surface for white-label controls in
    /// both appearances; this is distinct from the dynamic page canvas.
    static let actionDark = Color(hex: 0x06121D)

    // Founder-locked redesign vocabulary. These are shared semantic tokens,
    // deliberately separate from the legacy baseline above so Batch 1 can
    // land Home, Goals and You without silently restyling out-of-scope
    // screens. Later implementation batches can migrate onto the same set.
    static let redesignCanvas = dynamic(dark: 0x061019, light: 0xE8ECE5)
    static let redesignPaper = dynamic(dark: 0x0F1C2A, light: 0xFBFAF4)
    static let redesignSoft = dynamic(dark: 0x132334, light: 0xEEF2ED)
    static let redesignInk = dynamic(dark: 0xF3F8FA, light: 0x102431)
    static let redesignInkSecondary = dynamic(dark: 0xC3D2D9, light: 0x526970)
    static let redesignPurple = dynamic(dark: 0xAA98FF, light: 0x5C3FD2)
    static let redesignGreen = dynamic(dark: 0x55E39A, light: 0x16875F)
    static let redesignAmber = dynamic(dark: 0xEFB84F, light: 0xC88228)
    static let redesignTeal = dynamic(dark: 0x3BD2CA, light: 0x087E78)
    static let redesignCyan = dynamic(dark: 0x3BC6DD, light: 0x107F99)
    static let redesignFieldStart = dynamic(dark: 0x087B70, light: 0xCBE6E2)
    static let redesignFieldEnd = dynamic(dark: 0x132751, light: 0xB9D5DD)
    static let redesignAmberField = dynamic(dark: 0xF4BC48, light: 0xC98220)
    static let redesignCoachField = dynamic(dark: 0x122A55, light: 0xDDE8F1)
    static let redesignRule = dynamic(dark: 0xA7BCC5, light: 0x6E817F, darkOpacity: 0.18, lightOpacity: 0.22)
    // Batch 2 additions from the locked Log Compact Command Center. Mineral
    // Light uses deeper ink variants of amber/cyan wherever they are text or
    // thin semantic rules, so those stay legible on paper surfaces.
    static let redesignMuted = dynamic(dark: 0x92A5AF, light: 0x5D7279)
    static let redesignAmberInk = dynamic(dark: 0xEFB84F, light: 0x925500)
    static let redesignCyanInk = dynamic(dark: 0x3BC6DD, light: 0x10708A)
    static let redesignOnAmber = dynamic(dark: 0x10202A, light: 0xFFFAF1)
    static let redesignHairline = dynamic(dark: 0x9DB3BD, light: 0x193842, darkOpacity: 0.184, lightOpacity: 0.169)
    // Batch 2 Training Logger utility roles (locked utility package).
    static let redesignUtilityMuted = dynamic(dark: 0x92A5AF, light: 0x6B7E85)
    static let redesignRed = dynamic(dark: 0xFF697A, light: 0xB83D4B)
    static let redesignOnExecution = Color(hex: 0x10202A)
    static let redesignUtilityField = dynamic(dark: 0x087B70, light: 0xD5ECE6)
    static let redesignUtilityNavy = dynamic(dark: 0x132751, light: 0xB8CFDF)
    /// Suggested Today eyebrow on the teal field (#E9FFFF on dark field;
    /// deep teal ink on the light field so it stays legible).
    static let redesignSuggestionInk = dynamic(dark: 0xE9FFFF, light: 0x087E78)

    private static func dynamic(
        dark: UInt32,
        light: UInt32,
        darkOpacity: Double = 1,
        lightOpacity: Double = 1
    ) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(hex: dark, opacity: darkOpacity)
                : UIColor(hex: light, opacity: lightOpacity)
        })
    }
}

enum HomeColorToken: String, Codable {
    case primary, success, evidence, effort, warning, danger, muted, surface, plain

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? .muted
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

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

private extension UIColor {
    convenience init(hex: UInt32, opacity: Double = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: opacity
        )
    }
}
