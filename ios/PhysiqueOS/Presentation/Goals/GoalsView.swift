import SwiftUI

/// The production Goals index: one active primary journey, completed goal
/// history, and the current unavailable Add Goal state. Supporting goals
/// remain underlying evidence for the completed journey; the web index no
/// longer renders them as separate cards.
struct GoalsView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: GoalsViewModel?
    let onNavigate: (AppDestination) -> Void

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 20)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .task {
            if viewModel == nil { viewModel = GoalsViewModel(api: environment.goalsAPI) }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(let hub):
            VStack(alignment: .leading, spacing: 24) {
                header
                goalSection(title: "Primary Goal") {
                    activeGoalCard(hub.activeGoal)
                }
                if !hub.completedGoals.isEmpty {
                    goalSection(title: "Completed Goals") {
                        VStack(spacing: 10) {
                            ForEach(hub.completedGoals) { completedGoalCard($0) }
                        }
                    }
                }
                addGoalCard(hub)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Your Goals")
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("Every goal is continuously evaluated using the best available evidence.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func goalSection<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            content()
        }
    }

    private func activeGoalCard(_ goal: GoalSummaryReadModel) -> some View {
        Button { onNavigate(goal.destination) } label: {
            CardContainer(background: PhysiqueOSTheme.surfaceAccent) {
                HStack(alignment: .top, spacing: 14) {
                    IconBadge(systemImage: "dumbbell.fill", color: .primary, size: .md, isCircular: true)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Primary Goal")
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                        Text(goal.title)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        HStack(spacing: 5) {
                            Text(goal.statusLabel)
                            Text("•").accessibilityHidden(true)
                            Text(goal.confidence.map { "\($0.value)% confidence" } ?? "Confidence unavailable")
                        }
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        if let phase = goal.currentPhaseName {
                            Text("\(phase) · Active phase")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        }
                    }
                    Spacer(minLength: 6)
                    Image(systemName: "chevron.right")
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .padding(.top, 26)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open \(goal.title)")
    }

    private func completedGoalCard(_ goal: GoalSummaryReadModel) -> some View {
        Button { onNavigate(goal.destination) } label: {
            CardContainer(background: PhysiqueOSTheme.chartEffort.opacity(0.08)) {
                HStack(alignment: .top, spacing: 14) {
                    IconBadge(systemImage: "trophy.fill", color: .effort, size: .md, isCircular: true)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Completed Goal")
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                        Text(goal.title)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("\(goal.statusLabel) · \(goal.dateRange)")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        if let achievement = goal.achievement {
                            Text(achievement)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        }
                    }
                    Spacer(minLength: 6)
                    Image(systemName: "chevron.right")
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .padding(.top, 26)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open completed goal \(goal.title)")
    }

    private func addGoalCard(_ hub: GoalsHubReadModel) -> some View {
        CardContainer(background: PhysiqueOSTheme.surfaceMuted) {
            HStack(alignment: .top, spacing: 14) {
                IconBadge(systemImage: "plus", color: .primary, size: .md, isCircular: true)
                VStack(alignment: .leading, spacing: 5) {
                    Text("Add Goal")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(hub.addGoalMessage)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
