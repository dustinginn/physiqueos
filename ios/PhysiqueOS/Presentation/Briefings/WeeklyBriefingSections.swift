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
        BriefingTrainingResponseCard(training: training)
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

/// The recurring Briefing Training composition shared only by Weekly and
/// Midweek. Exercise cards stay neutral and use color as a thin signal,
/// matching the live web's trophy / exercise / record / output hierarchy.
struct BriefingTrainingResponseCard: View {
    static let presentationStyle = "neutral-outlined-highlights"
    let training: WeeklyTrainingSection

    var body: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 10) {
                    IconBadge(systemImage: "dumbbell.fill", color: .success, size: .sm)
                    Text("TRAINING RESPONSE")
                        .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                        .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        .accessibilityIdentifier("briefing.trainingResponse")
                }
                Text(training.headline ?? "Training kept moving forward.")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(training.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text(coverage)
                    .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)

                if let highlights = training.highlights, !highlights.isEmpty {
                    HStack(spacing: 7) {
                        Text("🔥 HIGHLIGHTS")
                            .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                            .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        Rectangle().fill(PhysiqueOSTheme.chartSuccess.opacity(0.45)).frame(height: 1)
                    }
                    VStack(spacing: 12) {
                        ForEach(highlights) { highlight in highlightCard(highlight) }
                    }
                }

                if let groups = training.priorityGroups, !groups.isEmpty {
                    Divider().overlay(PhysiqueOSTheme.divider)
                    Text("🎯 PRIORITY MUSCLE GROUPS")
                        .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                    VStack(spacing: 0) {
                        ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
                            if index > 0 { Divider().overlay(PhysiqueOSTheme.divider) }
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Circle().fill(toneColor(group.tone)).frame(width: 7, height: 7)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(group.label)
                                        .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    Text(groupSummary(group))
                                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                                }
                                Spacer(minLength: 8)
                            }
                            .padding(.vertical, 12)
                        }
                    }
                }
                if let watch = training.watch, !watch.message.isEmpty {
                    Divider().overlay(PhysiqueOSTheme.divider)
                    VStack(alignment: .leading, spacing: 5) {
                        Text([watch.exercise, watch.status].compactMap { $0 }.joined(separator: " · ").uppercased())
                            .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                        Text(watch.message)
                            .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }
        }
    }

    private var coverage: String {
        var parts: [String] = []
        if let trainingDayCount = training.trainingDayCount { parts.append("\(trainingDayCount) training days") }
        parts.append("\(training.comparableCategoryCount) reviewed categories")
        parts.append("\(training.improvingCount) improving")
        if training.steadyCount > 0 { parts.append("\(training.steadyCount) steady") }
        if let plateauing = training.plateauingCount { parts.append("\(plateauing) plateauing") }
        if let regressing = training.regressingCount, regressing > 0 { parts.append("\(regressing) regressing") }
        if let insufficient = training.insufficientCount { parts.append("\(insufficient) building evidence") }
        return parts.joined(separator: " · ")
    }

    private func highlightCard(_ highlight: BriefingTrainingHighlight) -> some View {
        let color = toneColor(highlight.tone)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(color)
                    .frame(width: 34, height: 34)
                    .background(color.opacity(0.13))
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(highlight.exerciseName)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(highlight.recordType)
                        .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                        .foregroundStyle(color)
                        .textCase(.uppercase)
                }
            }
            Text(highlight.performanceValue ?? highlight.headline)
                .physiqueOSFont(PhysiqueOSTypography.editorialMetric)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(highlightMovement(highlight))
                .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                .foregroundStyle(color)
            if !highlight.detail.isEmpty {
                Text(highlight.detail)
                    .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted.opacity(0.62))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(PhysiqueOSTheme.textSecondary.opacity(0.85), lineWidth: 1))
    }

    private func highlightMovement(_ highlight: BriefingTrainingHighlight) -> String {
        guard let absolute = highlight.absoluteDelta else { return "▲ \(highlight.delta)" }
        let sign = absolute > 0 ? "+" : absolute < 0 ? "−" : ""
        let absoluteText = absolute.rounded() == absolute ? String(Int(abs(absolute))) : String(format: "%.1f", abs(absolute))
        let unit = highlight.unit.map { " \($0)" } ?? ""
        let percent = highlight.percentChange.map { value in
            let percentSign = value > 0 ? "+" : value < 0 ? "−" : ""
            return " (\(percentSign)\(String(format: "%.1f", abs(value)))%)"
        } ?? ""
        return "▲ \(sign)\(absoluteText)\(unit)\(percent)"
    }

    private func toneColor(_ tone: String) -> Color {
        switch tone.lowercased() {
        case "success", "improving": PhysiqueOSTheme.chartSuccess
        case "evidence", "steady": PhysiqueOSTheme.chartEvidence
        case "warning", "plateauing": PhysiqueOSTheme.chartEffort
        case "danger", "error", "regressing": PhysiqueOSTheme.destructive
        case "neutral", "insufficient", "insufficient_data", "building": PhysiqueOSTheme.textMuted
        default: PhysiqueOSTheme.accent
        }
    }

    private func groupSummary(_ group: BriefingTrainingPriorityGroup) -> String {
        guard let count = group.comparableExerciseCount else { return group.statusLabel }
        return "\(group.statusLabel) across \(count) \(count == 1 ? "exercise" : "exercises")."
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
    var showsDailySemanticRows = false
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
                Text(section.headline ?? "Energy Balance")
                    .physiqueOSFont(PhysiqueOSTypography.editorialSection)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(balanceStatement)
                    .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                    .foregroundStyle(balanceColor)
                Text(section.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if let comparison = section.comparisonNarrative, !comparison.isEmpty {
                    Text(comparison)
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if showsDailySemanticRows,
                   let dailyBalances = section.dailyBalances,
                   !dailyBalances.isEmpty {
                    VStack(spacing: 8) {
                        ForEach(dailyBalances) { point in
                            dailySemanticRow(point)
                        }
                    }
                }
                Divider().overlay(PhysiqueOSTheme.divider)
                HStack(alignment: .top, spacing: 8) {
                    energyMetric("Avg Intake", "\(section.averageIntakeKcal) kcal", color: PhysiqueOSTheme.energyIntake)
                    energyMetric("Avg Expenditure", "\(section.averageExpenditureKcal) kcal", color: PhysiqueOSTheme.energyExpenditure)
                    energyMetric("Avg Balance", "\(section.averageBalanceKcal >= 0 ? "+" : "")\(section.averageBalanceKcal) kcal", color: PhysiqueOSTheme.chartSuccess)
                }
                Divider().overlay(PhysiqueOSTheme.divider)
                if let dailyBalances = section.dailyBalances, !dailyBalances.isEmpty {
                    Text(section.chartTitle ?? "Daily intake vs estimated expenditure")
                        .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    chart(dailyBalances)
                    EnergySeriesLegend()
                }
            }
        }
    }

    private var balanceStatement: String {
        if let authored = section.balanceHeadline, !authored.isEmpty { return authored }
        let balance = section.averageBalanceKcal
        if abs(balance) < 25 { return "About even day to day" }
        return "\(abs(balance).formatted()) kcal/day \(balance < 0 ? "below" : "above")"
    }

    private var balanceColor: Color {
        PhysiqueOSTheme.chartSuccess
    }

    private func dailySemanticRow(_ point: BriefingDailyEnergyPoint) -> some View {
        HStack(spacing: 12) {
            Text(fullWeekday(point.date, fallback: point.label))
                .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Spacer()
            if point.hasPairedData, let balance = point.balanceKcal {
                Text("\(balance >= 0 ? "+" : "−")\(abs(balance)) kcal")
                    .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                    .foregroundStyle(balance == 0 ? PhysiqueOSTheme.textSecondary : PhysiqueOSTheme.chartSuccess)
            } else {
                Text("No data")
                    .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func fullWeekday(_ value: String, fallback: String?) -> String {
        let input = DateFormatter()
        input.locale = Locale(identifier: "en_US_POSIX")
        input.calendar = Calendar(identifier: .gregorian)
        input.timeZone = TimeZone(secondsFromGMT: 0)
        input.dateFormat = "yyyy-MM-dd"
        guard let date = input.date(from: value) else { return fallback ?? value }
        let output = DateFormatter()
        output.locale = Locale(identifier: "en_US_POSIX")
        output.calendar = Calendar(identifier: .gregorian)
        output.timeZone = TimeZone(secondsFromGMT: 0)
        output.dateFormat = "EEEE"
        return output.string(from: date)
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
        .chartXAxis {
            AxisMarks(values: points.map(\.date)) { value in
                AxisValueLabel {
                    if let date = value.as(String.self),
                       let point = points.first(where: { $0.date == date }) {
                        Text(point.label ?? String(date.suffix(2)))
                            .physiqueOSFont(.init(size: 10, weight: .semibold))
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                }
            }
        }
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
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
