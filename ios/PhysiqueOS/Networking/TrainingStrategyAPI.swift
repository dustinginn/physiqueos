import Foundation

/// `operating-plan-training-strategy` (read) / `operating-plan.training-
/// strategy.save.v1` (write) — the Training Operating Plan strategy detail
/// and editor, combined into one production read exactly like
/// `NutritionStrategyAPI`. Reuses the same `composeOperatingPlanStrategyDetail`
/// / `createStrategyEditorModel` composition and `buildTraining`/
/// `ActiveProtocolSuccessorService` validation Web's own strategy edit page
/// already calls. Concurrency is Training's OWN actual model —
/// `expectedCurrentVersionId` echoes the protocol's `currentVersionId` back
/// to the server, the same canonical version boundary Nutrition uses (both
/// strategy types share `ActiveProtocolSuccessorService`), not Recovery's
/// `expectedRevision` counter.
protocol TrainingStrategyAPI: Sendable {
    func fetchDetail(strategyId: String) async throws -> TrainingStrategyDetail?
    func save(
        protocolId: String,
        expectedCurrentVersionId: String,
        frequencies: [TrainingAreaFrequency],
        priorities: [TrainingStrategyArea],
        progression: ProgressionPace
    ) async throws -> TrainingStrategySaveResult
}

struct TrainingStrategyDetail: Decodable, Equatable, Sendable {
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
        var frequencies: [TrainingAreaFrequency]
        var priorities: [TrainingStrategyArea]
        var progression: ProgressionPace
    }
}

struct TrainingStrategySaveResult: Decodable, Equatable, Sendable {
    var status: String
    var protocolId: String
    var currentVersionId: String?
}

struct ProductionTrainingStrategyAPI: TrainingStrategyAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func fetchDetail(strategyId: String) async throws -> TrainingStrategyDetail? {
        let envelope = try await api.readResource(
            "operating-plan-training-strategy", query: ["strategyId": strategyId], as: TrainingStrategyDetail.self
        )
        return envelope.data
    }

    func save(
        protocolId: String,
        expectedCurrentVersionId: String,
        frequencies: [TrainingAreaFrequency],
        priorities: [TrainingStrategyArea],
        progression: ProgressionPace
    ) async throws -> TrainingStrategySaveResult {
        try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)
        let payload = Payload(
            protocolId: protocolId,
            expectedCurrentVersionId: expectedCurrentVersionId,
            draft: Payload.Draft(frequencies: frequencies, priorities: priorities.map(\.rawValue), progression: progression.rawValue)
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.saveTrainingStrategy, protocolId, expectedCurrentVersionId,
            frequencies.map { "\($0.area.rawValue):\($0.count)" }.joined(separator: ","),
            priorities.map(\.rawValue).joined(separator: ","), progression.rawValue,
        ])
        let scope = "operating-plan.training-strategy.\(protocolId)"
        let outcome: ProductionCommandOutcome<TrainingStrategySaveResult> = try await api.submitCommand(
            ProductionCommandType.saveTrainingStrategy,
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
            var frequencies: [TrainingAreaFrequency]
            var priorities: [String]
            var progression: String
        }
    }
}

struct NotAvailableTrainingStrategyAPI: TrainingStrategyAPI {
    struct NotAvailable: Error {}

    func fetchDetail(strategyId: String) async throws -> TrainingStrategyDetail? { throw NotAvailable() }
    func save(
        protocolId: String,
        expectedCurrentVersionId: String,
        frequencies: [TrainingAreaFrequency],
        priorities: [TrainingStrategyArea],
        progression: ProgressionPace
    ) async throws -> TrainingStrategySaveResult { throw NotAvailable() }
}
