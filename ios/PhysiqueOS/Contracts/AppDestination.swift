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
    /// Native Goals browse destinations derived from the current web goal
    /// phase and Operating Plan links. These are presentation-only routes;
    /// they do not claim a production mutation contract.
    case goalPhase(goalId: String, phaseId: String)
    case goalPlan(goalId: String, focus: GoalPlanFocus)
    case checkIn(checkInType: String)
    case photoUpload
    case dexaUpload
    case briefingDetail(briefingId: String)
    case briefingList
    case priorityDetail(priorityId: String)
    case evidenceReview(reviewId: String)
    case trainingSession(sessionId: String)
    /// `training.exercise` — a Training Area row's own destination
    /// (`/progress/training/library/:exerciseSlug`,
    /// `TRAINING_EXERCISE`/`getTrainingAreaNavigationGroups`,
    /// `src/screens/ProgressPlaceholderScreen.jsx:986-996`). The router
    /// distinguishes canonical Training Area ids from individual exercise
    /// ids and presents the corresponding typed Native screen.
    case trainingExercise(exerciseId: String)
    /// `progress.stream` — the server's catch-all `/progress/*` pattern.
    /// Log's Nutrition and (multi-session/no-id) Training rows resolve
    /// here today because the server destination registry has no
    /// dedicated nutrition-day or activity destination id yet — verified
    /// directly against `destinationFromWebHref`'s pattern list, not
    /// assumed.
    case progressStream(streamId: String)
    /// `/progress/training/day/:date` — verified against
    /// `destinationFromWebHref`'s pattern list (`src/contracts/v1/destination.js`):
    /// there is no dedicated Training Day destination id yet, so this href
    /// falls through the same catch-all `progress.stream` pattern as
    /// `progressStream` above, with a compound `streamId` of
    /// `"training/day/<date>"`. This preserves that exact, if unusual,
    /// current contract fact — the same kind of quirk already recorded for
    /// `trainingLogger` — rather than inventing a dedicated destination id
    /// the server does not have.
    case trainingDay(date: String)
    /// The web's own typed-destination registry currently maps
    /// `/log/training` (the Training Logger entry point) to the same
    /// `log` destination id as `/log` itself — Training Logger has no
    /// dedicated destination id yet. This case preserves that exact,
    /// if unusual, current contract fact rather than inventing a nicer
    /// one; `serverDestinationId` intentionally returns `"log"` to match.
    case trainingLogger
    /// Native-only typed routes for the fixture-backed logging sandbox.
    /// They intentionally do not claim a server destination contract.
    case manualWeighIn
    case evidenceIntake
    case localEvidenceReview(reviewId: String)
    /// Native-only typed routes for the fixture-backed Operating Plan
    /// browse/sandbox vertical (`src/app/profile/operating-plan/**`,
    /// `src/app/profile/protocols/**`). Like the logging-sandbox cases
    /// above, these do not claim a server destination contract — the web's
    /// `OperatingPlanScreen.jsx`'s landing composer and
    /// `OperatingPlanStrategyDetailService` return raw `href` strings,
    /// not typed destination objects, so there
    /// is no existing `DestinationId` to mirror.
    case operatingPlan
    /// `strategy/[strategyType]/[strategyId]` — `strategyType` is one of
    /// `energy`, `nutrition`, `training`, `briefings`
    /// (`OperatingPlanStrategyType`'s exact allowlist).
    case operatingPlanStrategy(strategyType: String, strategyId: String)
    /// `strategy/[strategyType]/[strategyId]/edit` — reachable only for
    /// `nutrition`, `training`, `briefings` (Energy has no editor route in
    /// web today).
    case operatingPlanStrategyEdit(strategyType: String, strategyId: String)
    /// `/profile/protocols/[protocolId]` when the resolved protocol's
    /// category is Recovery, Peptide, or Supplement and it is active —
    /// `StrategyDomainScreen`'s roll-up of every active protocol sharing
    /// that category, keyed by one representative protocol id exactly as
    /// the web's `protocolItem()` href does.
    case operatingPlanProtocolDomain(protocolId: String)
    /// `execution/peptides/[protocolId]` — dosing detail, with an in-place
    /// edit mode mirroring the web's own `?edit=1` toggle on the same
    /// route rather than a second destination.
    case operatingPlanPeptideExecution(protocolId: String)
    /// `execution/[executionId]` for the Recovery (foam-rolling) support
    /// method — same in-place `?edit=1` toggle pattern as peptide
    /// execution above.
    case operatingPlanRecoverySupport(executionId: String)
    case operatingPlanTracking
    case operatingPlanTrackingSupport(executionId: String)
    case operatingPlanSupplementSupport(protocolId: String)
    case operatingPlanSupplementNew
    case operatingPlanSupplementEdit(protocolId: String)

    /// The server's destination id string, for parity with
    /// `DestinationId` values and for the placeholder screen's display.
    var serverDestinationId: String {
        switch self {
        case .goalDetail: "goal.detail"
        case .goalPhase: "native.goal.phase"
        case .goalPlan: "native.goal.plan"
        case .checkIn: "check-in"
        case .photoUpload: "photo.upload"
        case .dexaUpload: "dexa.upload"
        case .briefingDetail: "briefing.detail"
        case .briefingList: "briefing.list"
        case .priorityDetail: "priority.detail"
        case .evidenceReview: "evidence.review"
        case .trainingSession: "training.session"
        case .trainingExercise: "training.exercise"
        case .progressStream: "progress.stream"
        case .trainingDay: "progress.stream"
        case .trainingLogger: "log"
        case .manualWeighIn: "native.manual-weigh-in"
        case .evidenceIntake: "native.evidence-intake"
        case .localEvidenceReview: "native.evidence-review"
        case .operatingPlan: "native.operating-plan"
        case .operatingPlanStrategy: "native.operating-plan.strategy"
        case .operatingPlanStrategyEdit: "native.operating-plan.strategy.edit"
        case .operatingPlanProtocolDomain: "native.operating-plan.protocol"
        case .operatingPlanPeptideExecution: "native.operating-plan.protocol.peptide"
        case .operatingPlanRecoverySupport: "native.operating-plan.protocol.recovery"
        case .operatingPlanTracking: "native.operating-plan.tracking"
        case .operatingPlanTrackingSupport: "native.operating-plan.tracking.support"
        case .operatingPlanSupplementSupport: "native.operating-plan.protocol.supplement.support"
        case .operatingPlanSupplementNew: "native.operating-plan.supplement.new"
        case .operatingPlanSupplementEdit: "native.operating-plan.supplement.edit"
        }
    }
}
