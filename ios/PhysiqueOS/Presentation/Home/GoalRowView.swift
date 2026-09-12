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
        let content = VStack(alignment: .leading, spacing: 10) {
            Text("Primary Goal")
                .physiqueOSFont(PhysiqueOSTypography.primaryGoalEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            if let targetDescription = trajectory.targetDescription {
                Text(targetDescription + (trajectory.overallTargetDate.map { " by \(TrainingDateFormatting.short($0))" } ?? ""))
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
            }
            VStack(spacing: 8) {
                ForEach(trajectory.phases) { phase in
                    PhaseTrajectoryPhaseCard(phase: phase)
                }
            }
            if let guardrail = trajectory.guardrail {
                GuardrailCalloutCard(text: guardrail)
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
        phase.status.prefix(1).uppercased() + phase.status.dropFirst()
    }

    private var isOutcome: Bool { phase.progressType == "outcome" }
    private var isUnavailable: Bool { phase.progressType == "unavailable" }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                IconBadge(systemImage: isOutcome ? "figure.strengthtraining.traditional" : "safari", color: colorToken, size: .md, isCircular: false)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Phase \(phase.order + 1)")
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(accent)
                    Text(phase.phaseName)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                Spacer(minLength: 8)
                Text(statusLabel)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(Capsule())
            }
            if isUnavailable, let label = phase.presentationLabel {
                Text(label)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            } else if let percentage = phase.clampedProgressPercentage {
                AnimatedProgressBar(value: percentage, color: accent, accessibilityLabel: "\(phase.phaseName) progress")
                if let label = phase.presentationLabel {
                    Text(label)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                if isOutcome {
                    Text(phase.progressStatus == "awaiting_follow_up" ? "Awaiting next DEXA" : "DEXA measurements anchor progress")
                        .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
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

private struct GuardrailCalloutCard: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            IconBadge(systemImage: "checkmark.shield.fill", color: .primary, size: .md, isCircular: false)
            VStack(alignment: .leading, spacing: 3) {
                Text("Guardrail")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(text)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("This remains in effect throughout every phase.")
                    .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .padding(12)
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
            VStack(alignment: .leading, spacing: 4) {
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
