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
    static let leadFeatureDomains = ["Training", "New Baseline", "Calories"]
    static let trainingPresentationStyle = "gold-featured-lift"
    let content: MonthlyBriefingContent
    let confidence: BriefingConfidenceReadModel?
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 34) {
            hero
            if let goalMilestone = content.goalMilestone { goalMilestoneCard(goalMilestone) }
            if let trainingProgress = content.trainingProgress { trainingProgressCard(trainingProgress) }
            if let energyEvolution = content.energyEvolution { energyEvolutionCard(energyEvolution) }
            if let newBaseline = content.newBaseline { newBaselineCard(newBaseline) }
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
            features: monthlyLeadFeatures,
            footerItems: [("Goal & phase", content.heroGoalLabel)]
        )
    }

    private var monthlyLeadFeatures: [BriefingLeadFeature] {
        if let highlights = content.heroHighlights, !highlights.isEmpty {
            return highlights.map { item in
                BriefingLeadFeature(
                    icon: item.icon,
                    label: item.label,
                    value: item.value,
                    detail: item.detail,
                    tone: tone(item.tone)
                )
            }
        }
        return [
            content.trainingProgress.map { training in BriefingLeadFeature(
                icon: "dumbbell.fill",
                label: "Training",
                value: "Early momentum",
                detail: training.headline ?? training.narrative,
                tone: .effort
            ) },
            content.newBaseline.map { baseline in BriefingLeadFeature(
                icon: "scope",
                label: "New Baseline",
                value: baseline.bodyFatPercent + " body fat",
                detail: "Future scans can be compared with the \(baseline.referenceDateLabel) baseline.",
                tone: .primary
            ) },
            content.energyEvolution.map { energy in BriefingLeadFeature(
                icon: "bolt.fill",
                label: "Calories",
                value: signedCalories(energy.averageBalanceKcal) + " average balance",
                detail: energy.phaseLabel ?? "The month established a repeatable energy pattern.",
                tone: .evidence
            ) }
        ].compactMap { $0 }
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

    private func trainingProgressCard(_ trainingProgress: MonthlyTrainingProgressSection) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort) {
            VStack(alignment: .leading, spacing: 22) {
                editorialLabel("Training Progress", icon: "dumbbell.fill", color: PhysiqueOSTheme.chartEffort)
                Text(trainingProgress.headline ?? trainingProgress.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(trainingProgress.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if !trainingProgress.stats.isEmpty {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(trainingProgress.stats) { stat in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(stat.label.uppercased())
                                    .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                                    .foregroundStyle(PhysiqueOSTheme.chartEffort)
                                Text(stat.value)
                                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                if let detail = stat.detail {
                                    Text(detail)
                                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                                }
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading)
                            .background(PhysiqueOSTheme.surfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                    }
                }
                if let highlights = trainingProgress.highlights, !highlights.isEmpty {
                    monthlyFeaturedLift(highlights[0])
                    if highlights.count > 1 {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                            ForEach(Array(highlights.dropFirst())) { highlight in
                                monthlySupportingLift(highlight)
                            }
                        }
                    }
                }
                if let why = trainingProgress.whyItMatters {
                    callout(title: "Why It Matters", text: why, color: PhysiqueOSTheme.chartEffort)
                }
            }
        }
    }

    private func energyEvolutionCard(_ energyEvolution: MonthlyEnergyEvolutionSection) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.monthlyEnergy, background: PhysiqueOSTheme.surfaceElevated) {
            VStack(alignment: .leading, spacing: 22) {
                editorialLabel("Energy Evolution", icon: "bolt.fill", color: PhysiqueOSTheme.monthlyEnergy)
                Text(energyEvolution.headline ?? "How did energy change across the month?")
                    .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let phase = energyEvolution.phaseLabel {
                    Text(phase)
                        .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    Text(energyEvolution.phaseDateLabel ?? "")
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if let narrative = energyEvolution.narrative {
                    Text(narrative)
                        .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    monthlyMetric("Avg Intake", "\(energyEvolution.averageIntakeKcal) kcal", color: PhysiqueOSTheme.energyIntake)
                    monthlyMetric("Avg Expenditure", "\(energyEvolution.averageExpenditureKcal) kcal", color: PhysiqueOSTheme.energyExpenditure)
                    monthlyMetric("Avg Balance", signedCalories(energyEvolution.averageBalanceKcal), color: PhysiqueOSTheme.chartSuccess)
                    monthlyMetric("Balance Magnitude", "\(abs(energyEvolution.averageBalanceKcal)) kcal/day", color: PhysiqueOSTheme.accent)
                }
                if let insight = energyEvolution.insight {
                    callout(title: "What It Shows", text: insight, color: PhysiqueOSTheme.monthlyEnergy)
                }
                monthlyEnergyLegend
                staticWeeklyBarChart(energyEvolution)
            }
        }
    }

    /// Static bars — no `.chartScrub` modifier, matching the real screen's
    /// non-interactive rendering (pure CSS bar heights, no hover/tap).
    private func staticWeeklyBarChart(_ energyEvolution: MonthlyEnergyEvolutionSection) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(energyEvolution.weeks) { week in
                VStack(spacing: 10) {
                    Chart {
                        BarMark(x: .value("Series", "Intake"), y: .value("Value", week.averageIntakeKcal))
                            .foregroundStyle(PhysiqueOSTheme.energyIntake)
                        BarMark(x: .value("Series", "Expenditure"), y: .value("Value", week.averageExpenditureKcal))
                            .foregroundStyle(PhysiqueOSTheme.energyExpenditure)
                    }
                    .chartXAxis(.hidden)
                    .chartYAxis(.hidden)
                    .frame(height: 112)
                    Text(week.weekLabel)
                        .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(week.averageBalanceKcal.map(signedCalories) ?? signedCalories(week.averageIntakeKcal - week.averageExpenditureKcal))
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                        .foregroundStyle(PhysiqueOSTheme.monthlyEnergy)
                    if let coverage = week.coverageLabel {
                        Text(coverage)
                            .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                }
                .padding(12)
                .background(PhysiqueOSTheme.surfaceAccent.opacity(0.48))
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(PhysiqueOSTheme.monthlyEnergy.opacity(0.20)))
            }
        }
        .accessibilityLabel("Weekly average intake and expenditure across \(energyEvolution.weeks.count) weeks")
    }

    private func newBaselineCard(_ newBaseline: MonthlyNewBaselineSection) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    editorialLabel("New Baseline", icon: "scope", color: PhysiqueOSTheme.chartEvidence)
                    Spacer()
                    Text(newBaseline.referenceDateLabel)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                Text(newBaseline.headline ?? "The next phase gained a clear baseline.")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    monthlyMetric("Body Fat", newBaseline.bodyFatPercent, color: PhysiqueOSTheme.chartEvidence)
                    monthlyMetric("Lean Mass", newBaseline.leanMassLb, color: PhysiqueOSTheme.chartEvidence)
                    monthlyMetric("Fat Mass", newBaseline.fatMassLb, color: PhysiqueOSTheme.chartEvidence)
                    monthlyMetric("Reference Date", newBaseline.referenceDateLabel, color: PhysiqueOSTheme.chartEvidence)
                }
                Text(newBaseline.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if let interpretation = newBaseline.interpretation {
                    callout(title: "Baseline Read", text: interpretation, color: PhysiqueOSTheme.chartEvidence)
                }
            }
        }
        .accessibilityIdentifier("briefing.monthly.newBaseline")
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
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 18) {
                editorialLabel("What Changed", icon: "sparkles", color: PhysiqueOSTheme.accent)
                Text("\(content.monthLabel.split(separator: " ").first ?? "This month") changed how progress should be judged.")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                VStack(spacing: 3) {
                    ForEach(changeSections) { item in
                        monthlyChangePanel(item)
                    }
                }
                .padding(.horizontal, -22)
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

    private func monthlyFeaturedLift(_ highlight: BriefingTrainingHighlight) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 11) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(PhysiqueOSTheme.chartEffort)
                    .frame(width: 40, height: 40)
                    .background(PhysiqueOSTheme.chartEffort.opacity(0.16))
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text("FEATURED LIFT")
                        .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                        .foregroundStyle(PhysiqueOSTheme.chartEffort)
                    Text(highlight.exerciseName)
                        .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(highlight.recordType)
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
            Text(highlight.performanceValue ?? highlight.headline)
                .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("▲  \(highlight.delta)")
                .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                .foregroundStyle(PhysiqueOSTheme.chartEffort)
            Text(highlight.detail)
                .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.chartEffort.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(PhysiqueOSTheme.chartEffort.opacity(0.48)))
    }

    private func monthlySupportingLift(_ highlight: BriefingTrainingHighlight) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "trophy")
                .foregroundStyle(PhysiqueOSTheme.chartEffort)
            Text(highlight.exerciseName)
                .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(highlight.recordType)
                .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                .foregroundStyle(PhysiqueOSTheme.chartEffort)
            Text(highlight.performanceValue ?? highlight.headline)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(highlight.delta)
                .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                .foregroundStyle(PhysiqueOSTheme.chartEffort)
            Text(highlight.detail)
                .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 210, alignment: .topLeading)
        .background(PhysiqueOSTheme.surfaceMuted.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(PhysiqueOSTheme.chartEffort.opacity(0.34)))
    }

    private var monthlyEnergyLegend: some View {
        HStack(spacing: 16) {
            monthlyLegendItem("Intake", color: PhysiqueOSTheme.energyIntake)
            monthlyLegendItem("Estimated expenditure", color: PhysiqueOSTheme.energyExpenditure)
            monthlyLegendItem("Balance", color: PhysiqueOSTheme.monthlyEnergy)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func monthlyLegendItem(_ label: String, color: Color) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 11, height: 11)
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
    }

    private func tone(_ raw: String) -> HomeColorToken {
        switch raw {
        case "finish", "success": .success
        case "transformation", "training": .effort
        case "confirmation", "evidence": .evidence
        default: .primary
        }
    }

    private func monthlyChangePanel(_ item: MonthlyChangeSection) -> some View {
        let tint = color(for: item.tone)
        return HStack(alignment: .top, spacing: 14) {
            Rectangle().fill(tint).frame(width: 4)
            Image(systemName: changeIcon(for: item.domain))
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(tint.opacity(0.13))
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 8) {
                Text(item.title)
                    .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                    .foregroundStyle(tint)
                Text(item.headline)
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(item.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            .padding(.vertical, 18)
            .padding(.trailing, 18)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.07))
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 0, bottomTrailingRadius: 16, topTrailingRadius: 16))
    }

    private func changeIcon(for domain: String) -> String {
        switch domain {
        case "training": "dumbbell.fill"
        case "calories": "bolt.fill"
        case "weight": "scalemass.fill"
        case "photos": "camera.fill"
        case "dexa": "scope"
        default: "sparkles"
        }
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
