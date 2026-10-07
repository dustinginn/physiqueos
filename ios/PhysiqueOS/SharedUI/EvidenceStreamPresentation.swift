import SwiftUI
import UIKit

/// The nine Evidence destinations (Build 91, Founder-approved Option A):
/// the one registry for each domain's icon and stable category accent.
/// Category identity lives only in accents (Hub tile, page hero mark,
/// eyebrow, links, selected controls, small badges, Timeline identity);
/// every domain shares the neutral Evidence surfaces, and semantic data
/// colors (macros, intake/expenditure, Weight/DEXA, sleep, status) stay
/// independent of the domain accent.
enum EvidenceDomain: String, CaseIterable, Sendable {
    case training, activity, nutrition, weight, photos, dexa, energy, recovery, timeline

    /// The Hub stream id → domain. `health-metrics` (a hidden placeholder)
    /// and any future stream have no domain and render neutral.
    init?(streamId: String) {
        self.init(rawValue: streamId)
    }

    /// Production Timeline event types (`EvidenceTimelineService.js`) that
    /// belong to an Evidence domain. System events — Daily Briefing, Daily
    /// Check-In, Analysis, Protocol, Evidence Upload — have no domain.
    init?(timelineType: String) {
        switch timelineType {
        case "Workout": self = .training
        case "Daily Activity": self = .activity
        case "Weight": self = .weight
        case "Progress Photo": self = .photos
        case "DEXA": self = .dexa
        default: return nil
        }
    }

    /// Established PhysiqueOS glyphs: the web's `EVIDENCE_ICON_PRESENTATION`
    /// set, the shipping Home focus icons (`utensils` → `fork.knife`,
    /// `moon` → `moon.fill`) and the web Timeline "History" glyph.
    var systemImage: String {
        switch self {
        case .training: "dumbbell.fill"
        case .activity: "waveform.path.ecg"
        case .nutrition: "fork.knife"
        case .weight: "scalemass.fill"
        case .photos: "camera.fill"
        case .dexa: "person.fill.viewfinder"
        case .energy: "bolt.fill"
        case .recovery: "moon.fill"
        case .timeline: "clock.arrow.circlepath"
        }
    }

    /// Option A: one stable accent per domain; Timeline is an aggregator
    /// and stays neutral (its events carry their own domain identity).
    var accent: EvidenceAccent {
        switch self {
        case .training: .purple
        case .activity: .amber
        case .nutrition: .green
        case .energy: .orange
        case .weight: .blue
        case .dexa: .cyan
        case .photos: .rose
        case .recovery: .teal
        case .timeline: .neutral
        }
    }
}

/// An existing PhysiqueOS accent family as a Dark / Mineral Light pair. The
/// Mineral value is the family's deepest existing ink so accent text clears
/// 4.5:1 on the Evidence page and card surfaces.
struct EvidenceAccent: Equatable, Sendable {
    let name: String
    let dark: UInt32
    let mineral: UInt32

    /// `redesignPurple`.
    static let purple = EvidenceAccent(name: "Purple", dark: 0xAA98FF, mineral: 0x5C3FD2)
    /// `redesignAmber` / `redesignAmberInk`.
    static let amber = EvidenceAccent(name: "Amber", dark: 0xEFB84F, mineral: 0x925500)
    /// `redesignGreen` / Evidence semantic green ink.
    static let green = EvidenceAccent(name: "Green", dark: 0x55E39A, mineral: 0x28744A)
    /// `mealBreakfast` orange / `redesignOrangeInk` (the only existing orange
    /// Mineral ink, `#B65E16`, is 3.77:1 on an Evidence card).
    static let orange = EvidenceAccent(name: "Orange", dark: 0xFB923C, mineral: 0x9A4C10)
    /// `chartEvidence` / Evidence blue ink.
    static let blue = EvidenceAccent(name: "Blue", dark: 0x60A5FA, mineral: 0x176D92)
    /// `redesignCyan` / `redesignCyanInk`.
    static let cyan = EvidenceAccent(name: "Cyan", dark: 0x3BC6DD, mineral: 0x10708A)
    /// `mealSnacks` rose.
    static let rose = EvidenceAccent(name: "Rose", dark: 0xF472B6, mineral: 0xA83B78)
    /// `redesignTeal` / Evidence teal ink.
    static let teal = EvidenceAccent(name: "Teal", dark: 0x3BD2CA, mineral: 0x0B766F)
    /// The Evidence `sub` ink: aggregators and domain-less system events.
    static let neutral = EvidenceAccent(name: "Neutral", dark: 0xBCC5C8, mineral: 0x46535B)

    var color: Color { Self.dynamic(dark, mineral, 1, 1) }
    /// The small-mark tint (Hub tile, hero mark, Timeline node, tags) —
    /// never a card or page wash.
    var soft: Color { Self.dynamic(dark, mineral, 0.14, 0.12) }

    private static func dynamic(_ dark: UInt32, _ light: UInt32, _ darkOpacity: CGFloat, _ lightOpacity: CGFloat) -> Color {
        Color(uiColor: UIColor { traits in
            let isDark = traits.userInterfaceStyle == .dark
            let hex = isDark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: isDark ? darkOpacity : lightOpacity
            )
        })
    }
}

private struct EvidenceDomainKey: EnvironmentKey {
    static let defaultValue: EvidenceDomain? = nil
}

extension EnvironmentValues {
    /// The Evidence destination a page belongs to; shared Evidence
    /// components read their accent from it.
    var evidenceDomain: EvidenceDomain? {
        get { self[EvidenceDomainKey.self] }
        set { self[EvidenceDomainKey.self] = newValue }
    }
}

extension View {
    func evidenceDomain(_ domain: EvidenceDomain) -> some View {
        environment(\.evidenceDomain, domain)
    }
}

/// The domain's SF Symbol in its accent on the accent-soft circle — the
/// page hero mark (38–40 pt) shared by every Evidence report.
struct EvidenceDomainMark: View {
    let systemImage: String
    let accent: EvidenceAccent
    let diameter: CGFloat

    init(domain: EvidenceDomain, diameter: CGFloat) {
        systemImage = domain.systemImage
        accent = domain.accent
        self.diameter = diameter
    }

    /// The Evidence Hub's own mark: the Evidence tab glyph, neutral.
    init(hubDiameter diameter: CGFloat) {
        systemImage = AppTab.evidence.systemImageName
        accent = .neutral
        self.diameter = diameter
    }

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: diameter * 0.42, weight: .semibold))
            .foregroundStyle(accent.color)
            .frame(width: diameter, height: diameter)
            .background(accent.soft, in: Circle())
            .accessibilityHidden(true)
    }
}
