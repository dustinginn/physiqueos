import SwiftUI

/// Presentation-only formatting over the server-owned notification action.
/// This never derives a schedule or dose: it merely localizes the canonical
/// `HH:mm` and displays the canonical completion payload's dose.
enum PriorityExecutionContextPresentation {
    struct Lines: Equatable {
        let primary: String?
        let secondary: String?
    }

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
        lines(for: item, calendar: calendar).primary
    }

    /// Produces one schedule line even when the Server projects the same
    /// clock time in both `scheduledTime` and a cadence-rich subtitle or
    /// metadata value. Distinct state/date/instruction copy remains a
    /// secondary line; canonical schedule and action fields are untouched.
    static func lines(for item: PriorityOccurrence, calendar: Calendar = .current) -> Lines {
        let time = item.notificationAction?.scheduledTime.flatMap {
            localizedTime($0, calendar: calendar)
        }
        let dose = item.notificationAction?.completionCommand?.payload.dose?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let meaningfulDose = dose?.isEmpty == false ? dose : nil
        let candidates = [item.subtitle, item.metadata]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        var primary: String?
        if let time {
            let timeKey = comparisonKey(time)
            primary = candidates
                .filter { comparisonKey($0).contains(timeKey) }
                .max { lhs, rhs in lhs.count < rhs.count } ?? time
        } else if let meaningfulDose {
            primary = meaningfulDose
        } else {
            primary = item.subtitle
        }

        if let meaningfulDose,
           let current = primary,
           !comparisonKey(current).contains(comparisonKey(meaningfulDose)) {
            primary = "\(current) · \(meaningfulDose)"
        }

        let secondary = candidates.first { candidate in
            guard !isRedundant(candidate, with: primary) else { return false }
            if let time,
               comparisonKey(candidate).contains(comparisonKey(time)),
               primary.map({ comparisonKey($0).contains(comparisonKey(time)) }) == true,
               !hasDistinctDueAndScheduleSemantics(candidate, primary ?? "") {
                return false
            }
            if time != nil, isGenericRelativeTime(candidate) { return false }
            return true
        }
        return Lines(primary: primary, secondary: secondary)
    }

    private static func isRedundant(_ candidate: String, with primary: String?) -> Bool {
        guard let primary else { return false }
        let candidateKey = comparisonKey(candidate)
        let primaryKey = comparisonKey(primary)
        return candidateKey == primaryKey
            || primaryKey.contains(candidateKey)
            || candidateKey.contains(primaryKey)
    }

    private static func isGenericRelativeTime(_ value: String) -> Bool {
        ["today", "tonight", "thismorning", "thisafternoon", "thisevening"]
            .contains(comparisonKey(value))
    }

    private static func hasDistinctDueAndScheduleSemantics(_ lhs: String, _ rhs: String) -> Bool {
        let dueWords = ["due", "deadline"]
        let scheduleWords = ["scheduled", "starts", "begins"]
        let left = lhs.lowercased()
        let right = rhs.lowercased()
        return (dueWords.contains { left.contains($0) } && scheduleWords.contains { right.contains($0) })
            || (scheduleWords.contains { left.contains($0) } && dueWords.contains { right.contains($0) })
    }

    private static func comparisonKey(_ value: String) -> String {
        String(value.lowercased().unicodeScalars.filter(CharacterSet.alphanumerics.contains))
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
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.locale = calendar.locale ?? .current
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: resolved)
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
            if item.allowsHomeInlineCompletion, !isCompleting, !isSkipping {
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
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.priority.\(item.id)")
    }

    private var rowBody: some View {
        let presentation = PriorityExecutionContextPresentation.lines(for: item)
        return HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .physiqueOSFont(PhysiqueOSTypography.focusLabel)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let executionContext = presentation.primary {
                    Text(executionContext)
                        .physiqueOSFont(PhysiqueOSTypography.focusSubtitle)
                        .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if (density == .expanded || item.changeLabel != nil), let secondary = presentation.secondary {
                    Text(secondary)
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
                } else if !item.isMorningWeighIn && !item.isDexaAppointmentReminder {
                    completionIndicator
                }
            }
        }
    }

    private var accessibilityLabel: String {
        let presentation = PriorityExecutionContextPresentation.lines(for: item)
        var parts = [item.title]
        if let context = presentation.primary { parts.append(context) }
        if let secondary = presentation.secondary { parts.append(secondary) }
        if let actionLabel = item.actionLabel {
            parts.append(actionLabel)
        } else if item.completed {
            parts.append("Completed")
        } else if item.isMorningWeighIn || item.isDexaAppointmentReminder {
            parts.append("Open")
        } else {
            parts.append("Not completed")
        }
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
