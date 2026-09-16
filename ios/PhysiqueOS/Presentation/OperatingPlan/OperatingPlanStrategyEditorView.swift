import SwiftUI

/// `strategy/[strategyType]/[strategyId]/edit/page.js` +
/// `StrategyEditorService.js` — the real, currently reachable editors for
/// Nutrition, Training, and Coaching Updates (Energy has none; guarded by
/// `OperatingPlanStrategyDetailView` never offering an edit destination for
/// it). Founder Production uses each domain's canonical API and concurrency
/// model; OperatingPlanSandboxStore is used only under Sandbox authority.
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
    @Environment(AppEnvironment.self) private var environment
    let strategyId: String
    let store: OperatingPlanSandboxStore
    let onSaved: () -> Void

    @State private var model: NutritionStrategyEditorReadModel?
    @State private var errorMessage: String?
    @State private var expectedCurrentVersionId: String?
    @State private var protocolId: String?
    @State private var isLoadingProduction = false
    @State private var loadError: String?

    private var isProduction: Bool { environment.nativeAuthority == .founderProduction }

    var body: some View {
        ScrollView {
            if isProduction, isLoadingProduction, model == nil {
                ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 240)
            } else if let model, !isProduction || expectedCurrentVersionId != nil {
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
                OperatingPlanUnavailableView(message: isProduction ? (loadError ?? "This strategy is unavailable.") : "This strategy is unavailable.")
            }
        }
        .physiqueOSScrollBottomClearance()
        .task(id: "\(strategyId):\(environment.nativeAuthority)") { await loadIfNeeded() }
    }

    private func loadIfNeeded() async {
        guard isProduction else {
            protocolId = nil
            expectedCurrentVersionId = nil
            model = store.nutritionEditor(strategyId: strategyId)
            return
        }
        isLoadingProduction = true
        model = nil
        protocolId = nil
        expectedCurrentVersionId = nil
        loadError = nil
        defer { isLoadingProduction = false }
        do {
            guard let detail = try await environment.nutritionStrategyAPI.fetchDetail(strategyId: strategyId) else {
                model = nil
                return
            }
            protocolId = detail.protocolId
            expectedCurrentVersionId = detail.editor.expectedCurrentVersionId
            model = NutritionStrategyEditorReadModel(
                strategyId: detail.protocolId,
                proteinBasis: detail.editor.proteinBasis,
                proteinRatio: detail.editor.proteinRatio,
                fixedProteinGrams: detail.editor.fixedProteinGrams,
                carbohydrateStrategy: detail.editor.carbohydrateStrategy,
                fatStrategy: detail.editor.fatStrategy
            )
        } catch {
            model = nil
            loadError = "This strategy couldn't be loaded. Pull to refresh or try again."
        }
    }

    private func save(_ model: NutritionStrategyEditorReadModel) {
        guard isProduction else {
            switch store.saveNutrition(model) {
            case .success: errorMessage = nil; onSaved()
            case .failure(let error): errorMessage = error.message
            }
            return
        }
        guard let protocolId, let expectedCurrentVersionId else {
            errorMessage = "This strategy is unavailable. Refresh and try again."
            return
        }
        Task { @MainActor in
            do {
                _ = try await environment.nutritionStrategyAPI.save(
                    protocolId: protocolId,
                    expectedCurrentVersionId: expectedCurrentVersionId,
                    proteinBasis: model.proteinBasis,
                    proteinRatio: model.proteinRatio,
                    fixedProteinGrams: model.fixedProteinGrams,
                    carbohydrateStrategy: model.carbohydrateStrategy,
                    fatStrategy: model.fatStrategy
                )
                errorMessage = nil
                onSaved()
            } catch {
                errorMessage = "This strategy was not saved. Refresh before retrying."
            }
        }
    }
}

private struct TrainingStrategyEditor: View {
    @Environment(AppEnvironment.self) private var environment
    let strategyId: String
    let store: OperatingPlanSandboxStore
    let onSaved: () -> Void

