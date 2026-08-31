import SwiftUI

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
struct OperatingPlanFieldRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
                .frame(width: 132, alignment: .leading)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
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
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(isSelected ? PhysiqueOSTheme.background : PhysiqueOSTheme.textPrimary)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(isSelected ? PhysiqueOSTheme.accent : PhysiqueOSTheme.surfaceMuted)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
