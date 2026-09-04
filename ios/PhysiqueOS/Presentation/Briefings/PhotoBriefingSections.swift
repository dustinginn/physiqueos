import SwiftUI

/// Photo Event Briefing's complete verified section order
/// (`PhotoEventBriefingScreen.jsx`): Hero → Snapshot (facts + the
/// session's own capture-photo grid) → Progress (one of three mutually
/// exclusive branches: completion-journey comparisons, ordinary
/// comparisons, or a plain text-only card) → Interpretation → Coach's
/// Insight → optional Completion Decision.
///
/// Deliberately does NOT render a Confidence card, a forecast section, or
/// a Phase Review card — verified against source: this screen has no
/// `PhaseReviewCard` at all (unlike DEXA), and Confidence is computed/
/// persisted but never wired to render on the real screen either (same
/// verified gap as DEXA — see `BriefingReadModel.confidence`'s doc
/// comment).
///
/// No real photo media exists in this pass (see `ProgressPhotoTile`'s doc
/// comment) — the real screen's full-screen pinch-zoom `PhotoViewer` modal
/// is therefore not ported (nothing real to zoom into yet); tapping a
/// photo tile instead pushes the existing Progress Photos Evidence detail
/// screen (`.photoSetDetail(setId:)`) for this exact same canonical
/// session, which already provides pose-to-pose paging — reusing existing
/// navigation rather than building a second, redundant pager for
/// placeholder content.
struct PhotoBriefingSections: View {
    let content: PhotoBriefingContent
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            hero
            snapshotCard
            progressCard
            interpretationCard
            coachInsightCard
            if let experience = content.completionExperience {
                completionDecisionCard(experience.decision)
            }
        }
    }

    private var hero: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                Text("PHOTO EVENT")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Text(content.heroTitle)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.heroBody)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private var snapshotCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading(content.snapshotTitle)
                HStack(spacing: 16) {
                    BriefingStatItem(label: "Date", value: BriefingDateFormatting.shortDate(content.eventDate))
                    BriefingStatItem(label: "Set", value: content.completionLabel)
                    BriefingStatItem(label: "Weight", value: content.weightLabel)
                }
                Text(content.poseLabels.joined(separator: " · "))
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.conditionsSummary)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                photoGrid
            }
        }
    }

    private var photoGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(content.activeViews) { view in
                Button {
                    onNavigate(.photoSetDetail(setId: view.setId))
                } label: {
                    ProgressPhotoTile(roleLabel: view.poseId.label)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(view.poseId.label) photo, open in Progress Photos")
            }
        }
    }

    @ViewBuilder
    private var progressCard: some View {
        if let experience = content.completionExperience {
            completionComparisonsCard(experience)
        } else if !content.ordinaryComparisons.isEmpty {
            ordinaryComparisonsCard
        } else {
            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 8) {
                    SectionHeading(content.progressTitle)
                    Text(content.progressBody)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private var ordinaryComparisonsCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading(content.progressTitle)
                comparisonList(content.ordinaryComparisons)
            }
        }
    }

    /// "Since last check-in" + "From first upload to now" + New Baselines
    /// — verified this branch is mutually exclusive with the ordinary
    /// comparisons branch above.
    private func completionComparisonsCard(_ experience: PhotoCompletionExperience) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            if !experience.recentComparisons.isEmpty {
                CardContainer(padding: .md) {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeading("Since Last Check-In")
                        comparisonList(experience.recentComparisons)
                    }
                }
            }
            if !experience.journeyComparisons.isEmpty {
                CardContainer(padding: .md) {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeading("From First Upload to Now")
                        comparisonList(experience.journeyComparisons)
                    }
                }
            }
            if !experience.newBaselines.isEmpty {
                CardContainer(padding: .md) {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionHeading("New Baselines")
                        ForEach(experience.newBaselines) { baseline in
                            Text("\(baseline.poseId.label): \(baseline.narrative)")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                }
            }
        }
    }

    private func comparisonList(_ entries: [PhotoComparisonEntry]) -> some View {
        VStack(spacing: 10) {
            ForEach(entries) { entry in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        if let roleLabel = entry.roleLabel {
                            StatusChip(text: roleLabel, color: .primary)
                        }
                        Text(entry.poseId.label)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer(minLength: 8)
                        if let priorDate = entry.priorDate {
                            Text("\(BriefingDateFormatting.shortDate(priorDate)) → \(BriefingDateFormatting.shortDate(entry.currentDate))")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                    }
                    HStack(spacing: 8) {
                        ProgressPhotoTile(roleLabel: "Previous", caption: entry.priorDate.map(BriefingDateFormatting.shortDate))
                        ProgressPhotoTile(roleLabel: "Current", caption: BriefingDateFormatting.shortDate(entry.currentDate))
                    }
                    Text(entry.narrative)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private var interpretationCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading(content.interpretationTitle)
                ForEach(Array(content.interpretationParagraphs.enumerated()), id: \.offset) { _, paragraph in
                    Text(paragraph)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private var coachInsightCard: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Coach's Insight")
                Text(content.coachInsightBody)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                // Verified real behavior: only shown when there is no
                // completion-experience module below it.
                if content.completionExperience == nil, let nextMilestoneLabel = content.nextMilestoneLabel {
                    StatusChip(text: "Next: \(nextMilestoneLabel)", color: .primary)
                }
            }
        }
    }

    @ViewBuilder
    private func completionDecisionCard(_ decision: PhotoCompletionDecision) -> some View {
        switch decision.state {
        case .completed:
            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        Text("Goal Achieved")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                    if let title = decision.nextGoalTitle {
                        Text(title)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    if let label = decision.nextGoalActionLabel {
                        // Verified real behavior: this control is a
                        // disabled `<button>` on the live product itself
                        // ("· Coming next") — genuinely inert, not a
                        // Native simplification.
                        Text(label)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(PhysiqueOSTheme.surfaceMuted)
                            .clipShape(Capsule())
                    }
                }
            }
        case .awaitingDecision:
            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeading("Your Decision")
                    if let question = decision.question {
                        Text(question)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    if let keepOpenLabel = decision.keepOpenActionLabel, let destination = decision.keepOpenDestination {
                        Button(keepOpenLabel) { onNavigate(destination) }
                            .physiqueOSFont(PhysiqueOSTypography.briefingViewLink)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                }
            }
        case .retry:
            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeading("Upload Again")
                    if let question = decision.retryQuestion {
                        Text(question)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    if let label = decision.retryActionLabel, let destination = decision.retryDestination {
                        Button {
                            onNavigate(destination)
                        } label: {
                            Text(label)
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
    }
}
