import SwiftUI

struct GoalDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: GoalDetailViewModel?
    @State private var viewModelAuthority: NativeAPIEnvironment?

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
        .task(id: environment.nativeAuthority) {
            if viewModelAuthority != environment.nativeAuthority {
                viewModel = GoalDetailViewModel(
                    api: environment.goalsAPI,
                    store: environment.goalsSandboxStore,
                    usesSandboxStore: environment.nativeAuthority == .sandbox,
                    goalId: goalId
                )
                viewModelAuthority = environment.nativeAuthority
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
                ActiveGoalDetailContent(
                    goal: active,
                    allowsWrites: environment.nativeAuthority.permitsProductWrites,
                    onNavigate: onNavigate
                )
            } else if let completed = detail.completed {
                CompletedGoalDetailContent(goal: completed, onNavigate: onNavigate)
            } else if let supporting = detail.supporting {
                SupportingObjectiveDetailContent(goal: supporting)
            } else {
                GoalUnavailableView(message: "This goal is unavailable.")
            }
        }
    }
}

private struct ActiveGoalDetailContent: View {
    let goal: ActiveGoalReadModel
    let allowsWrites: Bool
    let onNavigate: (AppDestination) -> Void

    @State private var isShowingConfidenceDetail = false

    var body: some View {
        if let state = goal.currentState {
            // Server-owned current state: starting point → current
            // authoritative state → progress → guardrail → training →
            // turning points → latest briefing Coach's Take (last).
            // Confidence is display-only here: no detail sheet is reachable.
            ActiveGoalCurrentStateSections(
                goal: goal,
                state: state,
                allowsWrites: allowsWrites,
                onNavigate: onNavigate
            )
        } else {
            // Legacy layout (payloads without currentState), unchanged.
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
            .sheet(isPresented: $isShowingConfidenceDetail) {
                if let detail = goal.confidence.detail {
                    ConfidenceDetailSheet(confidence: goal.confidence.value ?? 0, detail: detail)
                }
            }
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
                    if allowsWrites {
                        Button { onNavigate(.goalEdit(goalId: goal.id)) } label: {
                            Image(systemName: "pencil")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(PhysiqueOSTheme.accent)
                                .frame(width: 40, height: 40)
                                .background(PhysiqueOSTheme.accent.opacity(0.14))
                                .clipShape(Circle())
                        }
                        .accessibilityLabel("Edit Goal")
                    }
                }
                Divider().overlay(PhysiqueOSTheme.divider)
                HStack(spacing: 8) {
                    Image(systemName: "gauge.with.dots.needle.33percent")
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    Text(goal.confidence.value.map { "\($0)% · \(goal.confidence.band)" } ?? goal.confidence.band)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    if goal.confidence.detail != nil {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    Spacer(minLength: 8)
                    Text(goal.dateRange)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    if goal.confidence.detail != nil { isShowingConfidenceDetail = true }
                }
                .accessibilityAddTraits(goal.confidence.detail != nil ? .isButton : [])
                if !goal.confidence.explanation.isEmpty {
                    Text(goal.confidence.explanation)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
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
                if allowsWrites, goal.orderedPhases.contains(where: { $0.order == phase.order + 1 }) {
                    GoalNavigationButton(title: "Review Phase Transition") {
                        onNavigate(.goalPhaseTransition(goalId: goal.id, phaseId: phase.id))
                    }
                }
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

/// Active Goal rendered from the Server's `active_goal_current_state_v1`.
/// Hierarchy: starting point → current authoritative state → progress →
/// guardrail → supporting training → turning points → coaching. Every
/// sentence shown here is a Server field; Native only formats numbers and
/// dates and chooses layout.
struct ActiveGoalCurrentStateSections: View {
    let goal: ActiveGoalReadModel
    let state: ActiveGoalCurrentStateReadModel
    let allowsWrites: Bool
    let onNavigate: (AppDestination) -> Void
    /// Composition columns grow with Dynamic Type.
    @ScaledMetric(relativeTo: .caption) private var columnWidth: CGFloat = 72

    /// The page's sections in render order. There is deliberately no
    /// strategy grid, "what's next" review card or legacy evidence-anchor
    /// section: coaching comes only from the latest briefing's Coach's Take,
    /// which closes the page after the factual sections.
    enum Section: String, CaseIterable {
        case hero, journey, bodyComposition, guardrail, trainingProgress, turningPoints, coachTake
    }

    nonisolated static func renderedSections(for state: ActiveGoalCurrentStateReadModel) -> [Section] {
        var sections: [Section] = [.hero, .journey]
        if state.composition != nil { sections.append(.bodyComposition) }
        if state.guardrail != nil { sections.append(.guardrail) }
        if state.training != nil { sections.append(.trainingProgress) }
        if !state.turningPoints.isEmpty { sections.append(.turningPoints) }
        if state.coachTake?.sections.isEmpty == false { sections.append(.coachTake) }
        return sections
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Self.renderedSections(for: state), id: \.self) { section in
                sectionView(section)
            }
        }
    }

    @ViewBuilder
    private func sectionView(_ section: Section) -> some View {
        switch section {
        case .hero: hero
        case .journey: journey
        case .bodyComposition: if let composition = state.composition { standing(composition) }
        case .guardrail: if let guardrail = state.guardrail { guardrailCard(guardrail) }
        case .trainingProgress: if let training = state.training { trainingSection(training) }
        case .coachTake: if let coachTake = state.coachTake { coachTakeSection(coachTake) }
        case .turningPoints: turningPointsSection
        }
    }

    // MARK: Hero — goal, destination, Confidence V3 (goal context + provenance)

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
                    if allowsWrites {
                        Button { onNavigate(.goalEdit(goalId: goal.id)) } label: {
                            Image(systemName: "pencil")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(PhysiqueOSTheme.accent)
                                .frame(width: 40, height: 40)
                                .background(PhysiqueOSTheme.accent.opacity(0.14))
                                .clipShape(Circle())
                        }
                        .accessibilityLabel("Edit Goal")
                    }
                }
                if let confidence = ActiveGoalFormat.heroConfidence(state) {
                    // Display-only: score/band, the V3 goal thesis and its
                    // provenance. No disclosure, tap target or detail sheet.
                    Divider().overlay(PhysiqueOSTheme.divider)
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Image(systemName: "gauge.with.dots.needle.33percent")
                                .foregroundStyle(PhysiqueOSTheme.accent)
                            Text(confidence.headline)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        if let thesis = confidence.thesis {
                            Text(thesis)
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        if let provenance = confidence.provenance {
                            Text(provenance)
                                .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(confidence.accessibilityLabel)
                    .accessibilityAddTraits(.isStaticText)
                }
            }
        }
        .padding(.bottom, 12)
    }

