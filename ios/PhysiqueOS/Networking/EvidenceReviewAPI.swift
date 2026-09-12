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
                    date: object.observedAt ?? object.date,
                    dexaMeasurements: object.dexaMeasurements
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
        var measuredAt: String?
        var totalMass: MassValue?
        var bodyFatPercentage: Double?
        var fatMass: MassValue?
        var leanMass: MassValue?
        var boneMineralContent: MassValue?
        var restingMetabolicRate: MassValue?
        var visceralAdiposeTissue: VisceralAdiposeTissue?

        /// `applyDexaReviewMeasurements`'s exact stored shape
        /// (`DexaPdfIntakeService.js`) — only present when `evidenceType`
        /// is a DEXA scan. Optional throughout: an object that hasn't
        /// finished interpretation yet (or isn't DEXA at all) simply
        /// decodes every field to `nil`, never a decode failure.
        var dexaMeasurements: DEXAScanMeasurements? {
            guard ["dexa_scan", "dexa", "body_composition"].contains(evidenceType) else { return nil }
            return DEXAScanMeasurements(
                measuredAt: measuredAt ?? observedAt ?? date,
                totalMassLb: totalMass?.value,
                bodyFatPercentage: bodyFatPercentage,
                fatMassLb: fatMass?.value,
                leanMassLb: leanMass?.value,
                boneMineralContentLb: boneMineralContent?.value,
                restingMetabolicRateKcal: restingMetabolicRate?.value,
                visceralAdiposeTissueMassLb: visceralAdiposeTissue?.mass?.value,
                visceralAdiposeTissueVolumeIn3: visceralAdiposeTissue?.volume?.value
            )
        }
    }

    private struct MassValue: Decodable {
        var value: Double?
        var unit: String?
    }

    private struct VisceralAdiposeTissue: Decodable {
        var mass: MassValue?
        var volume: MassValue?
    }
}

/// `dexa-review.measurements.v1`'s exact input/output shape
/// (`applyDexaReviewMeasurements`, `DexaPdfIntakeService.js`) — every
/// field Native must resend on every edit, since the server does a full
/// replace, not a merge (an omitted field is silently nulled on the
/// canonical scan, RMR/VAT included).
struct DEXAScanMeasurements: Equatable, Sendable {
    var measuredAt: String?
    var totalMassLb: Double?
    var bodyFatPercentage: Double?
    var fatMassLb: Double?
    var leanMassLb: Double?
    var boneMineralContentLb: Double?
    var restingMetabolicRateKcal: Double?
    var visceralAdiposeTissueMassLb: Double?
    var visceralAdiposeTissueVolumeIn3: Double?
}
