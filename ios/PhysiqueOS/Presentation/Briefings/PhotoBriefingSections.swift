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
/// `PhaseReviewCard` at all (unlike DEXA), and Confidence is persisted but
/// is not part of the captured Photo Event presentation.
///
/// Authorized media is rendered through the same authenticated
/// `ProgressPhotoTile` seam as Progress Photos Evidence. Tapping a tile
/// carries both the server-owned session and pose identity into that shared
/// detail/pager, so a filtered or reordered grid cannot open the wrong image.
struct PhotoBriefingSections: View {
    static let sectionInventory = ["Hero", "Snapshot", "Progress", "Interpretation", "Coach's Insight", "Completion Decision"]
    @Environment(AppEnvironment.self) private var environment
    let content: PhotoBriefingContent
    var onNavigate: (AppDestination) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 30) {
            hero
            snapshotCard
            progressCard
            interpretationCard
            coachInsightCard
            if let experience = content.completionExperience {
                completionDecisionCard(experience.decision)
            }
        }
        .task { await environment.founderPhotoMediaStore.loadManifestIfNeeded() }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                IconBadge(systemImage: "wand.and.stars", color: .warning, size: .md, isCircular: false)
                Text("PHOTO EVENT")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
            }
            VStack(alignment: .leading, spacing: 18) {
                Text(content.heroTitle)
                    .physiqueOSFont(PhysiqueOSTypography.editorialHero)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.heroBody)
                    .physiqueOSFont(PhysiqueOSTypography.editorialBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private var snapshotCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
            VStack(alignment: .leading, spacing: 18) {
                BriefingEditorialHeading(title: content.snapshotTitle)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    snapshotMetric("Date", BriefingDateFormatting.shortDate(content.eventDate))
                    snapshotMetric("Set", content.completionLabel)
                    snapshotMetric("Weight", content.weightLabel)
                }
                Text(content.poseLabels.joined(separator: " · "))
                    .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(content.conditionsSummary)
                    .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                photoGrid
            }
        }
    }

    private var photoGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(content.activeViews) { view in
                let item = environment.founderPhotoMediaStore.resolvedItem(
                    setId: view.setId,
                    captureDate: view.captureDate,
                    poseId: view.poseId
                )
                Button {
                    onNavigate(.photoSetDetail(setId: item?.photoSessionId ?? view.setId, poseId: view.poseId))
                } label: {
                    ProgressPhotoTile(
                        roleLabel: view.poseId.label,
                        source: item.map { environment.founderPhotoMediaStore.source(viewIdentity: $0.viewIdentity) } ?? .placeholder,
                        caption: item.map { BriefingDateFormatting.shortDate($0.captureDate) }
                    )
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
            BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
                VStack(alignment: .leading, spacing: 16) {
                    BriefingEditorialHeading(title: content.progressTitle)
                    Text(content.progressBody)
                        .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private var ordinaryComparisonsCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
            VStack(alignment: .leading, spacing: 18) {
                BriefingEditorialHeading(title: content.progressTitle)
                if !content.progressBody.isEmpty {
                    Text(content.progressBody)
                        .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
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
                BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
                    VStack(alignment: .leading, spacing: 18) {
                        BriefingEditorialHeading(title: "Since Last Check-In")
                        comparisonList(experience.recentComparisons)
                    }
                }
            }
            if !experience.journeyComparisons.isEmpty {
                BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
                    VStack(alignment: .leading, spacing: 18) {
                        BriefingEditorialHeading(title: "From First Upload to Now")
                        comparisonList(experience.journeyComparisons)
                    }
                }
            }
            if !experience.newBaselines.isEmpty {
                BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort) {
                    VStack(alignment: .leading, spacing: 16) {
                        BriefingEditorialHeading(title: "New Baselines")
                        ForEach(experience.newBaselines) { baseline in
                            Text("\(baseline.poseId.label): \(baseline.narrative)")
                                .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
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
                let resolved = environment.founderPhotoMediaStore.resolvedComparisonItems(
                    priorSetId: entry.priorSetId,
                    priorDate: entry.priorDate,
                    currentSetId: entry.currentSetId,
                    currentDate: entry.currentDate,
                    poseId: entry.poseId
                )
                let priorItem = resolved.prior
                let currentItem = resolved.current
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        if let roleLabel = entry.roleLabel {
                            StatusChip(text: roleLabel, color: .primary)
                        }
                        Text(entry.poseId.label)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer(minLength: 8)
                        if let priorDate = priorItem?.captureDate ?? entry.priorDate {
                            Text("\(BriefingDateFormatting.shortDate(priorDate)) → \(BriefingDateFormatting.shortDate(currentItem?.captureDate ?? entry.currentDate))")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                    }
                    Text("Tap a photo to expand")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    HStack(spacing: 8) {
                        ProgressPhotoTile(
                            roleLabel: "Previous",
                            source: priorItem.map { environment.founderPhotoMediaStore.source(viewIdentity: $0.viewIdentity) } ?? .placeholder,
                            caption: priorItem.map { BriefingDateFormatting.shortDate($0.captureDate) } ?? entry.priorDate.map(BriefingDateFormatting.shortDate)
                        )
                        ProgressPhotoTile(
                            roleLabel: "Current",
                            source: currentItem.map { environment.founderPhotoMediaStore.source(viewIdentity: $0.viewIdentity) } ?? .placeholder,
                            caption: BriefingDateFormatting.shortDate(currentItem?.captureDate ?? entry.currentDate)
                        )
                    }
                    Text(entry.narrative)
                        .physiqueOSFont(PhysiqueOSTypography.briefingSupporting)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                .padding(.vertical, 8)
            }
        }
    }

    private func snapshotMetric(_ label: String, _ value: String) -> some View {
        VStack(spacing: 5) {
            Text(label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, minHeight: 74)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var interpretationCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.accent) {
            VStack(alignment: .leading, spacing: 16) {
                BriefingEditorialHeading(title: content.interpretationTitle)
                ForEach(Array(content.interpretationParagraphs.enumerated()), id: \.offset) { _, paragraph in
                    Text(paragraph)
                        .physiqueOSFont(PhysiqueOSTypography.briefingBody)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private var coachInsightCard: some View {
        BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort, background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 16) {
                BriefingEditorialHeading(title: "Coach's Insight")
                Text(content.coachInsightBody)
                    .physiqueOSFont(PhysiqueOSTypography.briefingBody)
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
            BriefingEditorialCard(tint: PhysiqueOSTheme.chartSuccess) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        Text("Goal Achieved")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                    if let title = decision.nextGoalTitle {
                        Text(title)
                            .physiqueOSFont(PhysiqueOSTypography.briefingBody)
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
            BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort) {
                VStack(alignment: .leading, spacing: 10) {
                    BriefingEditorialHeading(title: "Your Decision")
                    if let question = decision.question {
                        Text(question)
                            .physiqueOSFont(PhysiqueOSTypography.briefingBody)
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
            BriefingEditorialCard(tint: PhysiqueOSTheme.chartEffort) {
                VStack(alignment: .leading, spacing: 10) {
                    BriefingEditorialHeading(title: "Upload Again")
                    if let question = decision.retryQuestion {
                        Text(question)
                            .physiqueOSFont(PhysiqueOSTypography.briefingBody)
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
