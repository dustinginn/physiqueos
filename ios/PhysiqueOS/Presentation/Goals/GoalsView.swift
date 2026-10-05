import SwiftUI

/// The production Goals index: one active primary journey, completed goal
/// history, and the current unavailable Add Goal state. Supporting goals
/// remain underlying evidence for the completed journey; the web index no
/// longer renders them as separate cards.
struct GoalsView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: GoalsViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?
    let onNavigate: (AppDestination) -> Void

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.redesignCanvas)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = GoalsViewModel(
                    api: environment.goalsAPI,
                    store: environment.goalsSandboxStore,
                    usesSandboxStore: environment.nativeAuthority == .sandbox
                )
                viewModelAuthority = environment.nativeAuthority
            }
            await viewModel?.load()
        }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["goals"])
            }
            await viewModel?.load()
        }
        .refreshesOnForegroundWhenVisible { await viewModel?.load() }
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
            VStack(alignment: .leading, spacing: 18) {
                header
                if let activeGoal = hub.activeGoal {
                    goalSection(title: "CURRENT JOURNEY") {
                        activeGoalCard(activeGoal)
                    }
                }
                if !hub.completedGoals.isEmpty {
                    goalSection(title: "HISTORY") {
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
        VStack(alignment: .leading, spacing: 5) {
            Text("GOALS")
                .font(.system(size: 11, weight: .bold)).tracking(1)
                .foregroundStyle(PhysiqueOSTheme.redesignPurple)
            Text("Your Goals")
                .font(.system(size: 32, weight: .heavy))
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
            Text("Every goal is continuously evaluated using the best available evidence.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func goalSection<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 11, weight: .bold)).tracking(0.9)
                .foregroundStyle(PhysiqueOSTheme.redesignPurple)
            content()
        }
    }

    private func activeGoalCard(_ goal: GoalSummaryReadModel) -> some View {
        Button { onNavigate(goal.destination) } label: {
            ZStack {
                LinearGradient(colors: [PhysiqueOSTheme.redesignFieldStart, PhysiqueOSTheme.redesignFieldEnd], startPoint: .topLeading, endPoint: .bottomTrailing)
                HStack(alignment: .top, spacing: 11) {
                    Image(systemName: "dumbbell.fill")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(PhysiqueOSTheme.redesignGreen)
                        .frame(width: 42, height: 42)
                        .background(Color.black.opacity(0.16), in: RoundedRectangle(cornerRadius: 13))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Primary Goal")
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                        Text(goal.title)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                            .foregroundStyle(PhysiqueOSTheme.redesignInk)
                        HStack(spacing: 5) {
                            Text(goal.statusLabel)
                            Text("•").accessibilityHidden(true)
                            Text(goal.confidence.flatMap { confidence in
                                confidence.value.map { "\($0)% confidence" }
                            } ?? "Confidence unavailable")
                        }
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                        if let phase = goal.currentPhaseName {
                            Text("\(phase) · Active phase")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.redesignGreen)
                        }
                    }
                    Spacer(minLength: 6)
                    Image(systemName: "chevron.right")
                        .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                        .padding(.top, 21)
                }
                .padding(16)
            }
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open \(goal.title)")
    }

    private func completedGoalCard(_ goal: GoalSummaryReadModel) -> some View {
        Button { onNavigate(goal.destination) } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 11) {
                    IconBadge(systemImage: "trophy.fill", color: .effort, size: .md, isCircular: true)
                    VStack(alignment: .leading, spacing: 4) {
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
                        .padding(.top, 21)
                }
            }
            .padding(16)
            .background(PhysiqueOSTheme.redesignPaper)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(PhysiqueOSTheme.redesignAmber.opacity(0.35)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open completed goal \(goal.title)")
    }

    private func addGoalCard(_ hub: GoalsHubReadModel) -> some View {
        Group {
            if hub.addGoalAvailable {
                Button { onNavigate(.goalTransition) } label: { addGoalCardContent(hub) }
                    .buttonStyle(.plain)
            } else {
                addGoalCardContent(hub)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func addGoalCardContent(_ hub: GoalsHubReadModel) -> some View {
        VStack(alignment: .leading) {
            HStack(alignment: .center, spacing: 11) {
                IconBadge(systemImage: "plus", color: .primary, size: .sm, isCircular: true)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Add Goal")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(hub.addGoalMessage)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                if hub.addGoalAvailable {
                    Spacer(minLength: 6)
                    Image(systemName: "chevron.right").foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
        .padding(14)
        .background(PhysiqueOSTheme.redesignSoft)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
