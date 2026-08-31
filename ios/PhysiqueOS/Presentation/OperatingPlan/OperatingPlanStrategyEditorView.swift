import SwiftUI

/// `strategy/[strategyType]/[strategyId]/edit/page.js` +
/// `StrategyEditorService.js` — the real, currently reachable editors for
/// Nutrition, Training, and Coaching Updates (Energy has none; guarded by
/// `OperatingPlanStrategyDetailView` never offering an edit destination for
/// it). Saves are local-only via `OperatingPlanSandboxStore` — nothing
/// here reaches a server.
struct OperatingPlanStrategyEditorView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let strategyType: String
    let strategyId: String

    var body: some View {
        Group {
            switch strategyType {
            case "nutrition":
                NutritionStrategyEditor(strategyId: strategyId, store: environment.operatingPlanStore, onSaved: { dismiss() })
            case "training":
                TrainingStrategyEditor(strategyId: strategyId, store: environment.operatingPlanStore, onSaved: { dismiss() })
            case "briefings":
                CoachingUpdatesEditor(strategyId: strategyId, store: environment.operatingPlanStore, onSaved: { dismiss() })
            default:
                OperatingPlanUnavailableView(message: "This strategy cannot be edited.")
            }
        }
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Cancel") { dismiss() }
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }
}

private struct NutritionStrategyEditor: View {
    let strategyId: String
    let store: OperatingPlanSandboxStore
    let onSaved: () -> Void

    @State private var model: NutritionStrategyEditorReadModel?
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            if let model {
                VStack(alignment: .leading, spacing: 18) {
                    OperatingPlanScreenHeader(eyebrow: "Nutrition", title: "Edit Strategy", subtitle: "Macro targets that translate the Energy strategy into daily nutrition.")

                    OperatingPlanSection("Protein Basis") {
                        HStack(spacing: 8) {
                            ForEach(ProteinBasis.allCases) { basis in
                                OperatingPlanChoicePill(title: basis.label, isSelected: model.proteinBasis == basis) {
                                    self.model?.proteinBasis = basis
                                }
                            }
                        }
                        if model.proteinBasis == .bodyWeight {
                            CardContainer(padding: .sm) {
                                Stepper(value: Binding(get: { model.proteinRatio }, set: { self.model?.proteinRatio = $0 }), in: 0.5...2.0, step: 0.1) {
                                    Text("\(model.proteinRatio, specifier: "%.1f") g per lb bodyweight")
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                }
                            }
                        } else {
                            CardContainer(padding: .sm) {
                                Stepper(value: Binding(get: { model.fixedProteinGrams }, set: { self.model?.fixedProteinGrams = $0 }), in: 50...400, step: 5) {
                                    Text("\(Int(model.fixedProteinGrams)) g")
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                }
                            }
                        }
                    }

                    OperatingPlanSection("Carbohydrate Approach") {
                        HStack(spacing: 8) {
                            ForEach(CarbohydrateStrategy.allCases) { strategy in
                                OperatingPlanChoicePill(title: strategy.label, isSelected: model.carbohydrateStrategy == strategy) {
                                    self.model?.carbohydrateStrategy = strategy
                                }
                            }
                        }
                    }

                    OperatingPlanSection("Fat Approach") {
                        HStack(spacing: 8) {
                            ForEach(FatStrategy.allCases) { strategy in
                                OperatingPlanChoicePill(title: strategy.label, isSelected: model.fatStrategy == strategy) {
                                    self.model?.fatStrategy = strategy
                                }
                            }
                        }
                    }

                    if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
                    PrimaryActionButton(title: "Save Strategy") { save(model) }
                        .accessibilityIdentifier("operatingPlan.nutrition.save")
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            } else {
                OperatingPlanUnavailableView(message: "This strategy is unavailable.")
            }
        }
        .physiqueOSScrollBottomClearance()
        .onAppear { if model == nil { model = store.nutritionEditor(strategyId: strategyId) } }
    }

    private func save(_ model: NutritionStrategyEditorReadModel) {
        switch store.saveNutrition(model) {
        case .success: errorMessage = nil; onSaved()
        case .failure(let error): errorMessage = error.message
        }
    }
}

private struct TrainingStrategyEditor: View {
    let strategyId: String
    let store: OperatingPlanSandboxStore
    let onSaved: () -> Void

