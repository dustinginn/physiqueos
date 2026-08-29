import Foundation

/// Native transport mirror of the server's Evidence Hub read model
/// (`ProgressReportingService.getProgressHub`,
/// `src/domain/services/ProgressReportingService.js:302-512`, ordered by
/// `orderEvidenceStreams`/`EVIDENCE_HUB_CANONICAL_ORDER`,
/// `src/domain/services/EvidenceHubUsageService.js:3-13`). Evidence is not
/// a generic file gallery: each stream is a distinct canonical-evidence
/// category (Weight, Nutrition, Training, ...), not an upload/file list —
/// `protocols` is intentionally excluded here because
/// `EVIDENCE_HUB_CANONICAL_ORDER` omits it (`EVIDENCE_HUB_ARCHIVED_IDS`),
/// so it never renders on the real Evidence Hub page either.
struct EvidenceHubReadModel: Codable, Equatable {
    var title: String
    var subtitle: String
    var streams: [EvidenceStreamSummary]
}

/// One row of the hub — mirrors the server's per-stream object exactly
/// (`id`, `title`, `metric`, `trend`, `lastUpdated`, `status`, `tone`,
/// `href` → `destination`). Detail surfaces for every stream except
/// Training remain honest placeholders in this slice (see
/// `AppDestinationRouterView`); Training is the first complete evidence
/// vertical.
struct EvidenceStreamSummary: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var metric: String
    var trend: String
    var lastUpdated: String?
    var status: EvidenceStreamStatus
    var tone: HomeColorToken
    var destination: AppDestination
}

/// `stream.status` — `"available"` once real evidence exists, otherwise
/// `"placeholder"` (`buildProgressHub`, e.g. `ProgressReportingService.js:415`,
/// `:431`, `:445`, `:465`).
enum EvidenceStreamStatus: String, Codable {
    case available
    case placeholder
}
