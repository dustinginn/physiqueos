import Charts
import SwiftUI

/// Weekly Briefing's complete verified section order: Hero (headline/body/
/// Confidence anchor/strategy strip) → Energy → Weight → Photos → Training
/// → Body Composition (DEXA, when present) → Coach's Take. No standalone
/// Goal/Phase card and no forecast section — verified neither exists on the
/// real screen.
struct WeeklyBriefingSections: View {
    static let sectionInventory = ["Integrated Lead", "Energy", "Weight", "Photos", "Training", "Body Composition", "Coach's Take"]
    let content: WeeklyBriefingContent
    let confidence: BriefingConfidenceReadModel?
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            hero
            if let energy = content.energy { WeeklyEnergyCard(section: energy) }
            if let weight = content.weight { weightCard(weight) }
            if let photos = content.photos { photosCard(photos) }
            if let training = content.training { trainingCard(training) }
            if let bodyComposition = content.bodyComposition { bodyCompositionCard(bodyComposition) }
            coachTakeCard
        }
    }

    private var hero: some View {
        BriefingLeadCard(
            eyebrow: "WEEKLY BRIEFING",
            rangeLabel: "\(content.periodLabel)\n\(content.reportingRangeLabel)",
            headline: content.heroHeadline,
            narrative: content.heroBody,
            confidence: confidence,
            footerItems: [
                content.strategyPhaseLabel.map { ("Strategy", $0) },
                content.strategyWeekLabel.map { ("Week", $0) },
                content.strategyNextMilestone.map { ("Next", $0) }
            ].compactMap { $0 }
        )
    }

    private func weightCard(_ weight: WeeklyWeightSection) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEvidence) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 10) {
                    IconBadge(systemImage: "scalemass.fill", color: .evidence, size: .sm)
                    Text("WEIGHT CONTEXT")
                        .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                        .foregroundStyle(PhysiqueOSTheme.chartEvidence)
                }
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(String(format: "%.1f lb", weight.averageWeightLb))
                        .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(String(format: "%@%.1f lb this week", weight.changeLb >= 0 ? "+" : "", weight.changeLb))
                        .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                        .foregroundStyle(PhysiqueOSTheme.chartEvidence)
                }
                Text(weight.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private func photosCard(_ photos: WeeklyPhotosSection) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
            VStack(alignment: .leading, spacing: 16) {
                BriefingEditorialHeading(title: "Photos")
                Text(photos.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if let destination = photos.photoEventDestination {
                    Button {
                        onNavigate(destination)
                    } label: {
                        HStack(spacing: 4) {
                            Text("View Photo Briefing")
                            Image(systemName: "arrow.right")
                        }
                        .physiqueOSFont(PhysiqueOSTypography.briefingViewLink)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                }
            }
        }
    }

    private func trainingCard(_ training: WeeklyTrainingSection) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 10) {
                    IconBadge(systemImage: "dumbbell.fill", color: .success, size: .sm)
                    Text("TRAINING RESPONSE")
                        .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                        .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                }
                Text(training.headline ?? "Training kept moving forward.")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(training.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text(trainingCoverage(training))
                    .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                if let highlights = training.highlights, !highlights.isEmpty {
                    VStack(spacing: 12) {
                        ForEach(highlights) { highlight in trainingHighlight(highlight) }
                    }
                }
                if let groups = training.priorityGroups, !groups.isEmpty {
                    Divider().overlay(PhysiqueOSTheme.divider)
                    Text("PRIORITY MUSCLE GROUPS")
                        .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    VStack(spacing: 10) {
                        ForEach(groups) { group in
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(group.label)
                                        .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    Text("\(group.comparableExerciseCount) exercises reviewed")
                                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                                }
                                Spacer()
                                Text(group.statusLabel)
                                    .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                                    .foregroundStyle(toneColor(group.tone))
                            }
                            .padding(14)
                            .background(PhysiqueOSTheme.surfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    }
                }
            }
        }
    }

    private func trainingCoverage(_ training: WeeklyTrainingSection) -> String {
        var parts = ["\(training.trainingDayCount ?? 0) training days", "\(training.comparableCategoryCount) areas reviewed", "\(training.improvingCount) improving", "\(training.steadyCount) steady"]
        if let plateauing = training.plateauingCount { parts.append("\(plateauing) plateauing") }
        if let insufficient = training.insufficientCount { parts.append("\(insufficient) building evidence") }
        return parts.joined(separator: " · ")
    }

    private func trainingHighlight(_ highlight: BriefingTrainingHighlight) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(highlight.exerciseName)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(highlight.recordType)
                        .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                        .foregroundStyle(toneColor(highlight.tone))
                }
                Spacer(minLength: 8)
                Text(highlight.delta)
                    .physiqueOSFont(PhysiqueOSTypography.editorialMetric)
                    .foregroundStyle(toneColor(highlight.tone))
            }
            Text(highlight.headline)
                .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(highlight.detail)
                .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .padding(16)
        .background(toneColor(highlight.tone).opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(toneColor(highlight.tone).opacity(0.24)))
    }

    private func toneColor(_ tone: String) -> Color {
        switch tone.lowercased() {
        case "success", "improving": PhysiqueOSTheme.chartSuccess
        case "evidence", "steady": PhysiqueOSTheme.chartEvidence
        case "warning", "plateauing": PhysiqueOSTheme.chartEffort
        default: PhysiqueOSTheme.accent
        }
    }

    private func bodyCompositionCard(_ body: WeeklyBodyCompositionSection) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    BriefingEditorialHeading(title: "Body Composition")
                    Spacer()
                    Text(BriefingDateFormatting.shortDate(body.scanDate))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    weeklyMetric("Body Fat", body.bodyFatPercent, color: PhysiqueOSTheme.accent)
                    weeklyMetric("Lean Mass", body.leanMassLb, color: PhysiqueOSTheme.accent)
                    weeklyMetric("Fat Mass", body.fatMassLb, color: PhysiqueOSTheme.accent)
                }
                Text(body.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private var coachTakeCard: some View {
        BriefingCoachFinale(
            takeaway: content.coachTake.biggestTakeaway,
            recommendation: content.coachTake.recommendation,
            actionTitle: "Into Next Week",
            actions: content.coachTake.intoNextWeek
        )
    }

    private func weeklyMetric(_ label: String, _ value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(color)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.editorialMetric)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 78, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

/// The real screen's one genuinely interactive Briefing chart — a per-day
/// energy balance chart. Reuses the app's standardized `chartScrub`
/// tap-and-drag gesture (`ChartInteraction.swift`) exactly like every other
/// Evidence chart, since `dailyBalances` plots on the same categorical
/// (one-day-per-band) date-key domain those charts already use. Falls back
/// to the plain coverage summary when `dailyBalances` is `nil` (the real
/// screen's own `chart.summaryOnly` fallback).
struct WeeklyEnergyCard: View {
    let section: WeeklyEnergySection
    @State private var selectedDate: String?

    var body: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.energyExpenditure) {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 10) {
                    IconBadge(systemImage: "bolt.fill", color: .warning, size: .sm)
                    Text("ENERGY BALANCE")
                        .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                        .foregroundStyle(PhysiqueOSTheme.energyIntake)
                    Spacer()
                    Text("\(section.pairedDayCount)/\(section.eligibleDayCount) days paired")
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                Text("Calories need more context.")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(balanceStatement)
                    .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                    .foregroundStyle(balanceColor)
                Text(section.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    energyMetric("Avg Intake", "\(section.averageIntakeKcal) kcal", color: PhysiqueOSTheme.energyIntake)
                    energyMetric("Avg Expenditure", "\(section.averageExpenditureKcal) kcal", color: PhysiqueOSTheme.energyExpenditure)
                    energyMetric("Avg Balance", "\(section.averageBalanceKcal >= 0 ? "+" : "")\(section.averageBalanceKcal) kcal", color: PhysiqueOSTheme.chartSuccess)
                }
                if let dailyBalances = section.dailyBalances, !dailyBalances.isEmpty {
                    chart(dailyBalances)
                    EnergySeriesLegend()
                }
            }
        }
    }

    private var balanceStatement: String {
        let balance = section.averageBalanceKcal
        if abs(balance) <= 100 { return "About even day to day" }
        return balance > 0 ? "A controlled daily surplus" : "A consistent daily deficit"
    }

    private var balanceColor: Color {
        abs(section.averageBalanceKcal) <= 100 ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.energyIntake
    }

    private func chart(_ points: [BriefingDailyEnergyPoint]) -> some View {
        Chart {
            ForEach(points) { point in
                if let intake = point.intakeKcal {
                    BarMark(x: .value("Day", point.date), y: .value("Intake", intake))
                        .position(by: .value("Series", "Intake"))
                        .foregroundStyle(PhysiqueOSTheme.energyIntake)
                }
                if let expenditure = point.expenditureKcal {
                    BarMark(x: .value("Day", point.date), y: .value("Expenditure", expenditure))
                        .position(by: .value("Series", "Expenditure"))
                        .foregroundStyle(PhysiqueOSTheme.energyExpenditure)
                }
                if !point.hasPairedData {
                    RuleMark(x: .value("Missing", point.date))
                        .foregroundStyle(PhysiqueOSTheme.textMuted.opacity(0.5))
                        .lineStyle(StrokeStyle(lineWidth: 2, dash: [4, 4]))
                }
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 180)
        .chartScrub { location, proxy, geometry in
            let relativeX = geometry.relativeX(in: proxy, at: location)
            let touchedDate: String? = proxy.value(atX: relativeX)
            selectedDate = ChartCategoricalSelection.nearestPoint(matching: touchedDate, in: points, keyPath: \.date)?.date
        }
        .accessibilityLabel("Daily intake and expenditure across \(points.count) days")
    }

    private func energyMetric(_ label: String, _ value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(color)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 74, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
