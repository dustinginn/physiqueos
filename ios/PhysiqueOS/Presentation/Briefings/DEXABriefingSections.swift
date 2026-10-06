import SwiftUI

/// DEXA Event Briefing — a data-rich scan-to-scan review — in the
/// Founder-locked event family with its two locked corrections (every
/// canonical field-specific unit across the comparison tables, and the full
/// Goal/Phase body-composition breakdown): Hero (title, body, the persisted
/// Confidence ring, result grid, milestones) → Snapshot → What Measurably
/// Changed (Since Last Scan, Regional Fat, Measured Lean Tissue, Other
/// Notable Changes) → the phase breakdown → What This Scan Means → Coach's
/// Insight → optional read-only Phase Review → optional Goal Completion
/// handoff. Distinct from the recurring cadences; no Recovery. The tables
/// and breakdown are static (no chart interaction to arbitrate).
struct DEXABriefingSections: View {
    static let sectionInventory = ["Hero", "Current Scan", "What Measurably Changed", "Since Last Scan", "Regional Fat Change", "Measured Lean Tissue Change", "Other Notable Changes", "Cut Timeline", "What This Scan Means", "Coach's Insight", "Phase Review", "Goal Completion Handoff"]
    static let heroMetricPresentationStyle = "semantic-two-by-two"
    static let inlineComparisonSectionTitles = ["Regional Fat Change", "Measured Lean Tissue Change", "Other Notable Changes"]
    static let heroTypeLabel = "DEXA EVENT BRIEFING"
    let content: DEXABriefingContent
    let confidence: BriefingConfidenceReadModel?
    var onNavigate: (AppDestination) -> Void = { _ in }
    /// The Goal/Phase the artifact was published under (frozen attribution).
    var attribution: BriefingGoalAttribution? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            hero
            snapshotSection
            changesSection
            interpretationSection
            BriefingEventCoach(
                label: "Coach's Insight",
                text: "",
                rows: [("Biggest Win", content.coachInsight.biggestWin), ("Protect", content.coachInsight.protect),
                       ("Watch", content.coachInsight.watch), ("Next", content.coachInsight.next)].filter { !$0.1.isEmpty },
                rowStyle: .dexa
            )
            .accessibilityIdentifier("briefing.dexa.coachInsight")
            if let phaseReview = content.phaseReview { phaseReviewSection(phaseReview) }
            if let handoff = content.goalCompletionHandoff { handoffSection(handoff) }
        }
        .accessibilityIdentifier("briefing.dexa")
    }

    // MARK: Hero

    private var hero: some View {
        BriefingEventHero(
            eyebrow: Self.heroTypeLabel,
            date: "Scan · \(BriefingDateFormatting.shortDate(content.scanDate))",
            title: content.hero.title,
            summary: content.hero.body
        ) {
            if let confidence { DEXAConfidenceRow(confidence: confidence) }
            if !content.hero.results.isEmpty { DEXAHeroMetrics(results: content.hero.results) }
            if !content.hero.milestones.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(content.hero.milestones, id: \.self) { milestone in
                        Text("✓ \(milestone)").briefingText(.jn(11, 700))
                    }
                }
                .padding(.top, 14)
            }
        }
    }

    // MARK: Snapshot

    private var snapshotSection: some View {
        BriefingEventSection(bottomPadding: 5, identifier: "briefing.dexa.snapshot") {
            BriefingEventSectionHead(label: "Snapshot", trailing: "Current Scan")
            DEXASnapshotGrid(items: [
                ("Date", BriefingDateFormatting.monthDay(content.scanDate)),
                ("Window", "\(content.daysBetweenScans) days"),
                ("DEXA Weight", content.snapshot.weightLb),
                ("Body Fat", content.snapshot.bodyFatPercent),
                ("Fat Mass", content.snapshot.fatMassLb),
                ("Lean Tissue", content.snapshot.leanMassLb),
            ] + (content.snapshot.restingMetabolicRateKcal.map { [("RMR", "\($0) cal/day")] } ?? []))
            .padding(.bottom, 23)
        }
    }

    // MARK: What Measurably Changed

    private var changesSection: some View {
        BriefingEventSection(bottomPadding: 5, identifier: "briefing.dexa.changes") {
            BriefingEventSectionHead(label: "What Measurably Changed", trailing: content.isBaselineScan ? "Baseline Scan" : "Since Last Scan")
            DEXAUnitTable(
                title: "Since Last Scan",
                firstColumn: "Metric",
                rows: content.progress.headline.map { .init(label: $0.label, previous: $0.previous, current: $0.current, delta: $0.delta) }
            )
            if !content.progress.regionalFat.isEmpty {
                DEXAUnitTable(title: "Regional Fat Change", firstColumn: "Metric", rows: content.progress.regionalFat.map { .init(label: $0.region, previous: $0.previous, current: $0.current, delta: $0.delta) })
                    .accessibilityIdentifier("briefing.dexa.regionalFat")
            }
            if !content.progress.regionalLean.isEmpty {
                DEXAUnitTable(title: "Measured Lean Tissue Change", firstColumn: "Metric", rows: content.progress.regionalLean.map { .init(label: $0.region, previous: $0.previous, current: $0.current, delta: $0.delta) })
                    .accessibilityIdentifier("briefing.dexa.regionalLean")
            }
            if !content.progress.supplemental.isEmpty {
                DEXAUnitTable(title: "Other Notable Changes", firstColumn: "Metric", rows: content.progress.supplemental.map { .init(label: $0.label, previous: $0.previous, current: $0.current, delta: $0.delta) })
                    .accessibilityIdentifier("briefing.dexa.supplemental")
            }
            DEXAPhaseBreakdown(timeline: content.progress.timeline, goal: attribution?.goalTitle, phase: attribution?.phaseName)
                .padding(.bottom, 23)
        }
    }

    // MARK: What This Scan Means

    private var interpretationSection: some View {
        let interpretation = content.interpretation
        let paragraphs = [interpretation.opening, interpretation.fatLoss, interpretation.leanMass, interpretation.regional,
                          interpretation.phaseMeaning, interpretation.stoodOut, interpretation.goalProgress, interpretation.guardrailStatus]
            .compactMap { $0 }.filter { !$0.isEmpty }
        return BriefingEventSection(bottomPadding: 5, identifier: "briefing.dexa.interpretation") {
            BriefingEventLabel(text: "What This Scan Means")
            BriefingEventDataParagraphs(paragraphs: paragraphs)
                .padding(.top, 12)
            DEXAEvidenceNote(items: [("Supporting evidence", interpretation.supportingEvidence), ("Uncertainty", interpretation.uncertainty)].filter { !$0.1.isEmpty })
                .padding(.bottom, 23)
        }
    }

    // MARK: Phase Review / handoff (read-only)

    /// Always read-only — mirrors the historical replay route's real
    /// behavior exactly (see `DEXAPhaseReviewSummary`'s doc comment).
    private func phaseReviewSection(_ review: DEXAPhaseReviewSummary) -> some View {
        BriefingEventSection(identifier: "briefing.dexa.phaseReview") {
            BriefingEventLabel(text: "Phase Review")
            BriefingEventTitle(text: review.title)
            BriefingEventBody(text: review.promptText)
            if let recorded = review.recordedDecisionLabel {
                Text("This Phase Review decision has been recorded: \(recorded)")
                    .briefingText(.jn(11, 700))
                    .foregroundStyle(BriefingEventPalette.green)
                    .padding(.top, 12)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(review.options, id: \.self) { option in
                        Text("• \(option)").briefingText(.jn(11, 600)).foregroundStyle(BriefingEventPalette.muted)
                    }
                }
                .padding(.top, 12)
            }
            Color.clear.frame(height: 16)
        }
    }

    private func handoffSection(_ handoff: DEXAGoalCompletionHandoff) -> some View {
        BriefingEventSection(identifier: "briefing.dexa.handoff") {
            BriefingEventLabel(text: "One Qualified Check Remains")
            BriefingEventBody(text: handoff.questionText)
            BriefingEventAction(text: handoff.actionLabel, prominent: true) { onNavigate(handoff.actionDestination) }
            Color.clear.frame(height: 16)
        }
    }
}

