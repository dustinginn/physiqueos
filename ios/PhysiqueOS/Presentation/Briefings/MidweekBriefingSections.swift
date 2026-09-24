import SwiftUI

/// Midweek remains the short briefing cadence, restored to the established
/// pre-V3 format standard (verified: last accepted screen `684a51c2`,
/// shipped through Build 40 `cda5603d`) — Hero → Energy → Weight → Body
/// Composition → Training → Still Unresolved (≤2, Server-bounded) →
/// Coach's Take finale. A bound V3 `presentationContract` supplies
/// Server-owned module inclusion/order, Goal/Phase, Confidence, and
/// coaching text into that same standard; Native never re-ranks modules,
/// invents copy, or renders the full concatenated `narrativeV3.detail` in
/// the hero. Frozen historical V2 artifacts (no contract, no narrativeV3)
/// retain their original, denser Energy → Weight → Training → Body
/// Composition presentation untouched. Confidence is always a read-through
/// passthrough; Native never computes or refreshes it, and it renders at
/// most once per screen.
struct MidweekBriefingSections: View {
    static let sectionInventory = ["Integrated Lead", "Energy", "Weight", "Training", "Body Composition", "Coach's Take"]
    static let canonicalV3SectionInventory = ["Integrated Lead", "Energy", "Weight", "Body Composition", "Training", "Still Unresolved", "Coach's Take"]
    static let heroTypeLabel = "MIDWEEK BRIEFING"
    let content: MidweekBriefingContent
    let confidence: BriefingConfidenceReadModel?

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            hero
            if let contract = content.presentationContract {
                ForEach(contract.modules) { module in
                    if module.included { contractModule(module) }
                }
                let unresolved = Array(contract.uncertainty.visibleItems.prefix(2))
                if !unresolved.isEmpty {
                    BriefingUncertaintyCard(items: unresolved)
                }
                contractFinale(contract)
            } else if let narrative = content.narrativeV3 {
                // Contract-less canonical V3 compatibility path. Unreachable
                // against current production (which always publishes a
                // bound presentationContract); retained as a fail-safe so an
                // older/partial payload still renders the Server narrative
                // rather than crashing.
                canonicalNarrativeCard(narrative)
                BriefingUncertaintyCard(items: content.uncertainty)
                canonicalCoachTakeCard(narrative.coachTake)
            } else {
                if let energy = content.energy { WeeklyEnergyCard(section: energy, showsDailySemanticRows: true) }
                if let weight = content.weight {
                    weeklyWeightCard(weight)
                } else if let weightContextNarrative = content.weightContextNarrative {
                    narrativeCard(title: "Weight Context", text: weightContextNarrative)
                }
                if let training = content.training {
                    BriefingTrainingResponseCard(training: training)
                } else if let trainingResponseNarrative = content.trainingResponseNarrative {
                    narrativeCard(title: "Training Response", text: trainingResponseNarrative)
                }
                if let bodyComposition = content.bodyComposition { bodyCompositionCard(bodyComposition) }
                coachTakeCard
            }
        }
    }

    private var hero: some View {
        BriefingLeadCard(
            eyebrow: Self.heroTypeLabel,
            rangeLabel: BriefingDateFormatting.humanizedPeriodLabel(content.reportingRangeLabel),
            headline: content.presentationContract?.lead.headline ??
                content.narrativeV3?.summary ?? content.heroVerdict,
            narrative: heroNarrative,
            confidence: heroConfidence,
            footerItems: heroFooterItems
        )
    }

    /// When a bound contract is present, its `lead.meaning` is the whole
    /// hero body — including when the Server omits it (deduplicated
    /// against the headline). It must never fall through to
    /// `narrativeV3.detail`: that is the full concatenated Result/Meaning/
    /// Action/Watch/Confidence text this screen exists to stop showing in
    /// the hero. Only a contract-less payload (legacy compatibility path)
    /// uses the old `detail` / `heroSummary` fallback chain.
    /// Internal (not `private`) so tests can assert this exact fixed
    /// invariant directly — that an absent `lead.meaning` never falls
    /// through to `narrativeV3.detail` when a contract is present — rather
    /// than through a source-text pattern match.
    var heroNarrative: String {
        if let contract = content.presentationContract {
            return contract.lead.meaning ?? ""
        }
        return content.narrativeV3?.detail.flatMap { $0.isEmpty ? nil : $0 } ??
            content.heroSummary
    }

    /// One Confidence surface, exactly. When a bound V3 contract is present,
    /// Confidence renders only if the Server included it in the contract;
    /// it never falls through to an unrelated/legacy Confidence object.
    private var heroConfidence: BriefingConfidenceReadModel? {
        guard let contract = content.presentationContract else { return confidence }
        return contract.lead.confidence != nil ? confidence : nil
    }

    /// Compact Goal/Phase context in the established lead-footer slot
    /// (the same convention Weekly/Monthly already use). Server-owned
    /// names only; Native never synthesizes Goal/Phase meaning.
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
                WeeklyEnergyCard(
                    section: energy, showsDailySemanticRows: true,
                    showsChart: module.chartIncluded == true
                )
            }
        case "weight":
            if let weight = content.weight {
                weeklyWeightCard(weight)
            } else if let narrative = content.weightContextNarrative,
                      !narrative.isEmpty {
                narrativeCard(title: "Weight Context", text: narrative)
            }
        case "body_composition":
            if let body = content.bodyComposition {
                bodyCompositionCard(body)
            }
        case "training":
            if let training = content.training {
                BriefingTrainingResponseCard(training: training)
            } else if let narrative = content.trainingResponseNarrative,
                      !narrative.isEmpty {
                narrativeCard(title: "Training Response", text: narrative)
            }
        default:
            EmptyView()
        }
    }

    /// The established purple Coach's Take finale, filled from the
    /// Server's coaching items rather than legacy priority semantics:
    /// coachTake -> Biggest Takeaway, action -> My Recommendation,
    /// watch -> What To Watch (replacing the legacy Through-Sunday list,
    /// which V3 does not publish).
    private func contractFinale(_ contract: MidweekPresentationContract) -> some View {
        // The mapper's decode-time guard already enforces unique sections,
        // but `uniqueKeysWithValues:` traps at runtime on any violation —
        // building this defensively (last write wins) keeps a decode-layer
        // regression a rendering quirk, not a crash.
        let bySection = Dictionary(contract.coaching.map { ($0.section, $0.text) }, uniquingKeysWith: { _, latest in latest })
        return BriefingCoachFinale(
            takeaway: bySection["coachTake"] ?? "",
            recommendation: bySection["action"] ?? "",
            watch: bySection["watch"]
        )
    }

    private func canonicalNarrativeCard(_ narrative: CanonicalNarrativeV3ReadModel) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 16) {
                canonicalNarrativeSection("Result", narrative.result)
                canonicalNarrativeSection("What It Means", narrative.meaning)
                canonicalNarrativeSection("What To Do", narrative.action)
                canonicalNarrativeSection("What To Watch", narrative.watch)
                canonicalNarrativeSection("Confidence", narrative.confidence)
            }
        }
    }

    private func canonicalNarrativeSection(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(text)
                .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }

    private func canonicalCoachTakeCard(_ text: String) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 8) {
                Text("COACH'S TAKE")
                    .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(text)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
            }
        }
    }

    private func narrativeCard(title: String, text: String) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort) {
            VStack(alignment: .leading, spacing: 16) {
                BriefingEditorialHeading(title: title)
                Text(text)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
        }
    }

    private func weeklyWeightCard(_ weight: WeeklyWeightSection) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEvidence) {
            VStack(alignment: .leading, spacing: 18) {
                BriefingEditorialHeading(title: "Weight Context")
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(String(format: "%.1f lb", weight.averageWeightLb))
                        .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(String(format: "%@%.1f lb", weight.changeLb >= 0 ? "+" : "", weight.changeLb))
                        .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                        .foregroundStyle(PhysiqueOSTheme.chartEvidence)
                }
                if !weight.narrative.isEmpty {
                    Text(weight.narrative)
                        .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
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
                    midweekMetric("Body Fat", body.bodyFatPercent)
                    midweekMetric("Lean Mass", body.leanMassLb)
                    midweekMetric("Fat Mass", body.fatMassLb)
                }
                Text(body.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private var coachTakeCard: some View {
        BriefingCoachFinale(
            takeaway: content.coachTakeNarrative,
            recommendation: content.coachRecommendation ?? "",
            actionTitle: "Through Sunday",
            actions: content.prioritiesThroughSunday
        )
    }

    private func midweekMetric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.accent)
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
