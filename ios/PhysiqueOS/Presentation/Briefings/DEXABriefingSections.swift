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

    /// The frozen Goal title, or nil when the artifact persisted none (the
    /// mapper's "Goal at publication" placeholder is never shown as a goal).
    static func persistedGoalTitle(_ attribution: BriefingGoalAttribution?) -> String? {
        guard let title = attribution?.goalTitle, !title.isEmpty, title != "Goal at publication" else { return nil }
        return title
    }

    /// Canonical RMR text; production values already carry their unit.
    static func rmrText(_ value: String) -> String {
        value.contains(where: \.isLetter) ? value : "\(value) cal/day"
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
            BriefingEventSectionHead(label: "Snapshot", trailing: "Measured Event")
            // Locked compact snapshot: the scan's identity facts. The body
            // composition values themselves live in the hero and the change rails.
            DEXASnapshotGrid(items: [
                ("Date", BriefingDateFormatting.monthDay(content.scanDate)),
                ("Window", "\(content.daysBetweenScans) days"),
                ("Scans", "\(content.progress.timeline.scans.count) \(content.progress.timeline.scans.count == 1 ? "scan" : "scans")"),
            ] + (content.snapshot.restingMetabolicRateKcal.map { [("RMR", Self.rmrText($0))] } ?? []))
            .padding(.bottom, 23)
        }
    }

    // MARK: What Measurably Changed

    private var changesSection: some View {
        let goal = content.semanticGoalType
        return BriefingEventSection(bottomPadding: 5, identifier: "briefing.dexa.changes") {
            BriefingEventSectionHead(label: "What Measurably Changed", trailing: content.isBaselineScan ? "Baseline Scan" : "Since Last Scan")
            DEXAChangeRails(
                rows: content.progress.headline.map { DEXAChangeRails.Row(label: $0.label, previous: $0.previous, current: $0.current, delta: $0.delta) },
                group: .headline,
                goalType: goal
            )
            .padding(.top, 6)
            .accessibilityIdentifier("briefing.dexa.sinceLastScan")
            if !content.progress.regionalFat.isEmpty {
                DEXARegionCard(title: "Regional Fat Change", rows: content.progress.regionalFat.map { .init(label: $0.region, previous: $0.previous, current: $0.current, delta: $0.delta) },
                               group: .regionalFat, goalType: goal, previousDate: content.priorScanDate, currentDate: content.scanDate)
                    .accessibilityIdentifier("briefing.dexa.regionalFat")
            }
            if !content.progress.regionalLean.isEmpty {
                DEXARegionCard(title: "Measured Lean Tissue Change", rows: content.progress.regionalLean.map { .init(label: $0.region, previous: $0.previous, current: $0.current, delta: $0.delta) },
                               group: .regionalLean, goalType: goal, previousDate: content.priorScanDate, currentDate: content.scanDate)
                    .accessibilityIdentifier("briefing.dexa.regionalLean")
            }
            if !content.progress.supplemental.isEmpty {
                DEXARegionCard(title: "Other Notable Changes", rows: content.progress.supplemental.map { .init(label: $0.label, previous: $0.previous, current: $0.current, delta: $0.delta) },
                               group: .supplemental, goalType: goal, previousDate: content.priorScanDate, currentDate: content.scanDate, firstColumn: "Metric")
                    .accessibilityIdentifier("briefing.dexa.supplemental")
            }
            DEXAPhaseBreakdown(timeline: content.progress.timeline, goal: Self.persistedGoalTitle(attribution), phase: attribution?.phaseName, goalType: goal)
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
                            Text(result.label)
                                .briefingStrutText(.jn(9, 400, tracking: 0.08, uppercase: true), parentSize: 16, parentLineHeight: 21)
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
                            Text(rows[row][index].0)
                                .briefingStrutText(.jn(9, 400, tracking: 0.08, uppercase: true), parentSize: 16, parentLineHeight: 21)
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

/// `.phase-panel`: the restored Goal/Phase body-composition breakdown.
struct DEXAPhaseBreakdown: View {
    @Environment(\.colorScheme) private var colorScheme
    let timeline: DEXACutTimeline
    var goal: String? = nil
    var phase: String? = nil
    /// Canonical `semanticGoalType` for favorable / unfavorable color.
    var goalType: String? = nil

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
                        Text(metric.delta).briefingText(.jn(11, 800))
                            .foregroundStyle(DEXADeltaSemantics.tone(delta: metric.delta, label: metric.label, group: .headline, goalType: goalType).color)
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

// MARK: - Goal- and tissue-aware delta semantics

/// Bounded presentation mapping from a canonical DEXA delta to whether it is
/// favorable for the briefing's persisted physique goal. Never "positive =
/// good": lean tissue up is favorable, fat tissue / body-fat % up is
/// unfavorable — but only for goal types whose tissue semantics are known.
/// Context-dependent metrics (weight, RMR, ratios, bone) and any metric
/// under an unknown goal stay restrained amber; unchanged values are gray.
enum DEXADeltaSemantics {
    enum Tone: Equatable { case favorable, unfavorable, neutral, contextual }
    enum Group: Equatable { case headline, regionalFat, regionalLean, supplemental }
    enum Tissue: Equatable { case lean, fat, bodyFatPercent, contextDependent }

    /// Canonical `semanticGoalType` values whose tissue semantics are known:
    /// both physique goals want lean tissue kept/gained and fat reduced or
    /// held, so a lean gain is favorable and a fat gain unfavorable.
    static let tissueAwareGoalTypes: Set<String> = ["lean_mass_gain", "fat_loss"]

    static func tissue(label: String, group: Group) -> Tissue {
        switch group {
        case .regionalFat: return .fat
        case .regionalLean: return .lean
        case .headline, .supplemental:
            let l = label.lowercased()
            if l.contains("lean") { return .lean }
            if l.contains("body fat") || l == "body fat %" { return .bodyFatPercent }
            if l.contains("fat mass") || l.contains("visceral fat") { return .fat }
            return .contextDependent
        }
    }

    /// The sign of a canonical delta string ("+0.4 pts", "−1.2 lb", "0.0",
    /// "No change"); nil when it cannot be read.
    static func direction(_ delta: String) -> Int? {
        let trimmed = delta.trimmingCharacters(in: .whitespaces)
        if trimmed.lowercased().hasPrefix("no change") || trimmed.lowercased() == "unchanged" { return 0 }
        let numeric = trimmed.filter { "0123456789.".contains($0) }
        guard let magnitude = Double(numeric) else { return nil }
        if magnitude == 0 { return 0 }
        if trimmed.hasPrefix("-") || trimmed.hasPrefix("−") || trimmed.hasPrefix("–") { return -1 }
        return 1
    }

    static func tone(delta: String, label: String, group: Group, goalType: String?) -> Tone {
        guard let direction = direction(delta) else { return .contextual }
        if direction == 0 { return .neutral }
        let tissue = tissue(label: label, group: group)
        guard tissue != .contextDependent, let goalType, tissueAwareGoalTypes.contains(goalType) else { return .contextual }
        switch tissue {
        case .lean: return direction > 0 ? .favorable : .unfavorable
        case .fat, .bodyFatPercent: return direction > 0 ? .unfavorable : .favorable
        case .contextDependent: return .contextual
        }
    }
}

extension DEXADeltaSemantics.Tone {
    var color: Color {
        switch self {
        case .favorable: BriefingEventPalette.green
        case .unfavorable: BriefingEventPalette.coral
        case .neutral: BriefingEventPalette.muted
        case .contextual: BriefingEventPalette.amber
        }
    }

    var accessibilityWord: String {
        switch self {
        case .favorable: "favorable"
        case .unfavorable: "unfavorable"
        case .neutral: "unchanged"
        case .contextual: "context dependent"
        }
    }
}

// MARK: - Locked change rails (`.change`)

/// The locked "What Measurably Changed" rows: label + signed delta, the
/// previous / current endpoints, and a structural teal rail. Rail length is
/// data-derived (the row's relative change against the largest relative
/// change in the group), never a hand-authored value.
struct DEXAChangeRails: View {
    struct Row: Equatable {
        let label: String
        let previous: String
        let current: String
        let delta: String
    }

    let rows: [Row]
    let group: DEXADeltaSemantics.Group
    let goalType: String?

    static func number(_ text: String) -> Double? {
        Double(text.filter { "0123456789.-".contains($0) }.replacingOccurrences(of: "--", with: "-"))
    }

    /// Rail fill fraction per row: 0 when unchanged or unreadable, otherwise
    /// 0.12…1 proportional to |current − previous| / |previous| relative to
    /// the largest such change in the group.
    static func fractions(_ rows: [Row]) -> [CGFloat] {
        let relative: [Double?] = rows.map { row in
            guard let p = number(row.previous), let c = number(row.current), p != 0 else { return nil }
            return abs(c - p) / abs(p)
        }
        let maximum = relative.compactMap { $0 }.max() ?? 0
        return relative.map { value in
            guard let value, value > 0, maximum > 0 else { return 0 }
            return CGFloat(0.12 + 0.88 * value / maximum)
        }
    }

    var body: some View {
        let fractions = Self.fractions(rows)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                let tone = DEXADeltaSemantics.tone(delta: row.delta, label: row.label, group: group, goalType: goalType)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .bottom, spacing: 10) {
                        Text(row.label).briefingText(.jn(14, 700)).foregroundStyle(BriefingEventPalette.ink)
                        Spacer(minLength: 0)
                        Text(row.delta).briefingText(.jn(13, 800)).foregroundStyle(tone.color)
                    }
                    HStack {
                        Text(row.previous)
                        Spacer(minLength: 8)
                        Text(row.current)
                    }
                    .briefingText(.jn(10, 400))
                    .foregroundStyle(BriefingEventPalette.muted)
                    .padding(.top, 9)
                    DEXARail(fraction: fractions[index])
                        .padding(.top, 7)
                }
                .padding(.vertical, 14)
                .briefingRule(.top, BriefingEventPalette.rule)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.label): from \(row.previous) to \(row.current), \(row.delta), \(tone.accessibilityWord)")
            }
        }
    }
}

