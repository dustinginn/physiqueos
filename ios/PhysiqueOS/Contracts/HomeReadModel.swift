import Foundation

/// Native transport mirror of the server's `home.v1` application read model
/// (`Phase3ReadModelService` + `HomeBriefingService.getHomeBriefing`,
/// projected through `readModel.js`). This is a *mirror*, not a second
/// domain model: every field here is something the server already computed
/// and handed over — Goal state, Confidence, briefing selection, and today's
/// focus are never derived in Swift.
///
/// Field names intentionally match the server's own naming
/// (`qualitativeLevel`, `supportingFactors`, `progress`, …) so a future live
/// decode requires no field renaming, only a transport swap.
struct HomeReadModel: Codable, Equatable {
    var header: HomeHeader
    var hero: HomeHero
    var nextBestAction: HomeNextBestAction
    var briefingCards: [HomeBriefingCard]
    var goals: [HomeGoal]
    var todaysFocus: [HomeFocusItem]

    var hasBriefingCards: Bool { !briefingCards.isEmpty }
    var hasTodaysFocus: Bool { !todaysFocus.isEmpty }
}

struct HomeHeader: Codable, Equatable {
    var greeting: String
    var name: String
}

/// Mirrors `HomeHeroCard.jsx`'s `mode` prop. Only `active` and `terminal`
/// are modeled in this slice — `calibration` and `phase_trajectory` are
/// real web hero modes but are not yet exercised by a representative
/// fixture; see the Native V1 doc update for this slice.
enum HomeHeroMode: String, Codable {
    case active
    case terminal
}

struct HomeHero: Codable, Equatable {
    var mode: HomeHeroMode
    var goalLabel: String
    var headline: String
    var supportLine: String

    /// Goal Forecast Confidence, 0–100. This is a briefing-computed forecast
    /// confidence value, never a literal outcome probability — see
    /// `confidenceDetail` for the qualitative explanation actually shown to
    /// the Founder. `nil` means no confidence is available yet (the web
    /// shows an empty "—" ring in that case).
    var confidence: Int?
    var confidenceDetail: ConfidenceDetail?

    var projectedFinish: String?
    var daysRemaining: String?

    var actionLabel: String?
    var actionDestination: AppDestination?
}

/// Mirrors `buildConfidenceExplanationDetail`'s exact return shape
/// (`src/domain/presentation/confidenceExplanationPresentation.js`) — same
/// field names, same meaning. `qualitativeLevel` is a confidence *band*
/// label (e.g. "Moderate"), never a percentage restated as a claim.
struct ConfidenceDetail: Codable, Equatable {
    var qualitativeLevel: String
    var supportingFactors: [String]
    var limitingFactors: [String]
    var clarifyingFactors: [String]
    var uncertaintyStatement: String
}

enum HomeActionIcon: String, Codable {
    case activity, analysis, camera, check, scale, syringe, target
}

struct HomeNextBestAction: Codable, Equatable {
    var title: String
    var icon: HomeActionIcon
    var destination: AppDestination
}

struct HomeBriefingCard: Codable, Equatable, Identifiable {
    var id: String
    var sectionLabel: String
    var title: String
    var prompt: String
    /// Raw ISO-8601 timestamp; native formats it the same way the web does
    /// ("Today" vs. short month/day) — presentation formatting, not a
    /// domain calculation.
    var createdAt: String?
    var destination: AppDestination?
}

enum HomeGoalIcon: String, Codable {
    case activity, compass, dumbbell, shield, target
}

/// Mirrors the two `GoalRow.jsx` presentation modes this slice exercises:
/// a primary goal (progress bar + percentage) and a supporting objective
/// (status + detail pair). `terminal`, `calibration`, and
/// `phase_trajectory` goal presentations exist on the web but are deferred
/// — see the Native V1 doc update for this slice.
enum HomeGoalPresentation: Equatable {
    case primary(progress: Int)
    case supporting(status: String, detail: String)
}

struct HomeGoal: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var current: String
    var target: String
    var unit: String
    var icon: HomeGoalIcon
    var color: HomeColorToken
    var presentation: HomeGoalPresentation
    var destination: AppDestination?
}

extension HomeGoal {
    private enum CodingKeys: String, CodingKey {
        case id, title, current, target, unit, icon, color, destination
        case presentationMode, progress, status, detail
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        current = try container.decode(String.self, forKey: .current)
        target = try container.decode(String.self, forKey: .target)
        unit = try container.decode(String.self, forKey: .unit)
        icon = try container.decode(HomeGoalIcon.self, forKey: .icon)
        color = try container.decode(HomeColorToken.self, forKey: .color)
        destination = try container.decodeIfPresent(AppDestination.self, forKey: .destination)
        let mode = try container.decode(String.self, forKey: .presentationMode)
        switch mode {
        case "primary":
            presentation = .primary(progress: try container.decode(Int.self, forKey: .progress))
        case "supporting":
            presentation = .supporting(
                status: try container.decode(String.self, forKey: .status),
                detail: try container.decode(String.self, forKey: .detail)
            )
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .presentationMode, in: container,
                debugDescription: "Unsupported goal presentation mode: \(mode)"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(title, forKey: .title)
        try container.encode(current, forKey: .current)
        try container.encode(target, forKey: .target)
        try container.encode(unit, forKey: .unit)
        try container.encode(icon, forKey: .icon)
        try container.encode(color, forKey: .color)
        try container.encodeIfPresent(destination, forKey: .destination)
        switch presentation {
        case .primary(let progress):
            try container.encode("primary", forKey: .presentationMode)
            try container.encode(progress, forKey: .progress)
        case .supporting(let status, let detail):
            try container.encode("supporting", forKey: .presentationMode)
            try container.encode(status, forKey: .status)
            try container.encode(detail, forKey: .detail)
        }
    }
}

enum HomeFocusIcon: String, Codable {
    case activity, camera, moon, scale, syringe, target, utensils
}

struct HomeFocusItem: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var subtitle: String?
    var icon: HomeFocusIcon
    var color: HomeColorToken
    var completed: Bool
    /// A short badge (e.g. "Needs Setup") shown instead of the completion
    /// indicator, mirroring `FocusTile.jsx`'s `actionLabel` prop.
    var actionLabel: String?
    var destination: AppDestination?
}
