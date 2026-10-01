import SwiftUI

/// `/goals/[goalId]/edit` — `GoalEditWizardScreen.jsx`. Reached from the
/// Goal Detail hero's "Edit Goal" action, only for the active/primary
/// goal. Reuses `ProtocolBuilderShell`/`ProtocolBuilderChoiceRow` (the
/// same step-wizard chrome the Operating Plan builders use) rather than
/// inventing a second wizard shell.
struct GoalEditWizardView: View {
    @Environment(AppEnvironment.self) private var environment
    let onNavigate: (AppDestination) -> Void
    let goalId: String

    var body: some View {
        if let draft = environment.goalsSandboxStore.goalEditDraft(goalId: goalId) {
            GoalEditWizard(initial: draft, store: environment.goalsSandboxStore, onDone: { onNavigate(.goalDetail(goalId: goalId)) })
        } else {
            GoalUnavailableView(message: "This goal is not editable.")
        }
    }
}

private struct GoalEditWizard: View {
    let initial: GoalEditDraft
    let store: GoalsSandboxStore
    let onDone: () -> Void

    @State private var draft: GoalEditDraft
    @State private var step = 0
    @State private var errorMessage: String?
    @State private var savedMessage: String?

    init(initial: GoalEditDraft, store: GoalsSandboxStore, onDone: @escaping () -> Void) {
        self.initial = initial
        self.store = store
        self.onDone = onDone
        _draft = State(initialValue: initial)
    }

    private var totalSteps: Int { draft.orderedSteps.count + 2 }
    private var currentSection: GoalEditSection? {
        step >= 1 && step <= draft.orderedSteps.count ? draft.orderedSteps[step - 1] : nil
    }
    private var isReviewStep: Bool { step == draft.orderedSteps.count + 1 && step > 0 }

    private var planChanged: Bool { draft.plan != initial.plan }
    private var phasesChanged: Bool { draft.phases != initial.phases }

    var body: some View {
        if let savedMessage {
            VStack(spacing: 18) {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 44)).foregroundStyle(PhysiqueOSTheme.chartSuccess)
                Text(savedMessage).physiqueOSFont(PhysiqueOSTypography.cardHeading20).foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("Your changes are saved. Your evidence and history are right where you left them.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .multilineTextAlignment(.center)
                PrimaryActionButton(title: "Back to goal", action: onDone)
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(PhysiqueOSTheme.background)
        } else {
            ProtocolBuilderShell(
                eyebrow: "Goal Edit",
                title: title,
                currentStep: step + 1,
                totalSteps: totalSteps,
                canContinue: canContinue,
                primaryLabel: primaryLabel,
                errorMessage: errorMessage,
                onBack: step > 0 ? { step -= 1 } : nil,
                onContinue: { advance() }
            ) {
                content
            }
        }
    }

    private var title: String {
        if step == 0 { return "What would you like to edit?" }
        if let section = currentSection { return section.title }
        return "Review changes"
    }

    private var primaryLabel: String {
        isReviewStep ? "Save changes" : "Continue"
    }

    private var canContinue: Bool {
        if step == 0 { return !draft.selectedSections.isEmpty }
        return true
    }

    private func advance() {
        errorMessage = nil
        if isReviewStep {
            save()
            return
        }
        step += 1
    }

    private func save() {
        if let error = GoalEditValidation.combinedChangesError(planChanged: planChanged, phasesChanged: phasesChanged) {
            errorMessage = error
            return
        }
        if planChanged {
            switch store.saveGoalPlan(draft.plan) {
            case .success: savedMessage = "Goal updated"
            case .failure(let error): errorMessage = error.message
            }
        } else if phasesChanged {
            switch store.saveGoalPhases(draft.phases) {
            case .success: savedMessage = "Goal phases updated"
            case .failure(let error): errorMessage = error.message
            }
        } else {
            errorMessage = "No changes to save."
        }
    }

    @ViewBuilder private var content: some View {
        if step == 0 {
            sectionChooser
        } else if let section = currentSection {
            sectionEditor(section)
        } else {
            reviewStep
        }
    }

