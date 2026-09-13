import SwiftUI

private let iconMap: [HomeGoalIcon: String] = [
    .activity: "waveform.path.ecg",
    .compass: "safari",
    .dumbbell: "figure.strengthtraining.traditional",
    .shield: "checkmark.shield.fill",
    .target: "target",
]

/// Mirrors `GoalRow.jsx`'s `primary_goal` (progress bar + percentage) and
/// default "supporting" (status + detail pair) presentations. `terminal`,
/// `calibration`, and `phase_trajectory` goal rows exist on the web but are
/// not modeled in this slice.
struct GoalRowView: View {
    let goal: HomeGoal
    var onTap: (AppDestination) -> Void

    var body: some View {
        if case .phaseTrajectory(let trajectory) = goal.presentation {
            PhaseTrajectoryGoalView(title: goal.title, trajectory: trajectory, destination: goal.destination, onTap: onTap)
        } else {
            compactRow
        }
    }

    private var compactRow: some View {
        let row = HStack(spacing: 10) {
            IconBadge(systemImage: iconMap[goal.icon] ?? "target", color: goal.color, size: .md, isCircular: true)

            VStack(alignment: .leading, spacing: 2) {
                if isPrimary {
                    Text("Primary Goal")
                        .physiqueOSFont(PhysiqueOSTypography.primaryGoalEyebrow)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                }
                Text(goal.title)
                    .physiqueOSFont(PhysiqueOSTypography.goalTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .lineLimit(1)
                if isPrimary {
                    Text("\(goal.current)\(goal.unit) → \(goal.target)\(goal.unit)")
                        .physiqueOSFont(PhysiqueOSTypography.goalRange)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                if let phaseLabel {
                    Text(phaseLabel)
                        .physiqueOSFont(PhysiqueOSTypography.goalRange)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)
            trailing
        }
        .padding(.vertical, 8)

        return Group {
            if let destination = goal.destination {
                Button { onTap(destination) } label: { row }.buttonStyle(.plain)
            } else {
                row
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(goal.destination != nil ? .isButton : [])
    }

    private var isPrimary: Bool {
        if case .primary = goal.presentation { return true }
        return false
    }

    private var phaseLabel: String? {
        if case .primary(_, let phaseLabel) = goal.presentation { return phaseLabel }
        return nil
    }

    @ViewBuilder
    private var trailing: some View {
        switch goal.presentation {
        case .primary(let progress, _):
            HStack(spacing: 10) {
                AnimatedProgressBar(value: progress, color: goal.color.foreground, accessibilityLabel: "\(goal.title) progress")
                    .frame(width: 64)
                VStack(alignment: .trailing, spacing: 1) {
                    Text("\(progress)%")
                        .physiqueOSFont(PhysiqueOSTypography.goalProgressValue)
                        .foregroundStyle(goal.color.foreground)
                    Text("Complete")
                        .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        case .supporting(let status, let detail):
            VStack(alignment: .trailing, spacing: 2) {
                Text(status)
                    .physiqueOSFont(PhysiqueOSTypography.goalStatusValue)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(detail)
                    .physiqueOSFont(PhysiqueOSTypography.goalStatusDetail)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(2)
            }
            .frame(maxWidth: 120, alignment: .trailing)
        case .phaseTrajectory:
            // `compactRow` (and therefore `trailing`) is never rendered for
            // this case — `GoalRowView.body` routes it to
            // `PhaseTrajectoryGoalView` instead — but the switch must stay
            // exhaustive.
            EmptyView()
        }
    }
}

/// Founder Production's real Home for a two-phase Build Lean Mass goal
/// (Build 21 parity fix): every phase gets its own card — not just the
/// active one — plus the goal's guardrail, mirroring `GoalRow.jsx`'s
/// `PhaseTrajectoryGoal` component exactly rather than the collapsed
/// single-active-phase summary this slice previously rendered.
struct PhaseTrajectoryGoalView: View {
    let title: String
    let trajectory: HomePhaseTrajectory
    let destination: AppDestination?
    var onTap: (AppDestination) -> Void

    var body: some View {
        let content = VStack(alignment: .leading, spacing: 0) {
            Text("Primary Goal")
                .physiqueOSFont(PhysiqueOSTypography.primaryGoalEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .padding(.top, 2)
            if let targetDescription = trajectory.targetDescription {
                Text(targetDescription + (trajectory.overallTargetDate.map { " by \(TrainingDateFormatting.short($0))" } ?? ""))
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .padding(.top, 8)
            }
            VStack(spacing: 10) {
                ForEach(trajectory.phases) { phase in
                    PhaseTrajectoryPhaseCard(phase: phase)
                }
            }
            .padding(.top, 12)
            if let guardrail = trajectory.guardrail {
                GuardrailCalloutCard(text: guardrail)
                    .padding(.top, 12)
            }
        }

        return Group {
            if let destination {
                Button { onTap(destination) } label: { content }.buttonStyle(.plain)
            } else {
                content
            }
        }
    }
}

private struct PhaseTrajectoryPhaseCard: View {
    let phase: HomeGoalPhase

    private var colorToken: HomeColorToken {
        switch phase.presentationTone {
        case "gold", "orange": .effort
        case "green": .success
        default: .muted
        }
    }
    private var accent: Color { colorToken.foreground }

    private var statusLabel: String {
        if phase.timelineProgressState == "review_due" { return "Review due" }
        return phase.status.prefix(1).uppercased() + phase.status.dropFirst()
    }

    private var isOutcome: Bool { phase.progressType == "outcome" }
    private var isUnavailable: Bool { phase.progressType == "unavailable" }

    private var timingLabel: String? {
        guard phase.status == "active",
              let startDate = phase.startDate,
              let reviewDate = phase.calculatedPlannedReviewDate else { return nil }
        return "Started \(compactDate(startDate)) · Planned review \(compactDate(reviewDate))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: isOutcome ? "figure.strengthtraining.traditional" : "safari")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 36, height: 36)
                    .background(colorToken.background)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Phase \(phase.order + 1)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(accent)
                    Text(phase.phaseName)
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        .lineSpacing(3)
                }
                Spacer(minLength: 8)
                Text(statusLabel)
                    .font(.system(size: 9, weight: .heavy))
                    .foregroundStyle(accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(Capsule())
            }
            if let timingLabel {
                Text(timingLabel)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .padding(.leading, 46)
            }
            if isUnavailable, let label = phase.presentationLabel {
                Text(label)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            } else if let percentage = phase.clampedProgressPercentage {
                AnimatedProgressBar(value: percentage, color: accent, accessibilityLabel: "\(phase.phaseName) progress")
                if let label = phase.presentationLabel {
                    Text(label)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                if isOutcome {
                    Text(phase.progressStatus == "awaiting_follow_up" ? "Awaiting next DEXA" : "DEXA measurements anchor progress")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
        }
        .padding(12)
        .background(PhysiqueOSTheme.surfaceMuted.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(accent.opacity(0.2)))
    }
}

private func compactDate(_ value: String) -> String {
    let input = DateFormatter()
    input.locale = Locale(identifier: "en_US_POSIX")
    input.calendar = Calendar(identifier: .gregorian)
    input.timeZone = TimeZone(secondsFromGMT: 0)
    input.dateFormat = "yyyy-MM-dd"
    guard let date = input.date(from: value) else { return value }
    let output = DateFormatter()
    output.locale = Locale(identifier: "en_US_POSIX")
    output.calendar = Calendar(identifier: .gregorian)
    output.timeZone = TimeZone(secondsFromGMT: 0)
    output.dateFormat = "MMM d"
    return output.string(from: date)
}

private struct GuardrailCalloutCard: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            IconBadge(systemImage: "checkmark.shield.fill", color: .primary, size: .md, isCircular: false)
                .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 4) {
                Text("Guardrail")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(text)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("This remains in effect throughout every phase.")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .padding(16)
        .background(PhysiqueOSTheme.accent.opacity(0.07))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PhysiqueOSTheme.accent.opacity(0.22)))
    }
}

struct GoalsCardView: View {
    let goals: [HomeGoal]
    var onTap: (AppDestination) -> Void

    var body: some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Your Goals")
                VStack(spacing: 0) {
                    ForEach(goals) { goal in
                        GoalRowView(goal: goal, onTap: onTap)
                        if goal.id != goals.last?.id {
                            Divider().overlay(PhysiqueOSTheme.divider)
                        }
                    }
                }
            }
        }
    }
}