/// `.rail`: 5 pt rule track, teal→green fill, 10 pt knob at the fill end.
struct DEXARail: View {
    let fraction: CGFloat

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width * min(max(fraction, 0), 1)
            ZStack(alignment: .leading) {
                Rectangle().fill(BriefingEventPalette.rule)
                LinearGradient(colors: [BriefingEventPalette.teal, BriefingEventPalette.green], startPoint: .leading, endPoint: .trailing)
                    .frame(width: width)
                Circle().fill(BriefingEventPalette.green)
                    .frame(width: 10, height: 10)
                    .offset(x: max(width - 10, 0))
            }
        }
        .frame(height: 5)
        .accessibilityHidden(true)
    }
}

// MARK: - Locked regional cards (`.data-field` + `.data-table`)

/// Compact Region / previous scan / current scan / Change card, as locked;
/// canonical units stay in the values (the locked unit correction) and the
/// change column carries the semantic tone.
struct DEXARegionCard: View {
    struct Row: Equatable {
        let label: String
        let previous: String
        let current: String
        let delta: String
    }

    let title: String
    let rows: [Row]
    let group: DEXADeltaSemantics.Group
    let goalType: String?
    var previousDate: String?
    var currentDate: String
    var firstColumn = "Region"

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .briefingText(.jn(14, 700))
                .foregroundStyle(BriefingEventPalette.ink)
                .accessibilityAddTraits(.isHeader)
            BriefingFractionLayout(fractions: [1.3, 1, 1, 1], spacing: 6) {
                header(firstColumn, alignment: .leading)
                header(previousDate.map(BriefingDateFormatting.monthDay) ?? "Previous", alignment: .trailing)
                header(BriefingDateFormatting.monthDay(currentDate), alignment: .trailing)
                header("Change", alignment: .trailing)
            }
            .padding(.vertical, 8)
            .padding(.top, 12)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                let tone = DEXADeltaSemantics.tone(delta: row.delta, label: row.label, group: group, goalType: goalType)
                BriefingFractionLayout(fractions: [1.3, 1, 1, 1], spacing: 6, centered: true) {
                    cell(row.label, alignment: .leading)
                    cell(row.previous, alignment: .trailing)
                    cell(row.current, alignment: .trailing)
                    cell(row.delta, alignment: .trailing, color: tone.color, weight: 800)
                }
                .padding(.vertical, 10)
                .briefingRule(.top, BriefingEventPalette.rule)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.label): from \(row.previous) to \(row.current), \(row.delta), \(tone.accessibilityWord)")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            BriefingAppearanceBackground {
                BriefingEventPalette.surface
            } light: {
                BriefingCSSGradient(angle: 135, stops: [.init(color: BriefingPalette.fixed(0xD7EAE5), location: 0), .init(color: BriefingPalette.fixed(0xE4E0EF), location: 1)])
            }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .padding(.top, 15)
        .accessibilityElement(children: .contain)
    }

    private func header(_ text: String, alignment: Alignment) -> some View {
        Text(text)
            .briefingText(.jn(8, 800, tracking: 0.08, uppercase: true))
            .foregroundStyle(BriefingEventPalette.muted)
            .frame(maxWidth: .infinity, alignment: alignment)
    }

    private func cell(_ text: String, alignment: Alignment, color: Color = BriefingEventPalette.ink, weight: CGFloat = 400) -> some View {
        Text(text)
            .briefingText(.jn(11, weight))
            .foregroundStyle(color)
            .multilineTextAlignment(alignment == .leading ? .leading : .trailing)
            .frame(maxWidth: .infinity, alignment: alignment)
            .fixedSize(horizontal: false, vertical: true)
    }
}