    private var sectionChooser: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Choose one or more sections to update. Goal-plan changes and phase changes are saved separately.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            ForEach(GoalEditSection.allCases) { section in
                let selected = draft.selectedSections.contains(section)
                ProtocolBuilderChoiceRow(title: section.title, detail: nil, impact: nil, isSelected: selected) {
                    if selected { draft.selectedSections.remove(section) } else { draft.selectedSections.insert(section) }
                }
            }
        }
    }

    @ViewBuilder private func sectionEditor(_ section: GoalEditSection) -> some View {
        switch section {
        case .goalAndPurpose:
            VStack(alignment: .leading, spacing: 12) {
                labeledField("Goal name", text: $draft.plan.name)
                labeledField("Purpose", text: $draft.plan.purpose)
                labeledField("Primary outcome", text: $draft.plan.primaryOutcome)
            }
        case .overallGoal:
            VStack(alignment: .leading, spacing: 12) {
                Text("Where would you like this journey to end?").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                labeledField("Goal outcome", text: $draft.plan.target.description)
                DateField(date: Binding(
                    get: { OperatingPlanDateValues.date(from: draft.plan.timeline.startDate) },
                    set: { draft.plan.timeline.startDate = OperatingPlanDateValues.dateKey(from: $0) }
                ), maximumDate: .distantFuture, label: "Journey begins")
                DateField(date: Binding(
                    get: { OperatingPlanDateValues.date(from: draft.plan.timeline.targetDate ?? draft.plan.timeline.startDate) },
                    set: {
                        let key = OperatingPlanDateValues.dateKey(from: $0)
                        draft.plan.timeline.targetDate = key
                        draft.plan.target.targetDate = key
                    }
                ), maximumDate: .distantFuture, label: "Target date")
                Text("This is the destination for the entire goal. Individual phase timing may change as evidence comes in, but this remains the target unless you choose to change it.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        case .successCriteria:
            listEditor(title: "Success criteria", items: $draft.plan.successCriteria, addLabel: "Add criterion")
        case .guardrails:
            listEditor(title: "Guardrails", items: $draft.plan.guardrails, addLabel: "Add guardrail")
        case .coaching:
            Text("Briefing cadence, reminders, and scheduling remain unchanged.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
        case .phases:
            phasesEditor
        }
    }

    private func labeledField(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textMuted)
            TextField(label, text: text).textFieldStyle(.roundedBorder)
        }
    }

    private func listEditor(title: String, items: Binding<[GoalPlanListItem]>, addLabel: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(items.wrappedValue.indices, id: \.self) { index in
                HStack {
                    TextField("Item", text: Binding(get: { items.wrappedValue[index].text }, set: { items.wrappedValue[index].text = $0 }))
                        .textFieldStyle(.roundedBorder)
                    Button { items.wrappedValue.remove(at: index) } label: {
                        Image(systemName: "minus.circle.fill").foregroundStyle(PhysiqueOSTheme.destructive)
                    }
                }
            }
            Button(addLabel) {
                items.wrappedValue.append(.init(key: "item-\(UUID().uuidString.prefix(8))", text: ""))
            }
            .physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.accent)
        }
    }

    private var phasesEditor: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Operational phase lifecycle and timing changes require the Phase Transition flow — you can still update purpose, success criteria, and guardrails here.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textMuted)
            ForEach(draft.phases.indices, id: \.self) { index in
                let isActive = draft.phases[index].id == draft.activePhaseId
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Phase \(draft.phases[index].order) · \(draft.phases[index].status.label)")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer()
                        if isActive {
                            StatusChip(text: "Active — locked timing", color: .muted)
                        }
                    }
                    TextField("Phase name", text: Binding(get: { draft.phases[index].name }, set: { draft.phases[index].name = $0 }))
                        .textFieldStyle(.roundedBorder)
                    TextField("Purpose", text: Binding(get: { draft.phases[index].purpose }, set: { draft.phases[index].purpose = $0 }))
                        .textFieldStyle(.roundedBorder)
                }
                .padding(12)
                .background(PhysiqueOSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
        }
    }

    private var reviewStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            if planChanged {
                ProtocolBuilderReview(sections: [
                    .init(label: "Goal name", value: draft.plan.name),
                    .init(label: "Purpose", value: draft.plan.purpose),
                    .init(label: "Timeline", value: "\(draft.plan.timeline.startDate) → \(draft.plan.timeline.targetDate ?? "Open-ended")"),
                    .init(label: "Success criteria", value: draft.plan.successCriteria.map(\.text).joined(separator: "\n")),
                    .init(label: "Guardrails", value: draft.plan.guardrails.map(\.text).joined(separator: "\n")),
                ], footer: "Existing evidence and history remain intact.")
            } else if phasesChanged {
                ProtocolBuilderReview(sections: draft.phases.map {
                    .init(label: "Phase \($0.order) · \($0.name)", value: $0.purpose)
                }, footer: "Existing evidence and history remain intact.")
            } else {
                Text("No changes to review yet.").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }
}
