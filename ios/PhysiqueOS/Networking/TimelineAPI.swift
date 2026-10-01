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
