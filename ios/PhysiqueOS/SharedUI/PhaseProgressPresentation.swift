import SwiftUI

/// The single, shared phase-progress visual treatment: an `AnimatedProgressBar`
/// followed by one trailing semantic label -- never a separate raw
/// percentage number alongside it, since the bar's own fill already shows
/// where things stand and a second number is redundant quantitative
/// information.
///
/// Home's `PhaseTrajectoryPhaseCard` (`GoalRowView.swift`) is the original,
/// Founder-accepted treatment. The Goal detail page's Your Journey section
/// (`GoalPhaseCard` in `GoalDetailView.swift`) used to pair its label with
/// its own separate `"\(percentage)%"` text; it now reuses this exact
/// component instead of a divergent duplicate, so the two surfaces can never
/// drift apart again.
struct PhaseProgressPresentation: View {
    let percentage: Int
    let color: Color
    let label: String?
    let accessibilityLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            AnimatedProgressBar(value: percentage, color: color, accessibilityLabel: accessibilityLabel)
            if let label {
                Text(label)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }
}
