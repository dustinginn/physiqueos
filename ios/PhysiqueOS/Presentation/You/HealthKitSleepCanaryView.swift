import SwiftUI

/// TEMPORARY Founder-only controls for the active HealthKit Sleep canary.
/// Everything that already graduated to automatic operation (Activity,
/// Nutrition, Workouts, Strength reconciliation, notifications) runs without
/// any control here. Remove this view when Sleep itself graduates.
///
/// Enablement is in-memory and resets when the page closes; authorization and
/// the historical read are separate explicit taps.
struct HealthKitSleepCanaryView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var canaryEnabled = false
    @State private var isWorking = false
    @State private var authorizationMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider().overlay(PhysiqueOSTheme.divider)
            Text("SLEEP CANARY (TEMPORARY)")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("Founder-only controls for validating Apple Health Sleep before it becomes automatic. Nothing here runs on its own.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)

            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("Enable Sleep canary", isOn: $canaryEnabled)
                        .tint(PhysiqueOSTheme.accent)
                        .onChange(of: canaryEnabled) { _, enabled in
                            environment.healthKitFounderCanaryCoordinator.setEnabled(enabled)
                            if !enabled { authorizationMessage = nil }
                        }
                    PrimaryActionButton(
                        title: "Request Apple Health authorization",
                        isEnabled: canaryEnabled && !isWorking
                    ) {
                        requestAuthorization()
                    }
                    if let authorizationMessage {
                        Text(authorizationMessage)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }

            HealthKitSleepValidationSection(
                isEnabled: canaryEnabled && environment.healthKitFounderCanaryCoordinator.authorizationWasExplicitlyRequested
            )
            HealthKitSleepHistoricalEvidenceSection()
        }
    }

    private func requestAuthorization() {
        isWorking = true
        Task {
            let outcome = await environment.healthKitFounderCanaryCoordinator.requestAuthorization()
            await MainActor.run {
                switch outcome {
                case .completed: authorizationMessage = "Apple Health authorization flow completed. If Sleep reads return nothing, check Health › Apps › PhysiqueOS › Sleep."
                case .blockedByFeatureGate: authorizationMessage = "Enable the Sleep canary first."
                case .unavailable: authorizationMessage = "HealthKit is unavailable on this device."
                case let .failed(availability): authorizationMessage = "Authorization did not complete: \(String(describing: availability))."
                }
                isWorking = false
            }
        }
    }
}
