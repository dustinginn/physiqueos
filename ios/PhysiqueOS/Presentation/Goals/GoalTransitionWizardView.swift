import SwiftUI

/// `/goals/transition` (Route A of 5) — `GoalTransitionPreviewScreen.jsx`.
/// Reached from the Goals tab's "Add Goal" card only when
/// `hub.addGoalAvailable` is true (the real
/// `ProductionGoalTransitionEntryPointService` eligibility gate — a goal
/// ready to transition). All 10 real sections are ported; "Create Goal"
/// on the final Review section hands off to Route B
/// (`.goalProtocolTransition`).
struct GoalTransitionWizardView: View {
    @Environment(AppEnvironment.self) private var environment
    let onNavigate: (AppDestination) -> Void

    var body: some View {
        let store = environment.goalsSandboxStore
        if store.isTransitionEligible {
            GoalTransitionWizard(initial: store.currentTransitionDraft(), store: store, onNavigate: onNavigate)
        } else {
            GoalUnavailableView(message: "There isn't a goal ready to transition right now.")
        }
    }
}

private struct GoalTransitionWizard: View {
    let store: GoalsSandboxStore
    let onNavigate: (AppDestination) -> Void

    @State private var draft: GoalTransitionDraft
    @State private var step = 0
    @State private var errorMessage: String?

    init(initial: GoalTransitionDraft, store: GoalsSandboxStore, onNavigate: @escaping (AppDestination) -> Void) {
        self.store = store
        self.onNavigate = onNavigate
        _draft = State(initialValue: initial)
    }

    private let sections = GoalTransitionSection.allCases
    private var currentSection: GoalTransitionSection { sections[step] }
    private var isLastStep: Bool { step == sections.count - 1 }

    var body: some View {
        ProtocolBuilderShell(
            eyebrow: "Goal creation",
            title: currentSection.title,
            currentStep: step + 1,
            totalSteps: sections.count,
            canContinue: canContinue,
            primaryLabel: isLastStep ? "Create Goal" : "Continue",
            errorMessage: errorMessage,
            onBack: step > 0 ? { step -= 1 } : nil,
            onContinue: { advance() }
        ) {
            content
        }
    }

    private var canContinue: Bool {
        switch currentSection {
        case .objective: return !draft.objectiveTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        default: return true
        }
    }

    private func advance() {
        errorMessage = nil
        store.saveTransitionDraft(draft)
        if isLastStep {
            switch store.markTransitionReady() {
            case .success: onNavigate(.goalProtocolTransition)
            case .failure(let error): errorMessage = error.message
            }
            return
        }
        step += 1
    }

