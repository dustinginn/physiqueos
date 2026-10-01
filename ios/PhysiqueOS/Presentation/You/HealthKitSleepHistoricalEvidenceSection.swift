import SwiftUI

/// Temporary Founder-only trigger for the reviewed, bounded Evidence import.
/// It exposes counts and the first represented day, never private sleep values.
struct HealthKitSleepHistoricalEvidenceSection: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var capability: HealthKitSleepHistoricalEvidenceCapability?
    @State private var working = false
    @State private var summary: HealthKitSleepHistoricalEvidenceRunSummary?

    var body: some View {
        CardContainer(padding: .md) {
            VStack(alignment: .leading, spacing: 12) {
                Text("HISTORICAL SLEEP EVIDENCE")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text("Imports only Jul 6–Oct 6 from Apple Health into permanently non-strategic Recovery Evidence. Re-running is safe.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                PrimaryActionButton(title: working ? "Importing…" : "Import historical Sleep Evidence", isEnabled: !working && capability != nil) { Task { await run() } }
                if let summary {
                    Text(summary.failureCode.map { "Stopped: \($0)" } ?? "\(summary.samplesSent) samples · \(summary.batches) batches · first night \(summary.firstRepresentableSleepDay ?? "none")")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else if capability == nil {
                    Text("Server import window unavailable").physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task { capability = await environment.healthKitSleepHistoricalEvidenceRunner?.currentCapability() }
    }

    private func run() async {
        guard let runner = environment.healthKitSleepHistoricalEvidenceRunner else { return }
        working = true; defer { working = false }
        summary = await runner.run()
        capability = await runner.currentCapability()
    }
}
