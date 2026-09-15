import SwiftUI
import UserNotifications

/// Hidden diagnostic screen (long-press on Home — no visible affordance,
/// but deliberately compiled into every configuration, TestFlight/Release
/// included, since it exists to answer "does a pending local notification
/// actually exist" on exactly the physical device that reported a delivery
/// problem) answering that question and, if a request DOES exist, why iOS
/// might still not have shown it — built from
/// `NotificationDiagnostics.makeReport`, which reuses the live scheduler's
/// own reconciliation logic rather than a second copy of it. Read-only: it
/// never schedules, cancels, or otherwise mutates the notification center.
struct NotificationDiagnosticsView: View {
    let items: [PriorityOccurrence]
    @State private var report: NotificationDiagnostics.Report?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let report {
                        section("Capture") {
                            Text("\(report.capturedAt.formatted()) · \(report.timeZoneIdentifier)")
                            Text("Registered categories: \(report.registeredCategories.joined(separator: ", "))")
                        }
                        section("Authorization") {
                            Text(String(describing: report.authorizationStatus))
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }

                        // Distinct from authorization: a Focus Mode, the
                        // iOS 15+ Scheduled Summary, or a per-alert-type
                        // toggle can each silence delivery of an otherwise
                        // correctly-scheduled, authorized request — this
                        // is how "a request exists but iOS didn't show it"
                        // is told apart from "no request was ever created".
                        section("Delivery Settings") {
                            deliverySettingRow("Alert", report.deliverySettings.alertSetting)
                            deliverySettingRow("Sound", report.deliverySettings.soundSetting)
                            deliverySettingRow("Badge", report.deliverySettings.badgeSetting)
                            deliverySettingRow("Lock Screen", report.deliverySettings.lockScreenSetting)
                            deliverySettingRow("Notification Center", report.deliverySettings.notificationCenterSetting)
                            deliverySettingRow("Scheduled Summary", report.deliverySettings.scheduledDeliverySetting)
                            deliverySettingRow("Time Sensitive", report.deliverySettings.timeSensitiveSetting)
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

                        section("Delivered Requests (\(report.deliveredRequests.count))") {
                            Text("Only notifications still retained by iOS are visible. An empty list does not prove a request was never scheduled.")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            ForEach(Array(report.deliveredRequests.enumerated()), id: \.offset) { _, request in
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

    private func deliverySettingRow(_ label: String, _ setting: UNNotificationSetting) -> some View {
        HStack {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            Spacer()
            Text(String(describing: setting))
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(setting == .disabled ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.textPrimary)
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
