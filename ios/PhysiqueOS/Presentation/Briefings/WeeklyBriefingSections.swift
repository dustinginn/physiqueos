import Charts
import SwiftUI

/// Weekly Briefing's complete verified section order: Hero (headline/body/
/// Confidence anchor/strategy strip) → Energy → Weight → Photos → Training
/// → Body Composition (DEXA, when present) → Coach's Take. No standalone
/// Goal/Phase card and no forecast section — verified neither exists on the
/// real screen.
struct WeeklyBriefingSections: View {
    let content: WeeklyBriefingContent
    let confidence: BriefingConfidenceReadModel?
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            hero
            if let confidence { BriefingConfidenceCard(confidence: confidence) }
            if let energy = content.energy { WeeklyEnergyCard(section: energy) }
            if let weight = content.weight { weightCard(weight) }
            if let photos = content.photos { photosCard(photos) }
            if let training = content.training { trainingCard(training) }
            if let bodyComposition = content.bodyComposition { bodyCompositionCard(bodyComposition) }
            coachTakeCard
        }
    }

    private var hero: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                Text(content.reportingRangeLabel.uppercased())
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Text(content.heroHeadline)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.heroBody)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if content.strategyPhaseLabel != nil || content.strategyWeekLabel != nil || content.strategyNextMilestone != nil {
                    Divider().overlay(PhysiqueOSTheme.divider)
                    HStack(spacing: 14) {
                        if let phase = content.strategyPhaseLabel { strategyItem("Strategy", phase) }
                        if let week = content.strategyWeekLabel { strategyItem("Week", week) }
                        if let milestone = content.strategyNextMilestone { strategyItem("Next", milestone) }
                    }
                }
            }
        }
    }

    private func strategyItem(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func weightCard(_ weight: WeeklyWeightSection) -> some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Weight")
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(String(format: "%.1f lb", weight.averageWeightLb))
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(String(format: "%@%.1f lb this week", weight.changeLb >= 0 ? "+" : "", weight.changeLb))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(weight.changeLb <= 0 ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.chartEffort)
                }
                Text(weight.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private func photosCard(_ photos: WeeklyPhotosSection) -> some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Photos")
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
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Training")
                HStack(spacing: 16) {
                    BriefingStatItem(label: "Improving", value: "\(training.improvingCount)")
                    BriefingStatItem(label: "Steady", value: "\(training.steadyCount)")
                    BriefingStatItem(label: "Tracked", value: "\(training.comparableCategoryCount)")
                }
                Text(training.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private func bodyCompositionCard(_ body: WeeklyBodyCompositionSection) -> some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Body Composition") {
                    Text(BriefingDateFormatting.shortDate(body.scanDate))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                HStack(spacing: 16) {
                    BriefingStatItem(label: "Body Fat", value: body.bodyFatPercent)
                    BriefingStatItem(label: "Lean Mass", value: body.leanMassLb)
                    BriefingStatItem(label: "Fat Mass", value: body.fatMassLb)
                }
                Text(body.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private var coachTakeCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Coach's Take")
                labeledParagraph("Biggest Takeaway", content.coachTake.biggestTakeaway)
                labeledParagraph("My Recommendation", content.coachTake.recommendation)
                if !content.coachTake.intoNextWeek.isEmpty {
                    BriefingNarrativeList(title: "Into Next Week", items: content.coachTake.intoNextWeek)
                }
            }
        }
    }

    private func labeledParagraph(_ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(text)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
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
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Energy") {
                    Text("\(section.pairedDayCount)/\(section.eligibleDayCount) days paired")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                HStack(spacing: 16) {
                    BriefingStatItem(label: "Avg Intake", value: "\(section.averageIntakeKcal) kcal")
                    BriefingStatItem(label: "Avg Expenditure", value: "\(section.averageExpenditureKcal) kcal")
                    BriefingStatItem(label: "Avg Balance", value: "\(section.averageBalanceKcal >= 0 ? "+" : "")\(section.averageBalanceKcal) kcal")
                }
                if let dailyBalances = section.dailyBalances, !dailyBalances.isEmpty {
                    chart(dailyBalances)
                    EnergySeriesLegend()
                }
                Text(section.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private func chart(_ points: [BriefingDailyEnergyPoint]) -> some View {
        Chart {
            ForEach(points) { point in
                if let intake = point.intakeKcal {
                    LineMark(x: .value("Day", point.date), y: .value("Intake", intake), series: .value("Series", "Intake"))
                        .foregroundStyle(PhysiqueOSTheme.energyIntake)
                        .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                }
                if let expenditure = point.expenditureKcal {
                    LineMark(x: .value("Day", point.date), y: .value("Expenditure", expenditure), series: .value("Series", "Expenditure"))
                        .foregroundStyle(PhysiqueOSTheme.energyExpenditure)
                        .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: [6, 4]))
                }
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 130)
        .chartScrub { location, proxy, geometry in
            let relativeX = geometry.relativeX(in: proxy, at: location)
            let touchedDate: String? = proxy.value(atX: relativeX)
            selectedDate = ChartCategoricalSelection.nearestPoint(matching: touchedDate, in: points, keyPath: \.date)?.date
        }
        .accessibilityLabel("Daily intake and expenditure across \(points.count) days")
    }
}
