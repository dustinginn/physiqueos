import SwiftUI

/// Weekly Briefing in the Founder-locked recurring family (B Immersive Story
/// hero + C Dense Analytical body, final section alignment, accepted rich
/// Mineral Light fields): Hero → Energy → Weight → Body Composition →
/// Training → Coach's Take. Presentation only — every value is the
/// published artifact's canonical content.
///
/// Locked omissions: the recurring Photos card and the "Still Unresolved"
/// section are not Weekly sections in the locked family (Photo Briefing
/// stays a separate event path; Still Unresolved was a client presentation
/// discrepancy). Recovery enters only through its own future contract
/// after the 14-night rule; the current Native contract carries none.
struct WeeklyBriefingSections: View {
    static let sectionInventory = ["Integrated Lead", "Energy", "Weight", "Body Composition", "Training", "Coach's Take"]
    static let heroTypeLabel = "WEEKLY BRIEFING"
    let content: WeeklyBriefingContent
    let confidence: BriefingConfidenceReadModel?
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            hero
            if let energy = content.energy { BriefingEnergySection(section: energy) }
            if let weight = content.weight {
                BriefingWeightSection(
                    value: String(format: "%.1f lb", weight.averageWeightLb),
                    delta: "\(BriefingNumberFormatting.signed(weight.changeLb, decimals: 1)) lb this week",
                    note: weight.narrative
                )
            }
            if let body = content.bodyComposition {
                BriefingBodyCompositionSection(
                    scanDate: body.scanDate,
                    bodyFat: body.bodyFatPercent,
                    leanMass: body.leanMassLb,
                    fatMass: body.fatMassLb,
                    narrative: body.narrative,
                    objective: body.objective
                )
            }
            if let training = content.training { BriefingTrainingResponseCard(training: training) }
            BriefingCoachFinale(
                takeaway: content.coachTake.biggestTakeaway,
                recommendation: content.coachTake.recommendation,
                actionTitle: "Into Next Week",
                actions: content.coachTake.intoNextWeek
            )
        }
        .accessibilityIdentifier("briefing.weekly")
    }

    private var hero: some View {
        BriefingHeroField(minHeight: 640) {
            BriefingHeroTopline(
                eyebrow: Self.heroTypeLabel,
                range: BriefingDateFormatting.heroRangeLabel("\(content.periodLabel)\n\(content.reportingRangeLabel)")
            )
            if let confidence {
                BriefingHeroConfidence(
                    score: confidence.score,
                    band: confidence.band,
                    movement: BriefingConfidenceCopy.movement(confidence),
                    reason: confidence.primaryReason
                )
            }
            BriefingHeroStatement(headline: content.heroHeadline, meaning: content.heroBody)
            let footer = [
                content.strategyPhaseLabel.map { ("Strategy", $0) },
                content.strategyWeekLabel.map { ("Week", $0) },
                content.strategyNextMilestone.map { ("Next", $0) },
            ].compactMap { $0 }
            if !footer.isEmpty { BriefingHeroFooter(items: footer) }
        }
    }
}

/// Canonical Confidence movement copy. A Server-authored movement label
/// always wins; otherwise the persisted direction and delta are shown
/// verbatim ("Confidence increased +5").
enum BriefingConfidenceCopy {
    static func movement(_ confidence: BriefingConfidenceReadModel) -> String {
        if let label = confidence.presentationMovementLabel, !label.isEmpty { return label }
        switch confidence.movementDirection {
        case .increased: return "Confidence increased\(confidence.delta.map { " +\(abs($0))" } ?? "")"
        case .decreased: return "Confidence decreased\(confidence.delta.map { " −\(abs($0))" } ?? "")"
        case .held: return "Confidence held"
        case .initial: return "Initial assessment"
        }
    }
}

enum BriefingNumberFormatting {
    /// `+0.6` / `−0.6` (true minus sign) / `0.0`.
    static func signed(_ value: Double, decimals: Int) -> String {
        let magnitude = String(format: "%.\(decimals)f", abs(value))
        if value > 0 { return "+\(magnitude)" }
        if value < 0 { return "−\(magnitude)" }
        return magnitude
    }

    static func signedKcal(_ value: Int) -> String {
        value > 0 ? "+\(value) kcal" : value < 0 ? "−\(abs(value)) kcal" : "0 kcal"
    }
}

/// `weekly-weight` / `midweek-weight`.
struct BriefingWeightSection: View {
    let value: String
    let delta: String
    let note: String

    var body: some View {
        BriefingSection(identifier: "briefing.section.weight") {
            BriefingSectionHead(glyph: "↕", label: "Weight Context", tone: .blue)
            BriefingWeightGrid(value: value, delta: delta, note: note)
        }
    }
}

/// The locked Energy Balance section for Weekly and Midweek. Canonical V3
/// artifacts show the Server's plan-relative statement and its findings;
/// older artifacts show their authored headline / balance / narrative.
/// Daily rows appear where the cadence publishes them (Midweek); the chart
/// renders only when the Server included it.
struct BriefingEnergySection: View {
    @Environment(\.colorScheme) private var colorScheme
    let section: WeeklyEnergySection
    var showsDailySemanticRows = false
    var showsChart = true

