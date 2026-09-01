import Foundation

/// Wire encoding for `AppDestination` matching the server's actual
/// `{ id, parameters }` shape (`src/contracts/v1/destination.js`,
/// `src/application/read-models/readModel.js`'s `href` → `destination`
/// projection). Decoding this exact shape now — rather than a native-only
/// ad hoc format — is what lets a later live API response decode straight
/// into this type without changing Home.
extension AppDestination {
    private enum CodingKeys: String, CodingKey { case id, parameters }
    private enum ParameterKeys: String, CodingKey {
        case goalId, phaseId, focus, checkInType, briefingId, priorityId, reviewId, sessionId, streamId, exerciseId
        case strategyType, strategyId, protocolId, executionId
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let id = try container.decode(String.self, forKey: .id)
        switch id {
        case "goal.detail":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .goalDetail(goalId: try parameters.decode(String.self, forKey: .goalId))
        case "native.goal.phase":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .goalPhase(
                goalId: try parameters.decode(String.self, forKey: .goalId),
                phaseId: try parameters.decode(String.self, forKey: .phaseId)
            )
        case "native.goal.plan":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .goalPlan(
                goalId: try parameters.decode(String.self, forKey: .goalId),
                focus: try parameters.decode(GoalPlanFocus.self, forKey: .focus)
            )
        case "check-in":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .checkIn(checkInType: try parameters.decode(String.self, forKey: .checkInType))
        case "photo.upload":
            self = .photoUpload
        case "dexa.upload":
            self = .dexaUpload
        case "briefing.detail":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .briefingDetail(briefingId: try parameters.decode(String.self, forKey: .briefingId))
        case "briefing.list":
            self = .briefingList
        case "priority.detail":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .priorityDetail(priorityId: try parameters.decode(String.self, forKey: .priorityId))
        case "evidence.review":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .evidenceReview(reviewId: try parameters.decode(String.self, forKey: .reviewId))
        case "training.session":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .trainingSession(sessionId: try parameters.decode(String.self, forKey: .sessionId))
        case "training.exercise":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .trainingExercise(exerciseId: try parameters.decode(String.self, forKey: .exerciseId))
        case "progress.stream":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            let streamId = try parameters.decode(String.self, forKey: .streamId)
            if streamId.hasPrefix(Self.trainingDayStreamIdPrefix) {
                self = .trainingDay(date: String(streamId.dropFirst(Self.trainingDayStreamIdPrefix.count)))
            } else {
                self = .progressStream(streamId: streamId)
            }
        case "log":
            self = .trainingLogger
        case "native.manual-weigh-in":
            self = .manualWeighIn
        case "native.evidence-intake":
            self = .evidenceIntake
        case "native.evidence-review":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .localEvidenceReview(reviewId: try parameters.decode(String.self, forKey: .reviewId))
        case "native.operating-plan":
            self = .operatingPlan
        case "native.operating-plan.strategy":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .operatingPlanStrategy(
                strategyType: try parameters.decode(String.self, forKey: .strategyType),
                strategyId: try parameters.decode(String.self, forKey: .strategyId)
            )
        case "native.operating-plan.strategy.edit":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .operatingPlanStrategyEdit(
                strategyType: try parameters.decode(String.self, forKey: .strategyType),
                strategyId: try parameters.decode(String.self, forKey: .strategyId)
            )
        case "native.operating-plan.protocol":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .operatingPlanProtocolDomain(protocolId: try parameters.decode(String.self, forKey: .protocolId))
        case "native.operating-plan.protocol.peptide":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .operatingPlanPeptideExecution(protocolId: try parameters.decode(String.self, forKey: .protocolId))
        case "native.operating-plan.protocol.recovery":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .operatingPlanRecoverySupport(executionId: try parameters.decode(String.self, forKey: .executionId))
        case "native.operating-plan.tracking":
            self = .operatingPlanTracking
        case "native.operating-plan.tracking.support":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .operatingPlanTrackingSupport(executionId: try parameters.decode(String.self, forKey: .executionId))
        case "native.operating-plan.protocol.supplement.support":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .operatingPlanSupplementSupport(protocolId: try parameters.decode(String.self, forKey: .protocolId))
        case "native.operating-plan.supplement.new":
            self = .operatingPlanSupplementNew
        case "native.operating-plan.supplement.edit":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .operatingPlanSupplementEdit(protocolId: try parameters.decode(String.self, forKey: .protocolId))
        case "native.founder-server-connection":
            self = .founderServerConnection
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .id, in: container,
                debugDescription: "Unsupported or unknown destination id: \(id)"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(serverDestinationId, forKey: .id)
        var parameters = container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
        switch self {
        case .goalDetail(let goalId): try parameters.encode(goalId, forKey: .goalId)
        case .goalPhase(let goalId, let phaseId):
            try parameters.encode(goalId, forKey: .goalId)
            try parameters.encode(phaseId, forKey: .phaseId)
        case .goalPlan(let goalId, let focus):
            try parameters.encode(goalId, forKey: .goalId)
            try parameters.encode(focus, forKey: .focus)
        case .checkIn(let checkInType): try parameters.encode(checkInType, forKey: .checkInType)
        case .briefingDetail(let briefingId): try parameters.encode(briefingId, forKey: .briefingId)
        case .priorityDetail(let priorityId): try parameters.encode(priorityId, forKey: .priorityId)
        case .evidenceReview(let reviewId): try parameters.encode(reviewId, forKey: .reviewId)
        case .trainingSession(let sessionId): try parameters.encode(sessionId, forKey: .sessionId)
        case .trainingExercise(let exerciseId): try parameters.encode(exerciseId, forKey: .exerciseId)
        case .progressStream(let streamId): try parameters.encode(streamId, forKey: .streamId)
        case .trainingDay(let date): try parameters.encode(Self.trainingDayStreamIdPrefix + date, forKey: .streamId)
        case .localEvidenceReview(let reviewId): try parameters.encode(reviewId, forKey: .reviewId)
        case .operatingPlanStrategy(let strategyType, let strategyId):
            try parameters.encode(strategyType, forKey: .strategyType)
            try parameters.encode(strategyId, forKey: .strategyId)
        case .operatingPlanStrategyEdit(let strategyType, let strategyId):
            try parameters.encode(strategyType, forKey: .strategyType)
            try parameters.encode(strategyId, forKey: .strategyId)
        case .operatingPlanProtocolDomain(let protocolId): try parameters.encode(protocolId, forKey: .protocolId)
        case .operatingPlanPeptideExecution(let protocolId): try parameters.encode(protocolId, forKey: .protocolId)
        case .operatingPlanRecoverySupport(let executionId): try parameters.encode(executionId, forKey: .executionId)
        case .operatingPlanTrackingSupport(let executionId): try parameters.encode(executionId, forKey: .executionId)
        case .operatingPlanSupplementSupport(let protocolId): try parameters.encode(protocolId, forKey: .protocolId)
        case .operatingPlanSupplementEdit(let protocolId): try parameters.encode(protocolId, forKey: .protocolId)
        case .photoUpload, .dexaUpload, .briefingList, .trainingLogger, .manualWeighIn, .evidenceIntake,
             .operatingPlan, .operatingPlanTracking, .operatingPlanSupplementNew, .founderServerConnection:
            break
        }
    }

    /// `progress.stream`'s compound streamId prefix for a Training Day
    /// href (`/progress/training/day/<date>` → streamId
    /// `"training/day/<date>"`), matching `destinationFromWebHref`'s
    /// catch-all capture exactly.
    fileprivate static let trainingDayStreamIdPrefix = "training/day/"
}
