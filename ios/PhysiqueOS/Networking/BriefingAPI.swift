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
/// rows. Native fetches one page and does not invent additional
/// client-side pagination beyond the server's own `hasMore`/`nextCursor`
/// (manifest bound: `limit` 1–50, default 20) — matching the same
/// contract shape `TimelineAPI`/`ProductionPhotosAPI` already establish.
struct ProductionBriefingAPI: BriefingAPI {
    let api: ProductionNativeAPI

    func fetchHistory() async throws -> [BriefingHistoryRowReadModel] {
        let envelope = try await api.readResource("briefing-history", as: HistoryPayload.self)
        return envelope.data.items.map(\.readModel)
    }

    func fetchBriefing(artifactId: String) async throws -> BriefingReadModel? {
        // Event artifact ids are canonical and mechanically contain their
        // source identity. Prefer the event-specific read contracts so
        // historical media is resolved by the server before it reaches
        // Native. Scheduled cadences use the shared artifact-detail read.
        if artifactId.hasPrefix("dexa_event_") {
            return try await fetchDEXAEvent(scanId: String(artifactId.dropFirst("dexa_event_".count)))
        }
        if artifactId.hasPrefix("event_briefing_progress_photo_") {
            return try await fetchPhotoEvent(sessionId: String(artifactId.dropFirst("event_briefing_progress_photo_".count)))
        }
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
