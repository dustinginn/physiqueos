import Foundation

protocol SupplementStrategyAPI: Sendable {
    func fetchEditor(protocolId: String?) async throws -> SupplementStrategyDetail?
    func save(_ detail: SupplementStrategyDetail, model: SupplementEditorReadModel) async throws -> SupplementStrategySaveResult
    func changeLifecycle(protocolId: String, operation: String, expectedCurrentVersionId: String) async throws -> SupplementStrategySaveResult
}

struct SupplementStrategyDetail: Decodable, Equatable, Sendable {
    var mode: SupplementEditorReadModel.Mode
    var protocolId: String?
    var expectedCurrentVersionId: String?
    var lifecycleState: String
    var goalId: String
    var goalOptions: [OperatingPlanGoalLinkReadModel]
    var name: String
    var purpose: String
    var role: String
    var startDate: String
    var initialStatus: String

    var readModel: SupplementEditorReadModel {
        .init(
            mode: mode, protocolId: protocolId, goalId: goalId, goalOptions: goalOptions,
            name: name, purpose: purpose, role: role, startDate: startDate, initialStatus: initialStatus
        )
    }
}

struct SupplementStrategySaveResult: Decodable, Equatable, Sendable {
    var status: String
    var operation: String?
    var protocolId: String?
    var currentVersionId: String?
    var lifecycleState: String?
}

struct ProductionSupplementStrategyAPI: SupplementStrategyAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func fetchEditor(protocolId: String?) async throws -> SupplementStrategyDetail? {
        try await api.readResource(
            "operating-plan-supplement-strategy-editor",
            query: protocolId.map { ["protocolId": $0] } ?? [:],
            as: SupplementStrategyDetail.self
        ).data
    }

    func save(_ detail: SupplementStrategyDetail, model: SupplementEditorReadModel) async throws -> SupplementStrategySaveResult {
        try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)
        let operation = model.mode.rawValue
        let draft = Draft(
            protocolId: detail.protocolId,
            expectedCurrentVersionId: detail.expectedCurrentVersionId,
            name: model.name,
            purpose: model.purpose,
            role: model.role,
            goalId: model.goalId,
            startDate: model.startDate,
            initialStatus: model.initialStatus
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.saveSupplementStrategy, operation,
            detail.protocolId ?? "new", detail.expectedCurrentVersionId ?? "new",
            model.name, model.purpose, model.role, model.goalId, model.startDate, model.initialStatus,
        ])
        let outcome: ProductionCommandOutcome<SupplementStrategySaveResult> = try await api.submitCommand(
            ProductionCommandType.saveSupplementStrategy,
            idempotencyKey: idempotencyStore.resolvedKey(
                scope: "operating-plan.supplement-strategy.\(detail.protocolId ?? "new")", signature: signature
            ),
            payload: SavePayload(operation: operation, draft: draft)
        )
        guard let result = outcome.receipt.result else { throw ProductionNativeError.invalidResponse }
        return result
    }

    func changeLifecycle(protocolId: String, operation: String, expectedCurrentVersionId: String) async throws -> SupplementStrategySaveResult {
        try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.changeSupplementLifecycle, protocolId, operation, expectedCurrentVersionId,
        ])
        let outcome: ProductionCommandOutcome<SupplementStrategySaveResult> = try await api.submitCommand(
            ProductionCommandType.changeSupplementLifecycle,
            idempotencyKey: idempotencyStore.resolvedKey(
                scope: "operating-plan.supplement-lifecycle.\(protocolId)", signature: signature
            ),
            payload: LifecyclePayload(
                protocolId: protocolId, operation: operation, expectedCurrentVersionId: expectedCurrentVersionId
            )
        )
        guard let result = outcome.receipt.result else { throw ProductionNativeError.invalidResponse }
        return result
    }

    private struct SavePayload: Encodable { var operation: String; var draft: Draft }
    private struct LifecyclePayload: Encodable {
        var protocolId: String
        var operation: String
        var expectedCurrentVersionId: String
    }
    private struct Draft: Encodable {
        var protocolId: String?
        var expectedCurrentVersionId: String?
        var name: String
        var purpose: String
        var role: String
        var goalId: String
        var startDate: String
        var initialStatus: String
    }
}

struct NotAvailableSupplementStrategyAPI: SupplementStrategyAPI {
    struct NotAvailable: Error {}
    func fetchEditor(protocolId: String?) async throws -> SupplementStrategyDetail? { throw NotAvailable() }
    func save(_ detail: SupplementStrategyDetail, model: SupplementEditorReadModel) async throws -> SupplementStrategySaveResult { throw NotAvailable() }
    func changeLifecycle(protocolId: String, operation: String, expectedCurrentVersionId: String) async throws -> SupplementStrategySaveResult { throw NotAvailable() }
}
