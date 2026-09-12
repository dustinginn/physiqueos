import Foundation

/// Founder Production Evidence Review detail
/// (`evidence-review` native resource, `EvidenceReviewReadService.getReview`).
///
/// The native contract sends the RAW canonical review/evidence-package
/// records — unlike `evidence-review-queue` (already wired via
/// `ProductionLogAPI`), which the server already runs through
/// `createEvidenceReviewPresentation` for human-readable titles/summaries,
/// the `evidence-review` detail resource has no equivalent native
/// projection. Rather than reimplementing that 396-line, per-evidence-type
/// presentation service in Swift (exactly the kind of server intelligence
/// this app's own rules say Native must never recreate), this model stays
/// deliberately minimal: identity, status, version, each captured evidence
/// object's bare type/date, and — for DEXA specifically, per the Daily
/// Driver Write Build's approved scope — the raw interpreted measurement
/// values `dexa-review.measurements.v1` can correct. There is still no
/// general accept/reject/edit UI for other evidence types here; DEXA's
/// measurement correction is a narrow, explicitly-scoped exception, not a
/// precedent for a full Evidence Review editor.
struct EvidenceReviewDetailReadModel: Equatable {
    var id: String
    var status: String
    var createdAt: String?
    var version: Int?
    var items: [EvidenceReviewDetailItem]
}

struct EvidenceReviewDetailItem: Equatable, Identifiable {
    var id: String
    var type: String
    var date: String?
    /// Non-nil only for a DEXA scan object — the exact fields
    /// `dexa-review.measurements.v1` requires Native to resend in full on
    /// every edit (the server replaces, never merges).
    var dexaMeasurements: DEXAScanMeasurements? = nil
}
