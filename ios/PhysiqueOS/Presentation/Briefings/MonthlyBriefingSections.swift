import SwiftUI

/// Monthly — the richest, zine-like cadence — in the Founder-locked family
/// with the two authorized corrections (no Goal/Phase tags under the lead;
/// the Strategic Summary / Coach's Take closes the evidence body right
/// before Month Ahead): Hero → Goal Milestone (conditional) → Training
/// Progress → Energy Evolution (static weekly aggregates) → New Baseline →
/// What Changed → Defining Moments (conditional) → Coach's Take → Month
/// Ahead. Every value is the published artifact's canonical content; the
/// locked elements whose data the Native contract does not carry (the
/// training "weeks with bests" summary, record rails, readable-day and
/// target KPIs, the two-endpoint scale rail, the strategy recommendation
/// tag) are omitted rather than invented. No "Still Unresolved" section.
struct MonthlyBriefingSections: View {
    static let sectionInventory = ["Integrated Lead", "Goal Milestone", "Training Progress", "Energy Evolution", "New Baseline", "What Changed", "Defining Moments", "Coach's Take", "Month Ahead"]
    static let leadFeatureDomains = ["Training", "New Baseline", "Calories"]
    static let trainingPresentationStyle = "record-rows"
    static let heroTypeLabel = "MONTHLY BRIEFING"
    @Environment(\.colorScheme) private var colorScheme
    let content: MonthlyBriefingContent
    let confidence: BriefingConfidenceReadModel?
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            hero
            if let goalMilestone = content.goalMilestone { goalMilestoneSection(goalMilestone) }
            if let trainingProgress = content.trainingProgress { MonthlyTrainingSection(training: trainingProgress) }
            if let energyEvolution = content.energyEvolution { MonthlyEnergySection(energy: energyEvolution) }
            if let newBaseline = content.newBaseline { MonthlyBaselineSection(baseline: newBaseline) }
            if !changeItems.isEmpty {
                MonthlyNumberedSection(glyph: "◎", label: "What Changed", tone: .cyan, title: whatChangedTitle, items: changeItems, identifier: "briefing.monthly.whatChanged")
            }
            if !momentItems.isEmpty {
                MonthlyNumberedSection(glyph: "◷", label: "Defining Moments", tone: .purple, title: definingMomentsTitle, items: momentItems, identifier: "briefing.monthly.definingMoments")
            }
            if let strategic = content.strategicSummaryV3 { MonthlyStrategicSummaryCard(summary: strategic, heroBody: content.heroBody) }
            if !monthAheadItems.isEmpty || content.monthAheadIntroduction != nil { monthAheadSection }
        }
        .accessibilityIdentifier("briefing.monthly")
    }

    // MARK: Hero

    private var hero: some View {
        BriefingHeroField(minHeight: 820, padding: EdgeInsets(top: 30, leading: 24, bottom: 30, trailing: 24), monthly: true) {
            BriefingHeroTopline(
                eyebrow: Self.heroTypeLabel,
                range: [BriefingDateFormatting.heroRangeLabel(content.monthLabel), content.monthPeriodDetail].compactMap { $0 }.joined(separator: "\n"),
                monthly: true
            )
            if let confidence {
                BriefingHeroConfidence(
                    score: confidence.score,
                    band: confidence.band,
                    movement: BriefingConfidenceCopy.movement(confidence),
                    reason: confidence.presentationExplanation ?? confidence.primaryReason,
                    ringDiameter: 190,
                    topMargin: 28,
                    minHeight: 202,
                    copyWidth: 205,
                    overlap: 55,
                    reasonColor: colorScheme == .dark ? BriefingPalette.fixed(0xD5DFE1) : BriefingPalette.fixed(0x425C66)
                )
            }
            BriefingHeroStatement(
                headline: content.heroHeadline,
                meaning: content.heroBody,
                headlineSize: 39,
                headlineLineHeight: 1.04,
                ruleTop: 21,
                meaningTop: 13,
                meaningColor: colorScheme == .dark ? BriefingPalette.fixed(0xD8E3E5) : BriefingPalette.fixed(0x425C66)
            )
            if !leadFeatures.isEmpty { MonthlyHeroHighlights(items: leadFeatures) }
        }
        // The Goal/Phase context stays available to assistive technology
        // (Founder correction removed the visible tags under the lead).
        .accessibilityElement(children: .contain)
        .accessibilityHint(content.heroGoalLabel)
    }

    struct LeadFeature: Identifiable, Equatable {
        var id: String { label }
        let label: String
        let value: String
        let detail: String
    }

    /// The Server's hero highlights. Older (pre-V3) artifacts without them
    /// keep the established three domain features.
    var leadFeatures: [LeadFeature] {
        if let highlights = content.heroHighlights, !highlights.isEmpty {
            return highlights.map { LeadFeature(label: $0.label, value: $0.value, detail: $0.detail) }
        }
        // A canonical V3 Monthly never gets Native-authored lead features: the Server's
        // hero highlights (or none) are the whole lead.
        if content.strategicSummaryV3 != nil { return [] }
        return [
            content.trainingProgress.map { training in LeadFeature(label: "Training", value: "Early momentum", detail: training.headline ?? training.narrative) },
            content.newBaseline.map { baseline in LeadFeature(label: "New Baseline", value: baseline.bodyFatPercent + " body fat", detail: "Future scans can be compared with the \(baseline.referenceDateLabel) baseline.") },
            content.energyEvolution.map { energy in LeadFeature(label: "Calories", value: BriefingNumberFormatting.signedKcal(energy.averageBalanceKcal) + " average balance", detail: energy.phaseLabel ?? "The month established a repeatable energy pattern.") },
        ].compactMap { $0 }
    }

    // MARK: Goal milestone

    private func goalMilestoneSection(_ milestone: MonthlyGoalMilestoneSection) -> some View {
        BriefingSection(verticalPadding: 24, identifier: "briefing.monthly.goalMilestone") {
            BriefingSectionHead(glyph: "★", label: "Goal Milestone", tone: .green)
            BriefingSectionTitle(text: milestone.title, size: 25)
            if !milestone.narrative.isEmpty { MonthlyBodyCopy(text: milestone.narrative) }
            if let destination = milestone.destination {
                Button { onNavigate(destination) } label: {
                    Text("View Goal Completion ›")
                        .briefingText(.j(13, 800))
                        .foregroundStyle(BriefingPalette.standard.green)
                        .frame(minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: What Changed / Defining Moments

    private var whatChangedTitle: String {
        content.whatChangedTitle ?? "\(content.monthLabel.split(separator: " ").first ?? "This month") changed how progress should be judged."
    }

    private var definingMomentsTitle: String {
        if let title = content.definingMomentsTitle { return title }
        let count = momentItems.count
        return "\(count) \(count == 1 ? "moment" : "moments") defined \(content.monthLabel.split(separator: " ").first ?? "the month")."
    }

    var changeItems: [MonthlyNumberedSection.Item] {
        if let sections = content.whatChangedSections, !sections.isEmpty {
            return sections.map { .init(title: [$0.title, $0.headline].filter { !$0.isEmpty }.joined(separator: " · "), body: $0.narrative) }
        }
        return content.whatChanged.map { .init(title: $0, body: "") }
    }

    var momentItems: [MonthlyNumberedSection.Item] {
        if let moments = content.definingMomentDetails, !moments.isEmpty {
            return moments.map { .init(title: "\(Self.momentDate($0.dateLabel)) · \($0.title)", body: $0.narrative) }
        }
        return content.definingMoments.map { .init(title: "\(Self.momentDate($0.label)) · \($0.value)", body: $0.detail ?? "") }
    }

    /// Canonical `YYYY-MM-DD` moment dates read as "September 3".
    static func momentDate(_ value: String) -> String {
        guard value.count == 10, BriefingDateFormatting.shortDate(value) != value else { return value }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: value) else { return value }
        formatter.dateFormat = "MMMM d"
        return formatter.string(from: date)
    }

    // MARK: Month Ahead (`.ahead`)

    struct AheadItem: Identifiable, Equatable {
        let id: Int
        let label: String?
        let title: String
        let body: String
    }

    var monthAheadItems: [AheadItem] {
        if let actions = content.monthAheadActions, !actions.isEmpty {
            return actions.enumerated().map { index, action in
                if let headline = action.headline {
                    return AheadItem(id: index, label: action.title, title: headline, body: action.detail ?? "")
                }
                return AheadItem(id: index, label: nil, title: action.title, body: action.narrative)
            }
        }
        return content.monthAhead.enumerated().map { AheadItem(id: $0.offset, label: nil, title: $0.element, body: "") }
    }

    private var monthAheadSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("MONTH AHEAD")
                .briefingStrutText(.j(11, 800, tracking: 0.1))
                .foregroundStyle(BriefingPalette.fixed(0xC7B8FF))
                .accessibilityAddTraits(.isHeader)
            BriefingParagraph(
                content.monthAheadTitle ?? "Turn \(content.monthLabel.split(separator: " ").first ?? "this month")'s signals into repeatable evidence.",
                .j(28, 700, 1.08, relativeTo: .title2),
                color: .white
            )
            .padding(.top, 15)
            if let intro = content.monthAheadIntroduction, !intro.isEmpty {
                BriefingParagraph(intro, .j(15, 400, 1.5), color: Color.white.opacity(0.85))
                    .padding(.top, 10)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(monthAheadItems) { item in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(item.id + 1)")
                            .briefingText(.j(14, 800))
                            .foregroundStyle(BriefingPalette.fixed(0xDDD6FE))
                            .frame(width: 28, height: 28)
                            .background(Color.white.opacity(0.12), in: Circle())
                        VStack(alignment: .leading, spacing: 0) {
                            if let label = item.label {
                                Text(label)
                                    .briefingStrutText(.j(9, 800, tracking: 0.08, uppercase: true))
                                    .foregroundStyle(BriefingPalette.fixed(0xC7B8FF))
                            }
                            BriefingParagraph(item.title, .j(13, 700), color: .white)
                                .padding(.top, item.label == nil ? 0 : 2)
                            if !item.body.isEmpty {
                                BriefingParagraph(item.body, .j(12, 400, 1.45), color: Color.white.opacity(0.75))
                                    .padding(.top, 4)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 13)
                    .briefingRule(.top, Color.white.opacity(0.15))
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.top, 18)
        }
        .padding(EdgeInsets(top: 28, leading: 18, bottom: 30, trailing: 18))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            BriefingAppearanceBackground {
                BriefingCSSGradient(angle: 120, stops: [.init(color: BriefingPalette.fixed(0x15354B), location: 0), .init(color: BriefingPalette.fixed(0x172F59), location: 1)])
            } light: {
                BriefingCSSGradient(angle: 125, stops: [.init(color: BriefingPalette.fixed(0x143C4C), location: 0), .init(color: BriefingPalette.fixed(0x263866), location: 1)])
            }
        }
        .briefingRule(.bottom, BriefingPalette.standard.line)
        .padding(.horizontal, -4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("briefing.monthly.monthAhead")
    }
}

/// `.hero-highlights`: three ruled cells (label / value / detail).
struct MonthlyHeroHighlights: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.briefingPalette) private var c
    let items: [MonthlyBriefingSections.LeadFeature]

    var body: some View {
        let rule = colorScheme == .dark ? BriefingPalette.fixed(0xFFFFFF, 0.18) : BriefingPalette.fixed(0x102638, 0.14)
        BriefingFractionRow(fractions: Array(repeating: 1, count: items.count)) { index in
            VStack(alignment: .leading, spacing: 0) {
                Text(items[index].label)
                    .briefingText(.j(9, 800, tracking: 0.08, uppercase: true))
                    .foregroundStyle(c.muted)
                BriefingParagraph(items[index].value, .j(14, 700), color: c.ink)
                    .padding(.top, 5)
                if !items[index].detail.isEmpty {
                    BriefingParagraph(items[index].detail, .j(9, 400, 1.35), color: colorScheme == .dark ? BriefingPalette.fixed(0xC6D5D8) : BriefingPalette.fixed(0x425C66))
                        .padding(.top, 4)
                }
            }
            .padding(.vertical, 14)
            .padding(.leading, index == 0 ? 0 : 10)
            .padding(.trailing, 9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .leading) { if index > 0 { Rectangle().fill(rule).frame(width: 1) } }
            .accessibilityElement(children: .combine)
        }
        .briefingRule(.top, rule)
        .briefingRule(.bottom, rule)
        .padding(.top, 24)
    }
}

/// Monthly body copy: 15 px at 1.5, 10 px top.
struct MonthlyBodyCopy: View {
    @Environment(\.briefingPalette) private var c
    let text: String

    var body: some View {
        BriefingParagraph(text, .j(15, 400, 1.5), color: c.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 10)
    }
}

/// `.insight` / `.callout`: 3 px tone rule, tinted plate, tracked label.
struct MonthlyCallout: View {
    @Environment(\.briefingPalette) private var c
    let title: String
    let text: String
    let tone: BriefingTone

    var body: some View {
        let color = tone.color(c)
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .briefingStrutText(.j(11, 800, tracking: 0.07, uppercase: true))
                .foregroundStyle(color)
            BriefingParagraph(text, .j(13, 400, 1.5), color: c.secondary)
        }
        .padding(.vertical, 13)
        .padding(.leading, 14 + 3)
        .padding(.trailing, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(tone == .purple ? 0.09 : 0.07))
        .overlay(alignment: .leading) { Rectangle().fill(color).frame(width: 3) }
        .padding(.top, 16)
        .accessibilityElement(children: .combine)
    }
}

