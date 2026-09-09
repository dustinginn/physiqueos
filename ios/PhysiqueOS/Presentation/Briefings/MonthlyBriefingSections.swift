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
    static let sectionInventory = ["Integrated Lead", "Goal Milestone", "Training Progress", "Energy Evolution", "New Baseline", "What Changed", "Defining Moments", "Month Ahead"]
    let content: MonthlyBriefingContent
    let confidence: BriefingConfidenceReadModel?
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 34) {
            hero
            if let goalMilestone = content.goalMilestone { goalMilestoneCard(goalMilestone) }
            trainingProgressCard
            energyEvolutionCard
            newBaselineCard
            if !(content.whatChangedSections ?? []).isEmpty || !content.whatChanged.isEmpty { whatChangedCard }
            if !(content.definingMomentDetails ?? []).isEmpty || !content.definingMoments.isEmpty { definingMomentsCard }
            if !(content.monthAheadActions ?? []).isEmpty || !content.monthAhead.isEmpty { monthAheadCard }
        }
    }

    private var hero: some View {
        BriefingLeadCard(
            eyebrow: "MONTHLY BRIEFING",
            rangeLabel: content.monthLabel,
            headline: content.heroHeadline,
            narrative: content.heroBody,
            confidence: confidence,
            footerItems: [("Goal & phase", content.heroGoalLabel)]
        )
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
                Text(content.trainingProgress.headline ?? content.trainingProgress.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.trainingProgress.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if let highlights = content.trainingProgress.highlights, !highlights.isEmpty {
                    VStack(spacing: 12) {
                        ForEach(highlights) { highlight in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(highlight.exerciseName)
                                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                        Text(highlight.recordType)
                                            .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                                            .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                                    }
                                    Spacer()
                                    Text(highlight.delta)
                                        .physiqueOSFont(PhysiqueOSTypography.editorialMetric)
                                        .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                                }
                                Text(highlight.headline)
                                    .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Text(highlight.detail)
                                    .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                            .padding(16)
                            .background(PhysiqueOSTheme.chartSuccess.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                    }
                }
                if let why = content.trainingProgress.whyItMatters {
                    callout(title: "Why It Matters", text: why, color: PhysiqueOSTheme.chartEffort)
                }
            }
        }
    }

    private var energyEvolutionCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.energyExpenditure) {
            VStack(alignment: .leading, spacing: 18) {
                editorialLabel("Energy Evolution", icon: "bolt.fill", color: PhysiqueOSTheme.energyExpenditure)
                Text(content.energyEvolution.headline ?? "How did energy change across the month?")
                    .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let phase = content.energyEvolution.phaseLabel {
                    Text(phase)
                        .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    Text(content.energyEvolution.phaseDateLabel ?? "")
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if let narrative = content.energyEvolution.narrative {
                    Text(narrative)
                        .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    monthlyMetric("Avg Intake", "\(content.energyEvolution.averageIntakeKcal) kcal", color: PhysiqueOSTheme.energyIntake)
                    monthlyMetric("Avg Expenditure", "\(content.energyEvolution.averageExpenditureKcal) kcal", color: PhysiqueOSTheme.energyExpenditure)
                    monthlyMetric("Avg Balance", signedCalories(content.energyEvolution.averageBalanceKcal), color: PhysiqueOSTheme.chartSuccess)
                    monthlyMetric("Balance Magnitude", "\(abs(content.energyEvolution.averageBalanceKcal)) kcal/day", color: PhysiqueOSTheme.accent)
                }
                EnergySeriesLegend()
                staticWeeklyBarChart
                if let insight = content.energyEvolution.insight {
                    callout(title: "What It Shows", text: insight, color: PhysiqueOSTheme.energyIntake)
                }
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
                        .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(week.averageBalanceKcal.map(signedCalories) ?? signedCalories(week.averageIntakeKcal - week.averageExpenditureKcal))
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                        .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                    if let coverage = week.coverageLabel {
                        Text(coverage)
                            .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
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
                Text(content.newBaseline.headline ?? "The next phase gained a clear baseline.")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    monthlyMetric("Body Fat", content.newBaseline.bodyFatPercent, color: PhysiqueOSTheme.chartEvidence)
                    monthlyMetric("Lean Mass", content.newBaseline.leanMassLb, color: PhysiqueOSTheme.chartEvidence)
                    monthlyMetric("Fat Mass", content.newBaseline.fatMassLb, color: PhysiqueOSTheme.chartEvidence)
                    monthlyMetric("Reference Date", content.newBaseline.referenceDateLabel, color: PhysiqueOSTheme.chartEvidence)
                }
                Text(content.newBaseline.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if let interpretation = content.newBaseline.interpretation {
                    callout(title: "Baseline Read", text: interpretation, color: PhysiqueOSTheme.chartEvidence)
                }
            }
        }
    }

    private var definingMomentsCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 16) {
                editorialLabel("Defining Moments", icon: "calendar", color: PhysiqueOSTheme.accent)
                Text("\((content.definingMomentDetails ?? []).isEmpty ? content.definingMoments.count : content.definingMomentDetails!.count) moments defined \(content.monthLabel.split(separator: " ").first ?? "the month").")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(momentDetails) { moment in
                        HStack(alignment: .top, spacing: 14) {
                            VStack(spacing: 0) {
                                Image(systemName: moment.icon)
                                    .foregroundStyle(.white)
                                    .frame(width: 38, height: 38)
                                    .background(PhysiqueOSTheme.accent)
                                    .clipShape(Circle())
                                Rectangle().fill(PhysiqueOSTheme.accent.opacity(0.45)).frame(width: 2, height: 92)
                            }
                            VStack(alignment: .leading, spacing: 5) {
                                Text(moment.dateLabel)
                                    .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                                    .foregroundStyle(PhysiqueOSTheme.accent)
                                Text(moment.title)
                                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Text(moment.narrative)
                                    .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
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
                ForEach(changeSections) { item in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(item.title.uppercased())
                            .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                            .foregroundStyle(color(for: item.tone))
                        Text(item.headline)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(item.narrative)
                            .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    .padding(16)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(color(for: item.tone).opacity(0.24)))
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
                if let intro = content.monthAheadIntroduction {
                    Text(intro)
                        .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(actionCards) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            Image(systemName: item.icon)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                            Text(item.title)
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(item.narrative)
                                .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
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
                .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                .foregroundStyle(color)
        }
    }

    private func monthlyMetric(_ label: String, _ value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                .foregroundStyle(color)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
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

    private var changeSections: [MonthlyChangeSection] {
        if let sections = content.whatChangedSections, !sections.isEmpty { return sections }
        return content.whatChanged.enumerated().map { index, value in
            MonthlyChangeSection(domain: "legacy-\(index)", title: "Change", headline: value, narrative: "", tone: "primary")
        }
    }

    private var momentDetails: [MonthlyDefiningMoment] {
        if let moments = content.definingMomentDetails, !moments.isEmpty { return moments }
        return content.definingMoments.map { MonthlyDefiningMoment(dateLabel: $0.label, title: $0.value, narrative: "", icon: "sparkles") }
    }

    private var actionCards: [MonthlyActionCard] {
        if let actions = content.monthAheadActions, !actions.isEmpty { return actions }
        return content.monthAhead.enumerated().map { index, value in
            MonthlyActionCard(domain: "legacy-\(index)", title: value, narrative: "", icon: ["dumbbell.fill", "bolt.fill", "scope"][index % 3])
        }
    }

    private func color(for tone: String) -> Color {
        switch tone {
        case "success": PhysiqueOSTheme.chartSuccess
        case "warning": PhysiqueOSTheme.energyIntake
        case "evidence": PhysiqueOSTheme.chartEvidence
        default: PhysiqueOSTheme.accent
        }
    }

    private func callout(title: String, text: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                .foregroundStyle(color)
            Text(text)
                .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(color.opacity(0.22)))
    }
}
