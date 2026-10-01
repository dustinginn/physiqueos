import SwiftUI

/// `supplements/new/page.js` and `supplements/[protocolId]/edit/page.js` →
/// `SupplementStrategyEditorScreen.jsx` — name/purpose/role/goal, plus
/// (create-only) start date. Dose, timing, and reminders stay in
/// Execution (`OperatingPlanProtocolDomainView`'s support summary) exactly
/// as the web's own copy states — this editor intentionally does not
/// include them. Founder Production reads and writes the canonical
/// Supplement strategy/version transition; sandbox remains isolated.
struct OperatingPlanSupplementEditorView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    /// `nil` for `supplements/new`; a protocol id for `.../edit`.
    let protocolId: String?

    @State private var model: SupplementEditorReadModel?
    @State private var errorMessage: String?
    @State private var productionDetail: SupplementStrategyDetail?
    @State private var isLoadingProduction = false
    @State private var loadError: String?

    private var store: OperatingPlanSandboxStore { environment.operatingPlanStore }

    var body: some View {
        ScrollView {
            if let model, environment.nativeAuthority == .sandbox || productionDetail != nil {
                VStack(alignment: .leading, spacing: 18) {
                    OperatingPlanScreenHeader(
                        eyebrow: "Supplement",
                        title: model.mode == .create ? "Add Supplement" : "Edit Strategy",
                        subtitle: "Dose, timing, and reminders stay in Execution."
                    )

                    OperatingPlanSection("Name") {
                        CardContainer(padding: .sm) {
                            TextField("Supplement name", text: Binding(get: { model.name }, set: { self.model?.name = $0 }))
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }
                    }

                    OperatingPlanSection("Purpose") {
                        CardContainer(padding: .sm) {
                            TextField("Purpose", text: Binding(get: { model.purpose }, set: { self.model?.purpose = $0 }))
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }
                    }

                    OperatingPlanSection("Current Strategy or Role") {
                        CardContainer(padding: .sm) {
                            TextField("Current strategy or role", text: Binding(get: { model.role }, set: { self.model?.role = $0 }), axis: .vertical)
                                .lineLimit(3...6)
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }
                    }

                    OperatingPlanSection("Goal") {
                        HStack(spacing: 8) {
                            ForEach(model.goalOptions) { goal in
                                OperatingPlanChoicePill(title: goal.title, isSelected: model.goalId == goal.id) {
                                    self.model?.goalId = goal.id
                                }
                            }
                        }
                    }

                    if model.mode == .create {
                        OperatingPlanSection("Start Date") {
                            DateField(date: Binding(
                                get: { Self.dateFormatter.date(from: model.startDate) ?? Date() },
                                set: { self.model?.startDate = Self.dateFormatter.string(from: $0) }
                            ), maximumDate: .distantFuture, label: "Start date")
                        }
                    }

                    if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
                    PrimaryActionButton(title: model.mode == .create ? "Add Supplement" : "Save Strategy") { save(model) }
                        .accessibilityIdentifier("operatingPlan.supplement.save")
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            } else if environment.nativeAuthority == .founderProduction, isLoadingProduction {
                ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 240)
            } else {
                OperatingPlanUnavailableView(message: loadError ?? "This supplement is unavailable.")
            }
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Cancel") { dismiss() }
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
        .task(id: "\(protocolId ?? "new"):\(environment.nativeAuthority)") { await load() }
    }

    @MainActor
    private func load() async {
        switch environment.nativeAuthority {
        case .sandbox:
            productionDetail = nil
            model = store.supplementEditor(protocolId: protocolId)
        case .founderProduction:
            model = nil
            productionDetail = nil
            isLoadingProduction = true
            loadError = nil
            defer { isLoadingProduction = false }
            do {
                productionDetail = try await environment.supplementStrategyAPI.fetchEditor(protocolId: protocolId)
                model = productionDetail?.readModel
            } catch {
                productionDetail = nil
                model = nil
                loadError = "This Supplement strategy couldn't be loaded. Try again."
            }
        }
    }

    private func save(_ model: SupplementEditorReadModel) {
        switch environment.nativeAuthority {
        case .sandbox:
            switch store.saveSupplement(model) {
            case .success:
                errorMessage = nil
                dismiss()
            case .failure(let error):
                errorMessage = error.message
            }
        case .founderProduction:
            guard let detail = productionDetail else {
                errorMessage = "This supplement strategy is unavailable. Refresh and try again."
                return
            }
            Task { @MainActor in
                do {
                    _ = try await environment.supplementStrategyAPI.save(detail, model: model)
                    errorMessage = nil
                    await environment.productionNativeAPI.invalidateReadResources([
                        "operating-plan", "operating-plan-protocol-domain",
                    ])
                    dismiss()
                } catch {
                    errorMessage = "This Supplement strategy was not saved. Refresh before retrying."
                }
            }
        }
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
