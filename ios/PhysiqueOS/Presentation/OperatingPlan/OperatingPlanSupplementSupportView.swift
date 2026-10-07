import SwiftUI

struct OperatingPlanSupplementSupportView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let protocolId: String

    @State private var isEditing = false
    @State private var draft: OperatingPlanSupplementSupportReadModel?
    @State private var errorMessage: String?
    @State private var productionDetail: SupplementSupportDetail?
    @State private var isLoadingProduction = false
    @State private var loadError: String?

    private var support: OperatingPlanSupplementSupportReadModel? {
        switch environment.nativeAuthority {
        case .sandbox: environment.operatingPlanStore.supplementSupport(protocolId: protocolId)
        case .founderProduction: productionDetail?.readModel
        }
    }

    var backTitle: String = "Supplements"

    var body: some View {
        OperatingPlanScrollPage {
            content
        }
        .operatingPlanChrome(back: isEditing ? "Cancel" : backTitle, onBack: isEditing ? { isEditing = false } : nil)
        .accessibilityIdentifier("operatingPlan.supplementSupport")
        .task(id: "\(protocolId):\(environment.nativeAuthority)") { await loadProductionIfNeeded() }
    }

    @ViewBuilder private var content: some View {
        if environment.nativeAuthority == .founderProduction, isLoadingProduction, productionDetail == nil {
            OperatingPlanLoadingView()
        } else if let support {
            if isEditing, let draft { editor(draft) } else { detail(support) }
        } else {
            OperatingPlanFailureView(
                title: "This supplement support couldn't be loaded",
                message: loadError == nil ? "This supplement support is unavailable." : "Nothing was changed. Check your connection and try again.",
                retry: loadError == nil ? nil : { Task { await loadProductionIfNeeded() } }
            )
        }
    }

    @MainActor
    private func loadProductionIfNeeded() async {
        guard environment.nativeAuthority == .founderProduction else { return }
        isLoadingProduction = true
        loadError = nil
        defer { isLoadingProduction = false }
        do {
            productionDetail = try await environment.supplementSupportAPI.fetchSupport(protocolId: protocolId)
        } catch {
            productionDetail = nil
            loadError = "This Supplement Support plan couldn't be loaded. Try again."
        }
    }

    private func detail(_ support: OperatingPlanSupplementSupportReadModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            OperatingPlanHeader(eyebrow: "Supplement Support", title: support.name, subtitle: support.supportSummary)
            OperatingPlanGroup("Current Support") {
                OperatingPlanSurface {
                    VStack(alignment: .leading, spacing: 0) {
                        OperatingPlanLine("Dose / Quantity", [support.doseAmount, support.doseUnit].filter { !$0.isEmpty }.joined(separator: " "))
                        OperatingPlanLine("Schedule", OperatingPlanSchedulePresentation.formatSupportSchedule(support.supportSchedule))
                        OperatingPlanLine("Reminder", support.reminderPreference.label)
                        if let nextDue = support.nextDue { OperatingPlanLine("Next due", nextDue) }
                        if !support.notes.isEmpty { OperatingPlanLine("Execution Notes", support.notes) }
                    }
                }
            }
            OperatingPlanButton(title: "Edit Support", style: .quiet) {
                draft = support
                isEditing = true
            }
            .padding(.top, 20)
        }
    }

    private func editor(_ draft: OperatingPlanSupplementSupportReadModel) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            OperatingPlanHeader(eyebrow: "Edit Support", title: draft.name, subtitle: "Keep the quantity, schedule, reminder, and optional context aligned with your current strategy.")
            OperatingPlanGroup("Dose / Quantity") {
                OperatingPlanSurface(verticalPadding: 10) {
                    HStack(spacing: 10) {
                        TextField("Amount", text: Binding(get: { draft.doseAmount }, set: { self.draft?.doseAmount = $0 }))
                            .keyboardType(.decimalPad)
                        TextField("Unit", text: Binding(get: { draft.doseUnit }, set: { self.draft?.doseUnit = $0 }))
                    }
                    .textFieldStyle(.roundedBorder)
                }
            }
            OperatingPlanSupportScheduleEditor(schedule: Binding(
                get: { draft.supportSchedule }, set: { self.draft?.supportSchedule = $0 }
            ), sectionNumber: "2")
            OperatingPlanGroup("Reminder") {
                HStack(spacing: 8) {
                    ForEach(OperatingPlanReminderPreference.allCases) { preference in
                        OperatingPlanChoicePill(title: preference.label, isSelected: draft.reminderPreference == preference) {
                            self.draft?.reminderPreference = preference
                        }
                    }
                }
            }
            OperatingPlanGroup("Execution Notes") {
                OperatingPlanSurface(verticalPadding: 10) {
                    TextField("Optional context, such as take with food", text: Binding(get: { draft.notes }, set: { self.draft?.notes = $0 }), axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            if let errorMessage { OperatingPlanErrorText(message: errorMessage) }
            OperatingPlanButton(title: "Save Support", style: .primary) { save(draft) }
        }
    }

    private func save(_ model: OperatingPlanSupplementSupportReadModel) {
        switch environment.nativeAuthority {
        case .sandbox:
            switch environment.operatingPlanStore.saveSupplementSupport(model) {
            case .success: errorMessage = nil; isEditing = false
            case .failure(let error): errorMessage = error.message
            }
        case .founderProduction:
            guard let detail = productionDetail else {
                errorMessage = "This supplement plan is unavailable. Refresh and try again."
                return
            }
            Task { @MainActor in
                do {
                    _ = try await environment.supplementSupportAPI.save(
                        protocolId: detail.protocolId,
                        supplementVersionId: detail.supplementVersionId,
                        expectedRevision: detail.executionRevision,
                        doseAmount: model.doseAmount,
                        doseUnit: model.doseUnit,
                        supportSchedule: model.supportSchedule,
                        reminderPreference: model.reminderPreference,
                        notes: model.notes
                    )
                    errorMessage = nil
                    isEditing = false
                    await environment.reconcileCanonicalPriorityNotifications()
                    await loadProductionIfNeeded()
                } catch {
                    errorMessage = "This Supplement Support plan was not saved. Refresh before retrying."
                }
            }
        }
    }
}
