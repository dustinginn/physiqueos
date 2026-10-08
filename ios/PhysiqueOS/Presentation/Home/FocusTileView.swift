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

enum HomeFocusIconPresentation {
    static func systemImage(for icon: HomeFocusIcon) -> String {
        switch icon {
        case .activity: "figure.strengthtraining.traditional"
        case .camera: "camera.fill"
        case .moon: "moon.fill"
        case .pills: "pills.fill"
        case .scale: "scalemass.fill"
        case .syringe: "syringe.fill"
        case .target: "target"
        case .utensils: "fork.knife"
        case .unknown: "circle.dashed"
        }
    }
}

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
    var onSkip: (PriorityOccurrence) -> Void = { _ in }
    var isCompleting: Bool = false
    var isSkipping: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            Button { onTap(item.destination) } label: { rowBody }
                .buttonStyle(.plain)
                .accessibilityLabel(accessibilityLabel)
                .accessibilityHint("Opens priority details")
            if item.completable, !item.completed, !isCompleting, !isSkipping {
                Button { onComplete(item) } label: { completeButton }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Mark \(item.title) complete")
            }
            if item.canonicalSkipCommand != nil, !item.completed, !isSkipping, !isCompleting {
                HomePrioritySkipButton(
                    title: item.title,
                    identifier: "home.priority.\(item.id).skip"
                ) { onSkip(item) }
            }
            if isCompleting {
                Circle().fill(PhysiqueOSTheme.chartSuccess)
                    .overlay(Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white))
                    .frame(width: 24, height: 24)
                    .accessibilityLabel("Completed")
            }
            if isSkipping {
                ProgressView()
                    .controlSize(.small)
                    .tint(PhysiqueOSTheme.redesignRed)
                    .frame(width: 44, height: 44)
                    .accessibilityLabel("Skipping \(item.title)")
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(minHeight: 62)
        .background(PhysiqueOSTheme.redesignSoft)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(item.color.foreground.opacity(0.32), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
    }

    private var rowBody: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .physiqueOSFont(PhysiqueOSTypography.focusLabel)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                if let executionContext = PriorityExecutionContextPresentation.primaryLine(for: item) {
                    Text(executionContext)
                        .physiqueOSFont(PhysiqueOSTypography.focusSubtitle)
                        .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                }
                if (density == .expanded || item.changeLabel != nil), let metadata = item.metadata {
                    Text(metadata)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
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
            .fill(.clear)
            .overlay(Circle().stroke(PhysiqueOSTheme.redesignGreen, lineWidth: 1.5))
            .overlay(
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .black))
                    .foregroundStyle(PhysiqueOSTheme.redesignGreen)
            )
            .frame(width: 28, height: 28)
            .frame(minWidth: 44, minHeight: 44)
    }
}

/// Home's terminal Skip is intentionally a direct, independent action.
/// The visible red circle is compact; the outer 44-point frame is the
/// actual hit region and is kept separate from row navigation and Complete.
struct HomePrioritySkipButton: View {
    let title: String
    let identifier: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "minus")
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(PhysiqueOSTheme.redesignRed, in: Circle())
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Skip \(title)")
        .accessibilityHint("Marks only this occurrence skipped")
        .accessibilityIdentifier(identifier)
    }
}
