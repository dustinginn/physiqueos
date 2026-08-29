import SwiftUI

/// A single Training Day (`/progress/training/day/:date`) — Founder-
/// specified presentation (no single literal web route matches this
/// screen 1:1; the closest real web pieces are `MobilePageHeader`'s
/// eyebrow/title header pattern and `TrainingDayHistoryCard`'s grouped
/// "Sessions"-style container, both verified from source and reused here
/// for structural fidelity): a small purple uppercase "Training Day"
/// eyebrow, a compact date ("Aug 16, 2026" — not the long
/// "Wednesday, August 26" form), the day summary line
/// (`formatDaySummary`-equivalent), then one "Sessions" card grouping
/// every session row (not independent floating cards) — mirroring the
/// same `CardContainer` + grouped-rows convention `TrainingAreaView`'s
/// "Browse" card already establishes. Uses `TrainingReadService.getDay`'s
/// own field names (`TrainingDayReadModel`), which are intentionally
/// different from the list page's `TrainingDaySummary` — the web keeps
/// these as two separate projections and so does this port.
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
                header(for: day)
                sessionsCard(day.sessions)
            }
        }
    }

    private func header(for day: TrainingDayReadModel) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Training Day")
                .physiqueOSFont(PhysiqueOSTypography.sectionLabel)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(Self.formatCompactDate(day.date))
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(Self.formatSummary(day.summary))
                .physiqueOSFont(PhysiqueOSTypography.screenSubtitle)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A single grouped container for every session row — replaces a prior
    /// revision's bare `VStack` of independently bordered/elevated rows
    /// (which read as unrelated floating cards rather than one day's
    /// sessions) with the same `CardContainer` + `SectionHeading` +
    /// divided-rows convention `TrainingAreaView`'s "Browse" card and
    /// `TrainingSessionDetailView`'s "Exercises" card already establish.
    private func sessionsCard(_ sessions: [TrainingDaySessionSummary]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Sessions")
                VStack(spacing: 0) {
                    ForEach(sessions) { session in
                        NavigationLink(value: session.destination) {
                            TrainingDaySessionRowView(session: session)
                        }
                        .buttonStyle(.plain)

                        if session.id != sessions.last?.id {
                            Divider().overlay(PhysiqueOSTheme.divider)
                        }
                    }
                }
            }
        }
    }

    /// Founder-specified compact date ("Aug 16, 2026") — deliberately not
    /// the long `day.label` form ("Wednesday, August 26") the prior
    /// revision showed as the page title; `internal` (not `private`) so
    /// this formatting is directly testable.
    static func formatCompactDate(_ isoDate: String) -> String {
        let parts = isoDate.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return isoDate }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        guard let date = Calendar(identifier: .gregorian).date(from: components) else { return isoDate }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, yyyy"
        return formatter.string(from: date)
    }

    /// Mirrors `formatDaySummary` (`TrainingDayScreen.jsx:46-58`).
    /// `internal` (not `private`) so this formatting is directly testable.
    static func formatSummary(_ summary: TrainingDaySummaryDetail) -> String {
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

/// A grouped row inside the "Sessions" card — matches `TrainingAreaView`'s
/// "Browse" row weight/density (`surfaceMuted` fill, accent chevron, no
/// independent border/elevation) rather than the prior revision's
/// individually bordered `surfaceElevated` card, which read as unrelated
/// floating cards instead of rows within one Sessions section.
private struct TrainingDaySessionRowView: View {
    let session: TrainingDaySessionSummary

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.title)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(session.detail)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.accent)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
        .frame(maxWidth: .infinity)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
