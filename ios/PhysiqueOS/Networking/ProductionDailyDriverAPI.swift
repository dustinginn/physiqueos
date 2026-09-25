import Foundation

enum ProductionDailyDriverError: Error, Equatable {
    case unknownCanonicalExerciseArea(exerciseID: String, muscleGroupID: String?)
    case inconsistentCanonicalIdentity(expected: String, actual: String?)
    case unsupportedGoalContext(id: String)
    case unsupportedHomeGoalPresentation(id: String)
    case missingCanonicalIdentity(String)
    case missingPriorityOccurrenceDate(String)
}

private struct ProductionTimeline: Decodable, @unchecked Sendable {
    var contextId: String
    var goalId: String?
    var startDate: String?
    var endDate: String?
    var dateRangeLabel: String
    var options: [TrainingScopeOption]

    func scope(allLabel: String) -> TrainingScopeContext {
        TrainingScopeContext(
            options: options.map { option in
                TrainingScopeOption(
                    id: option.id == "all" ? "all" : "goal:\(option.id)",
                    label: option.id == "all" ? allLabel : option.label,
                    selected: option.selected
                )
            },
            dateRangeLabel: dateRangeLabel
        )
    }
}

enum ProductionContext {
    static func value(for scope: EvidenceScopeSelection) throws -> String {
        switch scope {
        case .all:
            return "all"
        case .goal(let goalId), .phase(let goalId, _):
            switch goalId {
            case EvidenceCanonicalGoalID.visibleAbs, "visible-abs":
                return "visible-abs"
            case EvidenceCanonicalGoalID.buildLeanMass, "build-lean-mass":
                return "build-lean-mass"
            default:
                throw ProductionDailyDriverError.unsupportedGoalContext(id: goalId)
            }
        }
    }
}

/// The minimal Goal/Phase context shape shared by the Patch 3 continuation
/// resources (`weight`, `photos`) — `projectGoalPhaseContext` server-side
/// — which, unlike the richer `ProductionTimeline` above, does NOT include
/// pre-built pill `options`/`dateRangeLabel` (only the raw
/// `contextId`/`startDate`/`endDate` a Native picker needs to construct
/// them). The 3-option pill set itself (All / Build Lean Mass / Visible
/// Abs) is fixed UI chrome identical across every Evidence vertical —
/// constructing it client-side from the server's own `selected` signal
/// (`contextId`) is the same kind of presentation-only work
/// `ProductionTimeline.scope(allLabel:)` already does, never a Goal/Phase
/// chronology decision.
struct NativeGoalPhaseContext: Decodable, Sendable {
    var contextId: String
    var startDate: String?
    var endDate: String?

    func scope(allLabel: String) -> TrainingScopeContext {
        TrainingScopeContext(
            options: [
                TrainingScopeOption(id: "goal:build-lean-mass", label: "Build Lean Mass", selected: contextId == "build-lean-mass"),
                TrainingScopeOption(id: "goal:visible-abs", label: "Visible Abs", selected: contextId == "visible-abs"),
                TrainingScopeOption(id: "all", label: allLabel, selected: contextId == "all"),
            ],
            dateRangeLabel: Self.dateRangeLabel(startDate: startDate, endDate: endDate)
        )
    }

    private static func dateRangeLabel(startDate: String?, endDate: String?) -> String {
        guard let startDate else { return "Complete history" }
        let endLabel = endDate.map(TrainingDateFormatting.short) ?? "Present"
        return "\(TrainingDateFormatting.short(startDate)) → \(endLabel)"
    }
}

// MARK: - Home and server-owned Priority occurrence projection

struct ProductionHomeAPI: HomeAPI {
    let api: ProductionNativeAPI
    var now: @Sendable () -> Date = { Date() }
    var calendar = Calendar.current

    func fetchHome() async throws -> HomeReadModel {
        // Presentation capability v2 advertises forward-compatible Home
        // enums. During a server-first rollout, Build 38 sends no capability
        // and receives the server's neutral v1 icon fallback; corrected
        // clients receive canonical domain icons such as `pills`.
        let envelope = try await api.readResource(
            "home", query: Self.query, as: Payload.self
        )
        return try Self.readModel(from: envelope)
    }

    func lastKnownHome() async -> HomeLastKnownSnapshot? {
        guard let envelope = await api.lastKnownResource("home", query: Self.query, as: Payload.self),
              let generatedAt = Self.serverInstant(envelope.generatedAt),
              // Home is a today surface (Today's Focus, briefing slots): a
              // snapshot from an earlier local day is refused, not shown.
              calendar.isDate(generatedAt, inSameDayAs: now()),
              let home = try? Self.readModel(from: envelope)
        else { return nil }
        return HomeLastKnownSnapshot(home: home, generatedAt: envelope.generatedAt, generatedDate: generatedAt)
    }

    private static func serverInstant(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private static let query = ["presentationVersion": "2"]

    private static func readModel(from envelope: ProductionResponseEnvelope<Payload>) throws -> HomeReadModel {
        let priorities = envelope.data.todaysFocus.map { $0.readOnlyOccurrence }
        let notificationOccurrences = (envelope.data.notificationOccurrences ?? envelope.data.todaysFocus)
            .map { $0.readOnlyOccurrence }
        if let invalid = priorities.first(where: { $0.date.isEmpty }) {
            throw ProductionDailyDriverError.missingPriorityOccurrenceDate(invalid.id)
        }
        let briefingCards = envelope.data.briefingCards.map { card in
            var canonical = card
            // The web DEXA route is scan-addressed, but the shared Native
            // Briefing detail resource is artifact-addressed. Home already
            // carries that canonical artifact id; normalize only at this
            // production adapter boundary so web routing remains unchanged.
            canonical.destination = .briefingDetail(briefingId: card.id)
            return canonical
        }
        return HomeReadModel(
            header: envelope.data.header,
            hero: envelope.data.hero.readModel,
            nextBestAction: envelope.data.nextBestAction,
            briefingCards: briefingCards,
            goals: try envelope.data.goals.map { try $0.readModel() },
            todaysFocus: priorities,
            notificationOccurrences: notificationOccurrences,
            notificationTimeZone: envelope.data.notificationTimeZone
        )
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var header: HomeHeader
        var hero: Hero
        var nextBestAction: HomeNextBestAction
        var briefingCards: [HomeBriefingCard]
        var goals: [Goal]
        var todaysFocus: [Priority]
        var notificationOccurrences: [Priority]?
        var notificationTimeZone: String?
    }

    private struct Hero: Decodable {
        var mode: String
        var goalLabel: String
        var headline: String
        var supportLine: String
        var confidence: Int?
        var confidenceDetail: ConfidenceDetail?
        var projectedFinish: String?
        var daysRemaining: String?
        var primaryTimeline: String?
        var plannedReviewDate: String?
        var actionLabel: String?
        var actionDestination: AppDestination?

        var readModel: HomeHero {
            HomeHero(
                mode: HomeHeroMode(rawValue: mode) ?? .active,
                goalLabel: goalLabel,
                headline: headline,
                supportLine: supportLine,
                confidence: confidence,
                confidenceDetail: confidenceDetail,
                primaryTimeline: primaryTimeline,
                projectedFinish: projectedFinish ?? plannedReviewDate,
                daysRemaining: daysRemaining,
                actionLabel: actionLabel,
                actionDestination: actionDestination
            )
        }
    }

    private struct Goal: Decodable {
        var id: String
        var title: String
        var current: String?
        var target: String?
        var unit: String?
        var icon: HomeGoalIcon
        var color: HomeColorToken
        var presentationMode: String?
        var progress: Int?
        var status: String?
        var detail: String?
        var destination: AppDestination?
        var presentation: Presentation?

        func readModel() throws -> HomeGoal {
            if presentation?.mode == "phase_trajectory_goal", let trajectory = presentation?.trajectory {
                let serverProgress = trajectory.goalProgress ?? trajectory.activePhase?.progress
                // Every phase gets its own card — Founder Production's real
                // Home (unlike this slice's prior collapsed single-line
                // summary) shows the full multi-phase journey (e.g. "Phase 1
                // Establish Maintenance · Completed" AND "Phase 2 Lean Mass
                // Build · Active") plus the goal's guardrail, matching
                // `GoalRow.jsx`'s `PhaseTrajectoryGoal` component exactly.
                // `order` here is the server's raw, ZERO-based phase index
                // (confirmed against the server's own test fixtures) — the
                // `+ 1` display-ordinal conversion happens only in the view,
                // never here, so the read model keeps the authoritative
                // server value.
                let phases = (trajectory.phases ?? []).map { phase in
                    HomeGoalPhase(
                        id: phase.phaseId ?? phase.phaseName ?? UUID().uuidString,
                        order: phase.order ?? 0,
                        phaseName: phase.phaseName ?? "Phase unavailable",
                        status: phase.status ?? "unavailable",
                        presentationTone: phase.presentationTone ?? "neutral",
                        progressType: phase.progress?.progressType,
                        clampedProgressPercentage: phase.progress?.clampedProgressPercentage,
                        presentationLabel: phase.progress?.presentationLabel,
                        progressStatus: phase.progress?.status,
                        startDate: phase.startDate,
                        calculatedPlannedReviewDate: phase.calculatedPlannedReviewDate,
                        timelineProgressState: phase.timelineProgressState
                    )
                }
                return HomeGoal(
                    id: id,
                    title: title,
                    current: Self.number(serverProgress?.latestValue ?? serverProgress?.baselineValue),
                    target: Self.number(serverProgress?.targetAmount),
                    unit: serverProgress?.unit ?? "",
                    icon: icon,
                    color: color,
                    presentation: .phaseTrajectory(HomePhaseTrajectory(
                        targetDescription: trajectory.overallGoal?.targetDescription,
                        overallTargetDate: trajectory.overallGoal?.overallTargetDate,
                        guardrail: presentation?.guardrail,
                        phases: phases
                    )),
                    destination: destination
                )
            }
            switch presentationMode ?? presentation?.mode {
            case "primary", "primary_goal":
                return HomeGoal(
                    id: id, title: title, current: current ?? "—", target: target ?? "—", unit: unit ?? "",
                    icon: icon, color: color, presentation: .primary(progress: progress ?? 0), destination: destination
                )
            case "supporting", "supporting_objective":
                return HomeGoal(
                    id: id, title: title, current: current ?? "", target: target ?? "", unit: unit ?? "",
                    icon: icon, color: color,
                    presentation: .supporting(status: status ?? "", detail: detail ?? ""), destination: destination
                )
            default:
                throw ProductionDailyDriverError.unsupportedHomeGoalPresentation(id: id)
            }
        }

        private static func number(_ value: Double?) -> String {
            guard let value else { return "—" }
            return value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
        }
    }

    private struct Presentation: Decodable { var mode: String; var trajectory: Trajectory?; var guardrail: String? }
    private struct Trajectory: Decodable {
        var goalProgress: ServerProgress?
        var activePhase: ActivePhase?
        var phases: [ActivePhase]?
        var overallGoal: OverallGoal?
    }
    private struct OverallGoal: Decodable { var targetDescription: String?; var overallTargetDate: String? }
    private struct ActivePhase: Decodable {
        var phaseId: String?
        var progress: ServerProgress?
        var order: Int?
        var phaseName: String?
        var status: String?
        var presentationTone: String?
        var startDate: String?
        var calculatedPlannedReviewDate: String?
        var timelineProgressState: String?
    }
    private struct ServerProgress: Decodable {
        var baselineValue: Double?
        var latestValue: Double?
        var targetAmount: Double?
        var unit: String?
        var clampedProgressPercentage: Int?
        var progressType: String?
        var presentationLabel: String?
        var status: String?
    }

    private struct Priority: Decodable, @unchecked Sendable {
        var id: String
        var completionId: String?
        var executionId: String?
        var occurrenceDate: String?
        var label: String
        var subtitle: String?
        var metadata: String?
        var changeLabel: String?
        var icon: HomeFocusIcon
        var color: HomeColorToken
        var state: String?
        var completed: Bool
        var completable: Bool?
        var actionLabel: String?
        var destination: AppDestination?
        var completionContext: PriorityCompletionContext?
        var sessionItems: [PrioritySessionItem]?
        var executionContract: ExecutionContract?
        var notificationAction: PriorityNotificationAction?

        struct ExecutionContract: Decodable {
            var priorityId: String?
            var occurrenceDate: String?
            var expectedVersion: Int?
        }

        var readOnlyOccurrence: PriorityOccurrence {
            let canonicalPriorityId = executionContract?.priorityId
                ?? completionId
                ?? id
            let canonicalOccurrenceDate = occurrenceDate
                ?? completionContext?.occurrenceDate
                ?? executionContract?.occurrenceDate
            return PriorityOccurrence(
                id: id,
                routePriorityId: canonicalPriorityId,
                executionItemId: executionId ?? canonicalPriorityId,
                // The production Home contract is occurrence-bound. An
                // absent date is invalid transport data, not permission to
                // substitute the device clock and silently open another day.
                date: canonicalOccurrenceDate ?? "",
                title: label,
                subtitle: subtitle,
                metadata: metadata,
                changeLabel: changeLabel,
                icon: icon,
                color: color,
                urgency: PriorityUrgency(rawValue: state ?? "") ?? .available,
                completed: completed,
                completable: completable == true && !completed && executionContract?.expectedVersion != nil,
                expectedVersion: executionContract?.expectedVersion,
                actionLabel: actionLabel,
                completionContext: completionContext,
                sessionItems: sessionItems,
                continueActionDestination: destination,
                attributedScope: nil,
                notificationAction: notificationAction
            )
        }
    }
}

// MARK: - Goals / current canonical Phase

struct ProductionGoalsAPI: GoalsAPI {
    let api: ProductionNativeAPI

