import Foundation

/// Native transport mirror of the server's `log.v1` application read model
/// (`Phase3ReadModelService` + `LogReadService.getLog`,
/// `LoggedTodayService.composeLoggedTodaySummary`). Only genuinely
/// server-computed/dynamic state is modeled here — Training Logger's and
/// Upload's card copy are static in the web source too (hardcoded JSX, not
/// read-model fields), so they live directly in `LogView`, exactly mirroring
/// how the web itself has no server data behind them.
struct LogReadModel: Codable, Equatable {
    /// The server-computed local "today" (`getLocalDateKey`), used as the
    /// default/maximum selectable date for the weigh-in entry — native
    /// must not derive this itself (see docs/PHYSIQUEOS_NATIVE_V1.md's
    /// timezone-drift concern from the Track A audit).
    var localDate: String
    /// Always exactly three rows — training, nutrition, activity, in that
    /// order — matching `composeLoggedTodaySummary`'s fixed row list.
    var loggedToday: [LoggedTodayRow]
    var pendingEvidenceReviews: [PendingEvidenceReview]

    var hasPendingEvidenceReviews: Bool { !pendingEvidenceReviews.isEmpty }
}

enum LoggedTodayRowKind: String, Codable {
    case training, nutrition, activity

    /// `LOGGED_TODAY_ICONS` in `LogHubScreen.jsx`.
    var systemImage: String {
        switch self {
        case .training: "figure.strengthtraining.traditional"
        case .nutrition: "fork.knife"
        case .activity: "waveform.path.ecg"
        }
    }

    var label: String {
        switch self {
        case .training: "Training"
        case .nutrition: "Nutrition"
        case .activity: "Activity"
        }
    }
}

struct LoggedTodayRow: Codable, Equatable, Identifiable {
    var kind: LoggedTodayRowKind
    var summary: String
    var context: String?
    var destination: AppDestination?

    var id: String { kind.rawValue }
}

struct PendingEvidenceReview: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    /// Already display-formatted (e.g. "Thursday, August 28"), mirroring
    /// `formatPendingReviewDate` — presentation formatting the server
    /// already performs, not recomputed here.
    var date: String
    var summary: String
    var likelyDuplicate: Bool
    var destination: AppDestination
}