    @State private var model: TrainingStrategyEditorReadModel?
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            if let model {
                VStack(alignment: .leading, spacing: 18) {
                    OperatingPlanScreenHeader(eyebrow: "Training", title: "Edit Strategy", subtitle: "Weekly structure and progression intent for the current phase.")

                    OperatingPlanSection("Weekly Frequency") {
                        VStack(spacing: 7) {
                            ForEach(model.frequencies.indices, id: \.self) { index in
                                CardContainer(padding: .sm) {
                                    Stepper(value: Binding(
                                        get: { self.model?.frequencies[index].count ?? 0 },
                                        set: { self.model?.frequencies[index].count = $0 }
                                    ), in: 0...7) {
                                        HStack {
                                            Text(model.frequencies[index].area.label)
                                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                            Spacer()
                                            Text("\(model.frequencies[index].count)x / week")
                                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    OperatingPlanSection("Training Focus") {
                        FlowPills(items: TrainingStrategyArea.allCases, isSelected: { model.priorities.contains($0) }, label: \.label) { area in
                            if let index = self.model?.priorities.firstIndex(of: area) {
                                self.model?.priorities.remove(at: index)
                            } else {
                                self.model?.priorities.append(area)
                            }
                        }
                    }

                    OperatingPlanSection("Progression") {
                        HStack(spacing: 8) {
                            ForEach(ProgressionPace.allCases) { pace in
                                OperatingPlanChoicePill(title: pace.label, isSelected: model.progression == pace) {
                                    self.model?.progression = pace
                                }
                            }
                        }
                    }

                    if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
                    PrimaryActionButton(title: "Save Strategy") { save(model) }
                        .accessibilityIdentifier("operatingPlan.training.save")
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            } else {
                OperatingPlanUnavailableView(message: "This strategy is unavailable.")
            }
        }
        .physiqueOSScrollBottomClearance()
        .onAppear { if model == nil { model = store.trainingEditor(strategyId: strategyId) } }
    }

    private func save(_ model: TrainingStrategyEditorReadModel) {
        switch store.saveTraining(model) {
        case .success: errorMessage = nil; onSaved()
        case .failure(let error): errorMessage = error.message
        }
    }
}

private struct CoachingUpdatesEditor: View {
    let strategyId: String
    let store: OperatingPlanSandboxStore
    let onSaved: () -> Void

    @State private var model: CoachingUpdatesEditorReadModel?

    var body: some View {
        ScrollView {
            if let model {
                VStack(alignment: .leading, spacing: 18) {
                    OperatingPlanScreenHeader(eyebrow: "Coaching Updates", title: "Edit Coaching Updates", subtitle: "How and when PhysiqueOS synthesizes progress into a readable update.")

                    OperatingPlanSection("Midweek Calibration") {
                        CardContainer(padding: .sm) {
                            VStack(alignment: .leading, spacing: 10) {
                                Toggle("Midweek Calibration", isOn: Binding(get: { model.midweekCalibrationEnabled }, set: { self.model?.midweekCalibrationEnabled = $0 }))
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .tint(PhysiqueOSTheme.accent)
                                timeOfDayPicker(selection: Binding(get: { model.midweekTimeOfDay }, set: { self.model?.midweekTimeOfDay = $0 }))
                            }
                        }
                    }

                    OperatingPlanSection("Weekly Synthesis") {
                        CardContainer(padding: .sm) {
                            VStack(alignment: .leading, spacing: 10) {
                                Toggle("Weekly Synthesis", isOn: Binding(get: { model.weeklySynthesisEnabled }, set: { self.model?.weeklySynthesisEnabled = $0 }))
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .tint(PhysiqueOSTheme.accent)
                                timeOfDayPicker(selection: Binding(get: { model.weeklyTimeOfDay }, set: { self.model?.weeklyTimeOfDay = $0 }))
                            }
                        }
                    }

                    OperatingPlanSection("Routine Daily Briefings") {
                        CardContainer(padding: .sm) {
                            Toggle("Routine Daily Briefings", isOn: Binding(get: { model.routineDailyBriefingsEnabled }, set: { self.model?.routineDailyBriefingsEnabled = $0 }))
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .tint(PhysiqueOSTheme.accent)
                        }
                    }

                    OperatingPlanSection("Notifications") {
                        CardContainer(padding: .sm) {
                            Toggle("Notify when ready", isOn: Binding(get: { model.notifyWhenReady }, set: { self.model?.notifyWhenReady = $0 }))
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .tint(PhysiqueOSTheme.accent)
                        }
                    }

                    PrimaryActionButton(title: "Save Coaching Updates") { store.saveCoaching(model); onSaved() }
                        .accessibilityIdentifier("operatingPlan.coaching.save")
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            } else {
                OperatingPlanUnavailableView(message: "Coaching Updates are unavailable.")
            }
        }
        .physiqueOSScrollBottomClearance()
        .onAppear { if model == nil { model = store.coachingEditor(strategyId: strategyId) } }
    }

    private func timeOfDayPicker(selection: Binding<TimeOfDayChoice>) -> some View {
        HStack(spacing: 8) {
            ForEach(TimeOfDayChoice.allCases) { choice in
                OperatingPlanChoicePill(title: choice.label, isSelected: selection.wrappedValue == choice) {
                    selection.wrappedValue = choice
                }
            }
        }
    }
}

/// A wrapping multi-select pill grid — the shared control behind Training
/// Focus (and reused by Recovery Support's day picker).
struct FlowPills<Item: Hashable>: View {
    let items: [Item]
    let isSelected: (Item) -> Bool
    let label: KeyPath<Item, String>
    let toggle: (Item) -> Void

    private let columns = [GridItem(.adaptive(minimum: 84), spacing: 8)]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                OperatingPlanChoicePill(title: item[keyPath: label], isSelected: isSelected(item)) { toggle(item) }
            }
        }
    }
}
