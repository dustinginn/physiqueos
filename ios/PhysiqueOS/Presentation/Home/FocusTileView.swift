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

/// Mirrors `FocusTile.jsx` exactly, including its two independent
/// affordances (verified directly against source for this task): the row
/// body is a `Link` to `/priorities/{id}` (navigation, no write), and a
/// completable-but-not-yet-completed item additionally renders a small
/// round check button in its own `<form>` that completes the occurrence
/// in place, without navigating away from Home. `item.actionLabel` (e.g.
/// "Upload Photos") replaces the completion indicator entirely for a
/// non-completable item, matching `FocusTile.jsx`'s own
/// `actionLabel`-present branch.
struct FocusTileView: View {
    let item: PriorityOccurrence
    var onTap: (AppDestination) -> Void
    var onComplete: (PriorityOccurrence) -> Void
    var isCompleting: Bool = false

    var body: some View {
        HStack(spacing: 6) {
            Button { onTap(item.destination) } label: { rowBody }
                .buttonStyle(.plain)
            if item.completable, !item.completed, !isCompleting {
                Button { onComplete(item) } label: { completeButton }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Mark \(item.title) complete")
            }
            if isCompleting {
                Circle().fill(PhysiqueOSTheme.chartSuccess)
                    .overlay(Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white))
                    .frame(width: 24, height: 24)
                    .accessibilityLabel("Completed")
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
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(.isButton)
    }

    private var rowBody: some View {
        HStack(spacing: 8) {
            IconBadge(systemImage: iconMap[item.icon] ?? "target", color: item.color, size: .xs, isCircular: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .physiqueOSFont(PhysiqueOSTypography.focusLabel)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let subtitle = item.subtitle {
                    Text(subtitle)
                        .physiqueOSFont(PhysiqueOSTypography.focusSubtitle)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            Spacer(minLength: 4)
            if !item.completable || item.completed {
                if let actionLabel = item.actionLabel {
                    StatusChip(text: actionLabel, color: .effort)
                } else {
                    completionIndicator
                }
            }
        }
    }

    private var accessibilityLabel: String {
        var parts = [item.title]
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

    private var completeButton: some View {
        Circle()
            .fill(PhysiqueOSTheme.surfaceElevated)
            .overlay(Circle().stroke(PhysiqueOSTheme.divider, lineWidth: 1))
            .overlay(
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            )
            .frame(width: 22, height: 22)
    }
}
