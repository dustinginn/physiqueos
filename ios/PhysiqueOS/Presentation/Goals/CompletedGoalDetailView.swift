import SwiftUI

struct CompletedGoalDetailContent: View {
    let goal: CompletedGoalReadModel
    let onNavigate: (AppDestination) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            hero
            recap
            highlights
            photos
            finalComposition
            achievedBy
            if let unlocked = goal.unlocked { unlockedCard(unlocked) }
        }
    }

    private var hero: some View {
        CardContainer(background: PhysiqueOSTheme.chartEffort.opacity(0.10)) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Completed Goal")
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                        Text(goal.title)
                            .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Label(goal.status, systemImage: "checkmark.circle.fill")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                    }
                    Spacer()
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(PhysiqueOSTheme.chartEffort)
                        .frame(width: 48, height: 48)
                        .background(PhysiqueOSTheme.chartEffort.opacity(0.14))
                        .clipShape(RoundedRectangle(cornerRadius: 15))
                }
                Divider().overlay(PhysiqueOSTheme.divider)
                HStack {
                    GoalMetric(label: "Journey", value: goal.dateRange)
                    GoalMetric(label: "Achievement", value: goal.achievement)
                }
            }
        }
    }

    private var recap: some View {
        GoalSection(eyebrow: "The story", title: "Journey Recap") {
            Text(goal.recap)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .lineSpacing(4)
        }
    }

    private var highlights: some View {
        GoalSection(eyebrow: "The moments that mattered", title: "Journey Highlights") {
            VStack(spacing: 16) {
                ForEach(Array(goal.highlights.enumerated()), id: \.element.id) { index, highlight in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(index + 1)")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                            .frame(width: 30, height: 30)
                            .background(PhysiqueOSTheme.chartEffort.opacity(0.14))
                            .clipShape(Circle())
                        VStack(alignment: .leading, spacing: 4) {
                            Text(highlight.date)
                                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                            Text(highlight.title)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(highlight.body)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }

    private var photos: some View {
        GoalSection(eyebrow: "The transformation", title: "Beginning → Completion") {
            VStack(spacing: 12) {
                ForEach(goal.photos) { photo in
                    VStack(alignment: .leading, spacing: 8) {
                        ZStack {
                            LinearGradient(
                                colors: [PhysiqueOSTheme.surfaceAccent, PhysiqueOSTheme.surfaceMuted],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                            Image(systemName: photo.systemImage)
                                .font(.system(size: 54, weight: .light))
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                        .frame(maxWidth: .infinity)
                        .aspectRatio(3 / 4, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                        Text(photo.label)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(photo.date)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                }
                GoalNavigationButton(title: "View full photo history") {
                    onNavigate(goal.photoHistoryDestination)
                }
            }
        }
    }

    private var finalComposition: some View {
        CardContainer(background: Color.black.opacity(0.34)) {
            VStack(alignment: .leading, spacing: 16) {
                Label("Final Body Composition", systemImage: "viewfinder")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                Text("The measurement that closed the journey")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("\(goal.finalComposition.date) DEXA")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                    GoalMetric(label: "Body Fat", value: goal.finalComposition.bodyFat)
                    GoalMetric(label: "Lean Mass", value: goal.finalComposition.leanMass)
                    GoalMetric(label: "Fat Mass", value: goal.finalComposition.fatMass)
                    GoalMetric(label: "Weight", value: goal.finalComposition.weight)
                }
                Text(goal.finalComposition.narrative)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                if let destination = goal.finalComposition.briefingDestination {
                    GoalNavigationButton(title: "View Final Goal Briefing") {
                        onNavigate(destination)
                    }
                }
            }
        }
    }

    private var achievedBy: some View {
        GoalSection(eyebrow: "The foundation", title: "How This Goal Was Achieved") {
            VStack(spacing: 9) {
                ForEach(goal.achievedBy, id: \.self) { item in
                    HStack(alignment: .top, spacing: 11) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        Text(item)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(13)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 13))
                }
            }
        }
    }

    private func unlockedCard(_ unlocked: CompletedGoalUnlockReadModel) -> some View {
        CardContainer(background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .center, spacing: 12) {
                Label("What This Unlocked", systemImage: "sparkles")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(goal.title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Image(systemName: "arrow.down")
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Text(unlocked.title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(unlocked.body)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .multilineTextAlignment(.center)
                PrimaryActionButton(title: "View Current Goal") {
                    onNavigate(unlocked.destination)
                }
            }
        }
    }
}