/// `.confidence-row`: 116 px ring + band/movement + reason.
struct DEXAConfidenceRow: View {
    @Environment(\.colorScheme) private var colorScheme
    let confidence: BriefingConfidenceReadModel

    /// "DEVELOPING · DECREASED −7" — the persisted band, direction and delta
    /// (a Server-authored movement label wins).
    var headline: String {
        let movement: String
        if let label = confidence.presentationMovementLabel, !label.isEmpty {
            movement = label
        } else {
            switch confidence.movementDirection {
            case .increased: movement = "Increased\(confidence.delta.map { " +\(abs($0))" } ?? "")"
            case .decreased: movement = "Decreased\(confidence.delta.map { " −\(abs($0))" } ?? "")"
            case .held: movement = "Held"
            case .initial: movement = "Initial assessment"
            }
        }
        return "\(confidence.band) · \(movement)".uppercased()
    }

    var body: some View {
        HStack(alignment: .center, spacing: 18) {
            ZStack {
                Circle().fill(colorScheme == .dark ? Color.white.opacity(0.17) : BriefingPalette.fixed(0x102638, 0.12))
                Circle()
                    .trim(from: 0, to: CGFloat(min(max(confidence.score, 0), 100)) / 100)
                    .rotation(.degrees(-90))
                    .fill(BriefingEventPalette.green)
                Circle()
                    .fill(colorScheme == .dark ? BriefingPalette.fixed(0x0B4050) : BriefingPalette.fixed(0xEAF2ED))
                    .frame(width: 94, height: 94)
                VStack(spacing: 3) {
                    Text("\(confidence.score)%").briefingText(.j(31, 700, 1))
                    Text("CONFIDENCE")
                        .briefingText(.jn(8, 400))
                        .foregroundStyle(colorScheme == .dark ? BriefingPalette.fixed(0xC7D7D9) : BriefingPalette.fixed(0x5D7078))
                }
            }
            .frame(width: 116, height: 116)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Confidence \(confidence.score) percent")
            VStack(alignment: .leading, spacing: 5) {
                BriefingParagraph(headline, .jn(13, 700, tracking: 0.06), color: BriefingEventPalette.green)
                BriefingParagraph(confidence.presentationExplanation ?? confidence.primaryReason, .j(11, 400, 1.45),
                                  color: colorScheme == .dark ? BriefingPalette.fixed(0xD6E2E3) : BriefingPalette.fixed(0x3F5D62))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.top, 22)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("briefing.hero.confidence")
    }
}

/// `.hero-metrics`: the canonical result grid (two columns on rules).
struct DEXAHeroMetrics: View {
    @Environment(\.colorScheme) private var colorScheme
    let results: [DEXAHeroResult]

