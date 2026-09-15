import Foundation

protocol EnergyStrategyAPI: Sendable {
    func fetchDetail(strategyId: String) async throws -> EnergyStrategyDetail?
}

struct EnergyStrategyDetail: Decodable, Equatable, Sendable {
    var protocolId: String
    var title: String
    var purpose: String
    var goal: String
    var startedDate: String
    var status: String
    var fields: [OperatingPlanStrategyFieldReadModel]
    var editLabel: String?
    var intentionallyReadOnly: Bool

    var readModel: OperatingPlanStrategyDetailReadModel {
        .init(
            strategyType: .energy, strategyId: protocolId, title: title, purpose: purpose,
            goal: goal, startedDate: startedDate, status: status, fields: fields,
            editLabel: nil, energyPhaseHistory: []
        )
    }
}

struct ProductionEnergyStrategyAPI: EnergyStrategyAPI {
    let api: ProductionNativeAPI
    func fetchDetail(strategyId: String) async throws -> EnergyStrategyDetail? {
        let detail = try await api.readResource(
            "operating-plan-energy-strategy", query: ["strategyId": strategyId], as: EnergyStrategyDetail.self
        ).data
        guard detail.intentionallyReadOnly, detail.editLabel == nil else { throw ProductionNativeError.invalidResponse }
        return detail
    }
}

struct NotAvailableEnergyStrategyAPI: EnergyStrategyAPI {
    struct NotAvailable: Error {}
    func fetchDetail(strategyId: String) async throws -> EnergyStrategyDetail? { throw NotAvailable() }
}

protocol CoachingUpdatesAPI: Sendable {
    func fetchDetail(strategyId: String) async throws -> CoachingUpdatesProductionDetail?
    func save(_ detail: CoachingUpdatesProductionDetail, model: CoachingUpdatesEditorReadModel) async throws -> CoachingUpdatesSaveResult
}

struct CoachingUpdatesProductionDetail: Decodable, Equatable, Sendable {
    var protocolId: String
    var title: String
    var purpose: String
    var goal: String
    var startedDate: String
    var status: String
    var fields: [OperatingPlanStrategyFieldReadModel]
    var editLabel: String?
    var context: Context
    var editor: CoachingUpdatesEditorReadModel

    struct Context: Decodable, Equatable, Sendable {
        var expectedCurrentVersionId: String
        var expectedRevision: Int
        var expectedSemanticDigest: String
        var photoExpectedCurrentVersionId: String
        var photoExpectedSemanticDigest: String
        var dexaExpectedRevision: Int
    }

    var readModel: OperatingPlanStrategyDetailReadModel {
        .init(
            strategyType: .briefings, strategyId: protocolId, title: title, purpose: purpose,
            goal: goal, startedDate: startedDate, status: status, fields: fields,
            editLabel: editLabel, energyPhaseHistory: []
        )
    }
}

struct CoachingUpdatesSaveResult: Decodable, Equatable, Sendable {
    var status: String
    var protocolId: String
    var revision: Int
    var coachingChanged: Bool?
    var photosChanged: Bool?
    var photoReminderChanged: Bool?
    var dexaChanged: Bool?
}

struct ProductionCoachingUpdatesAPI: CoachingUpdatesAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func fetchDetail(strategyId: String) async throws -> CoachingUpdatesProductionDetail? {
        try await api.readResource(
            "operating-plan-coaching-updates", query: ["strategyId": strategyId], as: CoachingUpdatesProductionDetail.self
        ).data
    }

    func save(_ detail: CoachingUpdatesProductionDetail, model: CoachingUpdatesEditorReadModel) async throws -> CoachingUpdatesSaveResult {
        try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let draftSignature = try encoder.encode(model).base64EncodedString()
        let context = detail.context
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.saveCoachingUpdates, detail.protocolId,
            context.expectedCurrentVersionId, String(context.expectedRevision), context.expectedSemanticDigest,
            context.photoExpectedCurrentVersionId, context.photoExpectedSemanticDigest,
            String(context.dexaExpectedRevision), draftSignature,
        ])
        let outcome: ProductionCommandOutcome<CoachingUpdatesSaveResult> = try await api.submitCommand(
            ProductionCommandType.saveCoachingUpdates,
            idempotencyKey: idempotencyStore.resolvedKey(
                scope: "operating-plan.coaching-updates.\(detail.protocolId)", signature: signature
            ),
            expectedVersion: String(context.expectedRevision),
            payload: Payload(
                protocolId: detail.protocolId,
                expectedCurrentVersionId: context.expectedCurrentVersionId,
                expectedSemanticDigest: context.expectedSemanticDigest,
                photoExpectedCurrentVersionId: context.photoExpectedCurrentVersionId,
                photoExpectedSemanticDigest: context.photoExpectedSemanticDigest,
                dexaExpectedRevision: context.dexaExpectedRevision,
                draft: model
            )
        )
        guard let result = outcome.receipt.result else { throw ProductionNativeError.invalidResponse }
        return result
    }

    private struct Payload: Encodable {
        var protocolId: String
        var expectedCurrentVersionId: String
        var expectedSemanticDigest: String
        var photoExpectedCurrentVersionId: String
        var photoExpectedSemanticDigest: String
        var dexaExpectedRevision: Int
        var draft: CoachingUpdatesEditorReadModel
    }
}

struct NotAvailableCoachingUpdatesAPI: CoachingUpdatesAPI {
    struct NotAvailable: Error {}
    func fetchDetail(strategyId: String) async throws -> CoachingUpdatesProductionDetail? { throw NotAvailable() }
    func save(_ detail: CoachingUpdatesProductionDetail, model: CoachingUpdatesEditorReadModel) async throws -> CoachingUpdatesSaveResult { throw NotAvailable() }
}
