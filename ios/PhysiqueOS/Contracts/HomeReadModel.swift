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
    /// `DailyFocusService.getDailyFocus()`'s own occurrence list — the
    /// exact same `PriorityOccurrence` shape (and identity) the Priority
    /// detail screen and Morning Check-In read, computed by
    /// `PriorityOccurrenceCalculator.project` from the same
    /// `ExecutionItemFixture` catalog, never a Home-only projection. See
    /// `PriorityReadModel.swift`'s type-level doc comment.
    var todaysFocus: [PriorityOccurrence]
    /// A bounded server-owned occurrence horizon used only for local
    /// notification scheduling. It is separate from `todaysFocus` because
    /// Home presentation is intentionally current-day and capped, while an
    /// early-morning request must already exist before the app is opened on
    /// that day. `nil` keeps older fixtures/server responses compatible.
    var notificationOccurrences: [PriorityOccurrence]? = nil
    /// Effective canonical schedule time zone used by the server when it
    /// projected the occurrence dates. Named-zone calendar construction is
    /// DST-safe and avoids substituting the device's current zone.
    var notificationTimeZone: String? = nil

    var hasBriefingCards: Bool { !briefingCards.isEmpty }
    var hasTodaysFocus: Bool { !todaysFocus.isEmpty }
    var notificationScheduleItems: [PriorityOccurrence] {
        notificationOccurrences ?? todaysFocus
    }
    var notificationCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = notificationTimeZone.flatMap(TimeZone.init(identifier:)) ?? .current
        return calendar
    }
}

struct HomeHeader: Codable, Equatable {
    var greeting: String
    var name: String
}

/// Mirrors the web Home hero's current production modes.
enum HomeHeroMode: String, Codable {
    case active
    case terminal
    case phaseTrajectory = "phase_trajectory"
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

    /// Server-composed goal/phase timeline copy (for example "7 weeks to
    /// goal target"), presented prominently in phase-trajectory mode.
    var primaryTimeline: String? = nil

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
    var movementFactors: [String] = []
    var summary: String = ""

    init(
        qualitativeLevel: String, supportingFactors: [String], limitingFactors: [String],
        clarifyingFactors: [String], uncertaintyStatement: String,
        movementFactors: [String] = [], summary: String = ""
    ) {
        self.qualitativeLevel = qualitativeLevel
        self.supportingFactors = supportingFactors
        self.limitingFactors = limitingFactors
        self.clarifyingFactors = clarifyingFactors
        self.uncertaintyStatement = uncertaintyStatement
        self.movementFactors = movementFactors
        self.summary = summary
    }

    // A prior revision relied on Swift's synthesized `Decodable`, which
    // does NOT treat a non-Optional property's default value as "use this
    // when the key is missing" — it still requires the key present, so
    // adding `movementFactors`/`summary` broke every older fixture that
    // predates those fields. This custom decoder is what actually makes
    // them backward-compatible optional additions.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        qualitativeLevel = try container.decode(String.self, forKey: .qualitativeLevel)
        supportingFactors = try container.decode([String].self, forKey: .supportingFactors)
        limitingFactors = try container.decode([String].self, forKey: .limitingFactors)
        clarifyingFactors = try container.decode([String].self, forKey: .clarifyingFactors)
        uncertaintyStatement = try container.decode(String.self, forKey: .uncertaintyStatement)
        movementFactors = try container.decodeIfPresent([String].self, forKey: .movementFactors) ?? []
        summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? ""
    }
}