// MARK: Training Progress (`.training`)

struct MonthlyTrainingSection: View {
    let training: MonthlyTrainingProgressSection

    var body: some View {
        BriefingSection(verticalPadding: 24, identifier: "briefing.monthly.training") {
            MonthlyTrainingContent(training: training)
        }
    }
}

private struct MonthlyTrainingContent: View {
    @Environment(\.briefingPalette) private var c
    let training: MonthlyTrainingProgressSection

    /// Record rows: the Server's per-lift `stats` (name · value · detail),
    /// then any typed highlights.
    private var records: [(String, String, String)] {
        training.stats.map { ($0.label, $0.value, $0.detail ?? "") } +
            (training.highlights ?? []).map { ($0.exerciseName, $0.performanceValue ?? $0.headline, [$0.delta, $0.detail].filter { !$0.isEmpty }.joined(separator: " · ")) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingSectionHead(glyph: "↗", label: "Training Progress", tone: .green)
            if let headline = training.headline, !headline.isEmpty {
                BriefingSectionTitle(text: headline, size: 25)
            }
            if !training.narrative.isEmpty { MonthlyBodyCopy(text: training.narrative) }
            ForEach(Array(records.enumerated()), id: \.offset) { _, record in
                VStack(alignment: .leading, spacing: 0) {
                    // `align-items: baseline`: the 13 px name drops 1.12 pt to
                    // share the 14 px value's baseline.
                    HStack(alignment: .top, spacing: 12) {
                        BriefingParagraph(record.0, .j(13, 700), color: c.ink)
                            .padding(.top, 1.12)
                        Text(record.1)
                            .briefingText(.j(14, 800))
                            .foregroundStyle(c.green)
                            .fixedSize()
                    }
                    if !record.2.isEmpty {
                        BriefingParagraph(record.2, .j(11, 400), color: c.muted)
                            .padding(.top, 4)
                    }
                }
                .padding(.vertical, 15)
                .briefingRule(.bottom, c.line)
                .accessibilityElement(children: .combine)
            }
            if let why = training.whyItMatters, !why.isEmpty {
                MonthlyCallout(title: "Why It Matters", text: why, tone: .green)
            }
        }
    }
}

