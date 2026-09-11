import Foundation

enum ProductionDailyDriverError: Error, Equatable {
    case unknownCanonicalExerciseArea(exerciseID: String, muscleGroupID: String?)
    case inconsistentCanonicalIdentity(expected: String, actual: String?)
    case unsupportedGoalContext(id: String)
    case unsupportedHomeGoalPresentation(id: String)
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

private enum ProductionContext {
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

// MARK: - Home and server-owned Priority occurrence projection

struct ProductionHomeAPI: HomeAPI {
    let api: ProductionNativeAPI

    func fetchHome() async throws -> HomeReadModel {
        let envelope = try await api.readResource("home", as: Payload.self)
        return HomeReadModel(
            header: envelope.data.header,
            hero: envelope.data.hero.readModel,
            nextBestAction: envelope.data.nextBestAction,
            briefingCards: envelope.data.briefingCards,
            goals: try envelope.data.goals.map { try $0.readModel() },
            todaysFocus: envelope.data.todaysFocus.map { $0.readOnlyOccurrence }
        )
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var header: HomeHeader
        var hero: Hero
        var nextBestAction: HomeNextBestAction
        var briefingCards: [HomeBriefingCard]
        var goals: [Goal]
        var todaysFocus: [Priority]
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
                mode: mode == "terminal" ? .terminal : .active,
                goalLabel: goalLabel,
                headline: headline,
                supportLine: supportLine,
                confidence: confidence,
                confidenceDetail: confidenceDetail,
                projectedFinish: projectedFinish ?? plannedReviewDate,
                daysRemaining: daysRemaining ?? primaryTimeline,
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
            if presentation?.mode == "phase_trajectory_goal" {
                let serverProgress = presentation?.trajectory?.goalProgress ?? presentation?.trajectory?.activePhase?.progress
                let activePhase = presentation?.trajectory?.activePhase
                let phaseLabel = activePhase?.order.map { order in
                    activePhase?.phaseName.map { "Phase \(order) · \($0)" } ?? "Phase \(order)"
                } ?? activePhase?.phaseName
                return HomeGoal(
                    id: id,
                    title: title,
                    current: Self.number(serverProgress?.latestValue ?? serverProgress?.baselineValue),
                    target: Self.number(serverProgress?.targetAmount),
                    unit: serverProgress?.unit ?? "",
                    icon: icon,
                    color: color,
                    presentation: .primary(progress: serverProgress?.clampedProgressPercentage ?? 0, phaseLabel: phaseLabel),
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

    private struct Presentation: Decodable { var mode: String; var trajectory: Trajectory? }
    private struct Trajectory: Decodable { var goalProgress: ServerProgress?; var activePhase: ActivePhase? }
    private struct ActivePhase: Decodable { var progress: ServerProgress?; var order: Int?; var phaseName: String? }
    private struct ServerProgress: Decodable {
        var baselineValue: Double?
        var latestValue: Double?
        var targetAmount: Double?
        var unit: String?
        var clampedProgressPercentage: Int?
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
        var actionLabel: String?
        var completionContext: PriorityCompletionContext?

        var readOnlyOccurrence: PriorityOccurrence {
            PriorityOccurrence(
                id: id,
                executionItemId: executionId ?? completionId ?? id,
                date: occurrenceDate ?? completionContext?.occurrenceDate ?? String(ISO8601DateFormatter().string(from: Date()).prefix(10)),
                title: label,
                subtitle: subtitle,
                metadata: metadata,
                changeLabel: changeLabel,
                icon: icon,
                color: color,
                urgency: PriorityUrgency(rawValue: state ?? "") ?? .available,
                completed: completed,
                completable: false,
                actionLabel: actionLabel,
                completionContext: nil,
                continueActionDestination: nil,
                attributedScope: nil
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
                        destination: nil, status: $0.status
                    )
                },
                supplementsAction: false
            )
        })
    }

    private struct Payload: Decodable, @unchecked Sendable { var sections: [Section] }
    private struct Section: Decodable { var iconKey: String; var tone: OperatingPlanSectionTone; var title: String; var subtitle: String; var items: [Item] }
    private struct Item: Decodable { var id: String; var title: String; var detail: String; var status: String? }
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
struct ProductionLogAPI: LogAPI {
    let api: ProductionNativeAPI

    func fetchLog() async throws -> LogReadModel {
        let payload = try await api.readResource("evidence-review-queue", as: Payload.self).data
        return LogReadModel(
            localDate: payload.localDate,
            loggedToday: payload.loggedToday.rows.map { row in
                LoggedTodayRow(
                    kind: row.id,
                    summary: row.summary,
                    context: row.context,
                    destination: Self.destination(for: row, localDate: payload.localDate)
                )
            },
            pendingEvidenceReviews: payload.pendingEvidenceReviews.map { review in
                PendingEvidenceReview(
                    id: review.id, title: review.title, date: review.date,
                    summary: review.summary, likelyDuplicate: review.likelyDuplicate,
                    destination: .evidenceReview(reviewId: review.id)
                )
            }
        )
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
        }
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var localDate: String
        var loggedToday: LoggedTodayPayload
        var pendingEvidenceReviews: [ReviewPayload]
    }