    @ViewBuilder private var content: some View {
        switch currentSection {
        case .completion:
            VStack(alignment: .leading, spacing: 10) {
                Text("You've reached the end of this goal. We'll use what you accomplished — and where you are today — to establish your next destination. Nothing changes until you make the final choice.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        case .objective:
            VStack(alignment: .leading, spacing: 10) {
                ForEach(GoalTransitionObjective.allCases) { objective in
                    ProtocolBuilderChoiceRow(title: objective.label, detail: nil, impact: nil, isSelected: draft.objective == objective) {
                        draft.objective = objective
                    }
                }
                if draft.objective == .custom {
                    TextField("Name your objective", text: $draft.customObjectiveTitle).textFieldStyle(.roundedBorder)
                }
            }
        case .guardrails:
            VStack(alignment: .leading, spacing: 10) {
                Text("Accept the guardrails that should carry forward, or add your own.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                ForEach(draft.guardrails.indices, id: \.self) { index in
                    ProtocolBuilderChoiceRow(title: draft.guardrails[index].title, detail: draft.guardrails[index].detail, impact: nil, isSelected: draft.guardrails[index].accepted) {
                        draft.guardrails[index].accepted.toggle()
                    }
                }
            }
        case .evidence:
            VStack(alignment: .leading, spacing: 14) {
                ForEach(GoalTransitionMeasureGroup.allCases) { group in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(group.label.uppercased()).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textMuted)
                        ForEach(draft.measures.indices.filter { draft.measures[$0].group == group }, id: \.self) { index in
                            ProtocolBuilderChoiceRow(title: draft.measures[index].title, detail: nil, impact: nil, isSelected: draft.measures[index].accepted) {
                                draft.measures[index].accepted.toggle()
                            }
                        }
                    }
                }
            }
        case .operating:
            VStack(alignment: .leading, spacing: 14) {
                calibrationList(title: "What we know", items: ["Your most recent DEXA composition.", "Your training frequency and progression trend.", "Your accepted guardrails."])
                calibrationList(title: "What we'll learn during calibration", items: ["How your body responds to the new energy target.", "Whether the new training rhythm holds under real life.", "How recovery trends under the new plan."])
            }
        case .strategy:
            VStack(alignment: .leading, spacing: 10) {
                Text("Your current protocols stay with your completed goal. Here, you're only deciding what should carry forward.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                ForEach(draft.protocolReviews.indices, id: \.self) { index in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(draft.protocolReviews[index].category.label).physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Picker(draft.protocolReviews[index].category.label, selection: Binding(
                            get: { draft.protocolReviews[index].disposition },
                            set: { draft.protocolReviews[index].disposition = $0 }
                        )) {
                            ForEach(ProtocolCategoryDisposition.allCases) { Text($0.label).tag($0) }
                        }.pickerStyle(.menu).tint(PhysiqueOSTheme.accent)
                    }
                    .padding(10)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
        case .commitments:
            VStack(alignment: .leading, spacing: 10) {
                Text("Your future routine, generated from what you've accepted so far.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                ForEach(draft.protocolReviews.filter { $0.disposition != .remove }) { review in
                    Label(review.category.label, systemImage: "checkmark.circle.fill")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                Text("Changed: you'll receive \(draft.cadence.label.lowercased()) coaching updates instead of daily.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        case .cadence:
            VStack(alignment: .leading, spacing: 10) {
                ForEach(ReviewCadence.allCases) { cadence in
                    ProtocolBuilderChoiceRow(title: cadence.label, detail: nil, impact: nil, isSelected: draft.cadence == cadence) {
                        draft.cadence = cadence
                    }
                }
                if draft.cadence == .twiceWeekly || draft.cadence == .custom {
                    FlowPills(items: OperatingPlanWeekday.allCases, isSelected: { draft.cadenceDays.contains($0) }, label: \.label) { day in
                        if draft.cadenceDays.contains(day) { draft.cadenceDays.removeAll { $0 == day } } else { draft.cadenceDays.append(day) }
                    }
                }
            }
        case .supporting:
            VStack(alignment: .leading, spacing: 10) {
                Text("Choose the areas that deserve extra attention.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                FlowPills(items: TrainingStrategyArea.allCases, isSelected: { draft.supportingPriorities.contains($0) }, label: \.label) { area in
                    if draft.supportingPriorities.contains(area) { draft.supportingPriorities.removeAll { $0 == area } } else { draft.supportingPriorities.append(area) }
                }
            }
        case .review:
            ProtocolBuilderReview(sections: [
                .init(label: "Objective", value: draft.objectiveTitle),
                .init(label: "Guardrails", value: draft.guardrails.filter(\.accepted).map(\.title).joined(separator: " · ")),
                .init(label: "Measures", value: draft.measures.filter(\.accepted).map(\.title).joined(separator: " · ")),
                .init(label: "Coaching cadence", value: "\(draft.cadence.label) · \(draft.cadenceDays.map(\.shortLabel).joined(separator: ", "))"),
                .init(label: "Priorities", value: draft.supportingPriorities.map(\.label).joined(separator: ", ")),
            ], footer: "Nothing is activated yet — you'll review protocols next.")
        }
    }

    private func calibrationList(title: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased()).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textMuted)
            ForEach(items, id: \.self) { item in
                Text("• \(item)").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }
}