// MARK: Energy Evolution (`.energy`)

struct MonthlyEnergySection: View {
    let energy: MonthlyEnergyEvolutionSection

    var body: some View {
        BriefingSection(verticalPadding: 24, identifier: "briefing.monthly.energy") {
            MonthlyEnergyContent(energy: energy)
        }
    }
}

private struct MonthlyEnergyContent: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.briefingPalette) private var c
    let energy: MonthlyEnergyEvolutionSection

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingSectionHead(glyph: "ϟ", label: "Energy Evolution", tone: .amber) {
                if let phase = [energy.phaseLabel, energy.phaseDateLabel].compactMap({ $0 }).joined(separator: " · ").nilIfEmpty {
                    Text(phase)
                        .briefingText(.j(11, 400))
                        .foregroundStyle(BriefingPaletteReader.muted)
                        .multilineTextAlignment(.trailing)
                }
            }
            .padding(.top, 4)
            BriefingSectionTitle(text: energy.headline ?? "How did energy change across the month?", size: 25)
            if let narrative = energy.narrative, !narrative.isEmpty { MonthlyBodyCopy(text: narrative) }
            field
            if let insight = energy.insight, !insight.isEmpty {
                BriefingParagraph(insight, .j(12, 400, 1.5), color: c.secondary)
                    .padding(.top, 15)
            }
        }
    }

    /// `.energy-field`: canonical monthly averages + static weekly bars.
    private var field: some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingFractionRow(fractions: [1, 1, 1]) { index in
                let items = [("Avg intake", "\(energy.averageIntakeKcal.formatted()) kcal"),
                             ("Avg expenditure", "\(energy.averageExpenditureKcal.formatted()) kcal"),
                             ("Avg balance", BriefingNumberFormatting.signedKcal(energy.averageBalanceKcal))]
                VStack(alignment: .leading, spacing: 4) {
                    BriefingParagraph(items[index].0, .j(10, 800, tracking: 0.08, uppercase: true), color: c.muted)
                    Text(items[index].1)
                        .briefingText(.j(16, 700))
                        .foregroundStyle(c.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 5)
                // `border-left` is inside the border-box: it narrows the content.
                .padding(.leading, index > 0 ? 1 : 0)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .leading) { if index > 0 { Rectangle().fill(c.line).frame(width: 1) } }
                .accessibilityElement(children: .combine)
            }
            .briefingRule(.top, c.line)
            .briefingRule(.bottom, c.line)
            .padding(.top, 14)
            MonthlyWeeklyBars(energy: energy)
                .padding(.top, 12)
            BriefingLegend(items: [("Intake", c.amber), ("Estimated expenditure", c.blue)])
        }
        .padding(EdgeInsets(top: 18, leading: 14, bottom: 16, trailing: 14))
        .background {
            BriefingAppearanceBackground {
                BriefingCSSGradient(angle: 135, stops: [.init(color: BriefingPalette.fixed(0xF2BC4D, 0.11), location: 0), .init(color: BriefingPalette.fixed(0x54C6E7, 0.055), location: 1)])
            } light: {
                BriefingCSSGradient(angle: 135, stops: [.init(color: BriefingPalette.fixed(0xEFE1C5), location: 0), .init(color: BriefingPalette.fixed(0xDCEBEF), location: 1)])
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .padding(.horizontal, -4)
        .padding(.top, 17)
    }
}

