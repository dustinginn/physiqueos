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

    var backTitle: String = "Operating Plan"

    var body: some View {
        OperatingPlanScrollPage {
            OperatingPlanHeader(
                eyebrow: "Tracking",
                title: "Tracking",
                subtitle: "Recurring measurements that keep the evidence current."
            )
            if let tracking {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 12) {
                        OperatingPlanIconTile(systemImage: OperatingPlanIcon.systemImage(for: "tracking"), tint: OperatingPlanColor.cyan)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Current tracking routine")
                                .physiqueOSFont(PhysiqueOSTypography.operatingPlanEyebrow)
                                .foregroundStyle(OperatingPlanColor.muted)
                            Text(tracking.title)
                                .physiqueOSFont(PhysiqueOSTypography.operatingPlanCardTitle)
                                .foregroundStyle(OperatingPlanColor.ink)
                            Text(tracking.currentSupport)
                                .physiqueOSFont(PhysiqueOSTypography.operatingPlanCardDetail)
                                .foregroundStyle(OperatingPlanColor.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 6)
                        OperatingPlanStatusPill(text: "Active", tone: .green)
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        if let nextDue = tracking.nextDue { OperatingPlanLine("Next due", nextDue) }
                        OperatingPlanLine("Completion", tracking.completion, detail: "Evidence-owned: no manual check-off", showsRule: false)
                    }
                    OperatingPlanButton(title: "Edit Support", style: .quiet) {
                        OperatingPlanNavigationContext.navigate(.operatingPlanTrackingSupport(executionId: tracking.executionId), from: "Tracking", using: onNavigate)
                    }
                    .accessibilityIdentifier("operatingPlan.tracking.editSupport")
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(OperatingPlanColor.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(OperatingPlanColor.rule, lineWidth: 1))
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("operatingPlan.tracking.routine")
                Text(tracking.purpose)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanCaption)
                    .foregroundStyle(OperatingPlanColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
            } else if environment.nativeAuthority == .founderProduction, isLoadingProduction {
                OperatingPlanLoadingView()
            } else {
                OperatingPlanFailureView(
                    title: "Tracking couldn't be loaded",
                    message: loadError == nil ? "Tracking is unavailable." : "Nothing was changed. Check your connection and try again.",
                    retry: loadError == nil ? nil : { Task { await loadProductionIfNeeded() } }
                )
            }
        }
        .operatingPlanChrome(back: backTitle)
        .accessibilityIdentifier("operatingPlan.tracking")
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

    var backTitle: String = "Tracking"

    var body: some View {
        OperatingPlanScrollPage {
            if let draft {
                VStack(alignment: .leading, spacing: 0) {
                    OperatingPlanHeader(
                        eyebrow: draft.title,
                        title: "Edit Support",
                        subtitle: "Set when this measurement is expected and whether Home should remind you. Weight evidence completes it automatically."
                    )
                    OperatingPlanSupportScheduleEditor(schedule: Binding(
                        get: { draft.supportSchedule },
                        set: { self.draft?.supportSchedule = $0 }
                    ))
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
                            TextField("Optional notes shown when this priority is opened", text: Binding(
                                get: { draft.notes }, set: { self.draft?.notes = $0 }
                            ), axis: .vertical)
                            .lineLimit(3...6)
                            .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                        }
                    }
                    if let errorMessage { OperatingPlanErrorText(message: errorMessage).padding(.top, 16) }
                    OperatingPlanButton(title: "Save Support", style: .primary) { save(draft) }
                        .padding(.top, 22)
                        .accessibilityIdentifier("operatingPlan.tracking.save")
                }
            } else if environment.nativeAuthority == .founderProduction, isLoadingProduction {
                OperatingPlanLoadingView()
            } else if environment.nativeAuthority == .founderProduction {
                OperatingPlanFailureView(
                    title: "This support method couldn't be loaded",
                    message: loadError ?? "This support method is unavailable.",
                    retry: { Task { await loadIfNeeded() } }
                )
            }
        }
        .operatingPlanChrome(back: backTitle)
        .accessibilityIdentifier("operatingPlan.trackingSupport")
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
                    await environment.reconcileCanonicalPriorityNotifications()
                    dismiss()
                } catch {
                    errorMessage = "The support schedule was not saved. Refresh before retrying."
                }
            }
        }
    }
}
