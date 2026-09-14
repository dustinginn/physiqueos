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
    static let sectionInventory = ["Integrated Lead", "Energy", "Weight", "Training", "Body Composition", "Coach's Take"]
    let content: MidweekBriefingContent
    let confidence: BriefingConfidenceReadModel?

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            hero
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

    private var hero: some View {
        BriefingLeadCard(
            eyebrow: "MIDWEEK BRIEFING",
            rangeLabel: content.reportingRangeLabel,
            headline: content.heroVerdict,
            narrative: content.heroSummary,
            confidence: confidence
        )
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
                Text(weight.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
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