/// Static weekly-aggregate bars (Monthly Energy Evolution is intentionally
/// non-interactive). Weeks the Server marked missing render as a dashed
/// "not shown" column rather than disappearing.
struct MonthlyWeeklyBars: View {
    @Environment(\.briefingPalette) private var c
    let energy: MonthlyEnergyEvolutionSection

    private enum Column: Identifiable {
        case week(MonthlyEnergyEvolutionSection.WeekBar)
        case omitted(MonthlyEnergyEvolutionSection.OmittedWeek)
        var id: String {
            switch self {
            case .week(let week): week.weekLabel
            case .omitted(let week): "omitted-\(week.weekLabel)"
            }
        }
    }

    private var columns: [Column] { energy.weeks.map(Column.week) + (energy.omittedWeeks ?? []).map(Column.omitted) }

    private var maxValue: CGFloat {
        CGFloat(energy.weeks.flatMap { [$0.averageIntakeKcal, $0.averageExpenditureKcal] }.max() ?? 1)
    }

    static func daysLabel(_ coverage: String?) -> String? {
        coverage?.replacingOccurrences(of: " observed days", with: " days").replacingOccurrences(of: " observed day", with: " day")
    }

    var body: some View {
        GeometryReader { geometry in
            let count = CGFloat(max(columns.count, 1))
            let inset: CGFloat = 4
            let gap: CGFloat = 13
            let colWidth = (geometry.size.width - inset * 2 - gap * (count - 1)) / count
            let plotTop: CGFloat = 12
            let plotHeight: CGFloat = 178 - 12 - 42
            ZStack(alignment: .topLeading) {
                ForEach(Array(columns.enumerated()), id: \.element.id) { index, column in
                    let x = inset + CGFloat(index) * (colWidth + gap)
                    switch column {
                    case .week(let week):
                        let half = (colWidth - 5) / 2
                        let hi = max(4, CGFloat(week.averageIntakeKcal) / maxValue * plotHeight)
                        let he = max(4, CGFloat(week.averageExpenditureKcal) / maxValue * plotHeight)
                        UnevenRoundedRectangle(topLeadingRadius: 2, topTrailingRadius: 2).fill(c.amber)
                            .frame(width: half, height: hi).offset(x: x, y: plotTop + plotHeight - hi)
                        UnevenRoundedRectangle(topLeadingRadius: 2, topTrailingRadius: 2).fill(c.blue)
                            .frame(width: half, height: he).offset(x: x + half + 5, y: plotTop + plotHeight - he)
                        weekLabel([week.weekLabel, Self.daysLabel(week.coverageLabel)].compactMap { $0 }.joined(separator: "\n"))
                            .frame(width: colWidth + 14)
                            .offset(x: x - 7, y: plotTop + plotHeight + 8)
                    case .omitted(let week):
                        if let days = week.observedDayCount {
                            Text("\(days) readable \(days == 1 ? "day" : "days")")
                                .briefingText(.j(9, 400))
                                .foregroundStyle(c.muted)
                                .frame(width: colWidth + 20)
                                .offset(x: x - 10, y: plotTop + plotHeight - 34 - 30 + 8)
                        }
                        RoundedRectangle(cornerRadius: 0)
                            .strokeBorder(c.line, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                            .frame(width: colWidth, height: 34)
                            .offset(x: x, y: plotTop + plotHeight - 34)
                        weekLabel("\(week.weekLabel)\nnot shown")
                            .frame(width: colWidth + 14)
                            .offset(x: x - 7, y: plotTop + plotHeight + 8)
                    }
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
        }
        .frame(height: 178)
        .briefingRule(.bottom, c.line)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Weekly average intake and estimated expenditure across \(energy.weeks.count) weeks")
        .accessibilityValue(energy.weeks.map { "\($0.weekLabel): \($0.averageIntakeKcal) in, \($0.averageExpenditureKcal) out" }.joined(separator: "; ")
            + (energy.omittedWeeks ?? []).map { "; \($0.weekLabel): not shown" }.joined())
        .accessibilityIdentifier("briefing.monthly.energyChart")
    }

    private func weekLabel(_ text: String) -> some View {
        Text(text)
            .briefingText(.j(9, 700, 1.25))
            .foregroundStyle(c.muted)
            .multilineTextAlignment(.center)
    }
}

// MARK: New Baseline (`.baseline`)

struct MonthlyBaselineSection: View {
    let baseline: MonthlyNewBaselineSection

    var body: some View {
        MonthlyBaselineContent(baseline: baseline)
            .padding(EdgeInsets(top: 28, leading: 18, bottom: 28, trailing: 18))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                BriefingAppearanceBackground {
                    BriefingCSSGradient(angle: 135, stops: [.init(color: BriefingPalette.fixed(0xAA8CFF, 0.12), location: 0), .init(color: BriefingPalette.fixed(0x54C6E7, 0.06), location: 1)])
                } light: {
                    BriefingCSSGradient(angle: 135, stops: [.init(color: BriefingPalette.fixed(0xE1DCEF), location: 0), .init(color: BriefingPalette.fixed(0xD6E9E7), location: 1)])
                }
            }
            .briefingRule(.bottom, BriefingPalette.standard.line)
            .padding(.horizontal, -4)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("briefing.monthly.newBaseline")
    }
}

private struct MonthlyBaselineContent: View {
    @Environment(\.briefingPalette) private var c
    let baseline: MonthlyNewBaselineSection

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingSectionHead(glyph: "◇", label: "New Baseline", tone: .purple) {
                if !baseline.referenceDateLabel.isEmpty {
                    Text(baseline.referenceDateLabel)
                        .briefingText(.j(11, 400))
                        .foregroundStyle(c.muted)
                }
            }
            BriefingSectionTitle(text: baseline.headline ?? "The next phase gained a clear baseline.", size: 25)
            BriefingFractionRow(fractions: [1, 1, 1]) { index in
                let items = [("Body Fat", baseline.bodyFatPercent), ("Lean Mass", baseline.leanMassLb), ("Fat Mass", baseline.fatMassLb)]
                VStack(alignment: .leading, spacing: 5) {
                    Text(items[index].0)
                        .briefingText(.j(10, 800, tracking: 0.08, uppercase: true))
                        .foregroundStyle(c.muted)
                    Text(items[index].1)
                        .briefingText(.j(16, 700))
                        .foregroundStyle(c.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                .padding(.vertical, 13)
                .padding(.horizontal, 6)
                .padding(.leading, index > 0 ? 1 : 0)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .leading) { if index > 0 { Rectangle().fill(c.line).frame(width: 1) } }
                .accessibilityElement(children: .combine)
            }
            .briefingRule(.top, c.line)
            .briefingRule(.bottom, c.line)
            .padding(.top, 16)
            if !baseline.narrative.isEmpty { MonthlyBodyCopy(text: baseline.narrative) }
            if let interpretation = baseline.interpretation, !interpretation.isEmpty {
                // Founder correction: no analytical "read" labels.
                MonthlyCallout(title: "What it means", text: interpretation, tone: .purple)
            }
        }
    }
}

// MARK: What Changed / Defining Moments (`.changes`)

struct MonthlyNumberedSection: View {
    struct Item: Equatable {
        let title: String
        let body: String
    }

