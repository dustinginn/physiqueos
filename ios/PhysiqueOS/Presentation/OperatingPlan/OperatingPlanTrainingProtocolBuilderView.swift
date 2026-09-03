import SwiftUI

/// `/profile/operating-plan/training/new` — `TrainingProtocolBuilderScreen.jsx`.
/// Real, live, reachable from the Operating Plan landing's Training row
/// (`buildTrainingPlanItem`) whenever no Training strategy is active yet;
/// once one exists the real web page redirects away before rendering
/// anything, so this view mirrors that same gate first (`GateView`) rather
/// than always showing the 11-step wizard.
struct OperatingPlanTrainingProtocolBuilderView: View {
    @Environment(AppEnvironment.self) private var environment
    let onNavigate: (AppDestination) -> Void

    private var store: OperatingPlanSandboxStore { environment.operatingPlanStore }

    var body: some View {
        let context = store.trainingProtocolBuilderContext()
        Group {
            if context.hasActiveProtocol {
                OperatingPlanUnavailableView(message: "You already have an active Training strategy.")
                    .navigationTitle("Training Strategy")
                    .navigationBarTitleDisplayMode(.inline)
            } else {
                TrainingProtocolBuilderWizard(context: context, onActivated: {
                    onNavigate(.operatingPlanStrategy(strategyType: "training", strategyId: "strategy_fixture_training"))
                })
            }
        }
    }
}

private struct TrainingProtocolBuilderWizard: View {
    let context: TrainingProtocolBuilderContextReadModel
    let onActivated: () -> Void

    @Environment(AppEnvironment.self) private var environment
    @State private var step = 1
    @State private var draft: TrainingProtocolBuilderDraft
    @State private var errorMessage: String?
    private let totalSteps = 11

    init(context: TrainingProtocolBuilderContextReadModel, onActivated: @escaping () -> Void) {
        self.context = context
        self.onActivated = onActivated
        _draft = State(initialValue: TrainingProtocolBuilderDraft(context: context))
    }

    private var canContinue: Bool {
        switch step {
        case 3: !draft.priorities.isEmpty
        case 9: !draft.recoveryGates.isEmpty
        default: true
        }
    }

    var body: some View {
        ProtocolBuilderShell(
            eyebrow: "Training Protocol Builder",
            title: stepTitle,
            currentStep: step,
            totalSteps: totalSteps,
            canContinue: canContinue,
            primaryLabel: primaryLabel,
            errorMessage: errorMessage,
            onBack: step > 1 ? { step -= 1 } : nil,
            onContinue: {
                if step < totalSteps { step += 1 } else { activate() }
            }
        ) {
            stepContent
        }
    }

    private func activate() {
        let store = environment.operatingPlanStore
        switch store.activateTrainingProtocol(draft) {
        case .success: errorMessage = nil; onActivated()
        case .failure(let error): errorMessage = error.message
        }
    }

    private var primaryLabel: String {
        [2: "Use this objective", 3: "Use these priorities", 4: "Use these frequencies", 5: "Use this rhythm",
         6: "Use this pace", 7: "Use this rule", 8: "Use maintenance", 9: "Use these safeguards",
         10: "Continue", 11: "Activate Training"][step] ?? "Continue"
    }

    private var stepTitle: String {
        switch step {
        case 1: "Let's define how Training supports what comes next."
        case 2: "What matters most from your training right now?"
        case 3: "Which areas deserve the most attention?"
        case 4: "How often should each area be trained?"
        case 5: "Build your preferred weekly rhythm."
        case 6: "How quickly should progression move?"
        case 7: "Here's the default progression rule."
        case 8: "Which nutrition phase should shape expectations?"
        case 9: "When should progression pause?"
        case 10: "Your Training Strategy"
        default: "Ready to add Training to your Operating Plan?"
        }
    }

