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
        VStack(alignment: .leading, spacing: 0) {
            hero
            journey
            if let phase = goal.activePhase { currentPhase(phase) }
            whatsNext
            guardrail
            evidenceAnchors
            trainingProgress
            turningPoints
            currentStrategy
        }
    }

    private var hero: some View {
        GoalAtmosphericCard(tone: .activeGoal, padding: 20, cornerRadius: 30) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 10) {
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
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                Divider().overlay(PhysiqueOSTheme.divider)
                HStack(spacing: 8) {
                    Image(systemName: "gauge.with.dots.needle.33percent")
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    Text("\(goal.confidence.value)% · \(goal.confidence.band)")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    Spacer(minLength: 8)
                    Text(goal.dateRange)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
        .padding(.bottom, 12)
    }

    private var journey: some View {
        GoalSection(eyebrow: "The path", title: "Your Journey") {
            VStack(spacing: 8) {
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
        GoalAtmosphericCard(tone: .activePhase, padding: 20, cornerRadius: 28) {
            VStack(alignment: .leading, spacing: 16) {
                Label("Where you are", systemImage: "figure.strengthtraining.traditional")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                Text("Current Phase")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(phase.name)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(phase.purpose)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    GoalContextMetric(label: "Goal Progress", value: "\(goal.goalProgress.percentage)%")
                    GoalContextMetric(label: "Strategic Review", value: goal.trainingProgress.reviewDate)
                }
                AnimatedProgressBar(
                    value: goal.goalProgress.percentage,
                    color: PhysiqueOSTheme.chartSuccess,
                    accessibilityLabel: "Goal progress"
                )
                GoalContextBody(label: "Evidence in View", text: phase.evidence)
                GoalContextBody(label: "What's Next", text: phase.progress.detail)
            }
        }
        .padding(.vertical, 12)
    }

    private var whatsNext: some View {
        GoalAtmosphericCard(tone: .activePhase, padding: 18, cornerRadius: 26) {
            VStack(alignment: .leading, spacing: 12) {
                Label("What's Next", systemImage: "sparkles")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                Text("Goal review comes next")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                ForEach(Array(goal.readiness.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                            .accessibilityHidden(true)
                        Text(item)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .padding(.bottom, 12)
    }

    private var guardrail: some View {
        GoalAtmosphericCard(tone: .guardrail, padding: 20, cornerRadius: 28) {
            VStack(alignment: .leading, spacing: 12) {
                Label("Non-negotiable", systemImage: "shield.checkered")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text("Guardrail")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(goal.guardrail.title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(goal.guardrail.scope)
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(goal.guardrail.body)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text(goal.guardrail.state)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(PhysiqueOSTheme.accent.opacity(0.12))
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 12)
    }

    private var evidenceAnchors: some View {
        GoalSection(eyebrow: "What progress means", title: "Evidence Anchors") {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 20) {
                    GoalMetric(label: "Goal Progress", value: "\(goal.goalProgress.percentage)%")
                    Divider().overlay(PhysiqueOSTheme.divider)
                    GoalMetric(label: "Remaining", value: "\(max(0, 100 - goal.goalProgress.percentage))%")
                }
                GoalEvidenceCard {
                    VStack(alignment: .leading, spacing: 16) {
                        Label("Goal baseline DEXA · \(goal.evidence.date)", systemImage: "viewfinder")
                            .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                            .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                            GoalMetric(label: "Body Fat", value: goal.evidence.bodyFat)
                            GoalMetric(label: "Lean Mass", value: goal.evidence.leanMass)
                            GoalMetric(label: "Fat Mass", value: goal.evidence.fatMass)
                            GoalMetric(label: "Weight", value: goal.evidence.weight)
                        }
                    }
                }
                GoalEvidenceCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Weight and energy", systemImage: "gauge.with.dots.needle.33percent")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(goal.evidence.support)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            .lineSpacing(3)
                    }
                }
            }
        }
    }

    private var trainingProgress: some View {
        GoalSection(eyebrow: "Long-term performance", title: "Training Progress") {
            GoalAtmosphericCard(tone: .guardrail, padding: 14, cornerRadius: 20) {
                VStack(alignment: .leading, spacing: 9) {
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
                            .padding(.vertical, 8)
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
            VStack(spacing: 20) {
                ForEach(goal.turningPoints) { item in
                    HStack(alignment: .top, spacing: 16) {
                        Rectangle()
                            .fill(PhysiqueOSTheme.divider)
                            .frame(width: 2)
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
            VStack(spacing: 16) {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(goal.strategy) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.label)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            if item.label == "Energy", let detail = goal.activePhase?.strategy.first {
                                Text(detail)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            } else {
                                Text("Goal support")
                                    .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(PhysiqueOSTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: 22))
                        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(PhysiqueOSTheme.divider))
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
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
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
        .padding(.vertical, 26)
        .overlay(alignment: .bottom) {
            Divider().overlay(PhysiqueOSTheme.divider)
        }
    }
}

struct GoalAccentCard<Content: View>: View {
    let tint: Color
    let tone: GoalVisualTone
    let eyebrow: String
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        GoalAtmosphericCard(tone: tone, padding: 14, cornerRadius: 20) {
            VStack(alignment: .leading, spacing: 8) {
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
        GoalAtmosphericCard(
            tone: phase.status == .completed ? .completed : (phase.status == .active ? .activePhase : .neutral),
            padding: 16,
            cornerRadius: 24
        ) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Text("\(phase.order)")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(tint)
                        .frame(width: 36, height: 36)
                        .background(tint.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
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
        VStack(alignment: .leading, spacing: 6) {
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

private struct GoalContextMetric: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct GoalContextBody: View {
    let label: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(text)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }
}

private struct GoalEvidenceCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(20)
            .background(PhysiqueOSTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(PhysiqueOSTheme.divider)
            )
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
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
            .background(PhysiqueOSTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(PhysiqueOSTheme.divider))
        }
        .buttonStyle(.plain)
    }
}

/// Goals-local semantic surfaces mirror the web's restrained violet, green,
/// and amber atmospheric cards without changing the shared card system used
/// by operational surfaces such as Log and Workout Logger.
enum GoalVisualTone {
    case activeGoal
    case completed
    case activePhase
    case guardrail
    case neutral

    var accent: Color {
        switch self {
        case .activeGoal, .guardrail: PhysiqueOSTheme.accent
        case .completed: PhysiqueOSTheme.chartEffort
        case .activePhase: PhysiqueOSTheme.chartSuccess
        case .neutral: PhysiqueOSTheme.textMuted
        }
    }

    var gradient: LinearGradient {
        let colors: [Color] = switch self {
        case .activeGoal:
            [PhysiqueOSTheme.accent.opacity(0.17), PhysiqueOSTheme.surfaceElevated, PhysiqueOSTheme.chartSuccess.opacity(0.055)]
        case .completed:
            [PhysiqueOSTheme.chartEffort.opacity(0.15), PhysiqueOSTheme.surfaceElevated, PhysiqueOSTheme.chartSuccess.opacity(0.045)]
        case .activePhase:
            [PhysiqueOSTheme.chartSuccess.opacity(0.12), PhysiqueOSTheme.surfaceElevated, PhysiqueOSTheme.chartSuccess.opacity(0.045)]
        case .guardrail:
            [PhysiqueOSTheme.accent.opacity(0.11), PhysiqueOSTheme.surfaceElevated, PhysiqueOSTheme.accent.opacity(0.035)]
        case .neutral:
            [PhysiqueOSTheme.surfaceMuted, PhysiqueOSTheme.surfaceElevated]
        }
        return LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    var border: Color {
        switch self {
        case .neutral: PhysiqueOSTheme.divider
        default: accent.opacity(0.25)
        }
    }

    var glowOpacity: Double {
        switch self {
        case .activeGoal, .completed: 0.13
        case .activePhase, .guardrail: 0.09
        case .neutral: 0.035
        }
    }
}

struct GoalAtmosphericCard<Content: View>: View {
    let tone: GoalVisualTone
    var padding: CGFloat = 14
    var cornerRadius: CGFloat = 20
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .background(tone.gradient)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(tone.border, lineWidth: 1)
            )
            .shadow(color: tone.accent.opacity(tone.glowOpacity), radius: 14, x: 0, y: 7)
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
