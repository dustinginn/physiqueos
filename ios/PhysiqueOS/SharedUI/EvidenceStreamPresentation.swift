import SwiftUI

/// Reasonable native equivalents of `EVIDENCE_ICON_PRESENTATION`
/// (`src/components/progress/EvidenceIconPresentation.js`) — this governs
/// each Evidence Hub row's icon badge, a distinct rainbow-per-category
/// palette from `stream.tone`'s five-value system (`HomeColorToken`),
/// which `EvidenceHubIndex.jsx` does not actually use for the icon badge.
/// Unlike the root tab bar (where exact icon fidelity is mandated), no
/// single correct SF Symbol exists for several of lucide-react's icons
/// (`Salad`, `ScanLine`), so these are documented best equivalents, not
/// pixel-exact ports.
enum EvidenceStreamPresentation {
    struct Style {
        let systemImage: String
        let color: Color
    }

    static func style(for streamId: String) -> Style {
        switch streamId {
        case "training": Style(systemImage: "dumbbell.fill", color: Color(hex: 0xC084FC)) // Dumbbell, purple
        case "nutrition": Style(systemImage: "carrot.fill", color: Color(hex: 0xFDBA74)) // Salad, orange
        case "weight": Style(systemImage: "scalemass.fill", color: Color(hex: 0x93C5FD)) // Scale, blue
        case "photos": Style(systemImage: "camera.fill", color: Color(hex: 0xFDA4AF)) // Camera, rose
        case "dexa": Style(systemImage: "person.fill.viewfinder", color: Color(hex: 0x6EE7B7)) // ScanLine, emerald
        case "activity": Style(systemImage: "waveform.path.ecg", color: Color(hex: 0xFCD34D)) // Activity, amber
        case "energy": Style(systemImage: "bolt.fill", color: Color(hex: 0xC4B5FD)) // Zap, violet
        case "recovery": Style(systemImage: "bed.double.fill", color: Color(hex: 0x5EEAD4)) // Activity (recovery), teal
        case "health-metrics": Style(systemImage: "heart.text.square.fill", color: Color(hex: 0x67E8F9)) // HeartPulse, cyan
        default: Style(systemImage: "list.clipboard.fill", color: PhysiqueOSTheme.textSecondary) // ClipboardList default
        }
    }
}