    var body: some View {
        BriefingSection(field: .energy, identifier: "briefing.section.energy") {
            BriefingSectionHead(glyph: "ϟ", label: "Energy Balance", tone: .amber) {
                Text("\(section.pairedDayCount)/\(section.eligibleDayCount) days paired")
                    .briefingText(.j(12, 400))
                    .foregroundStyle(BriefingPaletteReader.muted)
            }
            if let strategy = section.canonicalV3 {
                canonicalContent(strategy)
            } else {
                BriefingSectionTitle(text: nonEmpty(section.headline) ?? "Energy Balance")
                BriefingStatement(text: balanceStatement)
                if !section.narrative.isEmpty { BriefingBodyCopy(text: section.narrative) }
            }
            if let comparison = nonEmpty(section.comparisonNarrative) {
                BriefingSupportingLine(text: comparison)
            }
            if showsDailySemanticRows, let daily = section.dailyBalances, !daily.isEmpty {
                BriefingRuledRows(rows: daily.map { point in
                    (Self.fullWeekday(point.date, fallback: point.label),
                     point.hasPairedData ? point.balanceKcal.map(BriefingNumberFormatting.signedKcal) ?? "No data" : "No data")
                })
                .padding(.top, 12)
            }
            BriefingMetricsRow(items: [
                ("Avg intake", "\(section.averageIntakeKcal) kcal"),
                ("Avg expenditure", "\(section.averageExpenditureKcal) kcal"),
                ("Avg balance", BriefingNumberFormatting.signedKcal(section.averageBalanceKcal)),
            ])
            if showsChart, let daily = section.dailyBalances, !daily.isEmpty {
                BriefingEnergyBars(
                    bars: daily.map { point in
                        BriefingEnergyBar(date: point.date, label: point.label ?? String(point.date.suffix(2)), intake: point.intakeKcal, expenditure: point.expenditureKcal)
                    },
                    title: section.chartTitle ?? "Daily intake vs estimated expenditure",
                    compact: daily.count <= 3,
                    richPlate: colorScheme == .light
                )
            }
        }
    }

    /// Authored balance headline, or the canonical average stated plainly.
    var balanceStatement: String {
        if let authored = nonEmpty(section.balanceHeadline) { return authored }
        let balance = section.averageBalanceKcal
        if abs(balance) < 25 { return "About even day to day" }
        return balance > 0 ? "+\(balance.formatted()) kcal/day above" : "\(abs(balance).formatted()) kcal/day below"
    }

    @ViewBuilder
    private func canonicalContent(_ strategy: BriefingEnergyStrategyReadModel) -> some View {
        if let statement = strategy.statement ?? nonEmpty(section.narrative) {
            BriefingSectionTitle(text: "Energy Balance")
            BriefingBodyCopy(text: statement)
                .accessibilityIdentifier("briefing.energy.statement")
        } else {
            BriefingSectionTitle(text: nonEmpty(section.headline) ?? "Energy Balance")
        }
        if !strategy.findings.isEmpty {
            BriefingRuledRows(rows: strategy.findings.map { finding in
                (WeeklyEnergyCard.findingDimensionLabel(finding.dimension),
                 "\(Self.kcal(finding.observedValue)) vs \(Self.kcal(finding.targetValue)) target · \(WeeklyEnergyCard.findingStateLabel(finding.state))")
            })
            .padding(.top, 12)
        }
    }

    private static func kcal(_ value: Double) -> String {
        "\(Int(value.rounded()).formatted(.number.grouping(.automatic))) kcal"
    }

    private func nonEmpty(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }

    static func fullWeekday(_ value: String, fallback: String?) -> String {
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
}

/// Canonical label helpers retained for the Energy findings rows (and the
/// existing presentation tests).
enum WeeklyEnergyCard {
    static func findingDimensionLabel(_ dimension: String) -> String {
        switch dimension {
        case "intake": "Calorie intake"
        case "activity": "Active calories"
        default: dimension.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    /// The Server's `state` enum, unchanged in meaning: `on_plan`,
    /// `below_plan`, `above_plan`.
    static func findingStateLabel(_ state: String) -> String {
        state.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

/// `.daily-rows`: 42 px label / value rows between rules.
struct BriefingRuledRows: View {
    @Environment(\.briefingPalette) private var c
    let rows: [(String, String)]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(rows.indices, id: \.self) { index in
                HStack(alignment: .center, spacing: 12) {
                    Text(rows[index].0)
                        .briefingText(.j(13, 700))
                        .foregroundStyle(c.ink)
                    Spacer(minLength: 8)
                    Text(rows[index].1)
                        .briefingText(.j(13, 400))
                        .foregroundStyle(c.ink)
                        .multilineTextAlignment(.trailing)
                }
                .frame(minHeight: 42)
                .overlay(alignment: .bottom) { Rectangle().fill(c.line).frame(height: 1) }
                .accessibilityElement(children: .combine)
            }
        }
        .briefingRule(.top, c.line)
    }
}

/// A muted 12 px supporting line (comparison / methodology notes).
struct BriefingSupportingLine: View {
    @Environment(\.briefingPalette) private var c
    let text: String

    var body: some View {
        BriefingParagraph(text, .j(12, 400), color: c.muted)
            .padding(.top, 10)
    }
}
