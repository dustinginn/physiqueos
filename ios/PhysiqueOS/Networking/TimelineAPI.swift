import Foundation

protocol TimelineAPI: Sendable {
    func fetchTimeline() async throws -> TimelineReadModel
}

/// Timeline has no Sandbox fixture precedent — it is a genuinely new
/// Founder Production feature (Patch 3 continuation). Sandbox shows an
/// honest "not available" state rather than a fabricated fixture feed.
struct NotAvailableTimelineAPI: TimelineAPI {
    struct NotAvailable: Error {}

    func fetchTimeline() async throws -> TimelineReadModel {
        throw NotAvailable()
    }
}

#if DEBUG
/// Deterministic, non-shipping review feed for real-simulator visual parity.
/// It is selected only by `-physiqueos.redesign-review`; ordinary Sandbox
/// continues to show its truthful unavailable state.
struct TimelineRedesignReviewAPI: TimelineAPI {
    func fetchTimeline() async throws -> TimelineReadModel {
        TimelineReadModel(
            items: [
                .init(id: "weight-1", type: "Weight", date: "2026-09-10", title: "Weight logged", detail: "168.3 lb", tone: .evidence),
                .init(id: "briefing-1", type: "Daily Briefing", date: "2026-09-09", title: "Midweek Briefing", detail: "Review the week so far.", tone: .primary),
                .init(id: "photo-1", type: "Progress Photo", date: "2026-08-30", title: "Progress photo session captured", detail: "4 views recorded", tone: .success),
                .init(id: "dexa-1", type: "DEXA", date: "2026-08-30", title: "DEXA scan captured", detail: "BodySpec · 9.4% body fat", tone: .primary),
                .init(id: "workout-1", type: "Workout", date: "2026-08-29", title: "Workout recorded", detail: "Strength training evidence reconciled", tone: .effort),
                .init(id: "activity-1", type: "Daily Activity", date: "2026-08-29", title: "Daily activity captured", detail: "Apple Health activity evidence", tone: .evidence),
                .init(id: "upload-1", type: "Evidence Upload", date: "2026-08-20", title: "Evidence upload failed", detail: "Unrecovered upload event", tone: .danger),
                .init(id: "protocol-1", type: "Protocol", date: "2026-08-01", title: "Protocol updated", detail: "Current plan captured", tone: .success),
            ],
            hasMore: true,
            totalCount: 124,
            limit: 8
        )
    }
}
#endif

/// The `timeline` native resource returns one bounded, already-sorted
/// (newest-first) page with no cursor — Native fetches once per load and
/// never invents client-side pagination beyond the server's own bounds
/// (manifest: `limit` 1–200).
struct ProductionTimelineAPI: TimelineAPI {
    let api: ProductionNativeAPI

    func fetchTimeline() async throws -> TimelineReadModel {
        let envelope = try await api.readResource("timeline", as: Payload.self)
        return TimelineReadModel(
            items: envelope.data.items.map(\.readModel),
            hasMore: envelope.data.hasMore,
            totalCount: envelope.data.totalCount,
            limit: envelope.data.limit
        )
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var items: [Item]
        var hasMore: Bool
        var totalCount: Int
        var limit: Int
    }

    private struct Item: Decodable {
        var id: String
        var type: String
        var date: String
        var title: String
        var detail: String
        var tone: HomeColorToken

        var readModel: TimelineItem {
            TimelineItem(id: id, type: type, date: date, title: title, detail: detail, tone: tone)
        }
    }
}