    func fetchGoalsHub() async throws -> GoalsHubReadModel {
        let data = try await api.readResource("goals", as: HubPayload.self).data
        return GoalsHubReadModel(
            activeGoal: data.activeGoals.first.map(Self.summary),
            completedGoals: data.completedGoals.map {
                GoalSummaryReadModel(
                    id: $0.id, title: $0.title, lifecycle: .completed,
                    statusLabel: $0.status, dateRange: $0.dates,
                    achievement: $0.achievement, confidence: nil, currentPhaseName: nil
                )
            },
            addGoalAvailable: false,
            addGoalMessage: "Founder Production is read-only."
        )
    }

    func fetchGoalDetail(goalId: String) async throws -> GoalDetailReadModel? {
        let hub = try await fetchGoalsHub()
        if hub.activeGoal?.id == goalId {
            let payload = try await api.readResource("active-goal", as: ActivePayload.self).data
            guard payload.goalId == goalId else {
                throw ProductionDailyDriverError.inconsistentCanonicalIdentity(expected: goalId, actual: payload.goalId)
            }
            return GoalDetailReadModel(active: payload.model, completed: nil, supporting: nil)
        }
        if hub.completedGoals.contains(where: { $0.id == goalId }) {
            let payload = try await api.readResource("completed-goal", as: CompletedPayload.self).data
            guard payload.goalId == goalId else {
                throw ProductionDailyDriverError.inconsistentCanonicalIdentity(expected: goalId, actual: payload.goalId)
            }
            return GoalDetailReadModel(active: nil, completed: payload.model, supporting: nil)
        }
        return nil
    }

    /// Looks up any phase in the goal's full chronology, not only the
    /// currently active one — `active.phases` now carries every completed
    /// phase alongside the active one (see `ActivePayload.model`), so a
    /// historical phase (e.g. a completed "Establish Maintenance") must
    /// stay reachable here too, not just the phase matching
    /// `activePhaseId`.
    func fetchGoalPhase(goalId: String, phaseId: String) async throws -> GoalPhaseDetailReadModel? {
        guard let active = try await fetchGoalDetail(goalId: goalId)?.active,
              let phase = active.phases.first(where: { $0.id == phaseId }) else { return nil }
        return GoalPhaseDetailReadModel(
            goalId: goalId, goalTitle: active.title, phase: phase,
            goalProgress: active.goalProgress, confidence: active.confidence,
            guardrail: active.guardrail
        )
    }

    func fetchGoalStrategy(goalId: String, focus: GoalPlanFocus) async throws -> GoalStrategyReadModel? {
        guard let active = try await fetchGoalDetail(goalId: goalId)?.active else { return nil }
        return GoalStrategyReadModel(
            goalId: active.id, goalTitle: active.title, objective: active.objective,
            focus: focus, items: active.strategy, guardrail: active.guardrail
        )
    }

    private static func summary(_ value: ActiveSummary) -> GoalSummaryReadModel {
        let range = [value.phase?.startedAt, value.phase?.plannedReviewAt].compactMap { $0 }.joined(separator: " – ")
        return GoalSummaryReadModel(
            id: value.id, title: value.title, lifecycle: .active,
            statusLabel: value.statusLabel ?? value.status ?? "Active",
            dateRange: range,
            achievement: nil,
            confidence: value.confidence.map {
                GoalConfidenceReadModel(
                    value: $0.value, band: $0.band ?? "Unavailable",
                    explanation: $0.explanation ?? "", source: $0.source ?? "Server"
                )
            },
            currentPhaseName: value.phase?.name
        )
    }

    private struct HubPayload: Decodable, @unchecked Sendable {
        var activeGoals: [ActiveSummary]
        var completedGoals: [CompletedSummary]
    }

    private struct ActiveSummary: Decodable {
        var id: String
        var title: String
        var status: String?
        var statusLabel: String?
        var confidence: HubConfidence?
        var phase: HubPhase?
    }

    private struct HubConfidence: Decodable {
        var value: Int?
        var band: String?
        var source: String?
        var explanation: String?
    }

    private struct HubPhase: Decodable {
        var id: String
        var name: String
        var status: String
        var startedAt: String?
        var plannedReviewAt: String?
    }

    private struct CompletedSummary: Decodable {
        var id: String
        var title: String
        var status: String
        var dates: String
        var achievement: String?
    }

    private struct CompletedPayload: Decodable, @unchecked Sendable {
        var goalId: String
        var hero: CompletedHero
        var recap: String
        var highlights: [CompletedHighlight]
        var photos: CompletedPhotos
        var finalComposition: CompletedComposition
        var achievedBy: [String]
        var unlocked: CompletedUnlock?

        var model: CompletedGoalReadModel {
            CompletedGoalReadModel(
                id: goalId, title: hero.title, status: hero.status,
                dateRange: hero.dates, achievement: hero.achievement, recap: recap,
                highlights: highlights.enumerated().map { index, item in
                    CompletedGoalHighlightReadModel(
                        id: "\(goalId)-highlight-\(index)", date: item.date ?? "—",
                        title: item.title, body: item.body
                    )
                },
                photos: photos.rows(goalId: goalId),
                photoHistoryDestination: .progressStream(streamId: "photos"),
                finalComposition: CompletedGoalCompositionReadModel(
                    date: finalComposition.date ?? "—", bodyFat: finalComposition.bodyFat,
                    leanMass: finalComposition.leanMass, fatMass: finalComposition.fatMass,
                    weight: finalComposition.weight, narrative: finalComposition.narrative,
                    briefingDestination: nil
                ),
                achievedBy: achievedBy,
                unlocked: unlocked.flatMap { value in
                    value.destination.map {
                        CompletedGoalUnlockReadModel(title: value.title, body: value.body, destination: $0)
                    }
                }
            )
        }
    }
    private struct CompletedHero: Decodable { var title: String; var status: String; var dates: String; var achievement: String }
    private struct CompletedHighlight: Decodable { var date: String?; var title: String; var body: String }
    private struct CompletedPhotos: Decodable {
        var beginning: CompletedPhoto?
        var completion: CompletedPhoto?
        func rows(goalId: String) -> [CompletedGoalPhotoReadModel] {
            [
                beginning.map { CompletedGoalPhotoReadModel(id: $0.evidenceId ?? "\(goalId)-beginning", label: "Beginning", date: $0.date, systemImage: "person.crop.rectangle") },
                completion.map { CompletedGoalPhotoReadModel(id: $0.evidenceId ?? "\(goalId)-completion", label: "Completion", date: $0.date, systemImage: "person.crop.rectangle.fill") },
            ].compactMap { $0 }
        }
    }
    private struct CompletedPhoto: Decodable { var date: String; var evidenceId: String? }
    private struct CompletedComposition: Decodable {
        var date: String?; var bodyFat: String; var leanMass: String; var fatMass: String; var weight: String; var narrative: String
    }
    private struct CompletedUnlock: Decodable { var title: String; var body: String; var destination: AppDestination? }

    private struct ActivePayload: Decodable, @unchecked Sendable {
        var goalId: String
        var phaseId: String
        var confidence: Confidence
        var hero: Hero
        var journey: [Journey]
        var currentPhase: CurrentPhase
        var readiness: [String]
        var guardrail: Guardrail
        var evidence: Evidence
        var turningPoints: [GoalTurningPointReadModel]
        var strategy: [Strategy]