    let glyph: String
    let label: String
    let tone: BriefingTone
    let title: String
    let items: [Item]
    var identifier: String

    var body: some View {
        BriefingSection(verticalPadding: 24, identifier: identifier) {
            MonthlyNumberedContent(glyph: glyph, label: label, tone: tone, title: title, items: items)
        }
    }
}

private struct MonthlyNumberedContent: View {
    @Environment(\.briefingPalette) private var c
    let glyph: String
    let label: String
    let tone: BriefingTone
    let title: String
    let items: [MonthlyNumberedSection.Item]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BriefingSectionHead(glyph: glyph, label: label, tone: tone)
            BriefingSectionTitle(text: title, size: 25)
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .top, spacing: 11) {
                    Text("\(index + 1)")
                        .briefingText(.j(11, 800))
                        .foregroundStyle(tone.color(c))
                        .frame(width: 24, height: 24)
                        .background(tone.color(c).opacity(0.15), in: Circle())
                    VStack(alignment: .leading, spacing: 0) {
                        BriefingParagraph(item.title, .j(13, 700), color: c.ink)
                        if !item.body.isEmpty {
                            BriefingParagraph(item.body, .j(13, 400, 1.5), color: c.secondary)
                                .padding(.top, 5)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.vertical, 16)
                .briefingRule(.bottom, c.line)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// Canonical V3 Monthly strategic read — the Strategic Summary / Coach's
/// Take that closes the evidence body immediately before Month Ahead. The
/// Server's coach take leads verbatim; its other sections follow unless
/// they repeat the hero body. Confidence is not repeated here (the lead
/// already carries the one Confidence surface).
struct MonthlyStrategicSummaryCard: View {
    @Environment(\.colorScheme) private var colorScheme
    let summary: MonthlyStrategicSummaryV3
    let heroBody: String

    var renderedSectionTitles: [String] { sections.map(\.title) }

    /// With a coach take the locked close is that take alone (the action
    /// and watch content lives in Month Ahead); without one, the Server's
    /// strategic sections render in its order.
    private var sections: [(title: String, text: String)] {
        if let coachTake = summary.coachTake, !coachTake.isEmpty, coachTake != heroBody {
            return [("Coach's Take", coachTake)]
        }
        return [("Result", summary.result), ("What It Means", summary.meaning),
                ("What To Do", summary.action), ("What To Watch", summary.watch),
                ("Energy", summary.energyStatement)]
            .compactMap { title, text in
                guard let text, !text.isEmpty, text != heroBody else { return nil }
                return (title, text)
            }
    }

    var body: some View {
        if !sections.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text("COACH'S TAKE")
                    .briefingStrutText(.j(11, 800, tracking: 0.1))
                    .foregroundStyle(BriefingPalette.fixed(0xC7B8FF))
                    .accessibilityAddTraits(.isHeader)
                ForEach(Array(sections.enumerated()), id: \.offset) { index, section in
                    if section.title != "Coach's Take" {
                        Text(section.title)
                            .briefingText(.j(15, 700))
                            .foregroundStyle(.white)
                            .padding(.top, index == 0 ? 14 : 16)
                    }
                    BriefingParagraph(section.text, .j(15, 400, 1.55), color: Color.white.opacity(0.92))
                        .padding(.top, section.title == "Coach's Take" ? 10 : 7)
                }
            }
            .padding(EdgeInsets(top: 25, leading: 18, bottom: 27, trailing: 18))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                BriefingAppearanceBackground {
                    BriefingCSSGradient(angle: 120, stops: [.init(color: BriefingPalette.fixed(0x15354B), location: 0), .init(color: BriefingPalette.fixed(0x172F59), location: 1)])
                } light: {
                    BriefingCSSGradient(angle: 125, stops: [.init(color: BriefingPalette.fixed(0x173D4E), location: 0), .init(color: BriefingPalette.fixed(0x2B3764), location: 1)])
                }
            }
            .briefingRule(.bottom, BriefingPalette.standard.line)
            .padding(.horizontal, -4)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("briefing.monthly.strategic")
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
