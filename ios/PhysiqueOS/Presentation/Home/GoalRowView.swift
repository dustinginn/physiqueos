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
            }

            Spacer(minLength: 8)
            trailing
        }
        .padding(.vertical, 8)

        Group {
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

    @ViewBuilder
    private var trailing: some View {
        switch goal.presentation {
        case .primary(let progress):
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
        }
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