    var body: some View {
        let rule = colorScheme == .dark ? Color.white.opacity(0.18) : BriefingPalette.fixed(0x102638, 0.14)
        let rows = stride(from: 0, to: results.count, by: 2).map { Array(results[$0..<min($0 + 2, results.count)]) }
        VStack(spacing: 0) {
            ForEach(rows.indices, id: \.self) { row in
                HStack(alignment: .top, spacing: 0) {
                    ForEach(Array(rows[row].enumerated()), id: \.element.id) { column, result in
                        VStack(alignment: .leading, spacing: 0) {
                            Text(result.label.uppercased())
                                .briefingStrutText(.jn(9, 400, tracking: 0.08), parentSize: 16, parentLineHeight: 21)
                                .opacity(0.68)
                            Text(result.value)
                                .briefingText(.jn(19, 700))
                                .padding(.top, 4)
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                            if !result.context.isEmpty {
                                Text(result.context)
                                    .briefingStrutText(.jn(10, 400), parentSize: 16, parentLineHeight: 21)
                                    .opacity(0.7)
                            }
                        }
                        .padding(EdgeInsets(top: 13, leading: column == 1 ? 12 : 0, bottom: 10, trailing: 8))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .leading) { if column == 1 { Rectangle().fill(rule).frame(width: 1) } }
                        .accessibilityElement(children: .combine)
                    }
                    if rows[row].count == 1 { Color.clear.frame(maxWidth: .infinity, maxHeight: 0) }
                }
                .briefingRule(.bottom, rule)
            }
        }
        .briefingRule(.top, rule)
        .padding(.top, 22)
    }
}

/// `.snapshot-grid`: two columns of facts on 1 px rule gutters.
struct DEXASnapshotGrid: View {
    let items: [(String, String)]

