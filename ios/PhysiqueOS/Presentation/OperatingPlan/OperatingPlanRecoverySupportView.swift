import SwiftUI

/// `execution/[executionId]/page.js` for the Recovery (foam-rolling)
/// support method — the generic `ExecutionItemBuilderScreen` fields
/// (cadence, days, time of day, support/reminder preference, notes),
/// mirrored here as a local `isEditing` toggle on one view rather than a
/// second push destination, matching the web's own `?edit=1` pattern.
///
/// Under Founder Production this reads/writes the canonical
/// `operating-plan.recurring-support.save.v1` command
/// (`RecurringSupportAPI`) — the SAME server-owned workflow Web's own
/// `saveFoamRollingSupport` action calls, and the SAME `reminder.schedule
/// .timeOfDay` field `notificationAction.scheduledTime` is resolved from.
/// A production fetch failure fails closed (`OperatingPlanUnavailableView`)
/// rather than ever falling back to sandbox/fixture data. Under Sandbox,
/// behavior is unchanged: synchronous local reads/writes through
/// `OperatingPlanSandboxStore`.
struct OperatingPlanRecoverySupportView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let executionId: String

    @State private var isEditing = false
    @State private var draft: OperatingPlanRecoverySupportReadModel?
    @State private var errorMessage: String?
    @State private var productionDetail: RecurringSupportDetail?
    @State private var isLoadingProduction = false
    @State private var loadError: String?

    private var store: OperatingPlanSandboxStore { environment.operatingPlanStore }

    private var support: OperatingPlanRecoverySupportReadModel? {
        switch environment.nativeAuthority {
        case .sandbox: store.recoverySupport(executionId: executionId)
        case .founderProduction: productionDetail.map(Self.readModel(from:))
        }
    }

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
                Button { isEditing ? (isEditing = false) : dismiss() } label: {
                    Label(isEditing ? "Cancel" : "Support", systemImage: isEditing ? "xmark" : "arrow.left")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task(id: environment.nativeAuthority) { await loadProductionIfNeeded() }
    }

    private func loadProductionIfNeeded() async {
        guard environment.nativeAuthority == .founderProduction else { return }
        isLoadingProduction = true
        loadError = nil
        defer { isLoadingProduction = false }
        do {
            productionDetail = try await environment.recurringSupportAPI.fetchSupport(executionId: executionId)
        } catch {
            productionDetail = nil
            loadError = "This support method couldn't be loaded. Pull to refresh or try again."
        }
    }

    @ViewBuilder
    private var content: some View {
        if environment.nativeAuthority == .founderProduction, isLoadingProduction, productionDetail == nil {
            ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 240)
        } else if let support {
            if isEditing, let draft {
                editor(draft: draft)
            } else {
                detail(support)
            }
        } else {
            OperatingPlanUnavailableView(message: loadError ?? "This support method is unavailable.")
        }
    }

    private func detail(_ support: OperatingPlanRecoverySupportReadModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            OperatingPlanScreenHeader(eyebrow: "Recovery", title: support.name, subtitle: support.purpose)

            OperatingPlanSection("Current Support") {
                CardContainer(padding: .sm) {
                    VStack(alignment: .leading, spacing: 8) {
                        OperatingPlanFieldRow(label: "Summary", value: support.supportSummary)
                        OperatingPlanFieldRow(label: "Schedule", value: OperatingPlanSchedulePresentation.formatSupportSchedule(support.supportSchedule))
                        OperatingPlanFieldRow(label: "Starts", value: OperatingPlanDateValues.readableDate(support.supportSchedule.startDate))
                        OperatingPlanFieldRow(label: "Ends", value: support.supportSchedule.endDate.map(OperatingPlanDateValues.readableDate) ?? "Until changed")
                        OperatingPlanFieldRow(label: "Reminder", value: support.reminderPreference.label)
                        if let nextDue = support.nextDue { OperatingPlanFieldRow(label: "Next due", value: nextDue) }
                        if !support.notes.isEmpty { OperatingPlanFieldRow(label: "Execution Notes", value: support.notes) }
                    }
                }
            }

            PrimaryActionButton(title: "Edit Support") {
                draft = support
                isEditing = true
            }
            .accessibilityIdentifier("operatingPlan.recovery.editSupport")
        }
    }

    private func editor(draft: OperatingPlanRecoverySupportReadModel) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            OperatingPlanScreenHeader(eyebrow: "Recovery", title: "Edit \(draft.name) Support", subtitle: "Adjust when and how this support method is scheduled.")

            OperatingPlanSupportScheduleEditor(schedule: Binding(
                get: { draft.supportSchedule }, set: { self.draft?.supportSchedule = $0 }
            ))

            OperatingPlanSection("Reminder") {
                HStack(spacing: 8) {
                    ForEach(OperatingPlanReminderPreference.allCases) { option in
                        OperatingPlanChoicePill(title: option.label, isSelected: draft.reminderPreference == option) {
                            self.draft?.reminderPreference = option
                        }
                    }
                }
            }

            OperatingPlanSection("Execution Notes") {
                CardContainer(padding: .sm) {
                    TextField("Optional notes shown when this priority is opened", text: Binding(
                        get: { draft.notes }, set: { self.draft?.notes = $0 }
                    ), axis: .vertical)
                    .lineLimit(3...6)
                }
            }

            if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
            PrimaryActionButton(title: "Save Support") { save(draft) }
                .accessibilityIdentifier("operatingPlan.recovery.save")
        }
    }

    private func save(_ model: OperatingPlanRecoverySupportReadModel) {
        switch environment.nativeAuthority {
        case .sandbox:
            switch store.saveRecoverySupport(model) {
            case .success: errorMessage = nil; isEditing = false
            case .failure(let error): errorMessage = error.message
            }
        case .founderProduction:
            guard let detail = productionDetail, let reminderId = detail.reminderId else {
                errorMessage = "This support plan is unavailable. Refresh and try again."
                return
            }
            Task { @MainActor in
                do {
                    _ = try await environment.recurringSupportAPI.save(
                        protocolId: detail.protocolId, protocolCategory: detail.protocolCategory,
                        executionId: detail.executionId, reminderId: reminderId,
                        expectedRevision: detail.hydration.executionRevision,
                        supportSchedule: model.supportSchedule, reminderPreference: model.reminderPreference, notes: model.notes
                    )
                    errorMessage = nil
                    isEditing = false
                    await loadProductionIfNeeded()
                } catch {
                    errorMessage = "The support schedule was not saved. Refresh before retrying."
                }
            }
        }
    }

    private static func readModel(from detail: RecurringSupportDetail) -> OperatingPlanRecoverySupportReadModel {
        OperatingPlanRecoverySupportReadModel(
            executionId: detail.executionId,
            name: detail.title,
            purpose: detail.purpose,
            supportSummary: detail.supportSummary,
            supportSchedule: detail.hydration.supportSchedule,
            reminderPreference: detail.hydration.reminderPreference,
            notes: detail.hydration.notes,
            nextDue: detail.nextDue
        )
    }
}
