import SwiftUI

/// DEXA Event Briefing's complete verified section order
/// (`DEXAEventBriefingScreen.jsx`): Hero (title/body/results grid/optional
/// milestones) → Snapshot → Progress (Since-Last-Scan headline, Regional
/// Fat Change, Regional Lean Change, Other Notable Changes, the amber "Cut
/// Timeline" module) → Interpretation → Coach's Insight → optional
/// read-only Phase Review → optional Goal Completion Handoff CTA.
///
/// The web DEXA Event capture includes the persisted goal-confidence block
/// inside the hero, so Native renders that same score, band, movement, and
/// primary reason alongside the headline metrics.
///
/// Deliberately does NOT render a forecast section or any chart
/// interaction — verified: no forecast fields are rendered on the real
/// screen, and the "Cut Timeline" point grid is static (no hover/tap), so
/// this view does not reuse `ChartInteraction.swift`'s scrub gesture.
struct DEXABriefingSections: View {
    static let sectionInventory = ["Hero", "Current Scan", "What Measurably Changed", "Since Last Scan", "Regional Fat Change", "Measured Lean Tissue Change", "Other Notable Changes", "Cut Timeline", "What This Scan Means", "Coach's Insight", "Phase Review", "Goal Completion Handoff"]
    static let heroMetricPresentationStyle = "semantic-two-by-two"
    static let inlineComparisonSectionTitles = ["Regional Fat Change", "Measured Lean Tissue Change", "Other Notable Changes"]
    let content: DEXABriefingContent
    let confidence: BriefingConfidenceReadModel?
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 30) {
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
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent, background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 10) {
                    IconBadge(systemImage: "scope", color: .primary, size: .md, isCircular: false)
                    Text("DEXA EVENT BRIEFING")
                        .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                }
                Text(content.hero.title)
                    .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.hero.body)
                    .physiqueOSFont(PhysiqueOSTypography.editorialBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if let confidence {
                    HStack(alignment: .center, spacing: 18) {
                        ConfidenceRing(value: confidence.score, size: 112, lineWidth: 8)
                        VStack(alignment: .leading, spacing: 7) {
                            Text(confidence.bandLabel.uppercased())
                                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                            Text(confidence.movementLabel)
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(confidence.primaryReason)
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(content.hero.results) { result in
                        heroMetric(result)
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
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 18) {
                Text("SNAPSHOT")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                BriefingEditorialHeading(title: "Current Scan")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
                    snapshotMetric("Date", BriefingDateFormatting.shortDate(content.scanDate))
                    snapshotMetric("Interval", "\(content.daysBetweenScans) days")
                    snapshotMetric("DEXA Weight", content.snapshot.weightLb)
                    snapshotMetric("Body Fat", content.snapshot.bodyFatPercent)
                    snapshotMetric("Fat Mass", content.snapshot.fatMassLb)
                    snapshotMetric("Lean Tissue", content.snapshot.leanMassLb)
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
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
            VStack(alignment: .leading, spacing: 22) {
                BriefingEditorialHeading(title: "What Measurably Changed")

                comparisonGroup(title: "Since Last Scan", items: content.progress.headline)
                if !content.progress.regionalFat.isEmpty {
                    regionalGroup(title: "Regional Fat Change", items: content.progress.regionalFat)
                }
                if !content.progress.regionalLean.isEmpty {
                    regionalGroup(title: "Measured Lean Tissue Change", items: content.progress.regionalLean)
                }
                if !content.progress.supplemental.isEmpty {
                    supplementalGroup(title: "Other Notable Changes", items: content.progress.supplemental)
                }
                cutTimelineModule(content.progress.timeline)
            }
        }
    }

    private func comparisonGroup(title: String, items: [DEXAComparisonMetric]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
                .accessibilityIdentifier(title == "Regional Fat Change" ? "briefing.dexa.regionalFat" : title == "Measured Lean Tissue Change" ? "briefing.dexa.regionalLean" : "briefing.dexa.supplemental")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(items) { item in
                    VStack(alignment: .leading, spacing: 12) {
                        Text(item.label)
                            .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                        Text(item.delta)
                            .physiqueOSFont(PhysiqueOSTypography.editorialMetric)
                            .foregroundStyle(deltaColor(item.delta))
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                        HStack(alignment: .center, spacing: 7) {
                            comparisonValue("Previous", item.previous)
                            Image(systemName: directionSymbol(item.delta))
                                .foregroundStyle(deltaColor(item.delta))
                            comparisonValue("Current", item.current)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, minHeight: 142, alignment: .topLeading)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(item.label): from \(item.previous) to \(item.current), a change of \(item.delta)")
                }
            }
        }
    }

    private func regionalGroup(title: String, items: [DEXARegionalChangeMetric]) -> some View {
        comparisonRows(
            title: title,
            items: items.map { DEXAInlineComparisonRow(label: $0.region, previous: $0.previous, current: $0.current, delta: $0.delta) }
        )
    }

    private func supplementalGroup(title: String, items: [DEXAComparisonMetric]) -> some View {
        comparisonRows(
            title: title,
            items: items.map { DEXAInlineComparisonRow(label: $0.label, previous: $0.previous, current: $0.current, delta: $0.delta) }
        )
    }

    private func comparisonRows(title: String, items: [DEXAInlineComparisonRow]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            VStack(spacing: 0) {
                HStack(spacing: 6) {
                    comparisonColumnHeader("Metric", width: nil, alignment: .leading)
                    comparisonColumnHeader("Previous", width: 58, alignment: .trailing)
                    comparisonColumnHeader("", width: 18, alignment: .center)
                    comparisonColumnHeader("Current", width: 58, alignment: .leading)
                    comparisonColumnHeader("Delta", width: 62, alignment: .trailing)
                }
                .padding(.bottom, 8)
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    if index > 0 { Divider().overlay(PhysiqueOSTheme.divider) }
                    HStack(spacing: 6) {
                        Text(item.label)
                            .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(item.previous)
                            .frame(width: 58, alignment: .trailing)
                        Image(systemName: directionSymbol(item.delta))
                            .frame(width: 18)
                            .foregroundStyle(deltaColor(item.delta))
                        Text(item.current)
                            .frame(width: 58, alignment: .leading)
                        Text(item.delta)
                            .frame(width: 62, alignment: .trailing)
                            .foregroundStyle(deltaColor(item.delta))
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .padding(.vertical, 12)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(item.label): from \(item.previous) to \(item.current), a change of \(item.delta)")
                }
            }
        }
    }

    private func comparisonColumnHeader(_ text: String, width: CGFloat?, alignment: Alignment) -> some View {
        Text(text)
            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
            .foregroundStyle(PhysiqueOSTheme.textMuted)
            .frame(width: width, alignment: alignment)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: alignment)
    }

    /// Verified non-interactive on the real screen — a static per-scan
    /// point grid, no hover/tap/tooltip, so this deliberately does not use
    /// `ChartInteraction.swift`'s scrub gesture.
    private func cutTimelineModule(_ timeline: DEXACutTimeline) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 6) {
                Text(timeline.timelineLabel.uppercased())
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .accessibilityIdentifier("briefing.dexa.timeline")
                if timeline.isSimulated { StatusChip(text: "Simulated", color: .warning) }
                Spacer(minLength: 0)
                Text("\(timeline.elapsedDays) days · \(timeline.scans.count) body-composition scans")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            HStack {
                Text(BriefingDateFormatting.shortDate(timeline.baselineDate))
                Spacer()
                Image(systemName: "arrow.right")
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Spacer()
                Text(BriefingDateFormatting.shortDate(timeline.currentDate))
            }
            .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
            .foregroundStyle(PhysiqueOSTheme.textMuted)
            ForEach(timeline.metrics) { metric in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(metric.label)
                            .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer(minLength: 8)
                        Text(metric.delta)
                            .physiqueOSFont(PhysiqueOSTypography.briefingSecondaryValue)
                            .foregroundStyle(metric.delta.hasPrefix("-") ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.chartEffort)
                    }
                    HStack(alignment: .firstTextBaseline) {
                        Text(metric.points.first?.value ?? "—")
                        Spacer()
                        Text(metric.points.last?.value ?? "—")
                    }
                    .physiqueOSFont(PhysiqueOSTypography.editorialMetric)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .padding(12)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            Text(timeline.summary)
                .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .padding(12)
        .background(PhysiqueOSTheme.chartEffort.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }

    private var interpretationCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 18) {
                BriefingEditorialHeading(title: "What This Scan Means")
                    .accessibilityIdentifier("briefing.dexa.interpretation")
                Text(content.interpretation.opening)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                labeledParagraph(content.fatLossInterpretationLabel, content.interpretation.fatLoss)
                labeledParagraph("Lean Tissue", content.interpretation.leanMass)
                labeledParagraph("Where Change Occurred", content.interpretation.regional)
                if let phaseMeaning = content.interpretation.phaseMeaning {
                    labeledParagraph("Phase & Strategy", phaseMeaning)
                }
                if let stoodOut = content.interpretation.stoodOut {
                    labeledParagraph("What Stood Out", stoodOut)
                }
                labeledParagraph("Supporting Context", content.interpretation.supportingEvidence)
                labeledParagraph("Uncertainty", content.interpretation.uncertainty)
            }
        }
    }

    private func labeledParagraph(_ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(text)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted.opacity(0.55))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func snapshotMetric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func heroMetric(_ result: DEXAHeroResult) -> some View {
        let tint = heroMetricColor(result.label)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(result.emoji)
                    .font(.system(size: 18))
                    .frame(width: 36, height: 36)
                    .background(tint.opacity(0.16))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                Text(result.label)
                    .physiqueOSFont(PhysiqueOSTypography.briefingLabel)
                    .foregroundStyle(tint)
            }
            Text(result.value)
                .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .lineLimit(1)
            Text(result.context)
                .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 174, alignment: .topLeading)
        .background(tint.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: 17))
        .overlay(RoundedRectangle(cornerRadius: 17).strokeBorder(tint.opacity(0.42), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(result.label): \(result.value), \(result.context)")
    }

    private func heroMetricColor(_ label: String) -> Color {
        let normalized = label.lowercased()
        if normalized.contains("lean") { return PhysiqueOSTheme.chartEvidence }
        if normalized.contains("body fat") { return PhysiqueOSTheme.chartEffort }
        if normalized.contains("fat mass") { return PhysiqueOSTheme.macroProtein }
        if normalized.contains("weight") { return PhysiqueOSTheme.accent }
        return PhysiqueOSTheme.chartSuccess
    }

    private func comparisonValue(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
    }

    private func deltaColor(_ delta: String) -> Color {
        if delta.hasPrefix("-") { return PhysiqueOSTheme.chartSuccess }
        if delta.hasPrefix("0") || delta.hasPrefix("No") { return PhysiqueOSTheme.textMuted }
        return PhysiqueOSTheme.chartEffort
    }

    private func directionSymbol(_ delta: String) -> String {
        if delta.hasPrefix("-") { return "arrow.down" }
        if delta.hasPrefix("0") || delta.hasPrefix("No") { return "arrow.right" }
        return "arrow.up"
    }

    private var coachInsightCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort, background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 18) {
                BriefingEditorialHeading(title: "Coach's Insight")
                    .accessibilityIdentifier("briefing.dexa.coachInsight")
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
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort) {
            VStack(alignment: .leading, spacing: 16) {
                BriefingEditorialHeading(title: "Phase Review")
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
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
            VStack(alignment: .leading, spacing: 16) {
                BriefingEditorialHeading(title: "One Qualified Check Remains")
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

private struct DEXAInlineComparisonRow {
    let label: String
    let previous: String
    let current: String
    let delta: String
}
