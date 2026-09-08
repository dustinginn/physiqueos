import SwiftUI

/// Midweek Briefing's complete verified section order — genuinely distinct
/// from Weekly, NOT a reskinned template (verified: own service, own
/// screen, its own smaller surface): Hero Verdict/Summary → Energy Balance
/// → Weight Context → Training Response → Body Composition → Coach's Take.
/// No Photos section, nothing navigable but the shared back-to-history
/// link in the Detail header above this content. Confidence here is a pure
/// read-through passthrough of whatever is already current (verified:
/// Midweek never computes or refreshes it) — Native renders it exactly as
/// received, same as every other cadence, with no special-cased logic.
struct MidweekBriefingSections: View {
    static let sectionInventory = ["Hero", "Goal Confidence", "Training", "Weight", "Energy", "Body Composition", "Coach's Take"]
    let content: MidweekBriefingContent
    let confidence: BriefingConfidenceReadModel?

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            hero
            if let confidence { BriefingConfidenceCard(confidence: confidence) }
            if let energy = content.energy { WeeklyEnergyCard(section: energy) }
            if let weightContextNarrative = content.weightContextNarrative {
                narrativeCard(title: "Weight Context", text: weightContextNarrative)
            }
            if let trainingResponseNarrative = content.trainingResponseNarrative {
                narrativeCard(title: "Training Response", text: trainingResponseNarrative)
            }
            if let bodyComposition = content.bodyComposition { bodyCompositionCard(bodyComposition) }
            coachTakeCard
        }
    }

    private var hero: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort, background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 16) {
                Text(content.reportingRangeLabel.uppercased())
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Text(content.heroVerdict)
                    .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.heroSummary)
                    .physiqueOSFont(PhysiqueOSTypography.editorialBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private func narrativeCard(title: String, text: String) -> some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort) {
            VStack(alignment: .leading, spacing: 16) {
                BriefingEditorialHeading(title: title)
                Text(text)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
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
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent, background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 16) {
                BriefingEditorialHeading(title: "Coach's Take")
                Text(content.coachTakeNarrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if !content.prioritiesThroughSunday.isEmpty {
                    BriefingNarrativeList(title: "Priorities Through Sunday", items: content.prioritiesThroughSunday)
                }
            }
        }
    }
}
