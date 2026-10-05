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

    private let m = EvidenceMetrics(family: .training)

    var body: some View {
        EvidenceScrollPage {
            content
        }
        .evidencePageChrome(TrainingDateFormatting.short(date))
        .evidenceFamily(.training)
        .task {
            if viewModel == nil { viewModel = TrainingDayViewModel(api: environment.trainingAPI, date: date) }
            await viewModel?.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel?.state {
        case .none, .loading:
            EvidenceStatePanel(kind: .loading("Loading Training Evidence"), identifier: "training.day.loading")
        case .failed(let message):
            EvidenceStatePanel(kind: .failure(message, nil), identifier: "training.day.failure")
        case .loaded(.none):
            EvidenceStatePanel(kind: .empty("No training evidence for this day.", nil), identifier: "training.day.empty")
        case .loaded(.some(let day)):
            EvidencePageHeader(
                eyebrow: "Training Day",
                title: Self.formatCompactDate(day.date),
                subtitle: Self.formatSummary(day.summary)
            )
            sessionsSection(day.sessions)
        }
    }

    /// One open "Sessions" list of read-only rail rows in the Server's
    /// session order (Strength purple; Walking/Cardio teal; other neutral).
    private func sessionsSection(_ sessions: [TrainingDaySessionSummary]) -> some View {
        EvidenceSection(title: "Sessions", style: .open, identifier: "training.day.sessions") {
            EvidenceSmallNote(text: "\(sessions.count) session\(sessions.count == 1 ? "" : "s")")
        } content: {
            EvidenceDividedList(data: sessions) { session in
                NavigationLink(value: session.destination) {
                    TrainingDaySessionRowView(session: session)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("training.day.session.\(session.id)")
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

/// A session in the locked rail-row language. The type line comes from the
/// canonical `kind` (and the canonical activity type for `other`, e.g.
/// historical Cooldown), never from a guessed source.
private struct TrainingDaySessionRowView: View {
    let session: TrainingDaySessionSummary

    private var typeAndTone: (String, EvidenceRailTone) {
        switch session.kind {
        case .strength: ("Strength", .strength)
        case .walking: ("Walking", .walking)
        case .cardio: ("Cardio", .cardio)
        case .other: (session.activityType, .cooldown)
        }
    }

    var body: some View {
        EvidenceRailRow(type: typeAndTone.0, label: session.title, detail: session.detail, tone: typeAndTone.1)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
    }
}
