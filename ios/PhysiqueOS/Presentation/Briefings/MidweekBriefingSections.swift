import SwiftUI

/// Midweek — the shortest recurring cadence — in the Founder-locked family:
/// Hero → Server-ordered modules (Energy, Weight, Body Composition,
/// Training) → Coach's Take (Biggest Takeaway, What To Do, What To Watch).
/// A bound V3 `presentationContract` supplies Server-owned module
/// inclusion/order, Goal/Phase, Confidence and coaching text; Native never
/// re-ranks modules, invents copy, or renders the concatenated
/// `narrativeV3.detail` in the hero. Frozen historical V2 artifacts (no
/// contract) keep their original Energy → Weight → Training → Body
/// Composition order. Midweek has no Sleep / Recovery card by design, and
/// the locked family has no "Still Unresolved" section.
struct MidweekBriefingSections: View {
    static let sectionInventory = ["Integrated Lead", "Energy", "Weight", "Training", "Body Composition", "Coach's Take"]
    static let canonicalV3SectionInventory = ["Integrated Lead", "Energy", "Weight", "Body Composition", "Training", "Coach's Take"]
    static let heroTypeLabel = "MIDWEEK BRIEFING"
    let content: MidweekBriefingContent
    let confidence: BriefingConfidenceReadModel?
    /// The artifact's canonical evidence window (Sunday–Tuesday).
    var evidenceWindow: BriefingEvidenceWindowReadModel? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            hero
            if let contract = content.presentationContract {
                ForEach(contract.modules) { module in
                    if module.included { contractModule(module) }
                }
                contractFinale(contract)
            } else if let narrative = content.narrativeV3 {
                // Contract-less canonical V3 compatibility path (unreachable
                // against current production, which always binds a
                // contract); keeps an older/partial payload readable.
                canonicalNarrativeSection(narrative)
                BriefingCoachFinale(takeaway: narrative.coachTake, recommendation: narrative.action, watch: narrative.watch)
            } else {
                if let energy = content.energy { BriefingEnergySection(section: energy, showsDailySemanticRows: true) }
                weightModule
                trainingModule
                bodyCompositionModule
                BriefingCoachFinale(
                    takeaway: content.coachTakeNarrative,
                    recommendation: content.coachRecommendation ?? "",
                    actionTitle: "Through Sunday",
                    actions: content.prioritiesThroughSunday
                )
            }
        }
        .accessibilityIdentifier("briefing.midweek")
    }

    private var hero: some View {
        BriefingHeroField(minHeight: 632) {
            BriefingHeroTopline(
                eyebrow: Self.heroTypeLabel,
                range: BriefingDateFormatting.heroRangeLabel(content.reportingRangeLabel)
            )
            if let heroConfidence {
                BriefingHeroConfidence(
                    score: heroConfidence.score,
                    band: heroConfidence.band,
                    movement: heroConfidence.movement,
                    reason: heroConfidence.reason,
                    ringDiameter: 158,
                    scoreSize: 39
                )
            }
            BriefingHeroStatement(
                headline: content.presentationContract?.lead.headline ?? content.narrativeV3?.summary ?? content.heroVerdict,
                meaning: heroNarrative,
                headlineSize: 32
            )
            if !heroFooterItems.isEmpty { BriefingHeroFooter(items: heroFooterItems) }
        }
    }

    /// When a bound contract is present, its `lead.meaning` is the whole
    /// hero body — including when the Server omits it. It must never fall
    /// through to `narrativeV3.detail` (the full concatenated Result /
    /// Meaning / Action / Watch / Confidence text). Only a contract-less
    /// payload uses the old `detail` / `heroSummary` fallback chain.
    var heroNarrative: String {
        if let contract = content.presentationContract {
            return contract.lead.meaning ?? ""
        }
        return content.narrativeV3?.detail.flatMap { $0.isEmpty ? nil : $0 } ??
            content.heroSummary
    }

    struct HeroConfidence: Equatable {
        let score: Int
        let band: String
        let movement: String
        let reason: String
    }

    /// One Confidence surface, exactly. With a bound contract it renders
    /// only if the Server included it, using the contract's own movement
    /// label and reason; it never falls through to an unrelated object.
    var heroConfidence: HeroConfidence? {
        if let contract = content.presentationContract {
            guard let lead = contract.lead.confidence else { return nil }
            return HeroConfidence(
                score: lead.score,
                band: lead.band,
                movement: lead.movementLabel ?? confidence.map(BriefingConfidenceCopy.movement) ?? "",
                reason: lead.reason ?? confidence?.primaryReason ?? ""
            )
        }
        guard let confidence else { return nil }
        return HeroConfidence(
            score: confidence.score,
            band: confidence.band,
            movement: BriefingConfidenceCopy.movement(confidence),
            reason: confidence.primaryReason
        )
    }

    /// Goal & Phase context (Server-owned names only).
    private var heroFooterItems: [(String, String)] {
        guard let lead = content.presentationContract?.lead else { return [] }
        switch (lead.goal?.name, lead.phase?.name) {
        case let (goal?, phase?): return [("Goal & Phase", "\(goal) · \(phase)")]
        case let (goal?, nil): return [("Goal", goal)]
        case let (nil, phase?): return [("Phase", phase)]
        case (nil, nil): return []
        }
    }

    @ViewBuilder
    private func contractModule(_ module: MidweekPresentationContract.Module) -> some View {
        switch module.id {
        case "energy":
            if let energy = content.energy {
                BriefingEnergySection(section: energy, showsDailySemanticRows: true, showsChart: module.chartIncluded == true)
            }
        case "weight": weightModule
        case "body_composition": bodyCompositionModule
        case "training": trainingModule
        default: EmptyView()
        }
    }

    @ViewBuilder
    private var weightModule: some View {
        if let weight = content.weight {
            BriefingWeightSection(
                value: String(format: "%.1f lb", weight.averageWeightLb),
                delta: "\(BriefingNumberFormatting.signed(weight.changeLb, decimals: 1)) lb",
                note: weightNote(weight)
            )
        } else if let narrative = content.weightContextNarrative, !narrative.isEmpty {
            BriefingNarrativeSection(glyph: "↕", label: "Weight Context", tone: .blue, text: narrative)
        }
    }

    /// The Server's weight narrative, or — when it published none — the
    /// canonical basis of the average: the evidence window's weekdays and
    /// the weight module's observation count (no new interpretation).
    func weightNote(_ weight: WeeklyWeightSection) -> String {
        if !weight.narrative.isEmpty { return weight.narrative }
        guard let count = content.presentationContract?.modules.first(where: { $0.id == "weight" })?.observationCount,
              let window = evidenceWindow else { return "" }
        let start = BriefingEnergySection.fullWeekday(window.startDate, fallback: nil)
        let end = BriefingEnergySection.fullWeekday(window.endDate, fallback: nil)
        let days = start == end ? start : "\(start)–\(end)"
        return "\(days) average · \(count) \(count == 1 ? "observation" : "observations")"
    }

    @ViewBuilder
    private var trainingModule: some View {
        if let training = content.training {
            BriefingTrainingResponseCard(training: training, joinsHeadlineIntoDetail: true, showsCoverageLegend: true)
        } else if let narrative = content.trainingResponseNarrative, !narrative.isEmpty {
            BriefingNarrativeSection(glyph: "◆", label: "Training Response", tone: .green, text: narrative)
        }
    }

    @ViewBuilder
    private var bodyCompositionModule: some View {
        if let body = content.bodyComposition {
            BriefingBodyCompositionSection(
                scanDate: body.scanDate,
                bodyFat: body.bodyFatPercent,
                leanMass: body.leanMassLb,
                fatMass: body.fatMassLb,
                narrative: body.narrative
            )
        }
    }

    /// Coach's Take from the Server's coaching items: coachTake → Biggest
    /// Takeaway, action → What To Do, watch → What To Watch. When the
    /// contract suppresses its coachTake slot, the artifact's own canonical
    /// Narrative V3 coachTake fills Biggest Takeaway verbatim (the locked
    /// Midweek finale); nothing is written by Native.
    func finaleSlots(_ contract: MidweekPresentationContract) -> (takeaway: String, action: String, watch: String?) {
        let bySection = Dictionary(contract.coaching.map { ($0.section, $0.text) }, uniquingKeysWith: { _, latest in latest })
        let takeaway = bySection["coachTake"] ?? content.narrativeV3?.coachTake ?? ""
        return (takeaway, bySection["action"] ?? "", bySection["watch"])
    }

    private func contractFinale(_ contract: MidweekPresentationContract) -> some View {
        let slots = finaleSlots(contract)
        return BriefingCoachFinale(takeaway: slots.takeaway, recommendation: slots.action, watch: slots.watch)
    }

    private func canonicalNarrativeSection(_ narrative: CanonicalNarrativeV3ReadModel) -> some View {
        BriefingSection(identifier: "briefing.section.narrative") {
            BriefingSectionHead(glyph: "◇", label: "This Week So Far", tone: .purple)
            ForEach([("Result", narrative.result), ("What It Means", narrative.meaning), ("Confidence", narrative.confidence)].filter { !$0.1.isEmpty }, id: \.0) { item in
                BriefingLabeledParagraph(label: item.0, text: item.1)
            }
        }
    }
}

/// A section whose canonical content is narrative only.
struct BriefingNarrativeSection: View {
    let glyph: String
    let label: String
    let tone: BriefingTone
    let text: String

    var body: some View {
        BriefingSection {
            BriefingSectionHead(glyph: glyph, label: label, tone: tone)
            BriefingBodyCopy(text: text, top: 14)
        }
    }
}

/// Small tracked label above a 15 px paragraph.
struct BriefingLabeledParagraph: View {
    @Environment(\.briefingPalette) private var c
    let label: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .briefingText(.j(10, 800, tracking: 0.08))
                .foregroundStyle(c.muted)
            BriefingParagraph(text, .j(15, 400), color: c.secondary)
        }
        .padding(.top, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
