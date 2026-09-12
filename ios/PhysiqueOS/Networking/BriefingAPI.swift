import Foundation

protocol BriefingAPI: Sendable {
    func fetchHistory() async throws -> [BriefingHistoryRowReadModel]
    func fetchBriefing(artifactId: String) async throws -> BriefingReadModel?
    func fetchDEXAEvent(scanId: String) async throws -> BriefingReadModel?
    func fetchPhotoEvent(sessionId: String) async throws -> BriefingReadModel?
}

/// Wraps the existing `BriefingSandboxStore` (unchanged fixture behavior)
/// behind the same seam Production uses, so `BriefingHistoryView`/
/// `BriefingDetailView` read through one authority-switching API instead
/// of reaching into `environment.briefingSandboxStore` directly — the same
/// fixture-leak-class fix already applied to Photos/Weight/Timeline this
/// pass. History rows are thinned down to `BriefingHistoryRowReadModel`
/// even for Sandbox, matching what the real bounded `briefing-history`
/// resource actually sends (Native does not have two different History
/// row shapes depending on authority).
struct FixtureBriefingAPI: BriefingAPI {
    let store: BriefingSandboxStore

    func fetchHistory() async throws -> [BriefingHistoryRowReadModel] {
        store.history.map { briefing in
            BriefingHistoryRowReadModel(
                artifactId: briefing.id,
                artifactType: briefing.cadence == .event ? (briefing.dexa != nil ? "dexa_event" : "photo_event") : nil,
                cadence: briefing.cadence,
                label: briefing.historyTitle,
                publicationDate: briefing.generatedAt,
                version: 1
            )
        }
    }

    func fetchBriefing(artifactId: String) async throws -> BriefingReadModel? {
        store.briefing(id: artifactId)
    }

    func fetchDEXAEvent(scanId: String) async throws -> BriefingReadModel? {
        store.briefings.first { $0.dexa?.scanId == scanId }
    }

    func fetchPhotoEvent(sessionId: String) async throws -> BriefingReadModel? {
        store.briefings.first { $0.photo?.photoSessionId == sessionId }
    }
}

/// The `briefing-history` native resource — bounded, already-sorted
/// (newest-first, `ORDER BY observed_at DESC ... record_id DESC`) summary
/// rows. History is a complete archive, so Native follows the server's
/// bounded cursor until `hasMore == false` (manifest bound: 50 per page).
struct ProductionBriefingAPI: BriefingAPI {
    let api: ProductionNativeAPI

    func fetchHistory() async throws -> [BriefingHistoryRowReadModel] {
        var cursor: String?
        var rows: [BriefingHistoryRowReadModel] = []
        var seenCursors = Set<String>()
        repeat {
            var query = ["limit": "50"]
            if let cursor { query["cursor"] = cursor }
            let envelope = try await api.readResource("briefing-history", query: query, as: HistoryPayload.self)
            rows.append(contentsOf: envelope.data.items.map(\.readModel))
            guard envelope.data.page?.hasMore == true,
                  let next = envelope.data.page?.nextCursor,
                  !next.isEmpty,
                  seenCursors.insert(next).inserted
            else { break }
            cursor = next
        } while true
        return rows
    }

    func fetchBriefing(artifactId: String) async throws -> BriefingReadModel? {
        // History owns an artifact identity, not a source-id naming
        // convention. The shared detail read resolves every scheduled and
        // event artifact by that exact id, including older event id formats.
        let envelope = try await api.readResource(
            "briefing",
            query: ["artifactId": artifactId],
            as: ProductionBriefingPayload.self
        )
        return try ProductionBriefingMapper.detail(envelope.data.value)
    }

    func fetchDEXAEvent(scanId: String) async throws -> BriefingReadModel? {
        let envelope = try await api.readResource(
            "dexa-event",
            query: ["scanId": scanId],
            as: ProductionBriefingPayload.self
        )
        return try ProductionBriefingMapper.detail(envelope.data.value)
    }

    func fetchPhotoEvent(sessionId: String) async throws -> BriefingReadModel? {
        let envelope = try await api.readResource(
            "photo-event",
            query: ["sessionId": sessionId],
            as: ProductionBriefingPayload.self
        )
        return try ProductionBriefingMapper.photoEvent(envelope.data.value)
    }

    private struct HistoryPayload: Decodable, @unchecked Sendable {
        var items: [Row]
        var page: Page?

        struct Page: Decodable {
            var hasMore: Bool
            var nextCursor: String?
        }
    }

    private struct Row: Decodable {
        var artifactId: String
        var artifactType: String?
        var cadence: String
        var label: String
        var publicationDate: String?
        var version: Int

        var readModel: BriefingHistoryRowReadModel {
            BriefingHistoryRowReadModel(
                artifactId: artifactId,
                artifactType: artifactType,
                cadence: BriefingCadence(rawValue: cadence) ?? .daily,
                label: label,
                publicationDate: publicationDate,
                version: version
            )
        }
    }
}
