import Charts
import SwiftUI

/// Monthly Briefing's complete verified section order: Hero → Goal
/// Milestone (conditional, only when a goal-completion story was actually
/// selected for this month) → Training Progress → Energy Evolution (a
/// static, non-interactive weekly-aggregate bar chart — verified real
/// behavior, deliberately NOT given the `chartScrub` interaction Weekly's
/// per-day chart gets) → New Baseline → What Changed → Defining Moments →
/// Month Ahead. No standalone "Strategy"/"Phase Transition" section —
/// verified that's computed server-side but never rendered on the live
/// screen.
struct MonthlyBriefingSections: View {
    let content: MonthlyBriefingContent
    let confidence: BriefingConfidenceReadModel?
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            hero
            if let confidence { BriefingConfidenceCard(confidence: confidence) }
            if let goalMilestone = content.goalMilestone { goalMilestoneCard(goalMilestone) }
            trainingProgressCard
            energyEvolutionCard
            newBaselineCard
            if !content.whatChanged.isEmpty {
                CardContainer(padding: .md) { BriefingNarrativeList(title: "What Changed", items: content.whatChanged, numbered: false) }
            }
            if !content.definingMoments.isEmpty { definingMomentsCard }
            if !content.monthAhead.isEmpty {
                CardContainer(padding: .md) { BriefingNarrativeList(title: "Month Ahead", items: content.monthAhead) }
            }
        }
    }

    private var hero: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                Text(content.monthLabel.uppercased())
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Text(content.heroHeadline)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.heroBody)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text(content.heroGoalLabel)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.accent)
            }
        }
    }

    private func goalMilestoneCard(_ milestone: MonthlyGoalMilestoneSection) -> some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Goal Milestone")
                Text(milestone.title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(milestone.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if let destination = milestone.destination {
                    Button {
                        onNavigate(destination)
                    } label: {
                        HStack(spacing: 4) {
                            Text("View Goal Completion")
                            Image(systemName: "arrow.right")
                        }
                        .physiqueOSFont(PhysiqueOSTypography.briefingViewLink)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                }
            }
        }
    }

    private var trainingProgressCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Training Progress")
                if !content.trainingProgress.stats.isEmpty {
                    HStack(spacing: 16) {
                        ForEach(content.trainingProgress.stats) { stat in
                            BriefingStatItem(label: stat.label, value: stat.value)
                        }
                    }
                }
                Text(content.trainingProgress.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private var energyEvolutionCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Energy Evolution")
                HStack(spacing: 16) {
                    BriefingStatItem(label: "Avg Intake", value: "\(content.energyEvolution.averageIntakeKcal) kcal")
                    BriefingStatItem(label: "Avg Expenditure", value: "\(content.energyEvolution.averageExpenditureKcal) kcal")
                    BriefingStatItem(label: "Avg Balance", value: "\(content.energyEvolution.averageBalanceKcal >= 0 ? "+" : "")\(content.energyEvolution.averageBalanceKcal) kcal")
                }
                staticWeeklyBarChart
                EnergySeriesLegend()
            }
        }
    }

    /// Static bars — no `.chartScrub` modifier, matching the real screen's
    /// non-interactive rendering (pure CSS bar heights, no hover/tap).
    private var staticWeeklyBarChart: some View {
        Chart {
            ForEach(content.energyEvolution.weeks) { week in
                BarMark(x: .value("Week", week.weekLabel), y: .value("Value", week.averageIntakeKcal))
                    .foregroundStyle(PhysiqueOSTheme.energyIntake)
                    .position(by: .value("Series", "Intake"))
                BarMark(x: .value("Week", week.weekLabel), y: .value("Value", week.averageExpenditureKcal))
                    .foregroundStyle(PhysiqueOSTheme.energyExpenditure)
                    .position(by: .value("Series", "Expenditure"))
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 140)
        .accessibilityLabel("Weekly average intake and expenditure across \(content.energyEvolution.weeks.count) weeks")
    }

    private var newBaselineCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("New Baseline") {
                    Text(content.newBaseline.referenceDateLabel)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                HStack(spacing: 16) {
                    BriefingStatItem(label: "Body Fat", value: content.newBaseline.bodyFatPercent)
                    BriefingStatItem(label: "Lean Mass", value: content.newBaseline.leanMassLb)
                    BriefingStatItem(label: "Fat Mass", value: content.newBaseline.fatMassLb)
                }
                Text(content.newBaseline.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private var definingMomentsCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Defining Moments")
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(content.definingMoments) { moment in
                        HStack(alignment: .top) {
                            Text(moment.label)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                                .frame(width: 64, alignment: .leading)
                            Text(moment.value)
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                }
            }
        }
    }
}
