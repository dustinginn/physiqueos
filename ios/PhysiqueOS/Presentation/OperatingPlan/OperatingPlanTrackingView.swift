import SwiftUI

/// Under Founder Production, Tracking's Morning Weigh-In routine is the
/// SAME `operating-plan-recurring-support` read / `operating-plan
/// .recurring-support.save.v1` write Recovery's Foam Rolling screen uses —
/// see `OperatingPlanRecoverySupportView`'s doc comment for the full
/// rationale. A production fetch failure fails closed rather than falling
/// back to sandbox/fixture data; Sandbox behavior is unchanged.
struct OperatingPlanTrackingView: View {
    @Environment(AppEnvironment.self) private var environment
    let onNavigate: (AppDestination) -> Void

    @State private var productionDetail: RecurringSupportDetail?
    @State private var isLoadingProduction = false
    @State private var loadError: String?

    private static let morningWeighInExecutionId = "execution_morning_weigh_in"

    private var tracking: OperatingPlanTrackingReadModel? {
        switch environment.nativeAuthority {
        case .sandbox: environment.operatingPlanStore.tracking
        case .founderProduction: productionDetail.map(Self.readModel(from:))
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "TRACKING",
                    title: "Tracking",
                    subtitle: "Define the recurring measurements PhysiqueOS uses to understand how your plan is working."
                )
                OperatingPlanSection("Current Tracking Routines") {
                    CardContainer(padding: .md) {
                        if let tracking {
                            VStack(alignment: .leading, spacing: 12) {
                                Text(tracking.title)
                                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Text(tracking.purpose)
                                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                OperatingPlanFieldRow(label: "Current Support", value: tracking.currentSupport)
                                if let nextDue = tracking.nextDue { OperatingPlanFieldRow(label: "Next due", value: nextDue) }
                                OperatingPlanFieldRow(label: "Completion", value: tracking.completion)
                                PrimaryActionButton(title: "Edit Support") {
                                    onNavigate(.operatingPlanTrackingSupport(executionId: tracking.executionId))
                                }
                            }
                        } else if environment.nativeAuthority == .founderProduction, isLoadingProduction {
                            ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 120)
                        } else {
                            Text(loadError ?? "Tracking is unavailable.")
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Tracking")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: environment.nativeAuthority) { await loadProductionIfNeeded() }
    }

    private func loadProductionIfNeeded() async {
        guard environment.nativeAuthority == .founderProduction else { return }
        isLoadingProduction = true
        loadError = nil
        defer { isLoadingProduction = false }
        do {
            productionDetail = try await environment.recurringSupportAPI.fetchSupport(executionId: Self.morningWeighInExecutionId)
        } catch {
            productionDetail = nil
            loadError = "Tracking couldn't be loaded. Pull to refresh or try again."
        }
    }

    private static func readModel(from detail: RecurringSupportDetail) -> OperatingPlanTrackingReadModel {
        OperatingPlanTrackingReadModel(
            executionId: detail.executionId,
            title: detail.title,
            purpose: detail.purpose,
            currentSupport: detail.supportSummary,
            completion: "Weight evidence completes it automatically.",
            supportSchedule: detail.hydration.supportSchedule,
            reminderPreference: detail.hydration.reminderPreference,
            notes: detail.hydration.notes,
            nextDue: detail.nextDue
        )
    }
}

struct OperatingPlanTrackingSupportView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let executionId: String

    @State private var draft: OperatingPlanTrackingReadModel?
    @State private var errorMessage: String?
    @State private var productionDetail: RecurringSupportDetail?
    @State private var isLoadingProduction = false
    @State private var loadError: String?

    var body: some View {
        ScrollView {
            if let draft {
                VStack(alignment: .leading, spacing: 18) {
                    OperatingPlanScreenHeader(
                        eyebrow: draft.title,
                        title: "Edit Support",
                        subtitle: "Set when this measurement is expected and whether Home should remind you. Weight evidence completes it automatically."
                    )
                    OperatingPlanSupportScheduleEditor(schedule: Binding(
                        get: { draft.supportSchedule },
                        set: { self.draft?.supportSchedule = $0 }
                    ))
                    OperatingPlanSection("Reminder") {
                        HStack(spacing: 8) {
                            ForEach(OperatingPlanReminderPreference.allCases) { preference in
                                OperatingPlanChoicePill(title: preference.label, isSelected: draft.reminderPreference == preference) {
                                    self.draft?.reminderPreference = preference
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
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        }
                    }
                    if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
                    PrimaryActionButton(title: "Save Support") { save(draft) }
                        .accessibilityIdentifier("operatingPlan.tracking.save")
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            } else if environment.nativeAuthority == .founderProduction, isLoadingProduction {
                ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 240).padding(.top, 80)
            } else if environment.nativeAuthority == .founderProduction {
                OperatingPlanUnavailableView(message: loadError ?? "This support method is unavailable.")
            }
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: environment.nativeAuthority) { await loadIfNeeded() }
    }

    private func loadIfNeeded() async {
        switch environment.nativeAuthority {
        case .sandbox:
            if draft == nil, environment.operatingPlanStore.tracking.executionId == executionId {
                draft = environment.operatingPlanStore.tracking
            }
        case .founderProduction:
            isLoadingProduction = true
            loadError = nil
            defer { isLoadingProduction = false }
            do {
                guard let detail = try await environment.recurringSupportAPI.fetchSupport(executionId: executionId) else {
                    loadError = "This support method is unavailable."
                    return
                }
                productionDetail = detail
                draft = OperatingPlanTrackingReadModel(
                    executionId: detail.executionId, title: detail.title, purpose: detail.purpose,
                    currentSupport: detail.supportSummary, completion: "Weight evidence completes it automatically.",
                    supportSchedule: detail.hydration.supportSchedule, reminderPreference: detail.hydration.reminderPreference,
                    notes: detail.hydration.notes, nextDue: detail.nextDue
                )
            } catch {
                loadError = "This support method couldn't be loaded. Pull to refresh or try again."
            }
        }
    }

    private func save(_ model: OperatingPlanTrackingReadModel) {
        switch environment.nativeAuthority {
        case .sandbox:
            switch environment.operatingPlanStore.saveTracking(model) {
            case .success: dismiss()
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
                    dismiss()
                } catch {
                    errorMessage = "The support schedule was not saved. Refresh before retrying."
                }
            }
        }
    }
}
