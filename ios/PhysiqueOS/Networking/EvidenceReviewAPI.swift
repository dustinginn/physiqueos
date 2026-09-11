import Foundation

protocol EvidenceReviewAPI: Sendable {
    func fetchReview(reviewId: String) async throws -> EvidenceReviewDetailReadModel?
}

/// This detail screen is only ever reached via the `.evidenceReview`
/// destination, which only `ProductionLogAPI` ever constructs — Sandbox's
/// pending reviews always route through `.localEvidenceReview` to
/// `LocalEvidenceReviewView` instead. This stub exists only so the
/// authority-switching `AppEnvironment.evidenceReviewAPI` has a Sandbox
/// arm at all, matching the pattern every other production-only API
/// (e.g. `NotAvailableTimelineAPI`) follows.
struct NotAvailableEvidenceReviewAPI: EvidenceReviewAPI {
    struct NotAvailable: Error {}

    func fetchReview(reviewId: String) async throws -> EvidenceReviewDetailReadModel? {
        throw NotAvailable()
    }
}

/// Founder Production's read-only Evidence Review detail. Confirm/correct/
/// reject/dismiss are explicitly NOT wired here — those remain the isolated
/// Sandbox write flow (`LocalEvidenceReviewView`/`LoggingSandboxStore`),
/// which this conformance never touches.
struct ProductionEvidenceReviewAPI: EvidenceReviewAPI {
    let api: ProductionNativeAPI

    func fetchReview(reviewId: String) async throws -> EvidenceReviewDetailReadModel? {
        let envelope = try await api.readResource("evidence-review", query: ["reviewId": reviewId], as: Payload.self)
        guard let review = envelope.data.review else { return nil }
        return EvidenceReviewDetailReadModel(
            id: review.id,
            status: review.status,
            createdAt: review.createdAt,
            version: review.version,
            items: (review.interpretedEvidence?.evidenceObjects ?? []).map { object in
                EvidenceReviewDetailItem(
                    id: object.id ?? UUID().uuidString,
                    type: object.evidenceType ?? "evidence",
                    date: object.observedAt ?? object.date
                )
            }
        )
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var review: Review?
    }

    private struct Review: Decodable {
        var id: String
        var status: String
        var createdAt: String?
        var version: Int?
        var interpretedEvidence: InterpretedEvidence?
    }

    /// Wire keys are snake_case (`evidence_objects`); the shared decoder's
    /// `.convertFromSnakeCase` already matches these to the camelCase
    /// property names below automatically — explicit `CodingKeys` with
    /// snake_case raw values here would double-convert and fail to decode.
    private struct InterpretedEvidence: Decodable {
        var evidenceObjects: [EvidenceObject]?
    }

    private struct EvidenceObject: Decodable {
        var id: String?
        var evidenceType: String?
        var observedAt: String?
        var date: String?
    }
}