    private struct LoggedTodayPayload: Decodable {
        var rows: [RowPayload]
    }

    private struct RowPayload: Decodable {
        var id: LoggedTodayRowKind
        var summary: String
        var context: String?
        var recordId: String?
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

    func fetchPriority(priorityId: String) async throws -> PriorityOccurrence? {
        let value = try await api.readResource("priority", query: ["priorityId": priorityId], as: Payload.self).data
        guard value.id == priorityId else {
            throw ProductionDailyDriverError.inconsistentCanonicalIdentity(expected: priorityId, actual: value.id)
        }
        let date = value.completionContext?.occurrenceDate ?? value.executionContract?.occurrenceDate ?? String(ISO8601DateFormatter().string(from: Date()).prefix(10))
        return PriorityOccurrence(
            id: value.id, executionItemId: value.executionProjection?.executionId ?? value.id,
            date: date, title: value.title, subtitle: value.subtitle,
            metadata: value.sections.first?.items.first?.detail,
            changeLabel: nil, icon: .target, color: .primary,
            urgency: value.status == "Completed" ? .available : .available,
            completed: value.status == "Completed", completable: false,
            actionLabel: nil, completionContext: nil,
            continueActionDestination: nil, attributedScope: nil
        )
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var id: String; var title: String; var subtitle: String?; var status: String
        var completionContext: PriorityCompletionContext?
        var executionContract: ExecutionContract?
        var executionProjection: ExecutionProjection?
        var sections: [Section]
    }
    private struct ExecutionContract: Decodable { var occurrenceDate: String? }
    private struct ExecutionProjection: Decodable { var executionId: String? }
    private struct Section: Decodable { var title: String; var items: [Item] }
    private struct Item: Decodable { var label: String; var detail: String? }
}

// MARK: - Training and canonical exercise registry agreement

struct ProductionTrainingAPI: TrainingAPI {
    let api: ProductionNativeAPI

    func fetchTrainingLanding(scope: EvidenceScopeSelection) async throws -> TrainingLandingReadModel {
        let context = try ProductionContext.value(for: scope)
        async let landingRead = api.readResource("training-landing", query: ["context": context], as: LandingPayload.self)
        async let libraryRead = api.readResource("training-library", query: ["context": context], as: LibraryPayload.self)
        let (landingEnvelope, libraryEnvelope) = try await (landingRead, libraryRead)
        let payload = landingEnvelope.data
        let catalog = try CanonicalTrainingCatalog(exercises: libraryEnvelope.data.report.canonicalExercises)
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
        let payload = try await api.readResource(
            "training-library",
            query: ["context": try ProductionContext.value(for: scope), "path": areaId],
            as: LibraryPayload.self
        ).data
        let catalog = try CanonicalTrainingCatalog(exercises: payload.report.canonicalExercises)
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
            "training-library", query: ["context": context], as: LibraryPayload.self
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
                TrainingExerciseHistoryOccurrence(
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
            performanceRecords: payload.exerciseRecords,
            lastSession: occurrences.first,
            history: Array(occurrences.prefix(10))
        )
    }

    func fetchTrainingReporting(reportId: String, scope: EvidenceScopeSelection) async throws -> TrainingReportingReadModel? {
        // The daily-driver patch consumes the server reporting resource for
        // route/capability parity, while the accepted deep reporting
        // presentation remains deferred until its report-specific adapter.
        _ = try await api.readResource(
            "training-reporting",
            query: ["context": try ProductionContext.value(for: scope)],
            as: DiscardedReport.self
        )
        return nil
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
    private struct LibraryPayload: Decodable, @unchecked Sendable { var timeline: ProductionTimeline; var report: LibraryReport }
    private struct LibraryReport: Decodable { var canonicalExercises: [ProductionCanonicalExercise] }
    private struct ExercisePayload: Decodable, @unchecked Sendable {
        var timeline: ProductionTimeline
        var report: ExerciseReport
        var exerciseRecords: TrainingPerformanceRecordsReadModel?
    }
    private struct ExerciseReport: Decodable { var entries: [TrainingSessionDetailReadModel] }
    private struct DiscardedReport: Decodable, @unchecked Sendable { var timeline: ProductionTimeline }
}

struct ProductionTrainingLoggerAPI: TrainingLoggerAPI {
    let api: ProductionNativeAPI

