import Foundation

/// Pure lifecycle contract for the future Watch HealthKit adapter. Phase 0
/// deliberately contains no `HKWorkoutSession` calls; the shipping adapter
/// must translate these exact states to watchOS 11 APIs and attach the
/// structured session UUID as `HKMetadataKeyExternalUUID`.
enum WatchHealthKitWorkoutContract {
    static let schemaVersion = 1
    static let activityType = "traditionalStrengthTraining"
    static let locationType = "indoor"
    static let externalUUIDMetadataKey = "HKExternalUUID"

    enum State: String, Codable, Sendable {
        case notStarted, running, paused, ending, ended
    }

    enum Event: String, Codable, Sendable {
        case start, pause, resume, requestEnd, finishSaving
    }

    enum TransitionError: Error, Equatable, Sendable { case invalidTransition }

    static func transition(_ state: State, event: Event) throws -> State {
        switch (state, event) {
        case (.notStarted, .start): .running
        case (.running, .pause): .paused
        case (.paused, .resume): .running
        case (.running, .requestEnd), (.paused, .requestEnd): .ending
        case (.ending, .finishSaving): .ended
        default: throw TransitionError.invalidTransition
        }
    }
}
