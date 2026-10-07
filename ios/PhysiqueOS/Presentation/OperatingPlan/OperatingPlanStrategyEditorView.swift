import SwiftUI

/// `strategy/[strategyType]/[strategyId]/edit/page.js` +
/// `StrategyEditorService.js` — the real, currently reachable editors for
/// Nutrition, Training, and Coaching Updates (Energy has none; guarded by
/// `OperatingPlanStrategyDetailView` never offering an edit destination for
/// it). Founder Production uses each domain's canonical API and concurrency
/// model; OperatingPlanSandboxStore is used only under Sandbox authority.
///
/// Build 91: the locked editor grammar ("‹ Cancel" crumb, one title, line
/// fields, one Save). Save semantics are unchanged: `expectedCurrentVersionId`
/// on every production save, stale saves fail closed, no confirmation step.
/// Next DEXA Scan opens Coaching Updates with `anchor: .dexa`, which scrolls
/// to and marks the DEXA section; it is the same atomic editor and Save.
struct OperatingPlanStrategyEditorView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let strategyType: String
    let strategyId: String
    /// Captured once: a later re-render of the router never re-anchors.
    @State private var anchor: OperatingPlanNavigationContext.EditorAnchor?

    init(strategyType: String, strategyId: String, anchor: OperatingPlanNavigationContext.EditorAnchor? = nil) {
        self.strategyType = strategyType
        self.strategyId = strategyId
        _anchor = State(initialValue: anchor)
    }

    var body: some View {
        Group {
            switch strategyType {
            case "nutrition":
                NutritionStrategyEditor(strategyId: strategyId, store: environment.operatingPlanStore, onSaved: { dismiss() })
            case "training":
                TrainingStrategyEditor(strategyId: strategyId, store: environment.operatingPlanStore, onSaved: { dismiss() })
            case "briefings":
                CoachingUpdatesEditor(strategyId: strategyId, store: environment.operatingPlanStore, anchor: anchor, onSaved: { dismiss() })
            default:
                OperatingPlanScrollPage {
                    OperatingPlanFailureView(title: "Unavailable", message: "This strategy cannot be edited.")
                }
            }
        }
        .operatingPlanChrome(back: "Cancel")
        .accessibilityIdentifier("operatingPlan.editor.\(strategyType)")
    }
}