    @State private var model: TrainingStrategyEditorReadModel?
    @State private var errorMessage: String?
    @State private var expectedCurrentVersionId: String?
    @State private var protocolId: String?
    @State private var isLoadingProduction = false
    @State private var loadError: String?

    private var isProduction: Bool { environment.nativeAuthority == .founderProduction }

    var body: some View {
        ScrollView {
            if isProduction, isLoadingProduction, model == nil {
                ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 240)
            } else if let model, !isProduction || expectedCurrentVersionId != nil {
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
                OperatingPlanUnavailableView(message: isProduction ? (loadError ?? "This strategy is unavailable.") : "This strategy is unavailable.")
            }
        }
        .physiqueOSScrollBottomClearance()
        .task(id: "\(strategyId):\(environment.nativeAuthority)") { await loadIfNeeded() }
    }

    private func loadIfNeeded() async {
        guard isProduction else {
            protocolId = nil
            expectedCurrentVersionId = nil
            model = store.trainingEditor(strategyId: strategyId)
            return
        }
        isLoadingProduction = true
        model = nil
        protocolId = nil
        expectedCurrentVersionId = nil
        loadError = nil
        defer { isLoadingProduction = false }
        do {
            guard let detail = try await environment.trainingStrategyAPI.fetchDetail(strategyId: strategyId) else {
                model = nil
                return
            }
            protocolId = detail.protocolId
            expectedCurrentVersionId = detail.editor.expectedCurrentVersionId
            model = TrainingStrategyEditorReadModel(
                strategyId: detail.protocolId,
                frequencies: detail.editor.frequencies,
                priorities: detail.editor.priorities,
                progression: detail.editor.progression
            )
        } catch {
            model = nil
            loadError = "This strategy couldn't be loaded. Pull to refresh or try again."
        }
    }

    private func save(_ model: TrainingStrategyEditorReadModel) {
        guard isProduction else {
            switch store.saveTraining(model) {
            case .success: errorMessage = nil; onSaved()
            case .failure(let error): errorMessage = error.message
            }
            return
        }
        guard let protocolId, let expectedCurrentVersionId else {
            errorMessage = "This strategy's canonical identity is unavailable. Refresh and try again."
            return
        }
        Task { @MainActor in
            do {
                _ = try await environment.trainingStrategyAPI.save(
                    protocolId: protocolId,
                    expectedCurrentVersionId: expectedCurrentVersionId,
                    frequencies: model.frequencies,
                    priorities: model.priorities,
                    progression: model.progression
                )
                errorMessage = nil
                onSaved()
            } catch {
                errorMessage = "This strategy was not saved. Refresh before retrying."
            }
        }
    }
}

private struct CoachingUpdatesEditor: View {
    @Environment(AppEnvironment.self) private var environment
    let strategyId: String
    let store: OperatingPlanSandboxStore
    let onSaved: () -> Void

    @State private var model: CoachingUpdatesEditorReadModel?
    @State private var productionDetail: CoachingUpdatesProductionDetail?
    @State private var isLoadingProduction = false
    @State private var isSaving = false
    @State private var loadError: String?
    @State private var errorMessage: String?

    private var isProduction: Bool { environment.nativeAuthority == .founderProduction }

