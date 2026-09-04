import SwiftUI

/// Native-only: Phase Transition + Energy Strategy — the honest domain
/// contract extension `GoalsSandboxModel.swift`'s doc comment explains.
/// Reached from the Goal Detail's active-phase card ("Review Phase
/// Transition") whenever a next phase exists. Coordinates two stores
/// (`GoalsSandboxStore` for the phase lifecycle, `OperatingPlanSandboxStore`
/// for the Energy Strategy) using a validate-everything-before-committing-
/// anything sequence rather than true cross-store two-phase commit — the
/// simplest way to get all-or-nothing behavior in a synchronous, in-memory
/// fixture environment without over-engineering a distributed transaction
/// system neither store needs anywhere else.
struct PhaseTransitionView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let goalId: String
    let phaseId: String

    var body: some View {
        let goalsStore = environment.goalsSandboxStore
        let operatingPlanStore = environment.operatingPlanStore
        if let context = goalsStore.phaseTransitionContext(goalId: goalId, phaseId: phaseId, hasEnergyStrategyForNextPhase: operatingPlanStore.hasEnergyStrategy(forPhaseId:)) {
            PhaseTransitionWizard(context: context, goalsStore: goalsStore, operatingPlanStore: operatingPlanStore, onDone: { dismiss() })
        } else {
            GoalUnavailableView(message: "This phase is not eligible for transition.")
        }
    }
}

private struct PhaseTransitionWizard: View {
    let context: PhaseTransitionContext
    let goalsStore: GoalsSandboxStore
    let operatingPlanStore: OperatingPlanSandboxStore
    let onDone: () -> Void

    @State private var draft: PhaseTransitionDraft
    @State private var errorMessage: String?
    @State private var committed = false

    init(context: PhaseTransitionContext, goalsStore: GoalsSandboxStore, operatingPlanStore: OperatingPlanSandboxStore, onDone: @escaping () -> Void) {
        self.context = context
        self.goalsStore = goalsStore
        self.operatingPlanStore = operatingPlanStore
        self.onDone = onDone
        var initial = PhaseTransitionDraft()
        if !context.nextPhaseHasEnergyStrategy, context.nextPhase != nil {
            initial.energyStrategy = PhaseTransitionEnergyStrategyDraft(caloricIntakeMin: 2750, caloricIntakeMax: 2850, activityTargetKcal: 550)
        }
        _draft = State(initialValue: initial)
    }

    var body: some View {
        if committed {
            confirmation
        } else {
            form
        }
    }

    private var confirmation: some View {
        VStack(spacing: 18) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 44)).foregroundStyle(PhysiqueOSTheme.chartSuccess)
            Text("Phase transition committed").physiqueOSFont(PhysiqueOSTypography.cardHeading20).foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("Your prior phase's calibration history is preserved. Existing evidence and history remain intact.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                .multilineTextAlignment(.center)
            PrimaryActionButton(title: "Back to goal", action: onDone)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PhysiqueOSTheme.background)
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "Phase Review",
                    title: context.nextPhase != nil ? "Begin \(context.nextPhase!.name)?" : "Continue \(context.currentPhase.name)?",
                    subtitle: "\(context.currentPhase.name) is complete. Choose what happens next."
                )
                if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }

                OperatingPlanSection("Decision") {
                    VStack(spacing: 8) {
                        if context.nextPhase != nil {
                            ProtocolBuilderChoiceRow(title: "Begin \(context.nextPhase!.name)", detail: context.nextPhase!.purpose, impact: nil, isSelected: draft.decision == .beginNext) {
                                draft.decision = .beginNext
                            }
                        }
                        ProtocolBuilderChoiceRow(title: "Continue \(context.currentPhase.name)", detail: "Extend the current phase before deciding.", impact: nil, isSelected: draft.decision == .continueCurrent) {
                            draft.decision = .continueCurrent
                        }
                    }
                }

                if draft.decision == .continueCurrent {
                    OperatingPlanSection("Extension") {
                        Stepper("Extend by \(draft.extendDurationWeeks) week\(draft.extendDurationWeeks == 1 ? "" : "s")", value: $draft.extendDurationWeeks, in: 1...8)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                }

                if draft.decision == .beginNext, !context.nextPhaseHasEnergyStrategy, let nextPhase = context.nextPhase {
                    energyStrategySection(nextPhase)
                }

                PrimaryActionButton(title: "Confirm") { commit() }
                    .accessibilityIdentifier("goalPhaseTransition.confirm")
                Text("Existing evidence and history remain intact.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func energyStrategySection(_ nextPhase: GoalPhaseReadModel) -> some View {
        OperatingPlanSection("New Energy Strategy") {
            CardContainer(padding: .sm) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Establish \(nextPhase.name)'s Energy Strategy as part of this transition.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                    numberField("Caloric intake — low (kcal/day)", value: Binding(
                        get: { draft.energyStrategy?.caloricIntakeMin ?? 0 },
                        set: { draft.energyStrategy?.caloricIntakeMin = $0 }
                    ))
                    numberField("Caloric intake — high (kcal/day)", value: Binding(
                        get: { draft.energyStrategy?.caloricIntakeMax ?? 0 },
                        set: { draft.energyStrategy?.caloricIntakeMax = $0 }
                    ))
                    numberField("Activity/expenditure target (kcal/day)", value: Binding(
                        get: { draft.energyStrategy?.activityTargetKcal ?? 0 },
                        set: { draft.energyStrategy?.activityTargetKcal = $0 }
                    ))
                    TextField("Note (optional)", text: Binding(
                        get: { draft.energyStrategy?.note ?? "" },
                        set: { draft.energyStrategy?.note = $0 }
                    ), axis: .vertical).lineLimit(2...4).textFieldStyle(.roundedBorder)
                }
            }
        }
    }

    private func numberField(_ label: String, value: Binding<Int>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textMuted)
            TextField(label, value: value, format: .number).textFieldStyle(.roundedBorder).keyboardType(.numberPad)
        }
    }

    /// Validate BOTH commands before committing EITHER — the pattern this
    /// file's doc comment describes in place of true cross-store atomicity.
    private func commit() {
        errorMessage = nil
        if let error = PhaseTransitionValidation.error(draft: draft, context: context) {
            errorMessage = error
            return
        }
        if draft.decision == .beginNext, let energy = draft.energyStrategy, let nextPhase = context.nextPhase, !context.nextPhaseHasEnergyStrategy {
            if let error = PhaseTransitionEnergyStrategyValidation.error(energy) {
                errorMessage = error
                return
            }
            let energyResult = operatingPlanStore.establishPhaseEnergyStrategy(
                goalId: context.goalId, phaseId: nextPhase.id, phaseName: nextPhase.name, phaseOrder: nextPhase.order,
                caloricMin: energy.caloricIntakeMin, caloricMax: energy.caloricIntakeMax, activityTarget: energy.activityTargetKcal,
                reviewCadence: energy.reviewCadence, note: energy.note
            )
            guard case .success = energyResult else {
                if case .failure(let error) = energyResult { errorMessage = error.message }
                return
            }
        }
        let result = goalsStore.establishPhaseTransition(
            goalId: context.goalId, decision: draft.decision, currentPhaseId: context.currentPhase.id,
            nextPhaseId: context.nextPhase?.id, extendWeeks: draft.extendDurationWeeks
        )
        switch result {
        case .success: committed = true
        case .failure(let error): errorMessage = error.message
        }
    }
}