        var model: ActiveGoalReadModel {
            let currentJourney = journey.first { $0.status.lowercased() == "active" }
            let progress = GoalProgressReadModel(
                percentage: currentJourney?.percentage ?? 0,
                label: currentPhase.progress,
                detail: currentPhase.readiness
            )
            // `journey[]` already carries the full canonical chronology —
            // every phase the goal has ever had, completed ones included
            // (confirmed directly against a real Package 7 `active-goal`
            // response). A prior revision collapsed this down to a single
            // synthesized phase from `currentPhase`, which silently dropped
            // every completed phase and mis-numbered the active one (its
            // `order` was `journeyNumber - 1`, not the canonical number
            // itself — "Lean Mass Build" showed as "Phase 1" instead of
            // "Phase 2"). Completed entries have no richer `currentPhase`-
            // style object of their own on the wire, so their purpose/
            // evidence/strategy stay empty rather than borrowing the
            // active phase's — an honest "not provided" rather than a
            // fabrication.
            let phases: [GoalPhaseReadModel] = journey.map { entry in
                let isCurrent = entry.number == currentJourney?.number
                return GoalPhaseReadModel(
                    id: isCurrent ? currentPhase.id : "\(goalId)-phase-\(entry.number)",
                    order: entry.number,
                    name: isCurrent ? currentPhase.title : entry.name,
                    status: Self.phaseStatus(entry.status),
                    dates: isCurrent ? (currentJourney?.dates ?? currentPhase.review) : entry.dates,
                    purpose: isCurrent ? currentPhase.purpose : "",
                    progress: GoalProgressReadModel(
                        percentage: entry.percentage,
                        label: isCurrent ? currentPhase.progress : entry.progress,
                        detail: isCurrent ? currentPhase.readiness : ""
                    ),
                    evidence: isCurrent ? currentPhase.evidence : "",
                    strategy: [], successCriteria: [], guardrails: isCurrent ? [guardrail.title] : []
                )
            }
            let anchor = evidence.goalBaseline ?? evidence.phaseStart
            let goalGuardrail = GoalGuardrailReadModel(
                title: guardrail.title,
                state: guardrail.observation?.label ?? "Server monitored",
                scope: guardrail.scope,
                body: guardrail.body
            )
            return ActiveGoalReadModel(
                id: goalId,
                title: hero.title,
                status: hero.status,
                objective: hero.destination,
                dateRange: hero.destination,
                confidence: GoalConfidenceReadModel(
                    value: confidence.score, band: confidence.band ?? "Unavailable",
                    explanation: confidence.summary ?? "", source: "Server",
                    movement: confidence.movement, priorScore: confidence.priorScore, delta: confidence.delta,
                    detail: confidence.explanation.map {
                        ConfidenceDetail(
                            qualitativeLevel: $0.qualitativeLevel,
                            supportingFactors: $0.supportingFactors,
                            limitingFactors: $0.limitingFactors,
                            clarifyingFactors: $0.clarifyingFactors,
                            uncertaintyStatement: $0.uncertaintyStatement,
                            movementFactors: $0.movementFactors,
                            summary: $0.summary
                        )
                    }
                ),
                goalProgress: progress,
                phases: phases,
                activePhaseId: phaseId,
                readiness: readiness,
                guardrail: goalGuardrail,
                evidence: GoalEvidenceAnchorReadModel(
                    date: anchor?.date ?? "—", bodyFat: anchor?.bodyFat ?? "—",
                    leanMass: anchor?.leanMass ?? "—", fatMass: anchor?.fatMass ?? "—",
                    weight: anchor?.weight ?? "—", support: evidence.support ?? currentPhase.evidence
                ),
                trainingProgress: GoalTrainingProgressReadModel(
                    reviewDate: currentPhase.review, state: "Server-derived",
                    interpretation: currentPhase.evidence, comparisons: [], muscleGroups: []
                ),
                turningPoints: turningPoints,
                strategy: strategy.map {
                    GoalStrategyItemReadModel(id: $0.label, label: $0.label, active: $0.active)
                },
                plan: GoalPlanReadModel(
                    name: hero.title, purpose: currentPhase.purpose, primaryOutcome: hero.destination,
                    target: GoalTargetReadModel(
                        type: .numericChange, metric: "server-owned", direction: "server-owned",
                        amount: nil, targetValue: nil, unit: "", description: hero.destination, targetDate: nil
                    ),
                    timeline: GoalTimelineReadModel(startDate: "", targetDate: nil),
                    successCriteria: [], guardrails: []
                )
            )
        }

        /// Maps the wire's free-text journey status ("Completed" /
        /// "Active") to the closed presentation enum; anything else
        /// (a future "Planned" phase, say) fails safe to `.planned`
        /// rather than guessing.
        private static func phaseStatus(_ raw: String) -> GoalPhaseStatus {
            switch raw.lowercased() {
            case "completed": .completed
            case "active": .active
            default: .planned
            }
        }
    }

    private struct Confidence: Decodable {
        var score: Int?
        var band: String?
        var summary: String?
        var movement: String?
        var priorScore: Int?
        var delta: Int?
        var explanation: Explanation?

        struct Explanation: Decodable {
            var qualitativeLevel: String
            var summary: String
            var supportingFactors: [String]
            var limitingFactors: [String]
            var movementFactors: [String]
            var clarifyingFactors: [String]
            var uncertaintyStatement: String
        }
    }
    private struct Hero: Decodable { var title: String; var status: String; var destination: String }
    /// `support` is `null` for a completed journey entry (see
    /// `Package7Server`'s `active-goal` response for the Establish
    /// Maintenance phase) — genuinely optional on the wire, not a Native
    /// assumption. Unused downstream in `model` today; decoded for
    /// field-for-field fidelity only.
    private struct Journey: Decodable { var name: String; var number: Int; var status: String; var dates: String; var progress: String; var support: String?; var percentage: Int }
    private struct CurrentPhase: Decodable { var id: String; var goalId: String; var title: String; var purpose: String; var progress: String; var review: String; var evidence: String; var readiness: String }
    private struct Guardrail: Decodable { var title: String; var scope: String; var body: String; var observation: Observation? }
    private struct Observation: Decodable { var label: String }
    private struct Evidence: Decodable { var goalBaseline: Anchor?; var phaseStart: Anchor?; var support: String? }
    private struct Anchor: Decodable { var date: String; var bodyFat: String; var leanMass: String; var fatMass: String; var weight: String }
    private struct Strategy: Decodable { var label: String; var active: Bool }
}

// MARK: - Operating Plan

protocol OperatingPlanAPI: Sendable {
    func fetchOperatingPlan() async throws -> OperatingPlanReadModel
}

struct ProductionOperatingPlanAPI: OperatingPlanAPI {
    let api: ProductionNativeAPI

    func fetchOperatingPlan() async throws -> OperatingPlanReadModel {
        let payload = try await api.readResource("operating-plan", as: Payload.self).data
        return OperatingPlanReadModel(sections: payload.sections.map { section in
            OperatingPlanSectionReadModel(
                id: "\(section.iconKey)-\(section.title)",
                iconKey: section.iconKey,
                tone: section.tone,
                title: section.title,
                subtitle: section.subtitle,
                items: section.items.map {
                    OperatingPlanSectionItemReadModel(
                        id: $0.id, title: $0.title, detail: $0.detail,
                        destination: $0.destination, status: $0.status
                    )
                },
                supplementsAction: section.supplements == true
            )
        })
    }

    private struct Payload: Decodable, @unchecked Sendable { var sections: [Section] }
    private struct Section: Decodable {
        var iconKey: String
        var tone: OperatingPlanSectionTone
        var title: String
        var subtitle: String
        var items: [Item]
        var supplements: Bool?
    }
    private struct Item: Decodable {
        var id: String
        var title: String
        var detail: String
        var destination: AppDestination?
        var status: String?
    }
}

// MARK: - Log / Logged Today

/// Founder Production adapter for `coreNavigation.getLog` — the Package 7
/// `evidence-review-queue` resource actually serves the whole Log screen's
/// read model (`Logged Today` + pending Evidence Review queue together;
/// see `LogReadModel`'s own doc comment for the exact server service
/// this mirrors). There is no second "logged today" resource — Native
/// previously left `logAPI` a plain constant that never switched with
/// authority, so Founder Production showed the bundled `LogFixture.json`
/// (a fixed "Strength Training · 52 min" / "3 meals · 2,140 calories"
/// regardless of what the Founder actually did today) instead of this.
///
/// **Weight row (Build 21) — confirmed narrow server gap, worked around
/// client-side.** `evidence-review-queue`'s own `loggedToday.rows` sends
/// exactly Training/Nutrition/Activity, never Weight. The smallest server
/// fix would be adding a 4th row to that same resource (one round trip,
/// consistent with the other three). Until then, Native performs a
/// second, already-existing read (`weight`, the same resource
/// `ProductionWeightEvidenceAPI` already uses) and checks its `current`
/// entry's OWN date against this response's `localDate` — never a
/// "latest weight" fallback, and never a Swift-side same-day-revision
/// selection (the server's `current` is already revision-safe).
struct ProductionLogAPI: LogAPI {
    let api: ProductionNativeAPI

    func refreshLog() async throws -> LogReadModel {
        await api.invalidateReadResources(["evidence-review-queue"])
        return try await fetchLog()
    }

    func fetchLog() async throws -> LogReadModel {
        async let logRead = api.readResource("evidence-review-queue", as: Payload.self)
        async let weightRead = api.readResource("weight", query: ["context": "all"], as: WeightPayload.self)
        let payload = try await logRead.data
        let weightPayload = try? await weightRead.data

        var rows = payload.loggedToday.rows.map { row in
            LoggedTodayRow(
                kind: row.id,
                summary: row.summary,
                context: row.context,
                destination: Self.destination(for: row, localDate: payload.localDate),
                processing: row.processing
            )
        }
        rows.append(Self.weightRow(weightPayload, localDate: payload.localDate))

        var pending = payload.pendingEvidenceReviews.map { review in
            PendingEvidenceReview(
                id: review.id, title: review.title, date: review.date,
                summary: review.summary, likelyDuplicate: review.likelyDuplicate,
                destination: .evidenceReview(reviewId: review.id)
            )
        }
        var processing = payload.processingEvidenceReviews ?? []
        let acknowledgments = await api.acceptedEvidenceReviewProcessingAcknowledgments()
        for acknowledgment in acknowledgments {
            if processing.contains(where: { $0.id == acknowledgment.id }) { continue }
            guard pending.contains(where: { $0.id == acknowledgment.id }) else {
                await api.clearAcceptedEvidenceReviewProcessing(reviewId: acknowledgment.id)
                continue
            }

            let status = try? await ProductionEvidenceReviewAPI(api: api)
                .fetchReview(reviewId: acknowledgment.id)?.status
            if ["commit_failed", "partially_committed"].contains(status) {
                await api.clearAcceptedEvidenceReviewProcessing(reviewId: acknowledgment.id)
                continue
            }
            if status == "confirmed" {
                pending.removeAll { $0.id == acknowledgment.id }
                await api.clearAcceptedEvidenceReviewProcessing(reviewId: acknowledgment.id)
                continue
            }

            // A durable accepted receipt makes another review action false.
            // Until the Server queue catches up, project the honest interim
            // lifecycle state and keep canonical completion unresolved.
            pending.removeAll { $0.id == acknowledgment.id }
            let localDate = acknowledgment.localDate ?? payload.localDate
            processing.append(.init(
                id: acknowledgment.id, localDate: localDate,
                domain: acknowledgment.domain, label: acknowledgment.label,
                status: status ?? "accepted_processing"
            ))
            Self.overlayProcessingRow(
                domain: acknowledgment.domain, localDate: localDate,
                today: payload.localDate, rows: &rows
            )
        }

        return LogReadModel(
            localDate: payload.localDate,
            loggedToday: rows,
            pendingEvidenceReviews: pending,
            processingEvidenceReviews: processing
        )
    }

