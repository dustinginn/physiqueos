import SwiftUI

/// Founder-only diagnostic for the Phase C historical Sleep validation lane.
/// Not a Sleep product surface: it shows counts only (no times, durations,
/// stages, or sources) and runs nothing unless the Founder taps it while the
/// Server advertises an authorized validation window.
struct HealthKitSleepValidationSection: View {
    @Environment(AppEnvironment.self) private var environment
    let isEnabled: Bool
    @State private var capability: HealthKitSleepValidationCapability?
    @State private var checked = false
    @State private var isWorking = false
    @State private var summary: HealthKitSleepValidationRunSummary?

    var body: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 12) {
                Text("SLEEP HISTORICAL VALIDATION")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text("Founder diagnostic. Reads at most 30 nights of Apple Health Sleep before Sleep starts, only inside the window the Server authorizes, and uploads it as validation data. It never becomes Sleep history, Evidence, or coaching input.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                statusRow("Server window", capability == nil ? (checked ? "Not authorized" : "Not checked") : "Authorized (\(capability?.runId ?? ""))")
                PrimaryActionButton(title: "Check Server window", isEnabled: isEnabled && !isWorking) {
                    Task { await refresh() }
                }
                PrimaryActionButton(
                    title: isWorking ? "Validating…" : "Run historical Sleep validation",
                    isEnabled: isEnabled && capability != nil && !isWorking
                ) {
                    Task { await run() }
                }
                if let summary {
                    statusRow("Samples read", String(summary.samplesRead))
                    statusRow("Samples sent", String(summary.samplesSent))
                    statusRow("Not representable", String(summary.samplesNotRepresentable))
                    ForEach(summary.outcomes.keys.sorted(), id: \.self) { key in
                        statusRow(key, String(summary.outcomes[key] ?? 0))
                    }
                    if let code = summary.failureCode {
                        Text(code)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.chartEffort)
                    }
                }
            }
        }
    }

    @MainActor
    private func refresh() async {
        capability = await environment.healthKitSleepHistoricalValidationRunner?.currentCapability()
        checked = true
    }

    @MainActor
    private func run() async {
        guard let runner = environment.healthKitSleepHistoricalValidationRunner else { return }
        isWorking = true
        summary = await runner.run()
        isWorking = false
    }

    private func statusRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(PhysiqueOSTheme.textSecondary)
            Spacer()
            Text(value).foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
    }
}
