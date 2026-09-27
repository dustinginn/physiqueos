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
}
