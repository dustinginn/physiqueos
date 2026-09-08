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
    static let sectionInventory = ["Hero", "Goal Confidence", "Goal Milestone", "Training Progress", "Energy Evolution", "New Baseline", "What Changed", "Defining Moments", "Month Ahead"]
    let content: MonthlyBriefingContent
    let confidence: BriefingConfidenceReadModel?
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 34) {
            hero
            if let confidence { BriefingConfidenceCard(confidence: confidence) }
            if let goalMilestone = content.goalMilestone { goalMilestoneCard(goalMilestone) }
            trainingProgressCard
            energyEvolutionCard
            newBaselineCard
            if !content.whatChanged.isEmpty { whatChangedCard }
            if !content.definingMoments.isEmpty { definingMomentsCard }
            if !content.monthAhead.isEmpty { monthAheadCard }
        }
    }

    private var hero: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent, background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 18) {
                Text(content.monthLabel.uppercased())
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Text(content.heroHeadline)
                    .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.heroBody)
                    .physiqueOSFont(PhysiqueOSTypography.editorialBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text(content.heroGoalLabel)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(PhysiqueOSTheme.accent.opacity(0.12))
                    .clipShape(Capsule())
                HStack(spacing: 8) {
                    monthlySpotlight(icon: "dumbbell.fill", label: "Training", value: content.trainingProgress.stats.first?.value ?? "—", color: PhysiqueOSTheme.chartEffort)
                    monthlySpotlight(icon: "scope", label: "Baseline", value: content.newBaseline.bodyFatPercent, color: PhysiqueOSTheme.chartEvidence)
                    monthlySpotlight(icon: "bolt.fill", label: "Balance", value: signedCalories(content.energyEvolution.averageBalanceKcal), color: PhysiqueOSTheme.chartSuccess)
                }
            }
        }
    }

    private func goalMilestoneCard(_ milestone: MonthlyGoalMilestoneSection) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
            VStack(alignment: .leading, spacing: 16) {
                BriefingEditorialHeading(title: "Goal Milestone")
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
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort) {
            VStack(alignment: .leading, spacing: 18) {
                editorialLabel("Training Progress", icon: "dumbbell.fill", color: PhysiqueOSTheme.chartEffort)
                Text(content.trainingProgress.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if !content.trainingProgress.stats.isEmpty {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(content.trainingProgress.stats) { stat in
                            monthlyMetric(stat.label, stat.value, color: PhysiqueOSTheme.chartEffort)
                        }
                    }
                }
            }
        }
    }

    private var energyEvolutionCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.energyExpenditure) {
            VStack(alignment: .leading, spacing: 18) {
                editorialLabel("Energy Evolution", icon: "bolt.fill", color: PhysiqueOSTheme.energyExpenditure)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 18) {
                    monthlyMetric("Avg Intake", "\(content.energyEvolution.averageIntakeKcal) kcal", color: PhysiqueOSTheme.energyIntake)
                    monthlyMetric("Avg Expenditure", "\(content.energyEvolution.averageExpenditureKcal) kcal", color: PhysiqueOSTheme.energyExpenditure)
                    monthlyMetric("Avg Balance", signedCalories(content.energyEvolution.averageBalanceKcal), color: PhysiqueOSTheme.chartSuccess)
                }
                EnergySeriesLegend()
                staticWeeklyBarChart
            }
        }
    }

    /// Static bars — no `.chartScrub` modifier, matching the real screen's
    /// non-interactive rendering (pure CSS bar heights, no hover/tap).
    private var staticWeeklyBarChart: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(content.energyEvolution.weeks) { week in
                VStack(spacing: 8) {
                    Chart {
                        BarMark(x: .value("Series", "Intake"), y: .value("Value", week.averageIntakeKcal))
                            .foregroundStyle(PhysiqueOSTheme.energyIntake)
                        BarMark(x: .value("Series", "Expenditure"), y: .value("Value", week.averageExpenditureKcal))
                            .foregroundStyle(PhysiqueOSTheme.energyExpenditure)
                    }
                    .chartXAxis(.hidden)
                    .chartYAxis(.hidden)
                    .frame(height: 92)
                    Text(week.weekLabel)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                .padding(12)
                .background(PhysiqueOSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            }
        }
        .accessibilityLabel("Weekly average intake and expenditure across \(content.energyEvolution.weeks.count) weeks")
    }

    private var newBaselineCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    editorialLabel("New Baseline", icon: "scope", color: PhysiqueOSTheme.chartEvidence)
                    Spacer()
                    Text(content.newBaseline.referenceDateLabel)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    monthlyMetric("Body Fat", content.newBaseline.bodyFatPercent, color: PhysiqueOSTheme.chartEvidence)
                    monthlyMetric("Lean Mass", content.newBaseline.leanMassLb, color: PhysiqueOSTheme.chartEvidence)
                    monthlyMetric("Fat Mass", content.newBaseline.fatMassLb, color: PhysiqueOSTheme.chartEvidence)
                    monthlyMetric("Reference Date", content.newBaseline.referenceDateLabel, color: PhysiqueOSTheme.chartEvidence)
                }
                Text(content.newBaseline.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private var definingMomentsCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 16) {
                editorialLabel("Defining Moments", icon: "calendar", color: PhysiqueOSTheme.accent)
                Text("\(content.definingMoments.count) moments defined \(content.monthLabel.split(separator: " ").first ?? "the month").")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(content.definingMoments) { moment in
                        HStack(alignment: .top, spacing: 14) {
                            VStack(spacing: 0) {
                                Circle().fill(PhysiqueOSTheme.accent).frame(width: 14, height: 14)
                                Rectangle().fill(PhysiqueOSTheme.accent.opacity(0.45)).frame(width: 2, height: 58)
                            }
                            VStack(alignment: .leading, spacing: 5) {
                                Text(moment.label)
                                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                    .foregroundStyle(PhysiqueOSTheme.accent)
                                Text(moment.value)
                                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                        }
                    }
                }
            }
        }
    }

    private var whatChangedCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
            VStack(alignment: .leading, spacing: 18) {
                editorialLabel("What Changed", icon: "sparkles", color: PhysiqueOSTheme.accent)
                Text("\(content.monthLabel.split(separator: " ").first ?? "This month") changed how progress should be judged.")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                ForEach(Array(content.whatChanged.enumerated()), id: \.offset) { index, item in
                    let colors = [PhysiqueOSTheme.energyIntake, PhysiqueOSTheme.energyExpenditure, PhysiqueOSTheme.chartEffort]
                    HStack(alignment: .top, spacing: 12) {
                        Rectangle().fill(colors[index % colors.count]).frame(width: 4)
                        Text(item)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            .padding(.vertical, 14)
                    }
                    .padding(.horizontal, 14)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }
        }
    }

    private var monthAheadCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort, background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 18) {
                editorialLabel("Month Ahead", icon: "scope", color: PhysiqueOSTheme.accent)
                Text("Turn \(content.monthLabel.split(separator: " ").first ?? "this month")'s signals into repeatable evidence.")
                    .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(Array(content.monthAhead.enumerated()), id: \.offset) { index, item in
                        VStack(alignment: .leading, spacing: 8) {
                            Image(systemName: ["dumbbell.fill", "bolt.fill", "scope"][index % 3])
                                .foregroundStyle(PhysiqueOSTheme.accent)
                            Text(item)
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, minHeight: 144, alignment: .topLeading)
                        .background(PhysiqueOSTheme.surfaceMuted.opacity(0.65))
                        .overlay(RoundedRectangle(cornerRadius: 18).stroke(PhysiqueOSTheme.divider, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                    }
                }
            }
        }
    }

    private func editorialLabel(_ title: String, icon: String, color: Color) -> some View {
        HStack(spacing: 9) {
            Image(systemName: icon).foregroundStyle(color)
            Text(title.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(color)
        }
    }

    private func monthlyMetric(_ label: String, _ value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(color)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .padding(15)
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(color.opacity(0.22), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private func monthlySpotlight(icon: String, label: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Image(systemName: icon).foregroundStyle(color)
            Text(value).physiqueOSFont(PhysiqueOSTypography.cardHeading16).foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(label.uppercased()).physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(PhysiqueOSTheme.textMuted)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func signedCalories(_ value: Int) -> String {
        "\(value >= 0 ? "+" : "")\(value) kcal"
    }
}
