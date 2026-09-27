import SwiftUI

/// Explicit engineering diagnostic for the HealthKit workout-reconciliation
/// confirm flow. Reads only bounded, device-local diagnostic events already
/// recorded by the real confirm flow itself (`WorkoutReconciliationDiagnostics`,
/// `NetworkFailureDiagnostics`); never mutates anything, never re-implements
/// the decision logic it observes. See `WorkoutReconciliationDiagnostics`'s
/// own doc comment for why this exists.
struct WorkoutReconciliationDiagnosticsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reconciliationEvents: [WorkoutReconciliationDiagnostics.Event] = []
    @State private var networkFailureEvents: [NetworkFailureDiagnostics.Event] = []
    @State private var commandNetworkEvents: [CommandNetworkDiagnostics.Event] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    section("Reconciliation attempts (\(reconciliationEvents.count))") {
                        if reconciliationEvents.isEmpty {
                            Text("No workout-reconciliation confirm attempts recorded on this device yet.")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        ForEach(Array(reconciliationEvents.enumerated()), id: \.offset) { _, event in
                            reconciliationRow(event)
                        }
                    }
                    section("Underlying network errors (\(networkFailureEvents.count))") {
                        Text("Every call site collapses failures into one generic error type before this app's own logic ever sees them; this is the original identity, captured for diagnosis only.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        if networkFailureEvents.isEmpty {
                            Text("No underlying network errors recorded on this device yet.")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        ForEach(Array(networkFailureEvents.enumerated()), id: \.offset) { _, event in
                            networkFailureRow(event)
                        }
                    }
                    section("Command network diagnostics (\(commandNetworkEvents.count))") {
                        Text("Protocol, interface, and connection-phase timings for every command submission's own dedicated connection, success or failure — captured even when the response came back with a non-2xx status this app never logged.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        if commandNetworkEvents.isEmpty {
                            Text("No command network diagnostics recorded on this device yet.")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                        ForEach(Array(commandNetworkEvents.enumerated()), id: \.offset) { _, event in
                            commandNetworkRow(event)
                        }
                    }
                }
                .padding(16)
            }
            .background(PhysiqueOSTheme.background)
            .navigationTitle("Workout Reconciliation Diagnostics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { capture() }
            .refreshable { capture() }
        }
    }

    @MainActor private func capture() {
        reconciliationEvents = WorkoutReconciliationDiagnostics.recentEvents()
        networkFailureEvents = NetworkFailureDiagnostics.recentEvents()
        commandNetworkEvents = CommandNetworkDiagnostics.recentEvents()
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            content()
        }
    }

    private func reconciliationRow(_ event: WorkoutReconciliationDiagnostics.Event) -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(event.stage) · \(event.capturedAt.formatted())")
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(event.reviewId).textSelection(.enabled)
                Text("Action: \(event.action)")
                if let rawVersionValue = event.rawVersionValue { Text("Version: \(rawVersionValue) (\(event.rawVersionType ?? "?"))") }
                if let outcome = event.outcome { Text("Outcome: \(outcome)") }
                if let domain = event.underlyingErrorDomain {
                    Text("Underlying: \(domain) #\(event.underlyingErrorCode ?? 0) — \(event.underlyingErrorDescription ?? "")")
                        .foregroundStyle(PhysiqueOSTheme.destructive)
                }
                if let taskWasCancelledAtCatch = event.taskWasCancelledAtCatch {
                    Text("App task cancelled at catch: \(taskWasCancelledAtCatch ? "yes" : "no")")
                        .foregroundStyle(PhysiqueOSTheme.destructive)
                }
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
        }
    }

    private func networkFailureRow(_ event: NetworkFailureDiagnostics.Event) -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(event.path) · \(event.capturedAt.formatted())")
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("\(event.errorDomain) #\(event.errorCode)")
                Text(event.errorDescription).textSelection(.enabled)
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
        }
    }

    private func commandNetworkRow(_ event: CommandNetworkDiagnostics.Event) -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(event.path) · \(event.capturedAt.formatted())")
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("Succeeded: \(event.succeeded ? "yes" : "no")")
                if let httpStatusCode = event.httpStatusCode {
                    Text("HTTP status: \(httpStatusCode) · body: \(event.responseBodyByteCount ?? 0) bytes")
                        .foregroundStyle(PhysiqueOSTheme.destructive)
                } else if event.succeeded {
                    Text("No HTTP response captured despite a successful transport call.")
                        .foregroundStyle(PhysiqueOSTheme.destructive)
                }
                if let interface = event.networkInterface, let status = event.pathStatus {
                    Text("Path: \(status) · \(interface)")
                }
                if let protocolName = event.protocolName {
                    Text("Protocol: \(protocolName) · reused: \(event.isReusedConnection == true ? "yes" : "no") · multipath: \(event.isMultipath == true ? "yes" : "no")")
                }
                if let totalMs = event.totalMs {
                    Text("Total: \(Int(totalMs))ms (connect \(Int(event.connectMs ?? 0))ms, TLS \(Int(event.secureConnectionMs ?? 0))ms, response \(Int(event.responseMs ?? 0))ms)")
                }
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
        }
    }
}