    private static func overlayProcessingRow(
        domain: String, localDate: String, today: String,
        rows: inout [LoggedTodayRow]
    ) {
        guard localDate == today,
              let kind = LoggedTodayRowKind(rawValue: domain),
              let index = rows.firstIndex(where: { $0.kind == kind && $0.destination == nil })
        else { return }
        rows[index].summary = "\(kind.label) processing"
        rows[index].context = "Confirmation accepted · No action required"
        rows[index].processing = true
    }

    /// `recordId` is the real canonical record the row is about — Training
    /// and Nutrition rows link straight to that record's own detail
    /// screen; Activity has no per-record detail screen of its own on
    /// Native, so it links to today's Activity Day (`localDate`, the
    /// server's own computed "today", never a Native-derived date). A row
    /// with no `recordId` (nothing logged) has no destination.
    private static func destination(for row: RowPayload, localDate: String) -> AppDestination? {
        guard let recordId = row.recordId else { return nil }
        switch row.id {
        case .training: return .trainingSession(sessionId: recordId)
        case .nutrition: return .nutritionDay(dayId: recordId)
        case .activity: return .activityDay(date: localDate)
        case .weight: return nil
        }
    }

    /// `nil` weight payload (e.g. a transient failure on the second read)
    /// degrades to an honest "Nothing logged yet" rather than surfacing an
    /// error for the whole Log screen over one non-critical row.
    private static func weightRow(_ weight: WeightPayload?, localDate: String) -> LoggedTodayRow {
        guard let current = weight?.current, current.date == localDate else {
            return LoggedTodayRow(kind: .weight, summary: "Nothing logged yet", context: nil, destination: .progressStream(streamId: "weight"))
        }
        let unit = current.unit ?? "lb"
        let formatted = current.value.rounded() == current.value ? String(Int(current.value)) : String(format: "%.1f", current.value)
        return LoggedTodayRow(kind: .weight, summary: "\(formatted) \(unit)", context: nil, destination: .progressStream(streamId: "weight"))
    }

    private struct WeightPayload: Decodable, @unchecked Sendable {
        var current: CurrentWeight?
    }

    private struct CurrentWeight: Decodable {
        var date: String
        var value: Double
        var unit: String?
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var localDate: String
        var loggedToday: LoggedTodayPayload
        var pendingEvidenceReviews: [ReviewPayload]
        var processingEvidenceReviews: [ProcessingEvidenceReview]?
    }

    private struct LoggedTodayPayload: Decodable {
        var rows: [RowPayload]
    }

    private struct RowPayload: Decodable {
        var id: LoggedTodayRowKind
        var summary: String
        var context: String?
        var recordId: String?
        var processing: Bool?
    }

    private struct ReviewPayload: Decodable {
        var id: String
        var date: String
        var title: String
        var summary: String
        var likelyDuplicate: Bool
    }

}

// MARK: - Priority detail

struct ProductionPriorityAPI: PriorityAPI {
    let api: ProductionNativeAPI

    func fetchExecutionItems() async throws -> [ExecutionItemFixture] { [] }

    func fetchPriority(priorityId: String, occurrenceDate: String?) async throws -> PriorityOccurrence? {
        var query = ["priorityId": priorityId]
        if let occurrenceDate { query["occurrenceDate"] = occurrenceDate }
        let value = try await api.readResource("priority", query: query, as: Payload.self).data
        guard value.id == priorityId else {
            throw ProductionDailyDriverError.inconsistentCanonicalIdentity(expected: priorityId, actual: value.id)
        }
        guard let date = value.completionContext?.occurrenceDate ?? value.executionContract?.occurrenceDate else {
            throw ProductionDailyDriverError.missingCanonicalIdentity("priority occurrence date")
        }
        return PriorityOccurrence(
            id: value.id, routePriorityId: value.executionContract?.priorityId ?? value.id,
            executionItemId: value.executionProjection?.executionId ?? value.id,
            date: date, title: value.title, subtitle: value.subtitle,
            metadata: value.sections.first?.items.first?.detail,
            changeLabel: nil, icon: .target, color: .primary,
            urgency: value.status == "Upcoming" ? .upcoming : .available,
            completed: value.status == "Completed",
            completable: value.status != "Completed" && value.executionContract?.expectedVersion != nil,
            expectedVersion: value.executionContract?.expectedVersion,
            actionLabel: value.action?.label, completionContext: value.completionContext,
            continueActionDestination: Self.destination(forActionHref: value.action?.href), attributedScope: nil,
            detailSections: value.sections.map { PrioritySectionReadModel(title: $0.title, items: $0.items.map { PriorityDetailFieldReadModel(label: $0.label, detail: $0.detail) }) },
            relatedWeight: value.relatedWeight,
            notificationAction: value.notificationAction
        )
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var id: String; var title: String; var subtitle: String?; var status: String
        var completionContext: PriorityCompletionContext?
        var executionContract: ExecutionContract?
        var executionProjection: ExecutionProjection?
        var notificationAction: PriorityNotificationAction?
        var action: ActionPayload?
        var sections: [Section]
        var relatedWeight: PriorityRelatedWeight?
    }
    private struct ExecutionContract: Decodable { var priorityId: String?; var occurrenceDate: String?; var expectedVersion: Int? }
    private struct ExecutionProjection: Decodable { var executionId: String? }
    private struct ActionPayload: Decodable { var label: String?; var href: String? }
    private struct Section: Decodable { var title: String; var items: [Item] }
    private struct Item: Decodable { var label: String; var detail: String? }

    /// A narrow, honest mapping for the ONE real web `action.href` this
    /// task confirmed (`createMorningWeighInPriorityDetail`'s
    /// `action: {label:"Log Weight", href:"/check-in/morning"}`) — not a
    /// general web-route-to-`AppDestination` router. An unrecognized href
    /// stays `nil` rather than guessing.
    private static func destination(forActionHref href: String?) -> AppDestination? {
        switch href {
        case "/check-in/morning": .checkIn(checkInType: "morning")
        default: nil
        }
    }
}

// MARK: - Training and canonical exercise registry agreement

struct ProductionTrainingAPI: TrainingAPI {
    let api: ProductionNativeAPI

    func fetchTrainingLanding(scope: EvidenceScopeSelection) async throws -> TrainingLandingReadModel {
        try await fetchTrainingLibrary(scope: scope, browseAll: false)
    }

    func fetchTrainingLibrary(scope: EvidenceScopeSelection, browseAll: Bool) async throws -> TrainingLandingReadModel {
        let context = try ProductionContext.value(for: scope)
        async let landingRead = api.readResource("training-landing", query: ["context": context], as: LandingPayload.self)
        async let libraryRead = api.readResource("training-library", query: ["context": context, "libraryScope": browseAll ? "all" : "my-library"], as: LibraryPayload.self)
        let (landingEnvelope, libraryEnvelope) = try await (landingRead, libraryRead)
        let payload = landingEnvelope.data
        let catalog = try CanonicalTrainingCatalog(exercises: libraryEnvelope.data.exercises(browseAll: browseAll))
        return TrainingLandingReadModel(
            title: payload.report.title,
            subtitle: payload.report.subtitle,
            tone: payload.report.tone,
            scope: payload.timeline.scope(allLabel: "All Training"),
            latestTrainingDay: payload.report.latestTrainingDay.map {
                TrainingLandingDay(
                    date: $0.date, label: $0.label, daySummary: $0.summary,
                    destination: $0.destination, sessions: $0.sessions
                )
            },
            trainingAreas: catalog.areaSummaries,
            reportingLinks: payload.report.reportingLinks,
            trainingDays: payload.report.trainingDays.map {
                TrainingDaySummary(date: $0.date, label: $0.label, summary: $0.summary, destination: $0.destination)
            },
            currentProtocol: TrainingProtocolSummary(
                sourceOfTruth: payload.report.currentProtocol.sourceOfTruth,
                dailyActivityTarget: payload.report.currentProtocol.dailyActivityTarget,
                trainingObjective: payload.report.currentProtocol.resistanceTraining,
                goal: payload.report.currentProtocol.goal
            ),
            relatedGoals: payload.report.relatedGoals,
            sourceEvidence: payload.report.sourceEvidence
        )
    }

    func fetchTrainingDay(date: String) async throws -> TrainingDayReadModel? {
        try await api.readResource("training-day", query: ["date": date], as: TrainingDayReadModel.self).data
    }

    func fetchTrainingSession(sessionId: String) async throws -> TrainingSessionDetailReadModel? {
        let value = try await api.readResource("training-session", query: ["sessionId": sessionId], as: TrainingSessionDetailReadModel.self).data
        guard value.id == sessionId else {
            throw ProductionDailyDriverError.inconsistentCanonicalIdentity(expected: sessionId, actual: value.id)
        }
        return value
    }

    func fetchTrainingArea(areaId: String, scope: EvidenceScopeSelection) async throws -> TrainingAreaReadModel? {
        try await fetchTrainingLibraryArea(areaId: areaId, scope: scope, browseAll: false)
    }

    func fetchTrainingLibraryArea(areaId: String, scope: EvidenceScopeSelection, browseAll: Bool) async throws -> TrainingAreaReadModel? {
        let payload = try await api.readResource(
            "training-library",
            query: ["context": try ProductionContext.value(for: scope), "path": areaId, "libraryScope": browseAll ? "all" : "my-library"],
            as: LibraryPayload.self
        ).data
        let catalog = try CanonicalTrainingCatalog(exercises: payload.exercises(browseAll: browseAll))
        guard let area = catalog.areas.first(where: { $0.id == areaId }) else { return nil }
        return TrainingAreaReadModel(
            id: area.id,
            title: area.label,
            breadcrumbs: [
                TrainingBreadcrumb(label: "Training", destination: .progressStream(streamId: "training")),
                TrainingBreadcrumb(label: "Training Library", destination: .progressStream(streamId: "training/library")),
            ],
            scope: payload.timeline.scope(allLabel: "All Training"),
            exercises: area.exercises.map {
                TrainingAreaExerciseRow(
                    id: $0.canonicalExerciseId, label: $0.label, detail: nil,
                    destination: .trainingExercise(exerciseId: $0.canonicalExerciseId),
                    canonicalExerciseId: $0.canonicalExerciseId
                )
            }
        )
    }