    func fetchConfiguration() async throws -> TrainingLoggerConfiguration {
        let payload = try await api.readResource("training-logger", as: Payload.self).data
        let projected = payload.initialCanonicalExercises.map(ProductionCanonicalExercise.init)
        let catalog = try CanonicalTrainingCatalog(exercises: projected)
        let history = payload.initialHistorySessions
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
                        previouslyPerformed: payload.initialPerformedExerciseIds.contains(exercise.canonicalExerciseId),
                        history: Self.history(for: exercise.canonicalExerciseId, in: history),
                        progressionRecommendation: nil
                    )
                }
            }
        )
    }

    private static func history(
        for exerciseID: String,
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
                            durationSeconds: nil,
                            loadType: nil,
                            setType: nil
                        )
                    }
                )
            }
        }
    }

    private struct Payload: Decodable, @unchecked Sendable {
        var initialCanonicalExercises: [RawExercise]
        var initialHistorySessions: [HistorySession]
        var initialPerformedExerciseIds: [String]
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
    private struct HistorySession: Decodable {
        var id: String
        var observedAt: String
        var exercises: [HistoryExercise]
    }

    private struct HistoryExercise: Decodable {
        var canonicalExerciseId: String?
        var executionVariant: TrainingExecutionVariant?
        var sets: [HistorySet]
    }

    /// No `set_number` on the wire for this lean projection (see
    /// `HistorySession`'s doc comment) — display order is derived from
    /// array position, mirroring the server's own `index + 1` fallback
    /// wherever it lacks an explicit `set_number`, never a Native
    /// invention.
    private struct HistorySet: Decodable {
        var reps: Double?
        var weight: Double?
        var weightUnit: String?
    }
    fileprivate struct RawExercise: Decodable {
        var id: String; var name: String; var equipment: String?
        var bodyRegion: String?; var primaryMuscleGroups: [String]
        var defaultMeasurement: String?; var defaultLoadType: String?
    }
}

private struct ProductionCanonicalExercise: Decodable {
    var canonicalExerciseId: String
    var label: String
    var primaryMuscleGroupId: String?
    var primaryMuscleGroups: [String]
    var regionLabel: String?
    var equipment: String?
    var defaultMeasurement: String?
    var defaultLoadType: String?

    init(_ raw: ProductionTrainingLoggerAPI.RawExercise) {
        canonicalExerciseId = raw.id
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
    struct Exercise { var canonicalExerciseId: String; var label: String; var equipment: String?; var measurement: TrainingLoggerMeasurement }
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
                    : exercise.defaultLoadType == "bodyweight" ? .bodyweightReps : .repsLoad
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
        let candidates = [exercise.primaryMuscleGroupId] + exercise.primaryMuscleGroups.map(Optional.some) + [exercise.regionLabel]
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

    func fetchActivityDay(date: String) async throws -> ActivityDayRecord? {
        try await read(scope: .all).report.activityHistory.first { $0.date == date }
    }

    private func read(scope: EvidenceScopeSelection) async throws -> Payload {
        try await api.readResource("activity", query: ["context": try ProductionContext.value(for: scope)], as: Payload.self).data
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
                DEXALatestScan(date: $0.date, sourceLabel: "BodySpec PDF Import")
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

    private struct LatestScan: Decodable { var date: String }
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

        var readModel: DEXAScanHistoryRow {
            DEXAScanHistoryRow(
                id: id, date: date,
                bodyFatPercentage: bodyFatPercentage.map { String(format: "%.1f%%", $0) } ?? "Pending",
                fatMass: fatMass.map { String(format: "%.1f lb", $0) } ?? "Pending",
                leanMass: leanMass.map { String(format: "%.1f lb", $0) } ?? "Pending",
                restingMetabolicRate: rmr.map { "\(Int($0.rounded())) kcal/day" } ?? "Pending",
                sourceLabel: "BodySpec PDF Import"
            )
        }
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
        // Sequential, not concurrent: `ProductionNativeAPI` serializes reads
        // through one bearer-refresh path anyway, and a predictable request
        // order keeps this composition straightforward to test.
        let weight = try await ProductionWeightEvidenceAPI(api: api).fetchWeightReport(scope: .all)
        let training = try await ProductionTrainingAPI(api: api).fetchTrainingLanding(scope: .all)
        let nutrition = try await ProductionNutritionAPI(api: api).fetchNutritionLanding(scope: .all)
        let activity = try await ProductionActivityAPI(api: api).fetchActivityLanding(scope: .all)
        let energy = try await ProductionEnergyAPI(api: api).fetchEnergyReport(scope: .all)
        let dexa = try await ProductionDEXAAPI(api: api).fetchDEXAReport(scope: .all)

        let streams: [EvidenceStreamSummary] = [
            trainingStream(training),
            nutritionStream(nutrition),
            weightStream(weight),
            notYetAvailableStream(id: "photos", title: "Progress Photos", tone: .primary),
            dexaStream(dexa),
            activityStream(activity),
            energyStream(energy),
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
