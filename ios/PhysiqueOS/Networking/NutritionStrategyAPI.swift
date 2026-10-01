import Foundation

/// `operating-plan-nutrition-strategy` (read) / `operating-plan.nutrition-
/// strategy.save.v1` (write) — the Nutrition Operating Plan strategy detail
/// and editor, combined into one production read so Native can render the
/// detail screen and prime the editor from a single fetch. Reuses the exact
/// same `composeOperatingPlanStrategyDetail`/`createStrategyEditorModel`
/// composition and `buildNutrition`/`ActiveProtocolSuccessorService`
/// validation Web's own strategy edit page already calls — Native never
/// re-derives macro validation itself. Concurrency is Nutrition's OWN
/// actual model: `expectedCurrentVersionId` echoes the protocol's
/// `currentVersionId` back to the server (not Recovery's `expectedRevision`
/// counter), so it travels in the payload rather than as an `If-Match`
/// header.
protocol NutritionStrategyAPI: Sendable {
    func fetchDetail(strategyId: String) async throws -> NutritionStrategyDetail?
    func save(
        protocolId: String,
        expectedCurrentVersionId: String,
        proteinBasis: ProteinBasis,
        proteinRatio: Double,
        fixedProteinGrams: Double,
        carbohydrateStrategy: CarbohydrateStrategy,
        fatStrategy: FatStrategy
    ) async throws -> NutritionStrategySaveResult
}

struct NutritionStrategyDetail: Decodable, Equatable, Sendable {
    var protocolId: String
    var title: String
    var purpose: String
    var goal: String?
    var startedDate: String
    var status: String
    var fields: [OperatingPlanStrategyFieldReadModel]
    var editor: Editor

    struct Editor: Decodable, Equatable, Sendable {
        var expectedCurrentVersionId: String
        var proteinBasis: ProteinBasis
        var proteinRatio: Double
        var fixedProteinGrams: Double
        var carbohydrateStrategy: CarbohydrateStrategy
        var fatStrategy: FatStrategy
    }
}

struct NutritionStrategySaveResult: Decodable, Equatable, Sendable {
    var status: String
    var protocolId: String
    var currentVersionId: String?
}

struct ProductionNutritionStrategyAPI: NutritionStrategyAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func fetchDetail(strategyId: String) async throws -> NutritionStrategyDetail? {
        let envelope = try await api.readResource(
            "operating-plan-nutrition-strategy", query: ["strategyId": strategyId], as: NutritionStrategyDetail.self
        )
        return envelope.data
    }

    func save(
        protocolId: String,
        expectedCurrentVersionId: String,
        proteinBasis: ProteinBasis,
        proteinRatio: Double,
        fixedProteinGrams: Double,
        carbohydrateStrategy: CarbohydrateStrategy,
        fatStrategy: FatStrategy
    ) async throws -> NutritionStrategySaveResult {
        try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)
        let payload = Payload(
            protocolId: protocolId,
            expectedCurrentVersionId: expectedCurrentVersionId,
            draft: Payload.Draft(
                proteinBasis: proteinBasis.rawValue,
                proteinRatio: proteinRatio,
                fixedProteinGrams: fixedProteinGrams,
                carbohydrateStrategy: carbohydrateStrategy.rawValue,
                fatStrategy: fatStrategy.rawValue
            )
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.saveNutritionStrategy, protocolId, expectedCurrentVersionId,
            proteinBasis.rawValue, String(proteinRatio), String(fixedProteinGrams),
            carbohydrateStrategy.rawValue, fatStrategy.rawValue,
        ])
        let scope = "operating-plan.nutrition-strategy.\(protocolId)"
        let outcome: ProductionCommandOutcome<NutritionStrategySaveResult> = try await api.submitCommand(
            ProductionCommandType.saveNutritionStrategy,
            idempotencyKey: idempotencyStore.resolvedKey(scope: scope, signature: signature),
            payload: payload
        )
        guard let result = outcome.receipt.result else { throw ProductionNativeError.invalidResponse }
        return result
    }

    private struct Payload: Encodable {
        var protocolId: String
        var expectedCurrentVersionId: String
        var draft: Draft

        struct Draft: Encodable {
            var proteinBasis: String
            var proteinRatio: Double
            var fixedProteinGrams: Double
            var carbohydrateStrategy: String
            var fatStrategy: String
        }
    }
}

struct NotAvailableNutritionStrategyAPI: NutritionStrategyAPI {
    struct NotAvailable: Error {}

    func fetchDetail(strategyId: String) async throws -> NutritionStrategyDetail? { throw NotAvailable() }
    func save(
        protocolId: String,
        expectedCurrentVersionId: String,
        proteinBasis: ProteinBasis,
        proteinRatio: Double,
        fixedProteinGrams: Double,
        carbohydrateStrategy: CarbohydrateStrategy,
        fatStrategy: FatStrategy
    ) async throws -> NutritionStrategySaveResult { throw NotAvailable() }
}