    func fetchTrainingExercise(exerciseId: String, scope: EvidenceScopeSelection) async throws -> TrainingExerciseDetailReadModel? {
        let context = try ProductionContext.value(for: scope)
        let libraryEnvelope = try await api.readResource(
            "training-library", query: ["context": context, "libraryScope": "all"], as: LibraryPayload.self
        )
        let catalog = try CanonicalTrainingCatalog(exercises: libraryEnvelope.data.report.canonicalExercises)
        guard let canonicalExercise = catalog.exercise(id: exerciseId) else {
            throw ProductionDailyDriverError.inconsistentCanonicalIdentity(expected: exerciseId, actual: "unavailable")
        }
        let payload = try await api.readResource(
            "training-exercise",
            query: ["context": context, "exerciseId": exerciseId],
            as: ExercisePayload.self
        ).data
        let occurrences = payload.report.entries.flatMap { session in
            session.exercises.filter { $0.canonicalExerciseId == exerciseId }.map { exercise in
                var exercise = exercise
                exercise.sets = exercise.sets.map { $0.classified(defaultLoadType: canonicalExercise.defaultLoadType) }
                return TrainingExerciseHistoryOccurrence(
                    sessionId: session.id,
                    sessionDate: session.date,
                    exercise: exercise,
                    relationship: Self.relationship(for: exercise, in: session)
                )
            }
        }
        return TrainingExerciseDetailReadModel(
            id: exerciseId,
            title: canonicalExercise.label,
            breadcrumbs: [
                TrainingBreadcrumb(label: "Training", destination: .progressStream(streamId: "training")),
                TrainingBreadcrumb(label: "Training Library", destination: .progressStream(streamId: "training/library")),
            ],
            scope: payload.timeline.scope(allLabel: "All Training"),
            benchmark: TrainingExerciseHistoryCalculator.benchmark(for: occurrences),
            performanceRecords: TrainingPerformanceRecordsCalculator.normalizedCurrentDisplay(payload.exerciseRecords),
            lastSession: occurrences.first,
            history: Array(occurrences.prefix(10))
        )
    }

    /// The completed `training-reporting` contract
    /// (`TrainingReportingPresentationService`, Patch 3 continuation)
    /// sends the server-composed status groups, PRs, highlights, attention
    /// items, and category rollups directly — Native decodes and lays out
    /// this already-final presentation; it never re-derives status
    /// classification, PR detection, or rollup grouping from raw
    /// performance observations itself. One payload covers all 6 report
    /// ids (matching `availableReports`); Native selects the requested
    /// section client-side, mirroring the real web's own
    /// `getReportingContent` dispatch (there is no server-side
    /// per-`reportId` filter).
    func fetchTrainingReporting(reportId: String, scope: EvidenceScopeSelection) async throws -> TrainingReportingReadModel? {
        let envelope = try await api.readResource(
            "training-reporting",
            query: ["context": try ProductionContext.value(for: scope)],
            as: ReportingPayload.self
        )
        guard let link = envelope.data.reporting.availableReports.first(where: { $0.id == reportId }) else { return nil }
        let reporting = envelope.data.reporting
        switch reportId {
        case "resistance":
            return TrainingReportingReadModel(
                id: reportId,
                eyebrow: "Reporting",
                title: reporting.resistance?.title ?? link.label,
                summary: reporting.resistance?.summary ?? link.detail ?? "",
                scope: envelope.data.context.scope(allLabel: "All Training"),
                placeholderBody: nil,
                resistance: reporting.resistance?.readModel,
                historyDays: nil
            )
        case "history":
            return TrainingReportingReadModel(
                id: reportId,
                eyebrow: "Reporting",
                title: reporting.history?.title ?? link.label,
                summary: reporting.history?.summary ?? link.detail ?? "",
                scope: envelope.data.context.scope(allLabel: "All Training"),
                placeholderBody: nil,
                resistance: nil,
                historyDays: nil,
                productionHistoryDays: reporting.history?.days.map(\.readModel)
            )
        default:
            return TrainingReportingReadModel(
                id: reportId,
                eyebrow: "Reporting",
                title: link.label,
                summary: link.detail ?? "",
                scope: envelope.data.context.scope(allLabel: "All Training"),
                placeholderBody: "This page is now a permanent destination. It will grow into graphs, trends, comparisons, goal impact, and historical analysis as more canonical training evidence accumulates.",
                resistance: nil,
                historyDays: nil
            )
        }
    }

    private struct ReportingPayload: Decodable, @unchecked Sendable {
        var context: NativeGoalPhaseContext
        var reporting: Reporting
    }

    private struct Reporting: Decodable {
        var availableReports: [AvailableReport]
        var resistance: Resistance?
        var history: History?
    }

    private struct AvailableReport: Decodable {
        var id: String
        var label: String
        var detail: String?
    }

    private struct Resistance: Decodable {
        var title: String
        var summary: String
        var statusGroups: [StatusGroup]
        var recentPrs: [LinkRow]
        var highlights: [Highlight]
        var needsAttention: [LinkRow]
        var categories: [Category]

        var readModel: TrainingResistanceReportReadModel {
            TrainingResistanceReportReadModel(
                statusGroups: statusGroups.map(\.readModel),
                recentPrs: recentPrs.map { $0.readModel(destination: .trainingExercise(exerciseId: $0.canonicalExerciseId ?? "")) },
                highlights: highlights.map(\.readModel),
                needsAttention: needsAttention.map { $0.readModel(destination: .trainingExercise(exerciseId: $0.canonicalExerciseId ?? "")) },
                categoryRollups: categories.map(\.readModel)
            )
        }
    }

    private struct StatusGroup: Decodable {
        var status: String
        var label: String
        var count: Int
        var exercises: [LinkRow]

        private static let tones: [String: TrainingResistanceStatusTone] = [
            "improving": .success, "stable": .stable, "plateauing": .warning,
            "regressing": .danger, "insufficient_data": .stable,
        ]

        var readModel: TrainingResistanceStatusGroup {
            TrainingResistanceStatusGroup(
                label: label,
                tone: Self.tones[status] ?? .stable,
                items: exercises.map { $0.readModel(destination: .trainingExercise(exerciseId: $0.canonicalExerciseId ?? "")) }
            )
        }
    }

    private struct LinkRow: Decodable {
        var canonicalExerciseId: String?
        var label: String?
        var status: String?
        var latestEvidenceDate: String?
        var detail: String?

        func readModel(destination: AppDestination) -> TrainingReportingLinkRow {
            TrainingReportingLinkRow(
                id: canonicalExerciseId ?? label ?? UUID().uuidString,
                label: label ?? "Exercise",
                detail: detail,
                destination: destination
            )
        }
    }

    private struct Highlight: Decodable {
        var type: String
        var canonicalExerciseId: String?
        var categoryId: String?
        var label: String?
        var detail: String?

        var readModel: TrainingReportingLinkRow {
            let destination: AppDestination = type == "category"
                ? .trainingExercise(exerciseId: categoryId ?? "")
                : .trainingExercise(exerciseId: canonicalExerciseId ?? "")
            return TrainingReportingLinkRow(
                id: canonicalExerciseId ?? categoryId ?? label ?? UUID().uuidString,
                label: label ?? "Highlight",
                detail: detail,
                destination: destination
            )
        }
    }

    private struct Category: Decodable {
        var categoryId: String
        var label: String
        var status: String?
        var latestEvidenceDate: String?
        var exerciseCount: Int?
        var latestKnownSets: Int?
        var latestKnownVolume: Double?
        var statusCounts: [String: Int]?

        var readModel: TrainingReportingLinkRow {
            var parts: [String] = []
            if let latestEvidenceDate { parts.append("Latest \(TrainingDateFormatting.short(latestEvidenceDate))") }
            if let exerciseCount { parts.append("\(exerciseCount) exercise\(exerciseCount == 1 ? "" : "s")") }
            if let latestKnownSets, latestKnownSets > 0 { parts.append("\(latestKnownSets) set\(latestKnownSets == 1 ? "" : "s")") }
            return TrainingReportingLinkRow(
                id: categoryId,
                label: label,
                detail: parts.isEmpty ? nil : parts.joined(separator: " · "),
                destination: .trainingExercise(exerciseId: categoryId)
            )
        }
    }

    private struct History: Decodable {
        var title: String
        var summary: String
        var days: [HistoryDay]
    }

    private struct HistoryDay: Decodable {
        var id: String
        var date: String
        var label: String?
        var sessions: [HistorySession]

        var readModel: TrainingReportingHistoryDay {
            TrainingReportingHistoryDay(id: id, date: date, label: label, sessions: sessions.map(\.readModel))
        }
    }

    private struct HistorySession: Decodable {
        var sessionId: String
        var label: String?
        var occurrenceDate: String
        var revision: Int?

        var readModel: TrainingReportingHistorySession {
            TrainingReportingHistorySession(sessionId: sessionId, label: label, occurrenceDate: occurrenceDate, revision: revision)
        }
    }

    private static func relationship(
        for exercise: TrainingExerciseOccurrence,
        in session: TrainingSessionDetailReadModel
    ) -> TrainingExerciseRelationshipContext? {
        guard let group = session.exerciseRelationshipGroups.first(where: { $0.memberExerciseIds.contains(exercise.id) }) else { return nil }
        let partners = session.exercises.filter { group.memberExerciseIds.contains($0.id) && $0.id != exercise.id }
        return TrainingExerciseRelationshipContext(
            relationshipType: group.relationshipType,
            partnerNames: partners.map(\.name),
            partnerCanonicalExerciseIds: partners.compactMap(\.canonicalExerciseId)
        )
    }

    private struct LandingPayload: Decodable, @unchecked Sendable { var timeline: ProductionTimeline; var report: LandingReport }
    private struct LandingReport: Decodable {
        var title: String; var subtitle: String?; var tone: HomeColorToken
        var latestTrainingDay: Day?
        var reportingLinks: [TrainingReportingLink]
        var trainingDays: [Day]
        var currentProtocol: ProtocolSummary
        var relatedGoals: [TrainingRelatedGoal]
        var sourceEvidence: [TrainingSourceEvidenceItem]
    }
    private struct Day: Decodable {
        var date: String; var label: String; var summary: String?
        var destination: AppDestination; var sessions: [TrainingSessionPreview] = []
        private enum CodingKeys: String, CodingKey { case date, label, summary, destination, sessions }
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            date = try container.decode(String.self, forKey: .date)
            label = try container.decode(String.self, forKey: .label)
            summary = try container.decodeIfPresent(String.self, forKey: .summary)
            destination = try container.decode(AppDestination.self, forKey: .destination)
            sessions = try container.decodeIfPresent([TrainingSessionPreview].self, forKey: .sessions) ?? []
        }
    }
    private struct ProtocolSummary: Decodable { var sourceOfTruth: String; var dailyActivityTarget: String; var resistanceTraining: String; var goal: String }
    private struct LibraryPayload: Decodable, @unchecked Sendable {
        var timeline: ProductionTimeline
        var report: LibraryReport
        // Required: a missing authoritative membership projection is not All Exercises.
        var myLibraryExerciseIds: [String]

        func exercises(browseAll: Bool) -> [ProductionCanonicalExercise] {
            let membership = Set(myLibraryExerciseIds)
            return report.canonicalExercises.filter { browseAll || membership.contains($0.canonicalExerciseId) }
        }
    }
    private struct LibraryReport: Decodable { var canonicalExercises: [ProductionCanonicalExercise] }
    private struct ExercisePayload: Decodable, @unchecked Sendable {
        var timeline: ProductionTimeline
        var report: ExerciseReport
        var exerciseRecords: TrainingPerformanceRecordsReadModel?
    }
    private struct ExerciseReport: Decodable { var entries: [TrainingSessionDetailReadModel] }
}

struct ProductionTrainingLoggerAPI: TrainingLoggerAPI {
    let api: ProductionNativeAPI