enum HomeActionIcon: String, Codable {
    case activity, analysis, camera, check, moon, pills, scale, syringe, target, utensils
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

/// Mirrors the `GoalRow.jsx` presentation modes this slice exercises:
/// a primary goal (progress bar + percentage), a supporting objective
/// (status + detail pair), and — as of Build 21 — the full multi-phase
/// `phase_trajectory_goal` layout (`PhaseTrajectoryGoal`/`PhaseRow`/
/// `GuardrailCallout` in `GoalRow.jsx`) that Founder Production's real
/// Home actually renders for a two-phase Build Lean Mass goal: every
/// phase's own card (not just the active one), each with its own status
/// and progress, plus the goal's guardrail. `terminal` and `calibration`
/// goal presentations still exist on the web but remain deferred.
enum HomeGoalPresentation: Equatable {
    /// `phaseLabel` — e.g. "Phase 2 · Lean Mass Build" — mirrors the same
    /// canonical phase order/name Goals Detail shows in "Your Journey",
    /// derived from the server's `trajectory.activePhase.order`/`.phaseName`.
    /// `nil` for a goal with no explicit phase chronology (matching the
    /// server's own `hasExplicitPhases` gate) — never a Native-invented
    /// ordinal.
    case primary(progress: Int, phaseLabel: String? = nil)
    case supporting(status: String, detail: String)
    case phaseTrajectory(HomePhaseTrajectory)
}

/// Mirrors `presentation.trajectory` (`HomeGoalTrajectoryService.js`'s
/// return value) as surfaced through `home.goals[0].presentation` when
/// `mode === "phase_trajectory_goal"`. Every phase in `phases` is kept —
/// not just the active one — so Home can render the same "every phase
/// gets its own card" layout the web's `PhaseTrajectoryGoal` component
/// does, instead of collapsing the goal down to a single active-phase
/// summary line.
struct HomePhaseTrajectory: Codable, Equatable {
    var targetDescription: String?
    var overallTargetDate: String?
    var guardrail: String?
    var phases: [HomeGoalPhase]
}

struct HomeGoalPhase: Codable, Equatable, Identifiable {
    var id: String
    /// Raw, zero-based server order — a display ordinal is always
    /// `order + 1` (`Phase {order + 1}`), mirroring the exact convention
    /// `ProductionHomeAPI.Goal.readModel()` already applies for the
    /// collapsed `.primary` phase label.
    var order: Int
    var phaseName: String
    /// `"completed" | "active" | "upcoming" | "planned" | "skipped"` —
    /// rendered verbatim as the status pill's text (title-cased), never
    /// re-interpreted into a Native-invented vocabulary.
    var status: String
    /// `"gold" | "green" | "orange" | "neutral"` — `HomeGoalTrajectoryService.js`'s
    /// `phasePresentationTone`.
    var presentationTone: String
    /// `"outcome" | "planned_time" | "qualitative" | "unavailable"`.
    var progressType: String?
    var clampedProgressPercentage: Int?
    /// Already display-formatted (e.g. "0.8 of 10 lb gained", "Completed") —
    /// presentation text the server composes, not recomputed here.
    var presentationLabel: String?
    /// `progress.status` (e.g. `"awaiting_follow_up"`) — used only to
    /// choose the outcome sub-caption ("Awaiting next DEXA" vs. "DEXA
    /// measurements anchor progress"), matching `PhaseRow`'s own check.
    var progressStatus: String?
    /// Canonical phase timing supplied by `HomeGoalTrajectoryService`.
    /// These remain date-only server values; the Home presentation never
    /// derives them from the device clock.
    var startDate: String? = nil
    var calculatedPlannedReviewDate: String? = nil
    var timelineProgressState: String? = nil
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
        case presentationMode, progress, status, detail, phaseLabel, phaseTrajectory
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
            presentation = .primary(
                progress: try container.decode(Int.self, forKey: .progress),
                phaseLabel: try container.decodeIfPresent(String.self, forKey: .phaseLabel)
            )
        case "supporting":
            presentation = .supporting(
                status: try container.decode(String.self, forKey: .status),
                detail: try container.decode(String.self, forKey: .detail)
            )
        case "phaseTrajectory":
            presentation = .phaseTrajectory(try container.decode(HomePhaseTrajectory.self, forKey: .phaseTrajectory))
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
        case .primary(let progress, let phaseLabel):
            try container.encode("primary", forKey: .presentationMode)
            try container.encode(progress, forKey: .progress)
            try container.encodeIfPresent(phaseLabel, forKey: .phaseLabel)
        case .supporting(let status, let detail):
            try container.encode("supporting", forKey: .presentationMode)
            try container.encode(status, forKey: .status)
            try container.encode(detail, forKey: .detail)
        case .phaseTrajectory(let trajectory):
            try container.encode("phaseTrajectory", forKey: .presentationMode)
            try container.encode(trajectory, forKey: .phaseTrajectory)
        }
    }
}

enum HomeFocusIcon: String, Codable {
    case activity, camera, moon, pills, scale, syringe, target, utensils
}
