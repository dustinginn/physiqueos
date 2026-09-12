import Foundation

/// `dexa-review.measurements.v1` (`editDexaReview` port). Every call is a
/// FULL REPLACE of the scan's measurement set, never a merge — Native must
/// always resend every field it knows (including RMR/VAT even when
/// unedited), or the server silently nulls whatever is omitted. `evidence-
/// review.commit.v1` (the actual canonical confirmation) lives on
/// `EvidenceReviewCommitAPI`, shared with Nutrition/Activity — DEXA's own
/// write surface only covers the measurement-correction step.
protocol DEXAWriteAPI: Sendable {
    func editMeasurements(
        reviewId: String,
        evidenceObjectId: String,
        expectedVersion: String,
        measurements: DEXAScanMeasurements
    ) async throws -> DEXAMeasurementEditResult
}

/// `editDexaReview`'s `outcome.result` shape verbatim.
struct DEXAMeasurementEditResult: Decodable, Equatable, Sendable {
    var status: String
    var reviewId: String
    var revision: Int?
    var updatedAt: String?
}

struct ProductionDEXAWriteAPI: DEXAWriteAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func editMeasurements(
        reviewId: String,
        evidenceObjectId: String,
        expectedVersion: String,
        measurements: DEXAScanMeasurements
    ) async throws -> DEXAMeasurementEditResult {
        try NativeProductWriteGuard.authorize(.dexa, in: .founderProduction)
        let payload = Payload(
            reviewId: reviewId,
            evidenceObjectId: evidenceObjectId,
            measurements: Payload.Measurements(
                measuredAt: measurements.measuredAt,
                totalMass: measurements.totalMassLb,
                bodyFatPercentage: measurements.bodyFatPercentage,
                fatMass: measurements.fatMassLb,
                leanMass: measurements.leanMassLb,
                boneMineralContent: measurements.boneMineralContentLb,
                restingMetabolicRate: measurements.restingMetabolicRateKcal,
                vatMass: measurements.visceralAdiposeTissueMassLb,
                vatVolume: measurements.visceralAdiposeTissueVolumeIn3
            )
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.editDexaReviewMeasurements,
            reviewId,
            evidenceObjectId,
            expectedVersion,
            measurements.measuredAt ?? "",
            Self.value(measurements.totalMassLb),
            Self.value(measurements.bodyFatPercentage),
            Self.value(measurements.fatMassLb),
            Self.value(measurements.leanMassLb),
            Self.value(measurements.boneMineralContentLb),
            Self.value(measurements.restingMetabolicRateKcal),
            Self.value(measurements.visceralAdiposeTissueMassLb),
            Self.value(measurements.visceralAdiposeTissueVolumeIn3),
        ])
        let scope = "dexa-review.measurements.\(reviewId)"
        let outcome: ProductionCommandOutcome<DEXAMeasurementEditResult> = try await api.submitCommand(
            ProductionCommandType.editDexaReviewMeasurements,
            idempotencyKey: idempotencyStore.resolvedKey(scope: scope, signature: signature),
            expectedVersion: expectedVersion,
            payload: payload
        )
        guard let result = outcome.receipt.result else { throw ProductionNativeError.invalidResponse }
        return result
    }

    private static func value(_ value: Double?) -> String { value.map { String($0) } ?? "null" }

    private struct Payload: Encodable {
        var reviewId: String
        var evidenceObjectId: String
        var measurements: Measurements

        struct Measurements: Encodable {
            var measuredAt: String?
            var totalMass: Double?
            var bodyFatPercentage: Double?
            var fatMass: Double?
            var leanMass: Double?
            var boneMineralContent: Double?
            var restingMetabolicRate: Double?
            var vatMass: Double?
            var vatVolume: Double?

            enum CodingKeys: String, CodingKey {
                case measuredAt, totalMass, bodyFatPercentage, fatMass, leanMass
                case boneMineralContent, restingMetabolicRate, vatMass, vatVolume
            }

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try Self.encode(measuredAt, forKey: .measuredAt, into: &container)
                try Self.encode(totalMass, forKey: .totalMass, into: &container)
                try Self.encode(bodyFatPercentage, forKey: .bodyFatPercentage, into: &container)
                try Self.encode(fatMass, forKey: .fatMass, into: &container)
                try Self.encode(leanMass, forKey: .leanMass, into: &container)
                try Self.encode(boneMineralContent, forKey: .boneMineralContent, into: &container)
                try Self.encode(restingMetabolicRate, forKey: .restingMetabolicRate, into: &container)
                try Self.encode(vatMass, forKey: .vatMass, into: &container)
                try Self.encode(vatVolume, forKey: .vatVolume, into: &container)
            }

            private static func encode<Value: Encodable>(
                _ value: Value?,
                forKey key: CodingKeys,
                into container: inout KeyedEncodingContainer<CodingKeys>
            ) throws {
                if let value { try container.encode(value, forKey: key) }
                else { try container.encodeNil(forKey: key) }
            }
        }
    }
}

struct NotAvailableDEXAWriteAPI: DEXAWriteAPI {
    struct NotAvailable: Error {}

    func editMeasurements(
        reviewId: String,
        evidenceObjectId: String,
        expectedVersion: String,
        measurements: DEXAScanMeasurements
    ) async throws -> DEXAMeasurementEditResult {
        throw NotAvailable()
    }
}