    func fetchConfiguration() async throws -> TrainingLoggerConfiguration {
        let payload = try await api.readResource("training-logger", as: Payload.self).data
        let projected = payload.initialCanonicalExercises.map(ProductionCanonicalExercise.init)
        let catalog = try CanonicalTrainingCatalog(exercises: projected)
        let history = payload.initialHistorySessions
        let recommendations = Dictionary(
            uniqueKeysWithValues: (payload.initialProgressionRecommendations ?? []).map {
                ($0.canonicalExerciseId, $0.recommendation)
            }
        )
        return TrainingLoggerConfiguration(
            areas: catalog.areas.map { TrainingLoggerArea(id: $0.id, label: $0.label) },
            variants: [],
            exercises: catalog.areas.flatMap { area in
                area.exercises.map { exercise in
                    TrainingLoggerCatalogExercise(
                        canonicalExerciseId: exercise.canonicalExerciseId,
                        name: exercise.label,
                        areaId: area.id,
                        equipment: exercise.equipment,
                        measurement: exercise.measurement,
                        defaultLoadType: exercise.defaultLoadType,
                        previouslyPerformed: payload.initialPerformedExerciseIds.contains(exercise.canonicalExerciseId),
                        inMyLibrary: payload.initialMyLibraryExerciseIds.contains(exercise.canonicalExerciseId),
                        history: Self.history(for: exercise.canonicalExerciseId, defaultLoadType: exercise.defaultLoadType, in: history),
                        progressionRecommendation: recommendations[exercise.canonicalExerciseId]
                    )
                }
            },
            categorySuggestion: payload.initialCategorySuggestion
        )
    }

    static func history(
        for exerciseID: String,
        defaultLoadType: String? = nil,
        in sessions: [HistorySession]
    ) -> [TrainingLoggerHistoryRecord] {
        sessions.flatMap { session in
            session.exercises.filter { $0.canonicalExerciseId == exerciseID }.map { exercise in
                TrainingLoggerHistoryRecord(
                    sessionId: session.id,
                    workoutDate: String(session.observedAt.prefix(10)),
                    executionVariant: exercise.executionVariant,
                    relationship: nil,
                    sets: exercise.sets.enumerated().map { index, set in
                        TrainingSet(
                            setNumber: index + 1,
                            reps: set.reps,
                            weight: set.weight,
                            weightUnit: set.weightUnit,
                            durationSeconds: set.durationSeconds,
                            loadType: set.loadType,
                            setType: set.measurementType,
                            loadSemantics: set.loadSemantics
                        ).classified(defaultLoadType: defaultLoadType)
                    }
                )
            }
        }
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var initialCanonicalExercises: [RawExercise]
        var initialHistorySessions: [HistorySession]
        var initialPerformedExerciseIds: [String]
        var initialMyLibraryExerciseIds: [String]
        var initialProgressionRecommendations: [RawRecommendation]?
        var initialCategorySuggestion: TrainingLoggerCategorySuggestion?
    }

    /// `coreNavigation.getTrainingLogger`'s `initialHistorySessions` are a
    /// distinct, leaner canonical projection (`projectTrainingHistorySession`)
    /// from the full presentation shape `training-session` returns — they
    /// exist only to drive "previously performed" set history in the
    /// exercise picker, so the server strips them to
    /// `{id, evidence_type, observed_at, exercises, exerciseRelationshipGroups}`
    /// with each set reduced to `{reps, weight, weight_unit}`. Reusing
    /// `TrainingSessionDetailReadModel` here was a Native-side type
    /// mismatch, not a server contract gap.
    struct HistorySession: Decodable {
        var id: String
        var observedAt: String
        var exercises: [HistoryExercise]
    }

    struct HistoryExercise: Decodable {
        var canonicalExerciseId: String?
        var executionVariant: TrainingExecutionVariant?
        var sets: [HistorySet]
    }

    /// No `set_number` on the wire for this lean projection (see
    /// `HistorySession`'s doc comment) — display order is derived from
    /// array position, mirroring the server's own `index + 1` fallback
    /// wherever it lacks an explicit `set_number`, never a Native
    /// invention.
    struct HistorySet: Decodable {
        var reps: Double?
        var weight: Double?
        var weightUnit: String?
        var durationSeconds: Double?
        var loadType: String?
        var measurementType: String?
        /// Server `load_semantics` (read-time set-level classification).
        var loadSemantics: String?
    }
    private struct RawRecommendation: Decodable {
        var canonicalExerciseId: String
        var state: TrainingLoggerProgressionState
        var eyebrow: String
        var message: String
        var prescription: String
        var suggestedLoad: Double?
        var suggestedLoadType: String?
        var suggestedReps: Double?
        var suggestedUnit: String?

        var recommendation: TrainingLoggerProgressionRecommendation {
            .init(
                state: state,
                eyebrow: eyebrow,
                message: message,
                prescription: prescription,
                suggestedLoad: suggestedLoad,
                suggestedLoadType: suggestedLoadType,
                suggestedReps: suggestedReps,
                suggestedUnit: suggestedUnit
            )
        }
    }
    fileprivate struct RawExercise: Decodable {
        var id: String; var name: String; var equipment: String?
        var bodyRegion: String?; var primaryMuscleGroups: [String]
        var defaultMeasurement: String?; var defaultLoadType: String?
        var primaryNavigationCategory: String
    }
}

private struct ProductionCanonicalExercise: Decodable {
    var canonicalExerciseId: String
    var primaryNavigationCategory: String
    var label: String
    var primaryMuscleGroupId: String?
    var primaryMuscleGroups: [String]
    var regionLabel: String?
    var equipment: String?
    var defaultMeasurement: String?
    var defaultLoadType: String?

    init(_ raw: ProductionTrainingLoggerAPI.RawExercise) {
        canonicalExerciseId = raw.id
        primaryNavigationCategory = raw.primaryNavigationCategory
        label = raw.name
        primaryMuscleGroupId = nil
        primaryMuscleGroups = raw.primaryMuscleGroups
        regionLabel = raw.bodyRegion
        equipment = raw.equipment
        defaultMeasurement = raw.defaultMeasurement
        defaultLoadType = raw.defaultLoadType
    }
}

private struct CanonicalTrainingCatalog {
    struct Exercise {
        var canonicalExerciseId: String
        var label: String
        var equipment: String?
        var measurement: TrainingLoggerMeasurement
        var defaultLoadType: String?
    }
    struct Area { var id: String; var label: String; var exercises: [Exercise] }
    let areas: [Area]

    init(exercises: [ProductionCanonicalExercise]) throws {
        let definitions = [
            ("chest", "Chest"), ("back", "Back"), ("shoulders", "Shoulders"),
            ("biceps", "Biceps"), ("triceps", "Triceps"), ("core", "Core"),
            ("quads", "Quads"), ("hamstrings", "Hamstrings"),
            ("glutes", "Glutes"), ("calves", "Calves"),
        ]
        var grouped = Dictionary(uniqueKeysWithValues: definitions.map { ($0.0, [Exercise]()) })
        for exercise in exercises {
            guard let areaID = Self.areaID(for: exercise) else {
                throw ProductionDailyDriverError.unknownCanonicalExerciseArea(
                    exerciseID: exercise.canonicalExerciseId,
                    muscleGroupID: exercise.primaryMuscleGroupId ?? exercise.primaryMuscleGroups.first
                )
            }
            grouped[areaID, default: []].append(Exercise(
                canonicalExerciseId: exercise.canonicalExerciseId,
                label: exercise.label,
                equipment: exercise.equipment,
                measurement: exercise.defaultMeasurement == "duration" ? .duration
                    : exercise.defaultLoadType == "bodyweight" ? .bodyweightReps : .repsLoad,
                defaultLoadType: exercise.defaultLoadType
            ))
        }
        areas = definitions.map { id, label in
            Area(id: id, label: label, exercises: (grouped[id] ?? []).sorted { $0.label < $1.label })
        }
    }

    var areaSummaries: [TrainingAreaSummary] {
        areas.map {
            TrainingAreaSummary(
                id: $0.id, label: $0.label, exerciseCount: $0.exercises.count,
                destination: .trainingExercise(exerciseId: $0.id)
            )
        }
    }

    func exercise(id: String) -> Exercise? {
        areas.lazy.flatMap(\.exercises).first { $0.canonicalExerciseId == id }
    }

    private static func areaID(for exercise: ProductionCanonicalExercise) -> String? {
        // Category is canonical server navigation, not the first anatomical muscle.
        // In particular Hyperextension Machine's Lower Back anatomy does not own its Glutes placement.
        let candidates = [Optional(exercise.primaryNavigationCategory)]
        for candidate in candidates.compactMap({ $0 }).map(slug) {
            switch candidate {
            case "chest", "upper-chest": return "chest"
            case "back", "lats", "mid-back", "upper-back", "lower-back": return "back"
            case "shoulders", "front-delts", "side-delts", "rear-delts": return "shoulders"
            case "biceps", "forearms", "arms": return "biceps"
            case "triceps": return "triceps"
            case "core", "abs", "obliques", "deep-core", "hip-flexors": return "core"
            case "quads", "lower-body": return "quads"
            case "hamstrings": return "hamstrings"
            case "glutes", "adductors", "hip-abductors": return "glutes"
            case "calves": return "calves"
            default: continue
            }
        }
        return nil
    }

    private static func slug(_ value: String) -> String {
        value.lowercased().replacingOccurrences(of: "_", with: "-").replacingOccurrences(of: " ", with: "-")
    }
}

// MARK: - Nutrition and Activity

struct ProductionNutritionAPI: NutritionAPI {
    let api: ProductionNativeAPI

    func fetchNutritionLanding(scope: EvidenceScopeSelection) async throws -> NutritionLandingReadModel {
        let payload = try await read(scope: scope)
        return payload.landing(allLabel: "All Nutrition")
    }

    func fetchNutritionDay(dayId: String) async throws -> NutritionDayRecord? {
        try await read(scope: .all).report.nutritionDays.first { $0.id == dayId }
    }

    func fetchNutritionReporting(
        reportId: String, scope: EvidenceScopeSelection, range: EvidenceChartRange,
        macro: NutritionMacroKey, mealMacroMixSlot: NutritionMealSlotFilter,
        mealTrendSlot: NutritionMealSlotFilter, mealTrendMetric: NutritionMealTrendMetric
    ) async throws -> NutritionReportingReadModel? {
        guard ["calories", "macros", "meals"].contains(reportId) else { return nil }
        let payload = try await read(scope: scope)
        let days = NutritionReportingCalculator.rangeFiltered(days: payload.report.nutritionDays, range: range)
        let context = payload.timeline.scope(allLabel: "All Nutrition")
        switch reportId {
        case "calories": return NutritionReportingReadModel(id: reportId, eyebrow: "Nutrition Reporting", title: "Calories", subtitle: "Daily intake, weekly averages, and calorie history over time.", scope: context, dataSources: payload.report.dataSources, calories: NutritionReportingCalculator.caloriesReport(days: days), macros: nil, meals: nil)
        case "macros": return NutritionReportingReadModel(id: reportId, eyebrow: "Nutrition Reporting", title: "Macros", subtitle: "Macro distribution, daily averages, and weekly trends over time.", scope: context, dataSources: payload.report.dataSources, calories: nil, macros: NutritionReportingCalculator.macrosReport(days: days, selectedMacro: macro), meals: nil)
        default: return NutritionReportingReadModel(id: reportId, eyebrow: "Nutrition Reporting", title: "Meals", subtitle: "Meal structure across the selected period.", scope: context, dataSources: payload.report.dataSources, calories: nil, macros: nil, meals: NutritionReportingCalculator.mealsReport(days: days, macroMixSlot: mealMacroMixSlot, trendSlot: mealTrendSlot, trendMetric: mealTrendMetric))
        }
    }