    // MARK: Journey — phases (identity and dates; progress is shown once below)

    private var journey: some View {
        GoalSection(eyebrow: "The path", title: "Your Journey") {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(goal.orderedPhases) { phase in
                    Button { onNavigate(phase.destination(goalId: goal.id)) } label: {
                        GoalPhaseCard(phase: phase, showsProgress: false)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Open Phase \(phase.order), \(phase.name), \(phase.status.label)")
                }
                if let purpose = state.phase?.purpose, !purpose.isEmpty {
                    Text(purpose)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .padding(.top, 4)
                }
                if let phase = goal.activePhase, allowsWrites,
                   goal.orderedPhases.contains(where: { $0.order == phase.order + 1 }) {
                    GoalNavigationButton(title: "Review Phase Transition") {
                        onNavigate(.goalPhaseTransition(goalId: goal.id, phaseId: phase.id))
                    }
                }
            }
        }
    }

    // MARK: Where the goal stands — baseline → latest DEXA → progress

    private func standing(_ composition: ActiveGoalCurrentStateReadModel.Composition) -> some View {
        GoalSection(eyebrow: "Current progress", title: "Body Composition") {
            VStack(alignment: .leading, spacing: 14) {
                GoalEvidenceCard {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("")
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if let baseline = composition.baseline, !composition.sameAsBaseline {
                                columnHeader("Baseline", ActiveGoalFormat.shortDate(baseline.date))
                            }
                            columnHeader(composition.sameAsBaseline ? "Baseline" : "Latest",
                                         ActiveGoalFormat.shortDate(composition.current.date))
                            if composition.change != nil { columnHeader("Change", "") }
                        }
                        compositionRow("Lean Mass", composition.baseline?.leanMassLb, composition.current.leanMassLb, composition.change?.leanMassLb, unit: " lb", composition: composition)
                        compositionRow("Fat Mass", composition.baseline?.fatMassLb, composition.current.fatMassLb, composition.change?.fatMassLb, unit: " lb", composition: composition)
                        compositionRow("Body Fat", composition.baseline?.bodyFatPercent, composition.current.bodyFatPercent, composition.change?.bodyFatPoints, unit: "%", composition: composition, changeUnit: " pts")
                        compositionRow("Weight", composition.baseline?.weightLb, composition.current.weightLb, composition.change?.weightLb, unit: " lb", composition: composition)
                        Text(ActiveGoalFormat.compositionCaption(composition))
                            .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                            .foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                }
                if let progress = state.progress, let percent = progress.percentComplete {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("Goal progress")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Spacer()
                            Text("\(percent)%")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                        }
                        AnimatedProgressBar(value: percent, color: PhysiqueOSTheme.chartSuccess, accessibilityLabel: "Goal progress")
                        if let remaining = ActiveGoalFormat.remainingLabel(progress) {
                            Text(remaining)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Goal progress")
                    .accessibilityValue(["\(percent) percent", ActiveGoalFormat.remainingLabel(progress)].compactMap { $0 }.joined(separator: ", "))
                }
                if let cadence = state.phase?.measurementCadence {
                    Text(cadence)
                        .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
    }

    private func columnHeader(_ title: String, _ date: String) -> some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(date.isEmpty ? " " : date)
                .physiqueOSFont(PhysiqueOSTypography.goalProgressCaption)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
        .frame(width: columnWidth, alignment: .trailing)
    }

    private func compositionRow(_ label: String, _ baseline: Double?, _ current: Double?, _ change: Double?,
                                unit: String, composition: ActiveGoalCurrentStateReadModel.Composition,
                                changeUnit: String? = nil) -> some View {
        let showsBaseline = !composition.sameAsBaseline && composition.baseline != nil
        let baselineText = ActiveGoalFormat.value(baseline, unit: unit)
        let currentText = ActiveGoalFormat.value(current, unit: unit)
        let changeText = ActiveGoalFormat.signed(change, unit: changeUnit ?? unit)
        return HStack(alignment: .firstTextBaseline) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            if showsBaseline {
                valueCell(baselineText, emphasized: false)
            }
            valueCell(currentText, emphasized: true)
            if composition.change != nil {
                valueCell(changeText, emphasized: false)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([label,
                             showsBaseline ? "baseline \(baselineText)" : nil,
                             "\(composition.sameAsBaseline ? "baseline" : "latest") \(currentText)",
                             composition.change != nil ? "change \(changeText)" : nil]
            .compactMap { $0 }.joined(separator: ", "))
    }

    private func valueCell(_ text: String, emphasized: Bool) -> some View {
        Text(text)
            .physiqueOSFont(emphasized ? PhysiqueOSTypography.label14Heavy : PhysiqueOSTypography.caption12Semibold)
            .foregroundStyle(emphasized ? PhysiqueOSTheme.textPrimary : PhysiqueOSTheme.textSecondary)
            .frame(width: columnWidth, alignment: .trailing)
    }

    // MARK: Guardrail — latest measurement + Server interpretation

    private func guardrailCard(_ guardrail: ActiveGoalCurrentStateReadModel.Guardrail) -> some View {
        GoalAtmosphericCard(tone: .guardrail, padding: 20, cornerRadius: 28) {
            VStack(alignment: .leading, spacing: 12) {
                Label("Guardrail", systemImage: "shield.checkered")
                    .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(guardrail.title)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if let state = ActiveGoalFormat.guardrailState(guardrail) {
                    let tint = guardrail.status == "clear" ? PhysiqueOSTheme.chartSuccess
                        : guardrail.status == "watch" ? PhysiqueOSTheme.chartEffort : PhysiqueOSTheme.accent
                    Text(state)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(tint)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(tint.opacity(0.12))
                        .clipShape(Capsule())
                }
                if let interpretation = guardrail.interpretation, !interpretation.isEmpty {
                    Text(interpretation)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .padding(.vertical, 12)
    }

    // MARK: Training progress — structured evidence, Server summary

    private func trainingSection(_ training: ActiveGoalCurrentStateReadModel.Training) -> some View {
        GoalSection(eyebrow: ActiveGoalFormat.trainingEyebrow(training), title: "Training Progress") {
            VStack(alignment: .leading, spacing: 12) {
                Text(training.summary)
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                if !training.highlights.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(training.highlights.enumerated()), id: \.offset) { _, item in
                            HStack(alignment: .firstTextBaseline) {
                                Label(item.name, systemImage: item.personalRecord == true ? "trophy.fill" : "chart.line.uptrend.xyaxis")
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                Spacer()
                                if let change = item.percentChange {
                                    Text(ActiveGoalFormat.signed(change, unit: "%"))
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                        .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                                }
                            }
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(ActiveGoalFormat.highlightAccessibilityLabel(item))
                        }
                    }
                }
            }
        }
    }

    // MARK: Coaching — latest published briefing's Coach's Take, verbatim

    private func coachTakeSection(_ coachTake: ActiveGoalCurrentStateReadModel.CoachTake) -> some View {
        GoalSection(eyebrow: "Latest coaching", title: "Coach's Take") {
            GoalAtmosphericCard(tone: .activeGoal, padding: 18, cornerRadius: 24) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(coachTake.attribution)
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(PhysiqueOSTheme.accent)
                    ForEach(coachTake.sections) { section in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(section.title)
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(section.text)
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    GoalNavigationButton(title: "Open \(coachTake.briefingLabel)") {
                        onNavigate(.briefingDetail(briefingId: coachTake.artifactId))
                    }
                }
            }
        }
    }

    // MARK: Turning points — selective milestones

    private var turningPointsSection: some View {
        GoalSection(eyebrow: "Major milestones", title: "Evidence Turning Points") {
            VStack(spacing: 20) {
                ForEach(state.turningPoints) { item in
                    HStack(alignment: .top, spacing: 16) {
                        Rectangle()
                            .fill(PhysiqueOSTheme.divider)
                            .frame(width: 2)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(ActiveGoalFormat.shortDate(item.date))
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
}

/// Pure formatting for the current-state layout (numbers and dates only —
/// never interpretation). Unit-tested.
enum ActiveGoalFormat {
    static func shortDate(_ isoDate: String) -> String {
        let parts = isoDate.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return isoDate }
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        return "\(months[parts[1] - 1]) \(parts[2])"
    }

    static func number(_ value: Double) -> String {
        String(format: "%.1f", value)
    }

    static func value(_ value: Double?, unit: String) -> String {
        guard let value else { return "—" }
        return "\(number(value))\(unit)"
    }

    static func signed(_ value: Double?, unit: String) -> String {
        guard let value else { return "—" }
        let rounded = (value * 10).rounded() / 10
        return "\(rounded >= 0 ? "+" : "−")\(number(abs(rounded)))\(unit)"
    }

    static func confidenceHeadline(score: Int, band: String?) -> String {
        guard let band, !band.isEmpty else { return "\(score)% Confidence" }
        return "\(score)% · \(band)"
    }

    static func compositionCaption(_ composition: ActiveGoalCurrentStateReadModel.Composition) -> String {
        if composition.sameAsBaseline { return "\(composition.authority) · goal baseline" }
        return composition.baseline == nil ? "\(composition.authority) · latest scan" : "\(composition.authority) · goal baseline and latest scan"
    }

    static func highlightAccessibilityLabel(_ item: ActiveGoalCurrentStateReadModel.TrainingHighlight) -> String {
        [item.name,
         item.percentChange.map { signed($0, unit: "%") },
         item.personalRecord == true ? "personal record" : nil].compactMap { $0 }.joined(separator: ", ")
    }

    /// The line under the progress bar. The lean-mass change lives in the
    /// composition table and the target in the hero, so this states only what
    /// is left — or that no scan has followed the baseline yet.
    static func remainingLabel(_ progress: ActiveGoalCurrentStateReadModel.Progress) -> String? {
        if progress.status == "awaiting_follow_up" { return "Awaiting the next DEXA" }
        guard let remaining = progress.remainingAmount else { return nil }
        return remaining <= 0 ? "Target reached" : "\(number(remaining)) \(progress.unit) to go"
    }

    /// The hero's Confidence on the current-state Goal: display-only score,
    /// band, the V3 goal thesis and its provenance. The detailed V3 evidence
    /// (supports/limits/could-raise/could-lower/assumptions) stays in the
    /// Server contract and is deliberately not presented on the Goal.
    struct HeroConfidence: Equatable {
        let headline: String
        let thesis: String?
        let provenance: String?
        let accessibilityLabel: String
    }

    static func heroConfidence(_ state: ActiveGoalCurrentStateReadModel) -> HeroConfidence? {
        guard let confidence = state.confidence, let score = confidence.score else { return nil }
        let thesis = confidence.summary.flatMap { $0.isEmpty ? nil : $0 }
        let provenance = confidence.publishedBy?.asOfLabel.flatMap { $0.isEmpty ? nil : $0 }
        let band = confidence.band.flatMap { $0.isEmpty ? nil : $0 }
        let spoken = ["Confidence \(score) percent\(band.map { ", \($0)" } ?? "")", thesis, provenance]
            .compactMap { $0 }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: ".!?")) }
            .filter { !$0.isEmpty }
            .joined(separator: ". ") + "."
        return HeroConfidence(headline: confidenceHeadline(score: score, band: confidence.band), thesis: thesis,
                              provenance: provenance, accessibilityLabel: spoken)
    }

    /// The pill carries the reading and its status; the scan date is already
    /// the composition table's "Latest" column.
    static func guardrailState(_ guardrail: ActiveGoalCurrentStateReadModel.Guardrail) -> String? {
        guard let measurement = guardrail.measurement, let position = guardrail.position else { return nil }
        let where_: String
        switch position {
        case "within": where_ = "Within range"
        case "below": where_ = "Below range"
        case "above": where_ = "Above range"
        default: return nil
        }
        return "\(number(measurement.value))% · \(where_)"
    }

    static func trainingEyebrow(_ training: ActiveGoalCurrentStateReadModel.Training) -> String {
        "Since \(shortDate(training.periodStart)) · \(training.trainingDayCount) training \(training.trainingDayCount == 1 ? "day" : "days")"
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
    /// The current-state layout shows goal progress once, in its own
    /// section, so phase cards there carry identity and dates only.
    var showsProgress: Bool = true

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
                if showsProgress {
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

/// A thin, single-purpose supporting-objective page — mirrors the real
/// `/goals/maintenance`/`/goals/lean-mass`-style pages the audit for this
/// task confirmed exist as their own real (but simple) routes, distinct
/// from the primary Goal's much richer multi-phase page. Fixes the
/// "Home → Your Goals looks tappable but goes nowhere" gap for these two
/// rows by giving them a real, existing destination rather than a
/// duplicated Home-only detail surface.
private struct SupportingObjectiveDetailContent: View {
    let goal: SupportingObjectiveReadModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Supporting Objective")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text(goal.title)
                    .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(goal.status)
                    .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            CardContainer {
                VStack(alignment: .leading, spacing: 8) {
                    Text(goal.detail)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(goal.narrative)
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }
}
