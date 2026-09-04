import SwiftUI

/// DEXA Event Briefing's complete verified section order
/// (`DEXAEventBriefingScreen.jsx`): Hero (title/body/results grid/optional
/// milestones) → Snapshot → Progress (Since-Last-Scan headline, Regional
/// Fat Change, Regional Lean Change, Other Notable Changes, the amber "Cut
/// Timeline" module) → Interpretation → Coach's Insight → optional
/// read-only Phase Review → optional Goal Completion Handoff CTA.
///
/// Deliberately does NOT render a Confidence card — verified against
/// source: the real screen checks `hero.confidence`, which the real
/// narrative composer never sets (Confidence instead lives, unrendered, at
/// `narrative.goalConfidence`), so no Confidence ring ever appears on the
/// real production or historical DEXA screen. See
/// `BriefingReadModel.confidence`'s doc comment.
///
/// Deliberately does NOT render a forecast section or any chart
/// interaction — verified: no forecast fields are rendered on the real
/// screen, and the "Cut Timeline" point grid is static (no hover/tap), so
/// this view does not reuse `ChartInteraction.swift`'s scrub gesture.
struct DEXABriefingSections: View {
    let content: DEXABriefingContent
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            hero
            snapshotCard
            progressCard
            interpretationCard
            coachInsightCard
            if let phaseReview = content.phaseReview { phaseReviewCard(phaseReview) }
            if let handoff = content.goalCompletionHandoff { goalCompletionCard(handoff) }
        }
    }

    private var hero: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                Text(content.hero.title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.hero.body)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(content.hero.results) { result in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(result.emoji) \(result.label)")
                                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                            Text(result.value)
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(result.context)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(PhysiqueOSTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(result.label): \(result.value), \(result.context)")
                    }
                }
                if !content.hero.milestones.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(content.hero.milestones, id: \.self) { milestone in
                            HStack(alignment: .top, spacing: 6) {
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                                Text(milestone)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(PhysiqueOSTheme.chartSuccess.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private var snapshotCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Current Scan") {
                    Text(BriefingDateFormatting.shortDate(content.scanDate))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    BriefingStatItem(label: "Interval", value: "\(content.daysBetweenScans) days")
                    BriefingStatItem(label: "DEXA Weight", value: content.snapshot.weightLb)
                    BriefingStatItem(label: "Body Fat", value: content.snapshot.bodyFatPercent)
                    BriefingStatItem(label: "Fat Mass", value: content.snapshot.fatMassLb)
                    BriefingStatItem(label: "Lean Tissue", value: content.snapshot.leanMassLb)
                }
                if let rmr = content.snapshot.restingMetabolicRateKcal {
                    Text("Estimated RMR: \(rmr) cal/day")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
    }

    private var progressCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 14) {
                SectionHeading("What Measurably Changed")

                comparisonGroup(title: "Since Last Scan", items: content.progress.headline)
                if !content.progress.regionalFat.isEmpty {
                    regionalGroup(title: "Regional Fat Change", items: content.progress.regionalFat)
                }
                if !content.progress.regionalLean.isEmpty {
                    regionalGroup(title: "Measured Lean Tissue Change", items: content.progress.regionalLean)
                }
                if !content.progress.supplemental.isEmpty {
                    comparisonGroup(title: "Other Notable Changes", items: content.progress.supplemental)
                }
                cutTimelineModule(content.progress.timeline)
            }
        }
    }

    private func comparisonGroup(title: String, items: [DEXAComparisonMetric]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            VStack(spacing: 4) {
                ForEach(items) { item in
                    HStack {
                        Text(item.label)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        Spacer(minLength: 8)
                        Text("\(item.previous) → \(item.current)")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(item.delta)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(item.delta.hasPrefix("-") ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.chartEffort)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(item.label): from \(item.previous) to \(item.current), a change of \(item.delta)")
                }
            }
        }
    }

    private func regionalGroup(title: String, items: [DEXARegionalChangeMetric]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            VStack(spacing: 4) {
                ForEach(items) { item in
                    HStack {
                        Text(item.region)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        Spacer(minLength: 8)
                        Text("\(item.previous) → \(item.current)")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(item.delta)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(item.delta.hasPrefix("-") ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.chartEffort)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(item.region): from \(item.previous) to \(item.current), a change of \(item.delta)")
                }
            }
        }
    }

    /// Verified non-interactive on the real screen — a static per-scan
    /// point grid, no hover/tap/tooltip, so this deliberately does not use
    /// `ChartInteraction.swift`'s scrub gesture.
    private func cutTimelineModule(_ timeline: DEXACutTimeline) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(timeline.timelineLabel.uppercased())
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if timeline.isSimulated { StatusChip(text: "Simulated", color: .warning) }
                Spacer(minLength: 0)
                Text("\(timeline.elapsedDays) days")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            ForEach(timeline.metrics) { metric in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(metric.label)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer(minLength: 8)
                        Text(metric.delta)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(metric.delta.hasPrefix("-") ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.chartEffort)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(metric.points) { point in
                                VStack(spacing: 2) {
                                    Text(BriefingDateFormatting.shortDate(point.date))
                                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                                    Text(point.value)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                }
                                .padding(8)
                                .background(PhysiqueOSTheme.surfaceMuted)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                }
            }
            Text(timeline.summary)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .padding(12)
        .background(PhysiqueOSTheme.chartEffort.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }

    private var interpretationCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("What This Scan Means")
                Text(content.interpretation.opening)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                labeledParagraph(content.interpretation.primaryLabel, content.interpretation.primaryText)
                labeledParagraph("Lean Tissue", content.interpretation.leanMassText)
                labeledParagraph("Where Change Occurred", content.interpretation.regionalText)
                if let phaseMeaning = content.interpretation.phaseMeaning {
                    labeledParagraph("Phase & Strategy", phaseMeaning)
                }
                if let stoodOut = content.interpretation.stoodOut {
                    labeledParagraph("What Stood Out", stoodOut)
                }
                labeledParagraph("Supporting Context", content.interpretation.supportingEvidenceText)
                labeledParagraph("Uncertainty", content.interpretation.uncertaintyText)
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
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }

    private var coachInsightCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("Coach's Insight")
                labeledParagraph("🎉 Biggest Win", content.coachInsight.biggestWin)
                labeledParagraph("💪 Protect", content.coachInsight.protect)
                labeledParagraph("👀 What to Watch", content.coachInsight.watch)
                labeledParagraph("🎯 Next Actions", content.coachInsight.next)
            }
        }
    }

    /// Always read-only — mirrors the historical replay route's real
    /// behavior exactly (see `DEXAPhaseReviewSummary`'s doc comment).
    private func phaseReviewCard(_ review: DEXAPhaseReviewSummary) -> some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Phase Review")
                Text(review.title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(review.promptText)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if let recorded = review.recordedDecisionLabel {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        Text("This Phase Review decision has been recorded: \(recorded)")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(review.options, id: \.self) { option in
                            Text("• \(option)")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                }
            }
        }
    }

    private func goalCompletionCard(_ handoff: DEXAGoalCompletionHandoff) -> some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading("One Qualified Check Remains")
                Text(handoff.questionText)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Button {
                    onNavigate(handoff.actionDestination)
                } label: {
                    Text(handoff.actionLabel)
                        .physiqueOSFont(PhysiqueOSTypography.primaryActionLabel)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(PhysiqueOSTheme.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }
}