    private func read(scope: EvidenceScopeSelection) async throws -> Payload {
        try await api.readResource("nutrition", query: ["context": try ProductionContext.value(for: scope)], as: Payload.self).data
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var timeline: ProductionTimeline
        var report: Report
        func landing(allLabel: String) -> NutritionLandingReadModel {
            let reportLinks = report.nutritionReportingLinks.map { link -> NutritionInfoLink in
                var link = link
                if ["calories", "macros", "meals"].contains(link.id) {
                    link.destination = .progressStream(streamId: "nutrition/reporting/\(link.id)")
                }
                return link
            }
            return NutritionLandingReadModel(
                title: report.title, subtitle: report.subtitle, tone: report.tone,
                scope: timeline.scope(allLabel: allLabel),
                latestNutritionDay: report.nutritionDays.first,
                reportingLinks: reportLinks, nutritionAreas: report.nutritionLibrary,
                nutritionHistory: report.nutritionDays, dataSources: report.dataSources
            )
        }
    }
    private struct Report: Decodable {
        var title: String; var subtitle: String?; var tone: HomeColorToken
        var nutritionDays: [NutritionDayRecord]
        var nutritionLibrary: [NutritionInfoLink]
        var nutritionReportingLinks: [NutritionInfoLink]
        var dataSources: [NutritionDataSource]
    }
}

struct ProductionActivityAPI: ActivityAPI {
    let api: ProductionNativeAPI

    func fetchActivityLanding(scope: EvidenceScopeSelection) async throws -> ActivityLandingReadModel {
        let payload = try await read(scope: scope)
        return ActivityLandingReadModel(
            title: payload.report.title, subtitle: payload.report.subtitle,
            tone: payload.report.tone, scope: payload.timeline.scope(allLabel: "All Activity"),
            latestActivityDay: payload.report.latestActivityDay,
            activityAreas: payload.report.activityAreas,
            linkedTrainingContext: payload.report.linkedTrainingContext,
            activityHistory: payload.report.activityHistory,
            dataSources: payload.report.dataSources
        )
    }

    /// Day Detail is a "day truth" screen — staleness here is unacceptable
    /// (the Build 58 defect this fixes: History showed a fresh revision
    /// while Detail, reading the exact same shared `activity?context=all`
    /// bucket through the read cache, kept serving whatever an earlier,
    /// unrelated caller — e.g. the combined-driver prefetch — had left
    /// there, for as long as that entry's TTL hadn't lapsed). Rather than
    /// inventing a new date-scoped server resource (Training's own
    /// `training-day` route gets this isolation for free, but that's a
    /// Server change out of scope here), Detail always bypasses the cache
    /// with `.reload` and performs a live read — matching the server's own
    /// uncached, always-fresh `/read/activity` route (`cache-control:
    /// no-store`), so it can never resolve to a revision older than
    /// whatever History's own most recent live read already observed. The
    /// live response still repopulates the shared `context=all` cache entry
    /// afterward (`ProductionNativeAPI.readResource`'s normal
    /// generation-gated store), so any other reader of that bucket benefits
    /// too — Detail just never itself settles for a passively-sitting stale
    /// value.
    func fetchActivityDay(date: String) async throws -> ActivityDayRecord? {
        try await read(scope: .all, policy: .reload).report.activityHistory.first { $0.date == date }
    }

    private func read(scope: EvidenceScopeSelection, policy: ProductionNativeAPI.ReadPolicy = .cacheFirst) async throws -> Payload {
        try await api.readResource("activity", query: ["context": try ProductionContext.value(for: scope)], policy: policy, as: Payload.self).data
    }
    private struct Payload: Decodable, @unchecked Sendable { var timeline: ProductionTimeline; var report: Report }
    private struct Report: Decodable {
        var title: String; var subtitle: String; var tone: HomeColorToken
        var latestActivityDay: ActivityDayRecord?; var activityAreas: [ActivityAreaSummary]
        var linkedTrainingContext: [ActivityTrainingContextEntry]
        var activityHistory: [ActivityDayRecord]; var dataSources: [ActivityDataSource]
    }
}

// MARK: - Finished server-derived Energy report

struct ProductionEnergyAPI: EnergyAPI {
    let api: ProductionNativeAPI

    func fetchEnergyReport(scope: EvidenceScopeSelection) async throws -> EnergyReportReadModel {
        let report = try await api.readResource(
            "energy", query: ["context": try ProductionContext.value(for: scope)], as: Payload.self
        ).data
        let days = report.days.map(\.readModel)
        return EnergyReportReadModel(
            title: "Energy", heading: "Energy Balance", subtitle: "Intake and expenditure over time.",
            scope: report.timeline.scope(allLabel: "All Energy"), summary: report.summary,
            weeklyTrend: report.weeks.reversed(), recentFourWeeks: report.recentFourWeeks,
            weeklyHistory: report.weeks, dailyHistory: days, dataSources: report.dataSources
        )
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var timeline: ProductionTimeline
        var summary: EnergySummary
        var days: [ServerEnergyDay]
        var weeks: [EnergyWeekRecord]
        var recentFourWeeks: [EnergyWeekRecord]
        var latestEvidenceDate: String?
        var dataSources: [EnergyDataSource]
    }

    private struct ServerEnergyDay: Decodable {
        var date: String
        var calorieIntake: Double?
        var activeCalories: Double?
        var estimatedExpenditure: Double?
        var energyBalance: Double?
        var completeness: String

        var readModel: EnergyDayRecord {
            EnergyDayRecord(
                id: date, date: date, calorieIntake: calorieIntake,
                activeCalories: activeCalories, estimatedExpenditure: estimatedExpenditure,
                energyBalance: energyBalance, completeness: completeness
            )
        }
    }
}

// MARK: - DEXA

/// The server already scopes/selects `dexaScans` server-side before
/// computing this report (`buildDEXAReport`), so — unlike
/// `FixtureDEXAAPI`/`DEXAEvidenceCalculator`, which must select which
/// scans are "in scope" and which is "latest" from a raw fixture list —
/// Production only decodes and reformats already-final server output. It
/// must never re-run scan selection itself (DEXA selection/revisions are
/// server-canonical).
struct ProductionDEXAAPI: DEXAAPI {
    let api: ProductionNativeAPI

    func fetchDEXAReport(scope: EvidenceScopeSelection) async throws -> DEXAReportReadModel {
        let context = try ProductionContext.value(for: scope)
        let envelope = try await api.readResource("dexa", query: ["context": context], as: Payload.self)
        return Self.report(from: envelope.data, allLabel: "All DEXA")
    }

    private static func report(from payload: Payload, allLabel: String) -> DEXAReportReadModel {
        let report = payload.report
        return DEXAReportReadModel(
            title: report.title,
            subtitle: report.subtitle,
            scope: payload.timeline.scope(allLabel: allLabel),
            latestScan: report.latestScan.map {
                DEXALatestScan(
                    date: $0.date,
                    sourceLabel: "BodySpec PDF Import",
                    sourceMediaId: $0.sourceMedia?.mediaId
                )
            },
            summary: report.summary.map { DEXASummaryItem(label: $0.label, value: $0.value) },
            delta: report.delta.map {
                DEXADelta(bodyFatPercentagePoints: $0.bodyFat, fatMassPounds: $0.fatMass, leanMassPounds: $0.leanMass)
            },
            bodyFatTrend: DEXAMetricSeries(
                title: "Body Fat %", unit: "%",
                points: report.chart.points.map { DEXATrendPoint(id: $0.id, date: $0.date, value: $0.value) }
            ),
            coreTrends: ["totalMass", "fatMass", "leanMass", "rmr"].compactMap { id in
                Self.series(id: id, in: report.charts, title: Self.coreTrendTitle(for: id), unit: Self.coreTrendUnit(for: id))
            },
            supplementalDetails: report.latestDetails.map { $0.readModel },
            supplementalTrends: ["vatMass", "androidGynoidRatio"].compactMap { id in
                Self.series(id: id, in: report.charts, title: Self.coreTrendTitle(for: id), unit: Self.coreTrendUnit(for: id))
            },
            regionalLeanTrends: Self.regionalTrends(in: report.regionalMassCharts, suffix: "-leanMass"),
            regionalFatTrends: Self.regionalTrends(in: report.regionalMassCharts, suffix: "-fatMass"),
            history: report.history.map(\.readModel),
            dataSources: report.dataSources
        )
    }

    /// Server chart `id`/`label`/`suffix` are cosmetically inconsistent
    /// with what this app's own Sandbox-established UI already calls each
    /// series (server: "Weight"/" kcal"; Native: "Total Mass"/"kcal/day")
    /// — matched by stable `id`, not by trusting the server's own label
    /// text, so on-screen copy stays consistent with the UI users already
    /// know regardless of authority.
    private static func series(id: String, in charts: [NamedChart], title: String, unit: String) -> DEXAMetricSeries? {
        guard let chart = charts.first(where: { $0.id == id }) else { return nil }
        return DEXAMetricSeries(
            title: title, unit: unit,
            points: chart.points.map { DEXATrendPoint(id: $0.id, date: $0.date, value: $0.value) }
        )
    }

    private static func regionalTrends(in charts: [NamedChart], suffix: String) -> [DEXAMetricSeries] {
        let order = ["arms", "legs", "trunk", "android", "gynoid"]
        return order.compactMap { region in
            guard let chart = charts.first(where: { $0.id == "\(region)\(suffix)" }) else { return nil }
            return DEXAMetricSeries(
                title: region.prefix(1).uppercased() + region.dropFirst(), unit: "lb",
                points: chart.points.map { DEXATrendPoint(id: $0.id, date: $0.date, value: $0.value) }
            )
        }
    }

    private static func coreTrendTitle(for id: String) -> String {
        switch id {
        case "totalMass": "Total Mass"
        case "fatMass": "Fat Mass"
        case "leanMass": "Lean Mass"
        case "vatMass": "VAT Mass"
        case "rmr": "RMR"
        case "androidGynoidRatio": "A/G Ratio"
        default: id
        }
    }

    private static func coreTrendUnit(for id: String) -> String {
        switch id {
        case "rmr": "kcal/day"
        case "androidGynoidRatio": ""
        default: "lb"
        }
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var timeline: ProductionTimeline
        var report: Report
    }