/// A labelled editor control row (label column + control) in line grammar.
private struct EditorControlLine<Control: View>: View {
    let label: String
    var showsRule = true
    @ViewBuilder var control: Control

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                Text(label)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldLabel)
                    .foregroundStyle(OperatingPlanColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                control
            }
            .padding(.vertical, 6)
            .frame(minHeight: 44)
            if showsRule {
                Rectangle().fill(OperatingPlanColor.rule).frame(height: 1).accessibilityHidden(true)
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
        OperatingPlanScrollPage {
            if isProduction, isLoadingProduction, model == nil {
                OperatingPlanLoadingView()
            } else if let model, !isProduction || expectedCurrentVersionId != nil {
                OperatingPlanHeader(eyebrow: "Nutrition", title: "Edit Strategy", subtitle: "Macro targets that translate the Energy strategy into daily nutrition.")

                OperatingPlanGroupTitle("Protein Basis")
                HStack(spacing: 8) {
                    ForEach(ProteinBasis.allCases) { basis in
                        OperatingPlanChoicePill(title: basis.label, isSelected: model.proteinBasis == basis) {
                            self.model?.proteinBasis = basis
                        }
                    }
                }
                OperatingPlanSurface(verticalPadding: 6) {
                    if model.proteinBasis == .bodyWeight {
                        Stepper(value: Binding(get: { model.proteinRatio }, set: { self.model?.proteinRatio = $0 }), in: 0.5...2.0, step: 0.1) {
                            Text("\(model.proteinRatio, specifier: "%.1f") g per lb bodyweight")
                                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                                .foregroundStyle(OperatingPlanColor.ink)
                        }
                        .frame(minHeight: 44)
                    } else {
                        Stepper(value: Binding(get: { model.fixedProteinGrams }, set: { self.model?.fixedProteinGrams = $0 }), in: 50...400, step: 5) {
                            Text("\(Int(model.fixedProteinGrams)) g")
                                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                                .foregroundStyle(OperatingPlanColor.ink)
                        }
                        .frame(minHeight: 44)
                    }
                }
                .padding(.top, 10)

                OperatingPlanGroupTitle("Carbohydrate Approach")
                FlowPills(items: CarbohydrateStrategy.allCases, isSelected: { model.carbohydrateStrategy == $0 }, label: \.label) {
                    self.model?.carbohydrateStrategy = $0
                }

                OperatingPlanGroupTitle("Fat Approach")
                FlowPills(items: FatStrategy.allCases, isSelected: { model.fatStrategy == $0 }, label: \.label) {
                    self.model?.fatStrategy = $0
                }

                if let errorMessage { OperatingPlanErrorText(message: errorMessage).padding(.top, 16) }
                OperatingPlanButton(title: "Save Strategy", style: .primary) { save(model) }
                    .padding(.top, 22)
                    .accessibilityIdentifier("operatingPlan.nutrition.save")
            } else {
                OperatingPlanFailureView(
                    title: "This strategy couldn't be loaded",
                    message: isProduction ? (loadError ?? "This strategy is unavailable.") : "This strategy is unavailable.",
                    retry: isProduction && loadError != nil ? { Task { await loadIfNeeded() } } : nil
                )
            }
        }
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
            loadError = "Nothing was changed. Check your connection and try again."
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
        OperatingPlanScrollPage {
            if isProduction, isLoadingProduction, model == nil {
                OperatingPlanLoadingView()
            } else if let model, !isProduction || expectedCurrentVersionId != nil {
                OperatingPlanHeader(eyebrow: "Training", title: "Edit Strategy", subtitle: "Weekly structure and progression intent for the current phase.")

                OperatingPlanGroupTitle("Weekly Frequency")
                OperatingPlanSurface {
                    ForEach(model.frequencies.indices, id: \.self) { index in
                        VStack(spacing: 0) {
                            Stepper(value: Binding(
                                get: { self.model?.frequencies[index].count ?? 0 },
                                set: { self.model?.frequencies[index].count = $0 }
                            ), in: 0...7) {
                                HStack {
                                    Text(model.frequencies[index].area.label)
                                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                                        .foregroundStyle(OperatingPlanColor.ink)
                                    Spacer()
                                    Text("\(model.frequencies[index].count)x / week")
                                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldDetail)
                                        .foregroundStyle(OperatingPlanColor.muted)
                                }
                            }
                            .padding(.vertical, 6)
                            .frame(minHeight: 44)
                            if index < model.frequencies.count - 1 {
                                Rectangle().fill(OperatingPlanColor.rule).frame(height: 1).accessibilityHidden(true)
                            }
                        }
                    }
                }

                OperatingPlanGroupTitle("Training Focus")
                FlowPills(items: TrainingStrategyArea.allCases, isSelected: { model.priorities.contains($0) }, label: \.label) { area in
                    if let index = self.model?.priorities.firstIndex(of: area) {
                        self.model?.priorities.remove(at: index)
                    } else {
                        self.model?.priorities.append(area)
                    }
                }

                OperatingPlanGroupTitle("Progression")
                HStack(spacing: 8) {
                    ForEach(ProgressionPace.allCases) { pace in
                        OperatingPlanChoicePill(title: pace.label, isSelected: model.progression == pace) {
                            self.model?.progression = pace
                        }
                    }
                }

                if let errorMessage { OperatingPlanErrorText(message: errorMessage).padding(.top, 16) }
                OperatingPlanButton(title: "Save Strategy", style: .primary) { save(model) }
                    .padding(.top, 22)
                    .accessibilityIdentifier("operatingPlan.training.save")
            } else {
                OperatingPlanFailureView(
                    title: "This strategy couldn't be loaded",
                    message: isProduction ? (loadError ?? "This strategy is unavailable.") : "This strategy is unavailable.",
                    retry: isProduction && loadError != nil ? { Task { await loadIfNeeded() } } : nil
                )
            }
        }
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
            loadError = "Nothing was changed. Check your connection and try again."
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
    let anchor: OperatingPlanNavigationContext.EditorAnchor?
    let onSaved: () -> Void

    @State private var model: CoachingUpdatesEditorReadModel?
    /// The Progress Photos schedule as loaded, for the next-date preview.
    @State private var loadedPhotos: CoachingProgressPhotosReadModel?
    @State private var productionDetail: CoachingUpdatesProductionDetail?
    @State private var isLoadingProduction = false
    @State private var isSaving = false
    @State private var loadError: String?
    @State private var errorMessage: String?
    @State private var hasScrolledToAnchor = false

    private var isProduction: Bool { environment.nativeAuthority == .founderProduction }

    static let dexaSectionId = "operatingPlan.coaching.section.dexa"

    var body: some View {
        ScrollViewReader { proxy in
            OperatingPlanScrollPage {
                if isProduction, isLoadingProduction, model == nil {
                    OperatingPlanLoadingView()
                } else if let model, !isProduction || productionDetail != nil {
                    OperatingPlanHeader(
                        eyebrow: "Coaching Updates",
                        title: "Edit Coaching Updates",
                        subtitle: anchor == .dexa
                            ? "Opened at DEXA. Midweek, Weekly, Monthly and Progress Photos are above and save together."
                            : "How and when PhysiqueOS synthesizes progress into a readable update."
                    )

                    cadenceSection("Midweek Calibration", schedule: Binding(get: { model.midweek }, set: { self.model?.midweek = $0 }))
                    cadenceSection("Weekly Synthesis", schedule: Binding(get: { model.weekly }, set: { self.model?.weekly = $0 }))

                    OperatingPlanGroupTitle("Monthly Review")
                    OperatingPlanSurface {
                        OperatingPlanToggleLine(title: "Enabled", isOn: Binding(get: { model.monthly.enabled }, set: { self.model?.monthly.enabled = $0 }))
                        OperatingPlanLine("Monthly delivery rule", "Day \(model.monthly.dayOfMonth) of each month")
                        exactTimePicker(label: "Preferred delivery time", value: Binding(get: { model.monthly.localTime }, set: { self.model?.monthly.localTime = $0 }), showsRule: false)
                    }

                    OperatingPlanGroupTitle("Progress Photos")
                    OperatingPlanSurface(verticalPadding: 10) {
                        Text("Choose when you plan to take progress photos, whether Home should remind you, and whether completed photo sessions should generate a Photo Event review.")
                            .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldDetail)
                            .foregroundStyle(OperatingPlanColor.muted)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.bottom, 6)
                        progressPhotoCadenceFields(model.photos)
                        EditorControlLine(label: "Preferred time") {
                            Picker("Preferred time", selection: Binding(get: { model.photos.timeOfDay }, set: { choice in
                                self.model?.photos.timeOfDay = choice
                                // The picker below shows 08:00 for an unset time; persist
                                // what is shown rather than sending no time at all.
                                if choice == .specific, self.model?.photos.specificTime == nil { self.model?.photos.specificTime = "08:00" }
                            })) {
                                ForEach(TimeOfDayChoice.allCases) { Text($0.label).tag($0) }
                            }.pickerStyle(.menu).tint(OperatingPlanColor.teal)
                        }
                        if model.photos.timeOfDay == .specific {
                            exactTimePicker(label: "Specific time", value: Binding(
                                get: { model.photos.specificTime ?? "08:00" },
                                set: { self.model?.photos.specificTime = $0 }
                            ))
                        }
                        progressPhotoSummary(model.photos)
                        OperatingPlanToggleLine(title: "Remind me about Progress Photos", isOn: Binding(get: { model.photos.reminderEnabled }, set: { self.model?.photos.reminderEnabled = $0 }))
                        OperatingPlanToggleLine(title: "Enable Photo Event briefing", isOn: Binding(get: { model.photoEventBriefingEnabled }, set: { self.model?.photoEventBriefingEnabled = $0 }), showsRule: false)
                    }

                    dexaSection(model)
                        .id(Self.dexaSectionId)

                    OperatingPlanGroupTitle("Notifications")
                    Text("Enabled briefings notify you when the canonical update is published. iOS notification permission controls delivery.")
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldDetail)
                        .foregroundStyle(OperatingPlanColor.muted)
                        .fixedSize(horizontal: false, vertical: true)

                    if let errorMessage { OperatingPlanErrorText(message: errorMessage).padding(.top, 16) }
                    OperatingPlanButton(title: isSaving ? "Saving Coaching Updates…" : "Save Coaching Updates", style: .navy, isEnabled: !isSaving) { save(model) }
                        .padding(.top, 22)
                        .accessibilityIdentifier("operatingPlan.coaching.save")
                } else {
                    OperatingPlanFailureView(
                        title: "Coaching Updates couldn't be loaded",
                        message: loadError ?? "Coaching Updates are unavailable.",
                        retry: loadError == nil ? nil : { Task { await load() } }
                    )
                }
            }
            .onChange(of: model != nil) { _, loaded in
                guard loaded, anchor == .dexa, !hasScrolledToAnchor else { return }
                hasScrolledToAnchor = true
                // After this layout pass, so the section exists to scroll to.
                Task { @MainActor in
                    withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(Self.dexaSectionId, anchor: .top) }
                }
            }
        }
        .task(id: "\(strategyId):\(environment.nativeAuthority)") { await load() }
    }

    @ViewBuilder
    private func dexaSection(_ model: CoachingUpdatesEditorReadModel) -> some View {
        let anchored = anchor == .dexa
        VStack(alignment: .leading, spacing: 0) {
            OperatingPlanGroupTitle("DEXA") {
                if anchored {
                    Text("From Next DEXA Scan")
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanPill)
                        .foregroundStyle(OperatingPlanColor.amber)
                        .accessibilityIdentifier("operatingPlan.coaching.dexa.anchored")
                }
            }
            OperatingPlanSurface(tone: anchored ? .amber : .paper, verticalPadding: 10) {
                Text("Schedule your next scan and choose the in-app reminders that support it.")
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldDetail)
                    .foregroundStyle(OperatingPlanColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 6)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Next scan date")
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldLabel)
                        .foregroundStyle(OperatingPlanColor.muted)
                    DateField(date: Binding(
                        get: { OperatingPlanDateValues.date(from: model.dexa.plannedDate) },
                        set: { self.model?.dexa.plannedDate = OperatingPlanDateValues.dateKey(from: $0) }
                    ), maximumDate: .distantFuture, minimumDate: Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: Date())), label: "Next scan date")
                }
                .padding(.vertical, 8)
                Rectangle().fill(OperatingPlanColor.rule).frame(height: 1).accessibilityHidden(true)
                exactTimePicker(label: "Time", value: Binding(get: { model.dexa.localTime }, set: { self.model?.dexa.localTime = $0 }))
                VStack(alignment: .leading, spacing: 6) {
                    Text("Preparation note (optional)")
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldLabel)
                        .foregroundStyle(OperatingPlanColor.muted)
                    TextField("Preparation note (optional)", text: Binding(get: { model.dexa.preparationNote }, set: { self.model?.dexa.preparationNote = $0 }), axis: .vertical)
                        .lineLimit(2...5)
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                        .foregroundStyle(OperatingPlanColor.ink)
                        .padding(10)
                        .background(OperatingPlanColor.raised, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .accessibilityIdentifier("operatingPlan.coaching.dexa.note")
                }
                .padding(.vertical, 10)
                Rectangle().fill(OperatingPlanColor.rule).frame(height: 1).accessibilityHidden(true)
                ForEach(DexaReminderPreference.allCases) { preference in
                    OperatingPlanToggleLine(title: preference.label, isOn: Binding(
                        get: { model.dexa.reminderPreferences.contains(preference) },
                        set: { enabled in
                            if enabled, !(self.model?.dexa.reminderPreferences.contains(preference) ?? false) {
                                self.model?.dexa.reminderPreferences.append(preference)
                            } else if !enabled {
                                self.model?.dexa.reminderPreferences.removeAll { $0 == preference }
                            }
                        }
                    ))
                }
                OperatingPlanToggleLine(title: "Remind me to upload results after the appointment", isOn: Binding(get: { model.dexa.uploadReminder }, set: { self.model?.dexa.uploadReminder = $0 }))
                OperatingPlanToggleLine(title: "Enable DEXA Event briefing", isOn: Binding(get: { model.dexaEventBriefingEnabled }, set: { self.model?.dexaEventBriefingEnabled = $0 }), showsRule: false)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("operatingPlan.coaching.dexa")
    }

    @MainActor
    private func load() async {
        switch environment.nativeAuthority {
        case .sandbox:
            productionDetail = nil
            model = store.coachingEditor(strategyId: strategyId)
            loadedPhotos = model?.photos
        case .founderProduction:
            isLoadingProduction = true
            model = nil
            productionDetail = nil
            loadError = nil
            defer { isLoadingProduction = false }
            do {
                productionDetail = try await environment.coachingUpdatesAPI.fetchDetail(strategyId: strategyId)
                model = productionDetail?.editor
                loadedPhotos = model?.photos
            } catch {
                productionDetail = nil
                model = nil
                loadError = "Nothing was changed. Check your connection and try again."
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
            // An older Server only understands Weekly / Every 2 weeks and
            // would save anything else as Weekly. Never send it a cadence
            // it cannot keep.
            if !model.photos.serverSupportsFlexibleCadence, !model.photos.isLegacyRepresentable {
                errorMessage = "This Progress Photos cadence needs the latest PhysiqueOS Server. Nothing was saved."
                return
            }
            Task { @MainActor in
                isSaving = true
                errorMessage = nil
                defer { isSaving = false }
                do {
                    _ = try await environment.coachingUpdatesAPI.save(detail, model: model)
                    // Replace pending Progress Photos notifications with the
                    // Server's new occurrence horizon now, not on the next
                    // Home read (stale identifiers are removed there).
                    await environment.reconcileCanonicalPriorityNotifications()
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

    /// Compact "Every [N] [Weeks | Months]" control, then "On [weekday]" or
    /// "On the [week of the month] [weekday]".
    @ViewBuilder
    private func progressPhotoCadenceFields(_ photos: CoachingProgressPhotosReadModel) -> some View {
        Stepper(value: Binding(
            get: { photos.cadenceInterval },
            set: { self.model?.photos.cadenceInterval = min(max($0, CoachingProgressPhotosReadModel.intervalRange.lowerBound), CoachingProgressPhotosReadModel.intervalRange.upperBound) }
        ), in: CoachingProgressPhotosReadModel.intervalRange) {
            Text("Every \(photos.cadenceInterval) \(photos.cadenceUnit.label(for: photos.cadenceInterval))")
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                .foregroundStyle(OperatingPlanColor.ink)
                .contentTransition(.numericText())
        }
        .frame(minHeight: 44)
        .accessibilityIdentifier("operatingPlan.coaching.photos.interval")
        Picker("Unit", selection: Binding(
            get: { photos.cadenceUnit },
            set: { unit in
                self.model?.photos.cadenceUnit = unit
                if unit == .month, self.model?.photos.weekOfMonth == nil { self.model?.photos.weekOfMonth = .first }
            }
        )) {
            ForEach(ProgressPhotoCadenceUnit.allCases) { Text($0.pluralLabel).tag($0) }
        }
        .pickerStyle(.segmented)
        .padding(.vertical, 6)
        .accessibilityIdentifier("operatingPlan.coaching.photos.unit")
        EditorControlLine(label: photos.cadenceUnit == .month ? "On the" : "On") {
            HStack(spacing: 0) {
                if photos.cadenceUnit == .month {
                    Picker("Week of the month", selection: Binding(get: { photos.weekOfMonth ?? .first }, set: { self.model?.photos.weekOfMonth = $0 })) {
                        ForEach(ProgressPhotoWeekOfMonth.allCases) { Text($0.label).tag($0) }
                    }.pickerStyle(.menu).tint(OperatingPlanColor.teal)
                    .accessibilityIdentifier("operatingPlan.coaching.photos.weekOfMonth")
                }
                Picker("Preferred day", selection: Binding(get: { photos.day }, set: { self.model?.photos.day = $0 })) {
                    ForEach(OperatingPlanWeekday.allCases) { Text($0.label).tag($0) }
                }.pickerStyle(.menu).tint(OperatingPlanColor.teal)
            }
        }
    }

    private func progressPhotoSummary(_ photos: CoachingProgressPhotosReadModel) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(photos.cadenceSummary)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                .foregroundStyle(OperatingPlanColor.ink)
            if let next = progressPhotoNextDate(photos) {
                Text(next)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldDetail)
                    .foregroundStyle(OperatingPlanColor.muted)
            }
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("operatingPlan.coaching.photos.summary")
    }

    private func progressPhotoNextDate(_ photos: CoachingProgressPhotosReadModel) -> String? {
        guard let saved = loadedPhotos else { return nil }
        let today = OperatingPlanDateValues.dateKey(from: Date())
        guard let date = ProgressPhotoCadencePreview.firstOccurrence(edited: photos, saved: saved, today: today) else { return nil }
        let label = OperatingPlanDateValues.readableDate(date)
        return photos.cadencePatternDiffers(from: saved) ? "Starts \(label)" : "Next: \(label)"
    }

    private func cadenceSection(_ title: String, schedule: Binding<CoachingUpdateScheduleReadModel>) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            OperatingPlanGroupTitle(title)
            OperatingPlanSurface {
                OperatingPlanToggleLine(title: "Enabled", isOn: Binding(get: { schedule.wrappedValue.enabled }, set: { schedule.wrappedValue.enabled = $0 }))
                EditorControlLine(label: "Day of week") {
                    Picker("Day of week", selection: Binding(get: { schedule.wrappedValue.day }, set: { schedule.wrappedValue.day = $0 })) {
                        ForEach(OperatingPlanWeekday.allCases) { Text($0.label).tag($0) }
                    }.pickerStyle(.menu).tint(OperatingPlanColor.teal)
                }
                exactTimePicker(label: "Preferred delivery time", value: Binding(get: { schedule.wrappedValue.localTime }, set: { schedule.wrappedValue.localTime = $0 }), showsRule: false)
            }
        }
    }

    private func exactTimePicker(label: String, value: Binding<String>, showsRule: Bool = true) -> some View {
        EditorControlLine(label: label, showsRule: showsRule) {
            DatePicker(label, selection: Binding(
                get: { OperatingPlanDateValues.time(from: value.wrappedValue) },
                set: { value.wrappedValue = OperatingPlanDateValues.timeKey(from: $0) }
            ), displayedComponents: .hourAndMinute)
            .labelsHidden()
            .tint(OperatingPlanColor.teal)
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

    @ScaledMetric(relativeTo: .body) private var minimum: CGFloat = 96

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: minimum), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                OperatingPlanChoicePill(title: item[keyPath: label], isSelected: isSelected(item)) { toggle(item) }
            }
        }
    }
}