    var body: some View {
        ScrollView {
            if isProduction, isLoadingProduction, model == nil {
                ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 240)
            } else if let model, !isProduction || productionDetail != nil {
                VStack(alignment: .leading, spacing: 18) {
                    OperatingPlanScreenHeader(eyebrow: "Coaching Updates", title: "Edit Coaching Updates", subtitle: "How and when PhysiqueOS synthesizes progress into a readable update.")

                    cadenceSection("Midweek Calibration", schedule: Binding(get: { model.midweek }, set: { self.model?.midweek = $0 }))
                    cadenceSection("Weekly Synthesis", schedule: Binding(get: { model.weekly }, set: { self.model?.weekly = $0 }))

                    OperatingPlanSection("Monthly Review") {
                        CardContainer(padding: .sm) {
                            VStack(alignment: .leading, spacing: 12) {
                                Toggle("Enabled", isOn: Binding(get: { model.monthly.enabled }, set: { self.model?.monthly.enabled = $0 }))
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy).tint(PhysiqueOSTheme.accent)
                                OperatingPlanFieldRow(label: "Monthly Delivery Rule", value: "Day \(model.monthly.dayOfMonth) of each month")
                                exactTimePicker(label: "Preferred delivery time", value: Binding(get: { model.monthly.localTime }, set: { self.model?.monthly.localTime = $0 }))
                            }
                        }
                    }

                    OperatingPlanSection("Progress Photos") {
                        CardContainer(padding: .sm) {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Choose when you plan to take progress photos, whether Home should remind you, and whether completed photo sessions should generate a Photo Event review.")
                                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                                Picker("Cadence", selection: Binding(get: { model.photos.cadence }, set: { self.model?.photos.cadence = $0 })) {
                                    ForEach(ProgressPhotoCadence.allCases) { Text($0.label).tag($0) }
                                }.pickerStyle(.menu).tint(PhysiqueOSTheme.accent)
                                Picker("Preferred day", selection: Binding(get: { model.photos.day }, set: { self.model?.photos.day = $0 })) {
                                    ForEach(OperatingPlanWeekday.allCases) { Text($0.label).tag($0) }
                                }.pickerStyle(.menu).tint(PhysiqueOSTheme.accent)
                                Picker("Preferred time", selection: Binding(get: { model.photos.timeOfDay }, set: { self.model?.photos.timeOfDay = $0 })) {
                                    ForEach(TimeOfDayChoice.allCases) { Text($0.label).tag($0) }
                                }.pickerStyle(.menu).tint(PhysiqueOSTheme.accent)
                                if model.photos.timeOfDay == .specific {
                                    exactTimePicker(label: "Specific time", value: Binding(
                                        get: { model.photos.specificTime ?? "08:00" },
                                        set: { self.model?.photos.specificTime = $0 }
                                    ))
                                }
                                Divider().overlay(PhysiqueOSTheme.divider)
                                Toggle("Remind me about Progress Photos", isOn: Binding(get: { model.photos.reminderEnabled }, set: { self.model?.photos.reminderEnabled = $0 }))
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy).tint(PhysiqueOSTheme.accent)
                                Toggle("Enable Photo Event briefing", isOn: Binding(get: { model.photoEventBriefingEnabled }, set: { self.model?.photoEventBriefingEnabled = $0 }))
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy).tint(PhysiqueOSTheme.accent)
                            }
                        }
                    }

                    OperatingPlanSection("DEXA") {
                        CardContainer(padding: .sm) {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Schedule your next scan and choose the in-app reminders that support it.")
                                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                                DateField(date: Binding(
                                    get: { OperatingPlanDateValues.date(from: model.dexa.plannedDate) },
                                    set: { self.model?.dexa.plannedDate = OperatingPlanDateValues.dateKey(from: $0) }
                                ), maximumDate: .distantFuture, minimumDate: Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: Date())), label: "Next scan date")
                                exactTimePicker(label: "Time", value: Binding(get: { model.dexa.localTime }, set: { self.model?.dexa.localTime = $0 }))
                                TextField("Preparation note (optional)", text: Binding(get: { model.dexa.preparationNote }, set: { self.model?.dexa.preparationNote = $0 }), axis: .vertical)
                                    .lineLimit(2...5).textFieldStyle(.roundedBorder)
                                Divider().overlay(PhysiqueOSTheme.divider)
                                ForEach(DexaReminderPreference.allCases) { preference in
                                    Toggle(preference.label, isOn: Binding(
                                        get: { model.dexa.reminderPreferences.contains(preference) },
                                        set: { enabled in
                                            if enabled, !(self.model?.dexa.reminderPreferences.contains(preference) ?? false) {
                                                self.model?.dexa.reminderPreferences.append(preference)
                                            } else if !enabled {
                                                self.model?.dexa.reminderPreferences.removeAll { $0 == preference }
                                            }
                                        }
                                    ))
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy).tint(PhysiqueOSTheme.accent)
                                }
                                Toggle("Remind me to upload results after the appointment", isOn: Binding(get: { model.dexa.uploadReminder }, set: { self.model?.dexa.uploadReminder = $0 }))
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy).tint(PhysiqueOSTheme.accent)
                                Toggle("Enable DEXA Event briefing", isOn: Binding(get: { model.dexaEventBriefingEnabled }, set: { self.model?.dexaEventBriefingEnabled = $0 }))
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy).tint(PhysiqueOSTheme.accent)
                            }
                        }
                    }

                    OperatingPlanSection("Notifications") {
                        Text("Enabled briefings notify you when the canonical update is published. iOS notification permission controls delivery.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }

                    if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
                    PrimaryActionButton(title: isSaving ? "Saving Coaching Updates…" : "Save Coaching Updates") { save(model) }
                        .disabled(isSaving)
                        .accessibilityIdentifier("operatingPlan.coaching.save")
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            } else {
                OperatingPlanUnavailableView(message: loadError ?? "Coaching Updates are unavailable.")
            }
        }
        .physiqueOSScrollBottomClearance()
        .task(id: "\(strategyId):\(environment.nativeAuthority)") { await load() }
    }

    @MainActor
    private func load() async {
        switch environment.nativeAuthority {
        case .sandbox:
            productionDetail = nil
            model = store.coachingEditor(strategyId: strategyId)
        case .founderProduction:
            isLoadingProduction = true
            model = nil
            productionDetail = nil
            loadError = nil
            defer { isLoadingProduction = false }
            do {
                productionDetail = try await environment.coachingUpdatesAPI.fetchDetail(strategyId: strategyId)
                model = productionDetail?.editor
            } catch {
                productionDetail = nil
                model = nil
                loadError = "Coaching Updates couldn't be loaded. Try again."
            }
        }
    }

    private func save(_ model: CoachingUpdatesEditorReadModel) {
        var model = model
        model.notificationPreference = .notifyWhenReady
        switch environment.nativeAuthority {
        case .sandbox:
            store.saveCoaching(model)
            onSaved()
        case .founderProduction:
            guard let detail = productionDetail else {
                errorMessage = "Refresh Coaching Updates before trying again."
                return
            }
            Task { @MainActor in
                isSaving = true
                errorMessage = nil
                defer { isSaving = false }
                do {
                    _ = try await environment.coachingUpdatesAPI.save(detail, model: model)
                    onSaved()
                } catch {
                    if let productionError = error as? ProductionNativeError,
                       let message = productionError.errorDescription {
                        errorMessage = "\(message) No partial configuration was accepted."
                    } else {
                        errorMessage = "Coaching Updates were not saved. No partial configuration was accepted. Refresh before retrying."
                    }
                }
            }
        }
    }

    private func cadenceSection(_ title: String, schedule: Binding<CoachingUpdateScheduleReadModel>) -> some View {
        OperatingPlanSection(title) {
            CardContainer(padding: .sm) {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("Enabled", isOn: Binding(get: { schedule.wrappedValue.enabled }, set: { schedule.wrappedValue.enabled = $0 }))
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy).tint(PhysiqueOSTheme.accent)
                    Picker("Day of week", selection: Binding(get: { schedule.wrappedValue.day }, set: { schedule.wrappedValue.day = $0 })) {
                        ForEach(OperatingPlanWeekday.allCases) { Text($0.label).tag($0) }
                    }.pickerStyle(.menu).tint(PhysiqueOSTheme.accent)
                    exactTimePicker(label: "Preferred delivery time", value: Binding(get: { schedule.wrappedValue.localTime }, set: { schedule.wrappedValue.localTime = $0 }))
                }
            }
        }
    }

    private func exactTimePicker(label: String, value: Binding<String>) -> some View {
        DatePicker(label, selection: Binding(
            get: { OperatingPlanDateValues.time(from: value.wrappedValue) },
            set: { value.wrappedValue = OperatingPlanDateValues.timeKey(from: $0) }
        ), displayedComponents: .hourAndMinute)
        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
        .tint(PhysiqueOSTheme.accent)
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
