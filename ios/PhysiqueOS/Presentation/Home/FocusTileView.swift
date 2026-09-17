import SwiftUI

/// Presentation-only formatting over the server-owned notification action.
/// This never derives a schedule or dose: it merely localizes the canonical
/// `HH:mm` and displays the canonical completion payload's dose.
enum PriorityExecutionContextPresentation {
    static func context(for item: PriorityOccurrence, calendar: Calendar = .current) -> String? {
        let time = item.notificationAction?.scheduledTime.flatMap {
            localizedTime($0, calendar: calendar)
        }
        let dose = item.notificationAction?.completionCommand?.payload.dose?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let values = [time, dose?.isEmpty == false ? dose : nil].compactMap { $0 }
        return values.isEmpty ? nil : values.joined(separator: " · ")
    }

    static func primaryLine(for item: PriorityOccurrence, calendar: Calendar = .current) -> String? {
        context(for: item, calendar: calendar) ?? item.subtitle
    }

    private static func localizedTime(_ value: String, calendar: Calendar) -> String? {
        let components = value.split(separator: ":").compactMap { Int($0) }
        guard components.count == 2,
              (0...23).contains(components[0]),
              (0...59).contains(components[1]) else { return nil }
        let calendar = calendar
        var date = DateComponents()
        date.calendar = calendar
        date.timeZone = calendar.timeZone
        date.year = 2001
        date.month = 1
        date.day = 1
        date.hour = components[0]
        date.minute = components[1]
        guard let resolved = calendar.date(from: date) else { return nil }
        return resolved.formatted(date: .omitted, time: .shortened)
    }
}

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
    enum Density { case compact, balanced, expanded }

    let item: PriorityOccurrence
    var density: Density = .balanced
    var onTap: (AppDestination) -> Void
    var onComplete: (PriorityOccurrence) -> Void
    var isCompleting: Bool = false

    var body: some View {
        HStack(spacing: 10) {
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
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
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
        HStack(spacing: 10) {
            IconBadge(systemImage: iconMap[item.icon] ?? "target", color: item.color, size: .xs, isCircular: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .physiqueOSFont(PhysiqueOSTypography.focusLabel)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let executionContext = PriorityExecutionContextPresentation.primaryLine(for: item) {
                    Text(executionContext)
                        .physiqueOSFont(PhysiqueOSTypography.focusSubtitle)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if (density == .expanded || item.changeLabel != nil), let metadata = item.metadata {
                    Text(metadata)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                if let changeLabel = item.changeLabel {
                    Text(changeLabel)
                        .physiqueOSFont(PhysiqueOSTypography.focusBadge)
                        .foregroundStyle(PhysiqueOSTheme.chartEffort)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(PhysiqueOSTheme.chartEffort.opacity(0.14))
                        .clipShape(Capsule())
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
        if let context = PriorityExecutionContextPresentation.primaryLine(for: item) { parts.append(context) }
        if let metadata = item.metadata { parts.append(metadata) }
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
