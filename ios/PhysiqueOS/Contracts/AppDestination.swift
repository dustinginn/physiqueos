import Foundation

/// A bounded subset of the server's typed destination registry
/// (`src/contracts/v1/destination.js`), covering only the destinations Home
/// actually links to. This is not a transcription of all 22 server cases —
/// the foundation-slice audit deliberately deferred that until a screen
/// needs it; Home is the first screen that does, so it introduces exactly
/// the cases it uses.
///
/// Case names and associated values mirror the server's `DestinationId` and
/// required-parameter contract so a later live API can decode directly into
/// this type without Home changing.
enum AppDestination: Hashable, Codable {
    case goalDetail(goalId: String)
    case checkIn(checkInType: String)
    case photoUpload
    case dexaUpload
    case briefingDetail(briefingId: String)
    case briefingList
    case priorityDetail(priorityId: String)

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
        }
    }
}
