import Foundation

/// A bounded subset of the server's typed destination registry
/// (`src/contracts/v1/destination.js`), covering only the destinations Home
/// and Log actually link to. This is not a transcription of all 22 server
/// cases — cases are added only when a real screen needs them.
///
/// Case names and associated values mirror the server's `DestinationId` and
/// required-parameter contract so a later live API can decode directly into
/// this type without the screen changing.
enum AppDestination: Hashable, Codable {
    case goalDetail(goalId: String)
    case checkIn(checkInType: String)
    case photoUpload
    case dexaUpload
    case briefingDetail(briefingId: String)
    case briefingList
    case priorityDetail(priorityId: String)
    case evidenceReview(reviewId: String)
    case trainingSession(sessionId: String)
    /// `progress.stream` — the server's catch-all `/progress/*` pattern.
    /// Log's Nutrition and (multi-session/no-id) Training rows resolve
    /// here today because the server destination registry has no
    /// dedicated nutrition-day or activity destination id yet — verified
    /// directly against `destinationFromWebHref`'s pattern list, not
    /// assumed.
    case progressStream(streamId: String)
    /// The web's own typed-destination registry currently maps
    /// `/log/training` (the Training Logger entry point) to the same
    /// `log` destination id as `/log` itself — Training Logger has no
    /// dedicated destination id yet. This case preserves that exact,
    /// if unusual, current contract fact rather than inventing a nicer
    /// one; `serverDestinationId` intentionally returns `"log"` to match.
    case trainingLogger

    /// The server's destination id string, for parity with
    /// `DestinationId` values and for the placeholder screen's display.
    var serverDestinationId: String {
        switch self {
        case .goalDetail: "goal.detail"
        case .checkIn: "check-in"
        case .photoUpload: "photo.upload"
        case .dexaUpload: "dexa.upload"
        case .briefingDetail: "briefing.detail"
        case .briefingList: "briefing.list"
        case .priorityDetail: "priority.detail"
        case .evidenceReview: "evidence.review"
        case .trainingSession: "training.session"
        case .progressStream: "progress.stream"
        case .trainingLogger: "log"
        }
    }
}
