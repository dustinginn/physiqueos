import SwiftUI

struct GoalDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: GoalDetailViewModel?

    let goalId: String
    let onNavigate: (AppDestination) -> Void

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { dismiss() } label: {
                    Label("Goals", systemImage: "arrow.left")
                        .labelStyle(.titleAndIcon)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task {
            if viewModel == nil {
                viewModel = GoalDetailViewModel(api: environment.goalsAPI, goalId: goalId)
            }
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
        case .unavailable:
            GoalUnavailableView(message: "This goal is unavailable.")
        case .failed(let message):
            GoalUnavailableView(message: message)
        case .loaded(let detail):
            if let active = detail.active {
                ActiveGoalDetailContent(goal: active, onNavigate: onNavigate)
            } else if let completed = detail.completed {
                CompletedGoalDetailContent(goal: completed, onNavigate: onNavigate)
            } else {
                GoalUnavailableView(message: "This goal is unavailable.")
            }
        }
    }
}

private struct ActiveGoalDetailContent: View {
    let goal: ActiveGoalReadModel
    let onNavigate: (AppDestination) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            hero
            goalProgress
            journey
            if let phase = goal.activePhase { currentPhase(phase) }
            readiness
            guardrail
            evidenceAnchors
            trainingProgress
            turningPoints
            currentStrategy
        }
    }

    private var hero: some View {
        CardContainer(background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 14) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text(goal.status)
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                        Text(goal.title)
                            .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(goal.objective)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "dumbbell.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(PhysiqueOSTheme.accent)
                        .frame(width: 48, height: 48)
                        .background(PhysiqueOSTheme.accent.opacity(0.14))
                        .clipShape(RoundedRectangle(cornerRadius: 15))
                }
                Divider().overlay(PhysiqueOSTheme.divider)
                HStack(alignment: .center, spacing: 14) {
                    ConfidenceRing(value: goal.confidence.value, label: "Goal", size: 70, lineWidth: 5)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(goal.confidence.band)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(goal.confidence.explanation)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        Text(goal.dateRange)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                }
            }
        }
    }

    private var goalProgress: some View {
        GoalSection(eyebrow: "Overall journey", title: "Goal Progress") {
            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(goal.goalProgress.label)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer()
                        Text("\(goal.goalProgress.percentage)%")
                            .physiqueOSFont(PhysiqueOSTypography.goalProgressValue)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    AnimatedProgressBar(
                        value: goal.goalProgress.percentage,
                        color: PhysiqueOSTheme.accent,
                        accessibilityLabel: "Goal progress"
                    )
                    Text(goal.goalProgress.detail)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    private var journey: some View {
        GoalSection(eyebrow: "The path", title: "Your Journey") {
            VStack(spacing: 10) {
                ForEach(goal.orderedPhases) { phase in
                    Button { onNavigate(phase.destination(goalId: goal.id)) } label: {
                        GoalPhaseCard(phase: phase)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Open Phase \(phase.order), \(phase.name), \(phase.status.label)")
                }
            }
        }
    }

    private func currentPhase(_ phase: GoalPhaseReadModel) -> some View {
        GoalAccentCard(tint: PhysiqueOSTheme.chartSuccess, eyebrow: "Where you are", title: "Current Phase") {
            VStack(alignment: .leading, spacing: 13) {
                Text(phase.name)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(phase.purpose)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                GoalProgressBlock(progress: phase.progress, color: PhysiqueOSTheme.chartSuccess, label: "Phase progress")
                GoalLabeledBody(label: "Evidence in view", text: phase.evidence)
            }
        }
    }

    private var readiness: some View {
        GoalSection(eyebrow: "Phase decision", title: "Ready to Move Forward When") {
            VStack(spacing: 12) {
                ForEach(Array(goal.readiness.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(index + 1)")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                            .frame(width: 28, height: 28)
                            .background(PhysiqueOSTheme.chartSuccess.opacity(0.12))
                            .clipShape(Circle())
                        Text(item)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }

    private var guardrail: some View {
        GoalAccentCard(tint: PhysiqueOSTheme.accent, eyebrow: "Non-negotiable", title: "Guardrail") {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(goal.guardrail.title)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Spacer(minLength: 8)
                    Text(goal.guardrail.state)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                }
                Text(goal.guardrail.scope)
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(goal.guardrail.body)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private var evidenceAnchors: some View {
        GoalSection(eyebrow: "What progress means", title: "Evidence Anchors") {
            VStack(spacing: 10) {
                CardContainer(background: Color.black.opacity(0.34)) {
                    VStack(alignment: .leading, spacing: 15) {
                        Label("Authoritative DEXA · \(goal.evidence.date)", systemImage: "viewfinder")
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                            GoalMetric(label: "Body Fat", value: goal.evidence.bodyFat)
                            GoalMetric(label: "Lean Mass", value: goal.evidence.leanMass)
                            GoalMetric(label: "Fat Mass", value: goal.evidence.fatMass)
                            GoalMetric(label: "Weight", value: goal.evidence.weight)
                        }
                    }
                }
                CardContainer(background: PhysiqueOSTheme.surfaceMuted) {
                    GoalLabeledBody(label: "Weight and energy", text: goal.evidence.support)
                }
            }
        }
    }

    private var trainingProgress: some View {
        GoalSection(eyebrow: "Long-term performance", title: "Training Progress") {
            CardContainer(background: PhysiqueOSTheme.accent.opacity(0.07)) {
                VStack(alignment: .leading, spacing: 13) {
                    HStack {
                        Label(goal.trainingProgress.state, systemImage: "chart.line.uptrend.xyaxis")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                        Spacer()
                        Text(goal.trainingProgress.reviewDate)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    Text(goal.trainingProgress.interpretation)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Divider().overlay(PhysiqueOSTheme.divider)
                    ForEach(goal.trainingProgress.comparisons, id: \.self) { item in
                        Label(item, systemImage: "checkmark.circle.fill")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    HStack(spacing: 8) {
                        ForEach(goal.trainingProgress.muscleGroups) { group in
                            VStack(spacing: 4) {
                                Text(group.name)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Text(group.status)
                                    .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(PhysiqueOSTheme.surfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 11))
                        }
                    }
                }
            }
        }
    }

    private var turningPoints: some View {
        GoalSection(eyebrow: "Major milestones", title: "Evidence Turning Points") {
            VStack(spacing: 16) {
                ForEach(goal.turningPoints) { item in
                    HStack(alignment: .top, spacing: 12) {
                        Capsule()
                            .fill(PhysiqueOSTheme.accent)
                            .frame(width: 2, height: 68)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.date)
                                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                            Text(item.title)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(item.body)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }

    private var currentStrategy: some View {
        GoalSection(eyebrow: "How the goal is supported", title: "Current Strategy") {
            VStack(spacing: 12) {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(goal.strategy) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.label)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text("Goal support")
                                .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                        .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
                        .padding(12)
                        .background(PhysiqueOSTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: 13))
                        .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder(PhysiqueOSTheme.divider))
                    }
                }
                GoalNavigationButton(title: "Review Strategy") {
                    onNavigate(.goalPlan(goalId: goal.id, focus: .strategy))
                }
                GoalNavigationButton(title: "Review Protocols") {
                    onNavigate(.goalPlan(goalId: goal.id, focus: .protocols))
                }
            }
        }
    }
}

struct GoalSection<Content: View>: View {
    let eyebrow: String
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(eyebrow)
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct GoalAccentCard<Content: View>: View {
    let tint: Color
    let eyebrow: String
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        CardContainer(background: tint.opacity(0.07)) {
            VStack(alignment: .leading, spacing: 12) {
                Text(eyebrow)
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(tint)
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                content
            }
        }
    }
}

struct GoalPhaseCard: View {
    let phase: GoalPhaseReadModel

    private var tint: Color {
        switch phase.status {
        case .completed: PhysiqueOSTheme.chartEffort
        case .active: PhysiqueOSTheme.chartSuccess
        case .planned: PhysiqueOSTheme.chartEvidence
        }
    }

    var body: some View {
        CardContainer(background: tint.opacity(phase.status == .completed ? 0.10 : 0.07)) {
            VStack(alignment: .leading, spacing: 11) {
                HStack(alignment: .top, spacing: 12) {
                    Text("\(phase.order)")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(tint)
                        .frame(width: 34, height: 34)
                        .background(tint.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text("Phase \(phase.order)")
                                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                                .foregroundStyle(tint)
                            Spacer()
                            Text(phase.status.label)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(tint)
                        }
                        Text(phase.name)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(phase.dates)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    Image(systemName: "chevron.right")
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                        .padding(.top, 18)
                }
                AnimatedProgressBar(value: phase.progress.percentage, color: tint, accessibilityLabel: "Phase progress")
                HStack(alignment: .firstTextBaseline) {
                    Text(phase.progress.label)
                    Spacer()
                    Text("\(phase.progress.percentage)%")
                }
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }
}

struct GoalProgressBlock: View {
    let progress: GoalProgressReadModel
    let color: Color
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(progress.label)
                Spacer()
                Text("\(progress.percentage)%")
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            .foregroundStyle(PhysiqueOSTheme.textPrimary)
            AnimatedProgressBar(value: progress.percentage, color: color, accessibilityLabel: label)
            Text(progress.detail)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }
}

struct GoalLabeledBody: View {
    let label: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(text)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }
}

struct GoalMetric: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct GoalNavigationButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                Spacer()
                Image(systemName: "arrow.right")
            }
            .foregroundStyle(PhysiqueOSTheme.textPrimary)
            .padding(.horizontal, 15)
            .frame(minHeight: 48)
            .background(PhysiqueOSTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(PhysiqueOSTheme.divider))
        }
        .buttonStyle(.plain)
    }
}

struct GoalUnavailableView: View {
    let message: String

    var body: some View {
        Text(message)
            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
            .foregroundStyle(PhysiqueOSTheme.textSecondary)
            .frame(maxWidth: .infinity, minHeight: 300)
    }
}
