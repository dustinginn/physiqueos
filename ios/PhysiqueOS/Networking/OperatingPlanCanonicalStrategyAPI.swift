import Foundation

protocol EnergyStrategyAPI: Sendable {
    func fetchDetail(strategyId: String) async throws -> EnergyStrategyDetail?
}

struct EnergyStrategyDetail: Decodable, Equatable, Sendable {
    static let supportedPhaseHistorySchemaVersion = "operating_plan_energy_phase_history_v1"

    var protocolId: String
    var title: String
    var purpose: String
    var goal: String
    var startedDate: String
    var status: String
    var fields: [OperatingPlanStrategyFieldReadModel]
    var editLabel: String?
    var intentionallyReadOnly: Bool
    var energyPhaseHistorySchemaVersion: String?
    var energyPhaseHistory: [OperatingPlanEnergyPhaseHistoryPayload]

    private enum CodingKeys: String, CodingKey {
        case protocolId, title, purpose, goal, startedDate, status, fields, editLabel, intentionallyReadOnly
        case energyPhaseHistorySchemaVersion, energyPhaseHistory
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        protocolId = try values.decode(String.self, forKey: .protocolId)
        title = try values.decode(String.self, forKey: .title)
        purpose = try values.decode(String.self, forKey: .purpose)
        goal = try values.decode(String.self, forKey: .goal)
        startedDate = try values.decode(String.self, forKey: .startedDate)
        status = try values.decode(String.self, forKey: .status)
        fields = try values.decode([OperatingPlanStrategyFieldReadModel].self, forKey: .fields)
        editLabel = try values.decodeIfPresent(String.self, forKey: .editLabel)
        intentionallyReadOnly = try values.decode(Bool.self, forKey: .intentionallyReadOnly)
        energyPhaseHistorySchemaVersion = try values.decodeIfPresent(String.self, forKey: .energyPhaseHistorySchemaVersion)
        energyPhaseHistory = try values.decodeIfPresent(
            [OperatingPlanEnergyPhaseHistoryPayload].self, forKey: .energyPhaseHistory
        ) ?? []
    }

    var readModel: OperatingPlanStrategyDetailReadModel {
        .init(
            strategyType: .energy, strategyId: protocolId, title: title, purpose: purpose,
            goal: goal, startedDate: startedDate, status: status, fields: fields,
            editLabel: nil, energyPhaseHistory: projectedPhaseHistory
        )
    }

    /// The schema marker gates this additive projection so an unknown future
    /// shape cannot leak values into the UI. Active phases remain solely in
    /// `fields`; any cross-Goal or cross-Phase revision causes the entire
    /// phase's target values to be withheld.
    private var projectedPhaseHistory: [OperatingPlanEnergyPhaseSnapshotReadModel] {
        guard energyPhaseHistorySchemaVersion == Self.supportedPhaseHistorySchemaVersion else { return [] }
        return energyPhaseHistory.compactMap { phase in
            guard ["completed", "superseded"].contains(phase.phaseStatus) else { return nil }
            let attributionMismatch = phase.id != phase.phaseId || phase.revisions.contains {
                $0.goalId != phase.goalId || $0.phaseId != phase.phaseId
            }
            return OperatingPlanEnergyPhaseSnapshotReadModel(
                id: phase.id,
                goalId: phase.goalId,
                phaseName: phase.phaseName,
                phaseOrder: phase.phaseOrder,
                isActive: false,
                caloricIntake: "",
                activityTarget: "",
                reviewCadence: "",
                note: "",
                phaseId: phase.phaseId,
                phaseStatus: phase.phaseStatus,
                startedOn: phase.startedOn,
                endedOn: phase.endedOn,
                dateSemantics: phase.dateSemantics,
                timeZone: phase.timeZone,
                availability: attributionMismatch ? "untrusted" : phase.availability,
                absenceKind: attributionMismatch ? "source_untrusted" : phase.absenceKind,
                reason: attributionMismatch ? "native_attribution_mismatch" : phase.reason,
                revisions: attributionMismatch ? [] : phase.revisions
            )
        }
    }
}

struct OperatingPlanEnergyPhaseHistoryPayload: Decodable, Equatable, Sendable {
    var id: String
    var goalId: String
    var phaseId: String
    var phaseName: String
    var phaseOrder: Int
    var phaseStatus: String
    var startedOn: String?
    var endedOn: String?
    var dateSemantics: String
    var timeZone: String?
    var availability: String
    var absenceKind: String?
    var reason: String?
    var revisions: [OperatingPlanEnergyPhaseRevisionReadModel]
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