    var body: some View {
        let rows = stride(from: 0, to: items.count, by: 2).map { Array(items[$0..<min($0 + 2, items.count)]) }
        VStack(spacing: 1) {
            ForEach(rows.indices, id: \.self) { row in
                HStack(spacing: 1) {
                    ForEach(rows[row].indices, id: \.self) { index in
                        VStack(alignment: .leading, spacing: 0) {
                            Text(rows[row][index].0.uppercased())
                                .briefingStrutText(.jn(9, 400, tracking: 0.08), parentSize: 16, parentLineHeight: 21)
                                .foregroundStyle(BriefingEventPalette.muted)
                            Text(rows[row][index].1)
                                .briefingText(.jn(17, 700))
                                .foregroundStyle(BriefingEventPalette.ink)
                                .padding(.top, 5)
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .background(BriefingPalette.standard.page)
                        .accessibilityElement(children: .combine)
                    }
                    if rows[row].count == 1 { BriefingPalette.standard.page.frame(maxWidth: .infinity) }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .background(BriefingEventPalette.rule)
        .padding(.horizontal, -8)
        .padding(.top, 16)
    }
}

/// `.table-field` + `.unit-table`: Metric / Previous / Current / Delta with
/// every canonical unit, delta emphasized.
struct DEXAUnitTable: View {
    @Environment(\.colorScheme) private var colorScheme
    struct Row: Equatable {
        let label: String
        let previous: String
        let current: String
        let delta: String
    }

    let title: String
    let firstColumn: String
    let rows: [Row]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .briefingText(.jn(16, 700))
                .foregroundStyle(BriefingEventPalette.ink)
                .accessibilityAddTraits(.isHeader)
            BriefingFractionLayout(fractions: [1.25, 1, 1, 1], spacing: 6) {
                header(firstColumn, alignment: .leading)
                header("Previous", alignment: .trailing)
                header("Current", alignment: .trailing)
                header("Delta", alignment: .trailing)
            }
            .padding(.vertical, 7)
            .padding(.top, 10)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                BriefingFractionLayout(fractions: [1.25, 1, 1, 1], spacing: 6, centered: true) {
                    cell(row.label, alignment: .leading)
                    cell(row.previous, alignment: .trailing)
                    cell(row.current, alignment: .trailing)
                    cell(row.delta, alignment: .trailing, emphasized: true)
                }
                .padding(.vertical, 10)
                .briefingRule(.top, BriefingEventPalette.rule)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.label): from \(row.previous) to \(row.current), a change of \(row.delta)")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            BriefingAppearanceBackground {
                BriefingEventPalette.surface
            } light: {
                BriefingCSSGradient(angle: 135, stops: [.init(color: BriefingPalette.fixed(0xD9E9E5), location: 0), .init(color: BriefingPalette.fixed(0xE3E0ED), location: 1)])
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .padding(.top, 14)
        .accessibilityElement(children: .contain)
    }

    private func header(_ text: String, alignment: Alignment) -> some View {
        Text(text.uppercased())
            .briefingText(.jn(8, 800, tracking: 0.07))
            .foregroundStyle(BriefingEventPalette.muted)
            .frame(maxWidth: .infinity, alignment: alignment)
    }

    private func cell(_ text: String, alignment: Alignment, emphasized: Bool = false) -> some View {
        Text(text)
            .briefingText(.jn(10, emphasized ? 800 : 400))
            .foregroundStyle(emphasized ? BriefingEventPalette.green : BriefingEventPalette.ink)
            .multilineTextAlignment(alignment == .leading ? .leading : .trailing)
            .frame(maxWidth: .infinity, alignment: alignment)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// `.phase-panel`: the restored Goal/Phase body-composition breakdown.
struct DEXAPhaseBreakdown: View {
    @Environment(\.colorScheme) private var colorScheme
    let timeline: DEXACutTimeline
    var goal: String? = nil
    var phase: String? = nil

    static func value(_ point: DEXATimelinePoint?, unit: String) -> String {
        guard let raw = point?.value, raw != "—" else { return "—" }
        if unit == "%" { return "\(raw)%" }
        return unit.isEmpty ? raw : "\(raw) \(unit)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                BriefingEventLabel(text: timeline.timelineLabel)
                if timeline.isSimulated {
                    Text("SIMULATED").briefingText(.jn(8, 800, tracking: 0.07)).foregroundStyle(BriefingEventPalette.muted)
                }
            }
            .accessibilityIdentifier("briefing.dexa.timeline")
            if goal != nil || phase != nil {
                HStack(alignment: .top, spacing: 8) {
                    if let goal { context("Goal", goal, alignment: .leading) }
                    Spacer(minLength: 0)
                    if let phase { context("Active phase", phase, alignment: .trailing) }
                }
                .padding(.top, 10)
                .padding(.bottom, 5)
            }
            VStack(spacing: 1) {
                HStack(spacing: 1) {
                    meta("Start", BriefingDateFormatting.monthDay(timeline.baselineDate))
                    meta("Current scan", BriefingDateFormatting.monthDay(timeline.currentDate))
                }
                .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 1) {
                    meta("Elapsed", "\(timeline.elapsedDays) days")
                    meta("Body-composition scans", "\(timeline.scans.count)")
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .background(BriefingEventPalette.rule)
            .padding(.top, 10)
            .padding(.bottom, 10)
            ForEach(timeline.metrics) { metric in
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(metric.label).briefingText(.jn(12, 700)).foregroundStyle(BriefingEventPalette.ink)
                        Spacer(minLength: 8)
                        Text(metric.delta).briefingText(.jn(11, 800)).foregroundStyle(BriefingEventPalette.green)
                    }
                    HStack(alignment: .center, spacing: 8) {
                        valueBox("Start", Self.value(metric.points.first, unit: metric.unit))
                        Text("→").briefingText(.jn(14, 400)).foregroundStyle(BriefingEventPalette.muted)
                        valueBox("Current", Self.value(metric.points.last, unit: metric.unit))
                    }
                    .padding(.top, 8)
                }
                .padding(.vertical, 13)
                .briefingRule(.top, BriefingEventPalette.rule)
                .accessibilityElement(children: .combine)
            }
            if !timeline.summary.isEmpty {
                BriefingParagraph(timeline.summary, .j(11, 400, 1.48), color: BriefingEventPalette.muted)
                    .padding(.top, 14)
            }
        }
        .padding(.vertical, 18)
        .padding(.leading, 18 + 3)
        .padding(.trailing, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            BriefingCSSGradient(angle: 135, stops: [.init(color: BriefingPalette.fixed(0x35C8C1, 0.13), location: 0), .init(color: BriefingPalette.fixed(0xA68AF8, 0.12), location: 1)])
        }
        .overlay(alignment: .leading) { Rectangle().fill(BriefingEventPalette.teal).frame(width: 3) }
        .padding(.top, 18)
        .accessibilityElement(children: .contain)
    }

    private func context(_ label: String, _ value: String, alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 0) {
            Text(label).briefingText(.jn(9, 400)).foregroundStyle(BriefingEventPalette.muted)
            Text(value).briefingText(.jn(12, 700)).foregroundStyle(BriefingEventPalette.ink)
        }
        .accessibilityElement(children: .combine)
    }