    @ViewBuilder private var stepContent: some View {
        switch step {
        case 1:
            VStack(alignment: .leading, spacing: 10) {
                Text("This sets the weekly structure and progression philosophy PhysiqueOS will coach against. Individual workouts can still move when life requires it.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        case 2:
            VStack(alignment: .leading, spacing: 10) {
                Text("Choose the outcome that should guide the plan.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                ForEach(TrainingBuilderObjective.allCases) { objective in
                    ProtocolBuilderChoiceRow(title: objective.label, detail: objective.detail, impact: objective.impact, isSelected: draft.objective == objective) {
                        draft.objective = objective
                    }
                }
            }
        case 3:
            VStack(alignment: .leading, spacing: 10) {
                Text("Priorities tell PhysiqueOS where progression deserves extra attention. They don't make the rest of your training optional.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                FlowPills(items: TrainingStrategyArea.allCases, isSelected: { draft.priorities.contains($0) }, label: \.label) { area in
                    if draft.priorities.contains(area) { draft.priorities.removeAll { $0 == area } } else { draft.priorities.append(area) }
                }
            }
        case 4:
            VStack(alignment: .leading, spacing: 10) {
                Text("Weekly frequency is the commitment. The exact training day can move without turning a rescheduled session into a miss.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                ForEach(TrainingStrategyArea.allCases) { area in
                    HStack {
                        Text(area.label).physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Spacer()
                        Picker(area.label, selection: frequencyBinding(area)) {
                            ForEach(0...4, id: \.self) { value in Text("\(value)x").tag(value) }
                        }.pickerStyle(.menu).tint(PhysiqueOSTheme.accent)
                    }
                    .padding(.horizontal, 14).frame(minHeight: 44)
                    .background(PhysiqueOSTheme.surfaceMuted).clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
        case 5:
            VStack(alignment: .leading, spacing: 10) {
                Text("Choose what you prefer to train each day. Combine areas when that fits. This schedule can move — the weekly frequency targets remain the commitment.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                ForEach(draft.rhythm.indices, id: \.self) { index in
                    rhythmDayEditor(index)
                }
            }
        case 6:
            VStack(alignment: .leading, spacing: 10) {
                Text("Maintenance should restore performance and support steady progress without forcing load increases before they're earned.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                ForEach(ProgressionPace.allCases) { pace in
                    ProtocolBuilderChoiceRow(title: pace.label, detail: progressionDetail(pace), impact: progressionImpact(pace), isSelected: draft.progressionPace == pace) {
                        draft.progressionPace = pace
                    }
                }
            }
        case 7:
            VStack(alignment: .leading, spacing: 10) {
                Text("Reach the top of the rep range across two successful sessions before increasing load.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text("This keeps progression deliberate. Exercise-specific exceptions can come later when PhysiqueOS has enough evidence to support them.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                summaryBox(label: "Default rule", value: "Two successful sessions · then increase load")
            }
        case 8:
            VStack(alignment: .leading, spacing: 10) {
                Text("Energy availability changes what productive training looks like.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                ForEach(TrainingBuilderNutritionPhase.allCases) { phase in
                    ProtocolBuilderChoiceRow(title: phase.label, detail: phase.detail, impact: phase.impact, isSelected: draft.nutritionPhase == phase) {
                        draft.nutritionPhase = phase
                    }
                }
            }
        case 9:
            VStack(alignment: .leading, spacing: 10) {
                Text("Progress is useful only when your body is ready to support it. An enabled safeguard tells PhysiqueOS to hold progression until the signal improves.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                ForEach(TrainingBuilderRecoveryGate.allCases) { gate in
                    ProtocolBuilderChoiceRow(title: gate.label, detail: gate.detail, impact: nil, isSelected: draft.recoveryGates.contains(gate)) {
                        if draft.recoveryGates.contains(gate) { draft.recoveryGates.removeAll { $0 == gate } } else { draft.recoveryGates.append(gate) }
                    }
                }
            }
        case 10:
            ProtocolBuilderReview(sections: reviewSections, footer: "Founder-authored · Begins upon activation")
        default:
            VStack(alignment: .leading, spacing: 10) {
                Text("PhysiqueOS will use this strategy to understand your weekly training rhythm, keep progression aligned with recovery, and focus future coaching on what matters most.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                summaryBox(label: "Starts today", value: context.effectiveDateLabel)
            }
        }
    }

    private func frequencyBinding(_ area: TrainingStrategyArea) -> Binding<Int> {
        Binding(
            get: { draft.frequencies.first { $0.area == area }?.count ?? 0 },
            set: { newValue in
                if let index = draft.frequencies.firstIndex(where: { $0.area == area }) {
                    draft.frequencies[index].count = newValue
                }
            }
        )
    }

    private func rhythmDayEditor(_ index: Int) -> some View {
        let day = draft.rhythm[index]
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(day.day.label).physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.textPrimary)
                Spacer()
                OperatingPlanChoicePill(title: "Flexible / Recovery", isSelected: day.isFlexibleRecovery) {
                    draft.rhythm[index].isFlexibleRecovery.toggle()
                    if draft.rhythm[index].isFlexibleRecovery { draft.rhythm[index].focus = [] }
                }
            }
            if !day.isFlexibleRecovery {
                FlowPills(items: TrainingStrategyArea.allCases, isSelected: { draft.rhythm[index].focus.contains($0) }, label: \.label) { area in
                    if draft.rhythm[index].focus.contains(area) { draft.rhythm[index].focus.removeAll { $0 == area } }
                    else { draft.rhythm[index].focus.append(area) }
                }
            }
        }
        .padding(12)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func summaryBox(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased()).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textMuted)
            Text(value).physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func progressionDetail(_ pace: ProgressionPace) -> String {
        switch pace {
        case .conservative: "Increase load or difficulty only after repeated, consistent success."
        case .moderate: "Progress after repeated evidence shows the current load is controlled and repeatable."
        case .aggressive: "Attempt progression as soon as performance suggests the next step may be possible."
        }
    }
    private func progressionImpact(_ pace: ProgressionPace) -> String {
        switch pace {
        case .conservative: "More time is spent mastering each level, with fewer failed attempts and lower recovery demand."
        case .moderate: "Balances steady improvement with recovery and is the intended pace for maintenance."
        case .aggressive: "Creates more opportunities for rapid progress, with more failed attempts and higher recovery demand."
        }
    }

    private var reviewSections: [ProtocolBuilderReview.Section] {
        [
            .init(label: "Purpose", value: draft.objective.reviewSummary),
            .init(label: "Training priorities", value: draft.priorities.map(\.label).joined(separator: " · ")),
            .init(label: "Weekly expectations", value: draft.frequencies.filter { $0.count > 0 }.map { "\($0.area.label) \($0.count)x" }.joined(separator: " · ")),
            .init(label: "Preferred weekly rhythm", value: draft.rhythm.map(rhythmLine).joined(separator: "\n")),
            .init(label: "Progression philosophy", value: "\(draft.progressionPace.label) pace. Reach the top of the rep range across two successful sessions before increasing load."),
            .init(label: "Recovery philosophy", value: draft.recoveryGates.map(\.label).joined(separator: " · ")),
            .init(label: "Nutrition context", value: "\(draft.nutritionPhase.label). Restore performance and build gradual progression."),
            .init(label: "How PhysiqueOS will coach this", value: "Prioritize the training day, reference Training selectively in future coaching, and keep push alerts off."),
            .init(label: "When we'll revisit it", value: "When your goal or nutrition phase changes, recovery slips, performance regresses, or the strategy stops matching your progress."),
        ]
    }

    private func rhythmLine(_ day: TrainingBuilderRhythmDay) -> String {
        let focus = day.focus.map(\.label).joined(separator: " / ")
        return "\(day.day.label) · \(day.isFlexibleRecovery ? "Flexible / Recovery" : (focus.isEmpty ? "Open" : focus))"
    }
}
