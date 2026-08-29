import SwiftUI

private let iconMap: [HomeFocusIcon: String] = [
    .activity: "figure.strengthtraining.traditional",
    .camera: "camera.fill",
    .moon: "moon.fill",
    .scale: "scalemass.fill",
    .syringe: "syringe.fill",
    .target: "target",
    .utensils: "fork.knife",
]

/// Mirrors `FocusTile.jsx`. Native V1 does not implement completion writes
/// in this slice (that requires a command boundary this slice deliberately
/// does not build — see docs/PHYSIQUEOS_NATIVE_V1.md); a completable,
/// not-yet-completed item is shown read-only rather than with a live
/// "mark complete" action, matching what the fixture can honestly support.
struct FocusTileView: View {
    let item: HomeFocusItem
    var onTap: (AppDestination) -> Void

    var body: some View {
        let tile = HStack(spacing: 8) {
            IconBadge(systemImage: iconMap[item.icon] ?? "target", color: item.color, size: .xs, isCircular: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.label)
                    .physiqueOSFont(PhysiqueOSTypography.focusLabel)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let subtitle = item.subtitle {
                    Text(subtitle)
                        .physiqueOSFont(PhysiqueOSTypography.focusSubtitle)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            Spacer(minLength: 4)
            if let actionLabel = item.actionLabel {
                StatusChip(text: actionLabel, color: .effort)
            } else {
                completionIndicator
            }
        }
        .padding(10)
        .frame(minHeight: 68)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(item.color.foreground.opacity(0.24), lineWidth: 1)
        )

        Group {
            if let destination = item.destination {
                Button { onTap(destination) } label: { tile }.buttonStyle(.plain)
            } else {
                tile
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(item.destination != nil ? .isButton : [])
    }

    private var accessibilityLabel: String {
        var parts = [item.label]
        if let subtitle = item.subtitle { parts.append(subtitle) }
        parts.append(item.actionLabel ?? (item.completed ? "Completed" : "Not completed"))
        return parts.joined(separator: ", ")
    }

    @ViewBuilder
    private var completionIndicator: some View {
        ZStack {
            Circle()
                .fill(item.completed ? PhysiqueOSTheme.confidence : PhysiqueOSTheme.surfaceElevated)
                .overlay(Circle().stroke(item.completed ? PhysiqueOSTheme.confidence : PhysiqueOSTheme.divider, lineWidth: 1))
            if item.completed {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: 20, height: 20)
        .accessibilityHidden(true)
    }
}