    private func meta(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).briefingText(.jn(8, 400)).foregroundStyle(BriefingEventPalette.muted)
            Text(value).briefingText(.jn(12, 700)).foregroundStyle(BriefingEventPalette.ink)
        }
        .padding(10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BriefingPalette.standard.page)
        .accessibilityElement(children: .combine)
    }

    private func valueBox(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).briefingText(.jn(8, 400)).foregroundStyle(BriefingEventPalette.muted)
            Text(value).briefingText(.jn(17, 700)).foregroundStyle(BriefingEventPalette.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colorScheme == .dark ? BriefingEventPalette.surface : Color.white.opacity(0.5), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// `.interpretation p` (DEXA): primary-ink paragraphs on top rules.
struct BriefingEventDataParagraphs: View {
    let paragraphs: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                BriefingParagraph(paragraph, .j(12, 400, 1.5), color: BriefingEventPalette.ink)
                    .padding(.vertical, 12)
                    .briefingRule(.top, BriefingEventPalette.rule)
            }
        }
    }
}

/// `.evidence-note`: purple-ruled supporting context.
struct DEXAEvidenceNote: View {
    let items: [(String, String)]

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.0).briefingText(.j(11, 700, 1.45)).foregroundStyle(BriefingEventPalette.ink)
                        BriefingParagraph(item.1, .j(11, 400, 1.45), color: BriefingEventPalette.ink)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.vertical, 14)
            .padding(.leading, 14 + 3)
            .padding(.trailing, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BriefingPalette.fixed(0xA68AF8, 0.1))
            .overlay(alignment: .leading) { Rectangle().fill(BriefingEventPalette.purple).frame(width: 3) }
            .padding(.top, 14)
        }
    }
}