    private struct Report: Decodable {
        var title: String
        var subtitle: String
        var latestScan: LatestScan?
        var summary: [SummaryItem]
        var delta: Delta?
        var chart: Chart
        var charts: [NamedChart]
        var regionalMassCharts: [NamedChart]
        var latestDetails: [DetailTuple]
        var history: [HistoryRow]
        var dataSources: [DEXADataSource]
    }

    private struct LatestScan: Decodable {
        var date: String
        var sourceMedia: MediaDescriptor?
    }
    private struct SummaryItem: Decodable { var label: String; var value: String }
    private struct Delta: Decodable { var bodyFat: String; var fatMass: String; var leanMass: String }
    private struct Chart: Decodable { var points: [ChartPoint] }
    private struct ChartPoint: Decodable { var id: String; var date: String; var value: Double? }
    private struct NamedChart: Decodable { var id: String; var points: [ChartPoint] }

    /// `latestDetails` is a heterogeneous JSON tuple array on the wire
    /// (`["VAT Mass", 12.3, " lb", 2]`, the trailing precision sometimes
    /// omitted) — not a keyed object — so it needs an `unkeyedContainer`
    /// decode rather than ordinary `Decodable` synthesis. Formatting rule
    /// mirrors the real product's own `MetricRows` component exactly:
    /// `Number.isFinite(value) ? value.toFixed(precision ?? 1)+unit : "Unavailable"`.
    private struct DetailTuple: Decodable {
        var label: String
        var value: Double?
        var unit: String
        var precision: Int

        init(from decoder: Decoder) throws {
            var container = try decoder.unkeyedContainer()
            label = try container.decode(String.self)
            value = try container.decodeNil() ? nil : try container.decode(Double.self)
            unit = try container.decode(String.self)
            precision = container.isAtEnd ? 1 : try container.decode(Int.self)
        }

        var readModel: DEXADetailRow {
            let formatted = value.map { String(format: "%.\(precision)f%@", $0, unit) } ?? "Unavailable"
            return DEXADetailRow(label: label, value: formatted)
        }
    }

    private struct HistoryRow: Decodable {
        var id: String
        var date: String
        var bodyFatPercentage: Double?
        var fatMass: Double?
        var leanMass: Double?
        var rmr: Double?
        var sourceMedia: MediaDescriptor?

        var readModel: DEXAScanHistoryRow {
            DEXAScanHistoryRow(
                id: id, date: date,
                bodyFatPercentage: bodyFatPercentage.map { String(format: "%.1f%%", $0) } ?? "Pending",
                fatMass: fatMass.map { String(format: "%.1f lb", $0) } ?? "Pending",
                leanMass: leanMass.map { String(format: "%.1f lb", $0) } ?? "Pending",
                restingMetabolicRate: rmr.map { "\(Int($0.rounded())) kcal/day" } ?? "Pending",
                sourceLabel: "BodySpec PDF Import",
                sourceMediaId: sourceMedia?.mediaId
            )
        }
    }

    private struct MediaDescriptor: Decodable {
        var mediaId: String
        var deliveryPath: String
    }
}

// MARK: - Evidence Hub summary projection

/// Composes the Evidence Hub's per-stream summary rows from the same
/// production reads every individual Evidence surface already uses —
/// Weight, Training, Nutrition, Activity, and Energy — rather than
/// inventing a new server call the Package 7 native contract doesn't
/// expose (there is no `evidence`/`progress-hub` read resource). DEXA and
/// Progress Photos are real product surfaces but are not yet wired to
/// production reads in this pass (Patch 3 scope, see `AppEnvironment`'s
/// doc comment); their rows stay an explicit "not yet available" state
/// rather than the bundled Sandbox fixture values, which would otherwise
/// misrepresent stale fixture data as Founder Production truth. Recovery
/// and Health Metrics have no backing resource at all yet, in either
/// authority, and keep the same "Coming soon" placeholder Sandbox already
/// shows.
struct ProductionEvidenceAPI: EvidenceAPI {
    let api: ProductionNativeAPI

    func fetchEvidenceHub() async throws -> EvidenceHubReadModel {
        // These are independent canonical reads. Actor reentrancy keeps the
        // one refresh-token boundary safe while allowing healthy requests to
        // overlap instead of forcing Evidence Hub through seven serial waits.
        async let weightRead = ProductionWeightEvidenceAPI(api: api).fetchWeightReport(scope: .all)
        async let trainingRead = ProductionTrainingAPI(api: api).fetchTrainingLanding(scope: .all)
        async let nutritionRead = ProductionNutritionAPI(api: api).fetchNutritionLanding(scope: .all)
        async let activityRead = ProductionActivityAPI(api: api).fetchActivityLanding(scope: .all)
        async let energyRead = ProductionEnergyAPI(api: api).fetchEnergyReport(scope: .all)
        async let dexaRead = ProductionDEXAAPI(api: api).fetchDEXAReport(scope: .all)
        async let photosRead = ProductionPhotosAPI(api: api).fetchPhotosLanding(scope: .all)
        let (weight, training, nutrition, activity, energy, dexa, photos) = try await (
            weightRead, trainingRead, nutritionRead, activityRead, energyRead, dexaRead, photosRead
        )

        let streams: [EvidenceStreamSummary] = [
            trainingStream(training),
            nutritionStream(nutrition),
            weightStream(weight),
            photosStream(photos),
            dexaStream(dexa),
            activityStream(activity),
            energyStream(energy),
            timelineStream(),
            comingSoonStream(id: "recovery", title: "Recovery", tone: .primary),
            comingSoonStream(id: "health-metrics", title: "Health Metrics", tone: .primary),
        ]

        return EvidenceHubReadModel(
            title: "Evidence Hub",
            subtitle: "PhysiqueOS organizes what it knows about your body, progress, and routines.",
            streams: streams
        )
    }

    private func trainingStream(_ landing: TrainingLandingReadModel) -> EvidenceStreamSummary {
        EvidenceStreamSummary(
            id: "training", title: "Training",
            metric: landing.latestTrainingDay?.daySummary ?? "No training recorded",
            trend: landing.latestTrainingDay?.daySummary ?? "No training recorded",
            lastUpdated: landing.latestTrainingDay?.date,
            status: landing.latestTrainingDay != nil ? .available : .placeholder,
            tone: .primary,
            destination: .progressStream(streamId: "training")
        )
    }

    private func nutritionStream(_ landing: NutritionLandingReadModel) -> EvidenceStreamSummary {
        EvidenceStreamSummary(
            id: "nutrition", title: "Nutrition",
            metric: landing.latestNutritionDay?.value ?? "No nutrition recorded",
            trend: landing.latestNutritionDay?.detail ?? "No nutrition recorded",
            lastUpdated: landing.latestNutritionDay?.date,
            status: landing.latestNutritionDay != nil ? .available : .placeholder,
            tone: .primary,
            destination: .progressStream(streamId: "nutrition")
        )
    }

    private func weightStream(_ report: WeightReportReadModel) -> EvidenceStreamSummary {
        let latest = report.history.first
        return EvidenceStreamSummary(
            id: "weight", title: "Weight",
            metric: latest?.value ?? "No weight recorded",
            trend: latest?.detail ?? "No weight recorded",
            lastUpdated: latest?.date,
            status: latest != nil ? .available : .placeholder,
            tone: .evidence,
            destination: .progressStream(streamId: "weight")
        )
    }

    private func dexaStream(_ report: DEXAReportReadModel) -> EvidenceStreamSummary {
        let latest = report.latestScan
        return EvidenceStreamSummary(
            id: "dexa", title: "DEXA",
            metric: report.summary.first(where: { $0.label == "Body Fat" })?.value ?? "No scan recorded",
            trend: latest != nil ? "Last scan \(latest!.date)" : "No scan recorded",
            lastUpdated: latest?.date,
            status: latest != nil ? .available : .placeholder,
            tone: .success,
            destination: .progressStream(streamId: "dexa")
        )
    }

    private func photosStream(_ landing: PhotosLandingReadModel) -> EvidenceStreamSummary {
        let latest = landing.latestSet
        return EvidenceStreamSummary(
            id: "photos", title: "Progress Photos",
            metric: latest != nil ? "\(latest!.views.count) views" : "No sessions recorded",
            trend: latest != nil ? "Last session \(latest!.date)" : "No sessions recorded",
            lastUpdated: latest?.date,
            status: latest != nil ? .available : .placeholder,
            tone: .primary,
            destination: .progressStream(streamId: "photos")
        )
    }

    private func timelineStream() -> EvidenceStreamSummary {
        EvidenceStreamSummary(
            id: "timeline", title: "Timeline",
            metric: "A chronological record of what PhysiqueOS has captured",
            trend: "A chronological record of what PhysiqueOS has captured",
            lastUpdated: nil,
            status: .available,
            tone: .primary,
            destination: .progressStream(streamId: "timeline")
        )
    }

    private func activityStream(_ landing: ActivityLandingReadModel) -> EvidenceStreamSummary {
        EvidenceStreamSummary(
            id: "activity", title: "Activity",
            metric: landing.latestActivityDay?.value ?? "No activity recorded",
            trend: landing.latestActivityDay?.detail ?? "No activity recorded",
            lastUpdated: landing.latestActivityDay?.date,
            status: landing.latestActivityDay != nil ? .available : .placeholder,
            tone: .primary,
            destination: .progressStream(streamId: "activity")
        )
    }

    private func energyStream(_ report: EnergyReportReadModel) -> EvidenceStreamSummary {
        let latest = report.dailyHistory.first
        return EvidenceStreamSummary(
            id: "energy", title: "Energy",
            metric: latest?.completeness ?? "No energy evidence recorded",
            trend: "\(report.summary.completeDays) of \(report.summary.evidenceDays) evidence days complete",
            lastUpdated: latest?.date,
            status: latest != nil ? .available : .placeholder,
            tone: .primary,
            destination: .progressStream(streamId: "energy")
        )
    }

    /// A Patch 3 surface that already exists in Sandbox but has no
    /// production read wired up yet — honest about being unavailable
    /// under Founder Production rather than showing the bundled fixture's
    /// stale values.
    private func notYetAvailableStream(id: String, title: String, tone: HomeColorToken) -> EvidenceStreamSummary {
        EvidenceStreamSummary(
            id: id, title: title,
            metric: "Not yet available in Founder Production",
            trend: "Not yet available in Founder Production",
            lastUpdated: nil, status: .placeholder, tone: tone,
            destination: .progressStream(streamId: id)
        )
    }

    /// A surface with no backing resource yet in either authority —
    /// mirrors `FixtureEvidenceAPI`'s own "Coming soon" row exactly.
    private func comingSoonStream(id: String, title: String, tone: HomeColorToken) -> EvidenceStreamSummary {
        EvidenceStreamSummary(
            id: id, title: title,
            metric: "Coming soon", trend: "Coming soon",
            lastUpdated: nil, status: .placeholder, tone: tone,
            destination: .progressStream(streamId: id)
        )
    }
}
