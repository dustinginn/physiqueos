import Foundation

/// Mirrors `HomeAPI`/`LogAPI`'s pattern: the seam `EvidenceView` depends on
/// instead of a concrete transport.
protocol EvidenceAPI: Sendable {
    func fetchEvidenceHub() async throws -> EvidenceHubReadModel
}

/// Fixture-backed conformance: decodes the same bundled JSON a live
/// implementation would eventually receive over the network, through the
/// same `EvidenceHubReadModel` decode path.
struct FixtureEvidenceAPI: EvidenceAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    func fetchEvidenceHub() async throws -> EvidenceHubReadModel {
        guard let url = Bundle.main.url(forResource: "EvidenceFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(EvidenceHubReadModel.self, from: data)
    }
}

#if DEBUG
/// Screenshot/UI-test-only Evidence Hub + Timeline seam for real-simulator
/// parity review against the locked H1/T1/S1 references. Enabled only by
/// `-physiqueos.evidence-review`; `-physiqueos.evidence-review.state`
/// selects `loaded` (default), `loading`, `failed` or `empty`. The hub
/// payload deliberately keeps the production composition (Timeline before
/// Recovery, Health Metrics placeholder present) so captures exercise the
/// real `EvidenceHubPresentation` projection. Absent from Release.
enum EvidenceRedesignReview {
    enum State: String {
        case loaded, loading, failed, empty
    }

    static var isEnabled: Bool {
        ProcessInfo.processInfo.arguments.contains("-physiqueos.evidence-review")
    }

    static var state: State {
        let arguments = ProcessInfo.processInfo.arguments
        guard let flag = arguments.firstIndex(of: "-physiqueos.evidence-review.state"),
              arguments.indices.contains(flag + 1),
              let state = State(rawValue: arguments[flag + 1])
        else { return .loaded }
        return state
    }

    /// `-physiqueos.evidence-review.scroll bottom` opens the page scrolled
    /// to its end so the lower Hub rows (Recovery, Timeline) can be reviewed.
    static var scrollsToBottom: Bool {
        let arguments = ProcessInfo.processInfo.arguments
        guard isEnabled, let flag = arguments.firstIndex(of: "-physiqueos.evidence-review.scroll"),
              arguments.indices.contains(flag + 1)
        else { return false }
        return arguments[flag + 1] == "bottom"
    }

    static var evidenceAPI: EvidenceAPI? { isEnabled ? HubAPI(state: state) : nil }
    static var timelineAPI: TimelineAPI? { isEnabled ? TimelineFeedAPI(state: state) : nil }

    /// Recently Used is device-local authority; the review seeds Training
    /// (opened twice) then Photos (opened once) in memory only.
    static var usageStore: EvidenceHubUsageStore? {
        guard isEnabled else { return nil }
        let now = Date()
        var usage = EvidenceHubUsage.empty
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "photos", now: now.addingTimeInterval(-7_200))
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "training", now: now.addingTimeInterval(-3_600))
        usage = EvidenceHubUsageService.recordVisit(usage: usage, evidenceType: "training", now: now.addingTimeInterval(-60))
        return InMemoryUsageStore(usage: usage)
    }

    struct Unavailable: Error {}

    private final class InMemoryUsageStore: EvidenceHubUsageStore, @unchecked Sendable {
        private var usage: EvidenceHubUsage
        init(usage: EvidenceHubUsage) { self.usage = usage }
        func load() -> EvidenceHubUsage { usage }
        func save(_ usage: EvidenceHubUsage) { self.usage = usage }
    }

    private static func waitIndefinitely() async throws -> Never {
        while true { try await Task.sleep(nanoseconds: 3_600_000_000_000) }
    }

    private struct HubAPI: EvidenceAPI {
        let state: State

        func fetchEvidenceHub() async throws -> EvidenceHubReadModel {
            switch state {
            case .loading: try await waitIndefinitely()
            case .failed: throw Unavailable()
            case .loaded, .empty: break
            }
            func stream(_ id: String, _ title: String, metric: String, lastUpdated: String?, tone: HomeColorToken = .primary, status: EvidenceStreamStatus = .available) -> EvidenceStreamSummary {
                EvidenceStreamSummary(id: id, title: title, metric: metric, trend: metric, lastUpdated: lastUpdated, status: status, tone: tone, destination: .progressStream(streamId: id))
            }
            return EvidenceHubReadModel(
                title: "Evidence Hub",
                subtitle: "PhysiqueOS organizes what it knows about your body, progress, and routines.",
                streams: [
                    stream("training", "Training", metric: "Push · 6 exercises", lastUpdated: "2026-08-30"),
                    stream("nutrition", "Nutrition", metric: "2,410 kcal", lastUpdated: "2026-08-30"),
                    stream("weight", "Weight", metric: "179.4 lb", lastUpdated: "2026-08-30", tone: .evidence),
                    stream("photos", "Progress Photos", metric: "4 views", lastUpdated: "2026-08-30"),
                    stream("dexa", "DEXA", metric: "9.4%", lastUpdated: "2026-08-30", tone: .success),
                    stream("activity", "Activity", metric: "612 active cal", lastUpdated: "2026-08-30"),
                    stream("energy", "Energy", metric: "Complete", lastUpdated: "2026-08-30"),
                    stream("timeline", "Timeline", metric: "A chronological record of what PhysiqueOS has captured", lastUpdated: nil),
                    stream("recovery", "Recovery", metric: "Last night · 7h 30m", lastUpdated: "2026-08-30", tone: .success),
                    stream("health-metrics", "Health Metrics", metric: "Coming soon", lastUpdated: nil, status: .placeholder),
                ]
            )
        }
    }

    private struct TimelineFeedAPI: TimelineAPI {
        let state: State

        func fetchTimeline() async throws -> TimelineReadModel {
            switch state {
            case .loading: try await waitIndefinitely()
            case .failed: throw Unavailable()
            case .empty: return TimelineReadModel(items: [], hasMore: false, totalCount: 0, limit: 50)
            case .loaded: break
            }
            return TimelineReadModel(
                items: [
                    .init(id: "weight-1", type: "Weight", date: "2026-09-10", title: "Weight logged", detail: "168.3 lb", tone: .evidence),
                    .init(id: "briefing-1", type: "Daily Briefing", date: "2026-09-09", title: "Midweek Briefing", detail: "Review the week so far.", tone: .primary),
                    .init(id: "photo-1", type: "Progress Photo", date: "2026-08-30", title: "Progress photo session captured", detail: "4 views recorded", tone: .success),
                    .init(id: "dexa-1", type: "DEXA", date: "2026-08-30", title: "DEXA scan captured", detail: "BodySpec · 9.4% body fat", tone: .primary),
                    .init(id: "workout-1", type: "Workout", date: "2026-08-29", title: "Workout recorded", detail: "Strength training evidence reconciled", tone: .effort),
                    .init(id: "activity-1", type: "Daily Activity", date: "2026-08-29", title: "Daily activity captured", detail: "Apple Health activity evidence", tone: .evidence),
                    .init(id: "upload-1", type: "Evidence Upload", date: "2026-08-20", title: "Evidence upload failed", detail: "Unrecovered upload event", tone: .danger),
                    .init(id: "protocol-1", type: "Protocol", date: "2026-08-01", title: "Protocol updated", detail: "Current plan captured", tone: .surface),
                ],
                hasMore: true,
                totalCount: 124,
                limit: 8
            )
        }
    }
}
#endif
