import SwiftUI

/// Founder-only, read-only view of the on-device command network
/// diagnostics, with a sanitized JSON export (share sheet). It never sends
/// anything by itself and contains no credentials, payloads or health values.
struct NetworkDiagnosticsSection: View {
    @State private var summary = NetworkDiagnosticsExport.summary()
    @State private var exportURL: URL?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider().overlay(PhysiqueOSTheme.divider)
            Text("NETWORK DIAGNOSTICS")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("Recent command attempts, connectivity waits and failures kept on this iPhone. Share the export when a save stalls.")
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            CardContainer(padding: .md) {
                VStack(alignment: .leading, spacing: 8) {
                    row("Command attempts", "\(summary.attempts)")
                    row("Failures kept", "\(summary.failures)")
                    row("Connectivity waits", "\(summary.connectivityWaits)")
                    row("Session recreations", "\(summary.sessionRecreations)")
                    row("Last failure", summary.lastFailureAt.map { $0.formatted(date: .abbreviated, time: .standard) } ?? "—")
                    if let exportURL {
                        ShareLink(item: exportURL) {
                            Label("Share diagnostics", systemImage: "square.and.arrow.up")
                        }
                        .tint(PhysiqueOSTheme.accent)
                        .accessibilityIdentifier("networkDiagnostics.share")
                    }
                }
            }
        }
        .task { refresh() }
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).foregroundStyle(PhysiqueOSTheme.textSecondary)
            Spacer()
            Text(value).foregroundStyle(PhysiqueOSTheme.textPrimary).monospacedDigit()
        }
        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
    }

    private func refresh() {
        summary = NetworkDiagnosticsExport.summary()
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOS-network-diagnostics.json")
        if (try? NetworkDiagnosticsExport.makeJSON().write(to: url, options: .atomic)) != nil {
            exportURL = url
        }
    }
}
