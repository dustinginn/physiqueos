import SwiftUI

/// A single Training Day (`/progress/training/day/:date`) — mirrors
/// `TrainingDayScreen.jsx:8-44`: a header (title + `formatDaySummary`
/// description) and a plain list of that day's sessions, each linking to
/// its session detail. Uses `TrainingReadService.getDay`'s own field names
/// (`TrainingDayReadModel`), which are intentionally different from the
/// list page's `TrainingDaySummary` — the web keeps these as two separate
/// projections and so does this port.
struct TrainingDayView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var viewModel: TrainingDayViewModel?
    let date: String

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .task {
            if viewModel == nil { viewModel = TrainingDayViewModel(api: environment.trainingAPI, date: date) }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.none):
            Text("No training evidence for this day.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let day)):
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(day.label)
                        .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(Self.formatSummary(day.summary))
                        .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }

                VStack(spacing: 8) {
                    ForEach(day.sessions) { session in
                        NavigationLink(value: session.destination) {
                            TrainingDaySessionRowView(session: session)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    /// Mirrors `formatDaySummary` (`TrainingDayScreen.jsx:46-58`).
    private static func formatSummary(_ summary: TrainingDaySummaryDetail) -> String {
        var parts: [String] = []
        if !summary.bodyAreas.isEmpty { parts.append(summary.bodyAreas.joined(separator: " · ")) }
        if summary.strengthSessions > 0 {
            parts.append("\(summary.strengthSessions) strength session\(summary.strengthSessions == 1 ? "" : "s")")
        }
        if summary.exerciseCount > 0 {
            parts.append("\(summary.exerciseCount) exercise\(summary.exerciseCount == 1 ? "" : "s")")
        }
        if summary.hasWalking { parts.append("Walking") }
        if summary.hasCardio { parts.append("Cardio") }
        return parts.isEmpty ? "Training day" : parts.joined(separator: " · ")
    }
}

private struct TrainingDaySessionRowView: View {
    let session: TrainingDaySessionSummary

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.title)
                    .physiqueOSFont(PhysiqueOSTypography.rowSummary)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(session.detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textMuted)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 56)
        .frame(maxWidth: .infinity)
        .background(PhysiqueOSTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(PhysiqueOSTheme.divider, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
