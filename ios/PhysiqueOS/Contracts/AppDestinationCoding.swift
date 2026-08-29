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
        case goalId, checkInType, briefingId, priorityId, reviewId, sessionId, streamId
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let id = try container.decode(String.self, forKey: .id)
        switch id {
        case "goal.detail":
            let parameters = try container.nestedContainer(keyedBy: ParameterKeys.self, forKey: .parameters)
            self = .goalDetail(goalId: try parameters.decode(String.self, forKey: .goalId))
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
        case .checkIn(let checkInType): try parameters.encode(checkInType, forKey: .checkInType)
        case .briefingDetail(let briefingId): try parameters.encode(briefingId, forKey: .briefingId)
        case .priorityDetail(let priorityId): try parameters.encode(priorityId, forKey: .priorityId)
        case .evidenceReview(let reviewId): try parameters.encode(reviewId, forKey: .reviewId)
        case .trainingSession(let sessionId): try parameters.encode(sessionId, forKey: .sessionId)
        case .progressStream(let streamId): try parameters.encode(streamId, forKey: .streamId)
        case .trainingDay(let date): try parameters.encode(Self.trainingDayStreamIdPrefix + date, forKey: .streamId)
        case .photoUpload, .dexaUpload, .briefingList, .trainingLogger: break
        }
    }

    /// `progress.stream`'s compound streamId prefix for a Training Day
    /// href (`/progress/training/day/<date>` → streamId
    /// `"training/day/<date>"`), matching `destinationFromWebHref`'s
    /// catch-all capture exactly.
    fileprivate static let trainingDayStreamIdPrefix = "training/day/"
}
