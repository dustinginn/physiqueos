import Foundation

/// Founder Production read-only Evidence Review detail
/// (`evidence-review` native resource, `EvidenceReviewReadService.getReview`).
///
/// The native contract sends the RAW canonical review/evidence-package
/// records — unlike `evidence-review-queue` (already wired via
/// `ProductionLogAPI`), which the server already runs through
/// `createEvidenceReviewPresentation` for human-readable titles/summaries,
/// the `evidence-review` detail resource has no equivalent native
/// projection yet. Rather than reimplementing that 396-line, per-evidence-
/// type presentation service in Swift (exactly the kind of server
/// intelligence this task's own rules say Native must never recreate),
/// this model stays deliberately minimal: identity, status, version, and
/// each captured evidence object's bare type/date — enough for an honest
/// read-only detail screen, with no confirm/correct/reject/dismiss
/// affordance. See this task's final report for the smallest server
/// correction (project `evidence-review` the same way `evidence-review-queue`
/// already is) that would let this grow into the full presentation.
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
}
