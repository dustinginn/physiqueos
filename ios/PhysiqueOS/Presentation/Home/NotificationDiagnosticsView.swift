import SwiftUI
import UserNotifications

/// DEBUG-only screen answering "does a pending local notification actually
/// exist for this occurrence, and if not, exactly why not" — built from
/// `NotificationDiagnostics.makeReport`, which reuses the live scheduler's
/// own reconciliation logic rather than a second copy of it. Read-only: it
/// never schedules, cancels, or otherwise mutates the notification center.
/// Not wired into any production navigation path — see `HomeView`'s
/// `#if DEBUG` entry point.
struct NotificationDiagnosticsView: View {
    let items: [PriorityOccurrence]
    @State private var report: NotificationDiagnostics.Report?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let report {
                        section("Authorization") {
                            Text(String(describing: report.authorizationStatus))
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }

                        section("Pending Requests (\(report.pendingRequests.count))") {
                            if report.pendingRequests.isEmpty {
                                Text("No PhysiqueOS priority notifications are pending.")
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                            ForEach(Array(report.pendingRequests.enumerated()), id: \.offset) { _, request in
                                pendingRequestRow(request)
                            }
                        }

                        section("Reconciliation, per today's-focus item") {
                            ForEach(Array(report.itemOutcomes.enumerated()), id: \.offset) { _, outcome in
                                outcomeRow(outcome)
                            }
                        }

                        if !report.lastSyncFailures.isEmpty {
                            section("Last sync() failures") {
                                ForEach(Array(report.lastSyncFailures.enumerated()), id: \.offset) { _, failure in
                                    Text("\(failure.identifier): \(failure.error.localizedDescription)")
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                        .foregroundStyle(PhysiqueOSTheme.destructive)
                                }
                            }
                        }
                    } else {
                        ProgressView().tint(PhysiqueOSTheme.accent)
                    }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationTitle("Notification Diagnostics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { report = await NotificationDiagnostics.makeReport(items: items) }
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            content()
        }
    }

    private func pendingRequestRow(_ request: NotificationDiagnostics.PendingRequestSnapshot) -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 4) {
                Text(request.identifier)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("\(request.title) — \(request.body)")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text("category: \(request.category)")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Text("trigger: \(request.triggerDescription)")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Text("next fire: \(request.nextTriggerDate.map(String.init(describing:)) ?? "none resolvable")")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                if let canonical = request.canonicalScheduledTime {
                    Text("canonical scheduledTime: \(canonical)")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
    }

    private func outcomeRow(_ outcome: NotificationDiagnostics.ItemOutcome) -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(outcome.title)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Spacer()
                    Text(outcome.outcome.rawValue.uppercased())
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(outcome.outcome == .skip ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.accent)
                }
                Text("scheduledTime: \(outcome.canonicalScheduledTime ?? "nil")")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                Text(outcome.reason)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }
}
