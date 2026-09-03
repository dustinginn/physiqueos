import Foundation

/// PhysiqueOS Native's shared Goal/Phase chronology model — the ONE place
/// every Evidence vertical (Training, Activity, Nutrition, Weight) resolves
/// its scope selector against, rather than three or four independently
/// reimplemented date-range filters.
///
/// v2 of this file. v1 mirrored the web's own real, hand-maintained
/// `EVIDENCE_CONTEXT_WINDOWS` constant (a Goal-only, 2-window table
/// disconnected from the canonical Goal/Phase domain records) — a correct
/// audit finding, but the Founder correctly rejected it as a *permanent*
/// Native architecture: mirroring a known web limitation forever is not the
/// same as building the right thing. This version instead models the real
/// canonical Goal/Phase lifecycle records (`CanonicalGoal`/
/// `CanonicalGoalPhase`, mirroring `src/domain/models/goal.js`/`goalPhase.js`
/// field-for-field) and walks their own date intervals to resolve
/// attribution — the exact algorithm now implemented server-side in
/// `GoalPhaseChronologyReadService.resolveGoalPhaseOwnership` (see
/// `claude/server-evidence-chronology`, not yet deployed/wired to any
/// route). `GoalPhaseChronology.resolveOwnership` below is a line-for-line
/// Swift port of that same pure function, over the same field names, so the
/// two stay provably equivalent rather than two competing systems.
///
/// Native does not own canonical Goal/Phase truth — `canonicalGoals` below
/// is fixture data shaped exactly like what that server projection would
/// return, standing in until a live API is connected (see
/// `FIXTURE MODE` in this port's task brief). This is the same "fixture
/// mirrors the real contract" convention already used throughout this
/// codebase (`GoalsFixture.json`, `TrainingFixture.json`, ...), not a new
/// parallel truth.

// MARK: - Canonical Goal/Phase records (mirrors goal.js / goalPhase.js)

/// Mirrors `src/domain/models/goalPhase.js`'s persisted shape — only the
/// fields a date-interval resolver needs (`id`, `name`, `order`, `status`,
/// `startDate`, `completedAt`), not the full authoring/review-state surface
/// (`timingMode`, `transitionPolicy`, `successCriteria`, ...) those pages
/// never consume.
struct CanonicalGoalPhase: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var order: Int
    var status: String
    var startDate: String
    /// The last day still owned by this phase (inclusive) — `nil` means
    /// still open/ongoing (the current phase). Mirrors `goalPhase.js`'s
    /// `completedAt`.
    var completedAt: String?
}

/// Mirrors `src/domain/models/goal.js`'s persisted shape, same field
/// selection rationale as `CanonicalGoalPhase` above. A Goal with an empty
/// `phases` array (e.g. the completed "Visible Abs" goal, which has no
/// phase split in product data) resolves to goal-only attribution — the
/// same "implicit single phase" compatibility `resolveGoalPhases`
/// (`goalPhase.js`) already establishes server-side.
struct CanonicalGoal: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var title: String
    var status: String
    var startDate: String
    /// `nil` = open-ended (the current active Goal). Mirrors `goal.js`'s
    /// `targetDate`.
    var targetDate: String?
    var phases: [CanonicalGoalPhase]
}

/// `resolveGoalPhaseOwnership`'s return shape, field-for-field —
/// `matchedBy` mirrors the server's own `"phase_interval" | "goal_only"`
/// literal strings so a future live API response can decode directly into
/// this type with no field renaming.
struct GoalPhaseAttribution: Codable, Equatable, Sendable {
    var goalId: String
    var goalTitle: String
    var goalStatus: String
    var phaseId: String?
    var phaseName: String?
    var phaseOrder: Int?
    var matchedBy: String
}

/// The resolver itself — a line-for-line Swift port of
/// `GoalPhaseChronologyReadService.resolveGoalPhaseOwnership`
/// (`claude/server-evidence-chronology` branch,
/// `src/domain/services/GoalPhaseChronologyReadService.js`). Kept as its own
/// enum (distinct from `EvidenceChronology` below) to make that
/// server-parity relationship explicit: this is the ported algorithm, not
/// Evidence-specific presentation logic.
enum GoalPhaseChronology {
    /// Assumes non-overlapping Goal windows (one Goal completes before the
    /// next begins) — true for every Goal in current product data, exactly
    /// as documented server-side.
    static func resolveOwnership(goals: [CanonicalGoal], occurrenceDate: String) -> GoalPhaseAttribution? {
        let date = String(occurrenceDate.prefix(10))
        for goal in goals {
            guard date >= goal.startDate else { continue }
            if let targetDate = goal.targetDate, date > targetDate { continue }

            let phases = goal.phases.sorted { $0.order < $1.order }
            guard !phases.isEmpty else { return goalOnlyAttribution(goal) }

            for (index, phase) in phases.enumerated() {
                guard date >= phase.startDate else { continue }

                // `completedAt` is the last day still owned by this phase
                // (inclusive) — the transition takes effect the following
                // calendar day. Falling back to the next phase's own start
                // date is exclusive instead: that phase begins owning dates
                // starting on its own start day.
                if let completedAt = phase.completedAt {
                    if date > completedAt { continue }
                } else if let nextPhase = phases[safe: index + 1], date >= nextPhase.startDate {
                    continue
                }

                return GoalPhaseAttribution(
                    goalId: goal.id, goalTitle: goal.title, goalStatus: goal.status,
                    phaseId: phase.id, phaseName: phase.name, phaseOrder: phase.order,
                    matchedBy: "phase_interval"
                )
            }

            // Inside the Goal's own window but before any phase's own
            // start — attribute to the Goal rather than dropping the record.
            return goalOnlyAttribution(goal)
        }
        return nil
    }

    private static func goalOnlyAttribution(_ goal: CanonicalGoal) -> GoalPhaseAttribution {
        GoalPhaseAttribution(
            goalId: goal.id, goalTitle: goal.title, goalStatus: goal.status,
            phaseId: nil, phaseName: nil, phaseOrder: nil, matchedBy: "goal_only"
        )
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

// MARK: - Scope selection (what the user has picked in the selector)

/// What a Founder can select in the shared scope selector: a whole Goal
/// (every Phase it contains), one specific Phase within a Goal, or "All"
/// history. There is no flat, hardcoded 2-goal enum anymore — options are
/// generated from `EvidenceChronology.canonicalGoals`, so a third goal or a
/// re-phased goal needs no Swift code change, only a fixture/data change.
enum EvidenceScopeSelection: Codable, Equatable, Hashable, Sendable {
    case goal(goalId: String)
    case phase(goalId: String, phaseId: String)
    case all

    /// The Goal this selection is scoped within, if any — used to decide
    /// which Goal's Phases (if it has more than one) should appear as a
    /// contextual secondary pill row.
    var focusedGoalID: String? {
        switch self {
        case .goal(let goalId): goalId
        case .phase(let goalId, _): goalId
        case .all: nil
        }
    }

    /// Stable string identity for a `TrainingScopeOption.id` pill — parsed
    /// back via `init(pillID:)`. `"all"` / `"goal:<id>"` / `"phase:<goalId>:<phaseId>"`.
    var pillID: String {
        switch self {
        case .all: "all"
        case .goal(let goalId): "goal:\(goalId)"
        case .phase(let goalId, let phaseId): "phase:\(goalId):\(phaseId)"
        }
    }

    init?(pillID: String) {
        if pillID == "all" { self = .all; return }
        let parts = pillID.split(separator: ":", maxSplits: 2).map(String.init)
        if parts.count == 2, parts[0] == "goal" { self = .goal(goalId: parts[1]); return }
        if parts.count == 3, parts[0] == "phase" { self = .phase(goalId: parts[1], phaseId: parts[2]); return }
        return nil
    }
}

// MARK: - Presentation projection (what a screen actually displays)

/// The display projection of a `GoalPhaseAttribution` carried on a
/// historical Evidence record — computed centrally by each Fixture API's
/// fetch methods from the record's own occurrence date, never recomputed
/// per screen. This is the concrete fix for Training's reported bug:
/// Training's day/session detail screens carried zero Goal/Phase
/// attribution on their records at all (verified directly against
/// `TrainingReadService.getDay`/session lookup — no `goalId`/`phaseId`
/// field existed anywhere on those projections); those screens now display
/// this.
struct EvidenceScopeAttribution: Codable, Equatable, Sendable {
    var goalId: String
    var goalTitle: String
    var phaseId: String?
    var phaseName: String?

    /// "Build Lean Mass · Lean Mass Build" when a Phase is known, otherwise
    /// just the Goal title ("Visible Abs" — that goal has no Phase split in
    /// product data).
    var label: String {
        if let phaseName { return "\(goalTitle) · \(phaseName)" }
        return goalTitle
    }
}

// MARK: - Shared resolver Evidence verticals call

enum EvidenceCanonicalGoalID {
    /// Fixture goal ids — non-private, illustrative values matching this
    /// port's task brief ("Use non-private fixture values"), not the real
    /// founder's opaque, dynamically-suffixed live goal id
    /// (`goal_transition_live_goal_visible_abs_at_rest_<generated>`,
    /// confirmed by source audit not to be a stable literal).
    static let visibleAbs = "goal-visible-abs"
    static let buildLeanMass = "goal-build-lean-mass"
}

/// The shared entry point every Evidence vertical's fixture-backed API
/// calls — loads `canonicalGoals` once from the bundled fixture (standing
/// in for the not-yet-wired `GoalPhaseChronologyReadService` read
/// capability), then wraps `GoalPhaseChronology.resolveOwnership` for
/// attribution, builds the scope-selector contract, and filters records by
/// selection. No screen and no vertical's API talks to
/// `GoalPhaseChronology`/`canonicalGoals` directly — everything goes
/// through here, so there is exactly one chronology system, not two.
enum EvidenceChronology {
    /// Loaded once from `EvidenceChronologyFixture.json` — the fixture
    /// mirror of what `GoalPhaseChronologyReadService`'s eventual live API
    /// response would return. Ordered newest-active-goal-first (Build Lean
    /// Mass, then the completed Visible Abs), matching
    /// `GoalsHubReadService.js`'s own `[activeGoal, ...completedGoals]`
    /// ordering (`GoalsHubReadModel.orderedGoals` already established this
    /// convention in `GoalsReadModel.swift`).
    static let canonicalGoals: [CanonicalGoal] = loadCanonicalGoals()

    private static func loadCanonicalGoals() -> [CanonicalGoal] {
        guard
            let url = Bundle.main.url(forResource: "EvidenceChronologyFixture", withExtension: "json"),
            let data = try? Data(contentsOf: url),
            let decoded = try? JSONDecoder().decode([CanonicalGoal].self, from: data)
        else { return [] }
        return decoded
    }

    /// Resolves which canonical Goal (and Phase, where applicable) a
    /// record's occurrence date belongs to, for display (e.g. the
    /// attribution chip on a Training Day/Session or Nutrition Day detail
    /// screen). `nil` when the date is outside every known Goal window —
    /// there is no third historical goal in product data to fall back to,
    /// so an out-of-window record is honestly unattributed rather than
    /// mis-attributed to whichever Goal happens to be current.
    static func attribution(forOccurrenceDate occurrenceDate: String, goals: [CanonicalGoal] = canonicalGoals) -> EvidenceScopeAttribution? {
        guard let resolved = GoalPhaseChronology.resolveOwnership(goals: goals, occurrenceDate: occurrenceDate) else { return nil }
        return EvidenceScopeAttribution(
            goalId: resolved.goalId, goalTitle: resolved.goalTitle,
            phaseId: resolved.phaseId, phaseName: resolved.phaseName
        )
    }

    /// Does `occurrenceDate` fall under the given scope selection? `.all`
    /// matches unconditionally — including a date that predates every known
    /// Goal, since "All" means the complete, un-narrowed history, not "every
    /// date that happens to resolve to a Goal."
    static func matches(_ occurrenceDate: String, scope: EvidenceScopeSelection, goals: [CanonicalGoal] = canonicalGoals) -> Bool {
        if case .all = scope { return true }
        guard let resolved = GoalPhaseChronology.resolveOwnership(goals: goals, occurrenceDate: occurrenceDate) else { return false }
        switch scope {
        case .all: return true
        case .goal(let goalId): return resolved.goalId == goalId
        case .phase(let goalId, let phaseId): return resolved.goalId == goalId && resolved.phaseId == phaseId
        }
    }

    /// The one shared filtering entry point every vertical's fixture-backed
    /// API calls instead of writing its own scope `.filter` — mirrors the
    /// real web behavior that only a stream's *day/entry list* narrows by
    /// scope, never its unscoped fields (current protocol, library/
    /// reporting links, related goals, "Latest ___" card).
    static func filter<T>(_ records: [T], scope: EvidenceScopeSelection, goals: [CanonicalGoal] = canonicalGoals, date: (T) -> String) -> [T] {
        if case .all = scope { return records }
        return records.filter { matches(date($0), scope: scope, goals: goals) }
    }

    /// Builds the pill-selector contract (`TrainingScopeContext`) for a
    /// given vertical and current selection. The top-level row is one pill
    /// per Goal (ordered as in `canonicalGoals`) plus "All ___"
    /// (per-vertical label). When the focused Goal (the selected Goal, or
    /// the Goal owning the selected Phase) has more than one canonical
    /// Phase, a secondary `phaseOptions` row exposes that Goal's Phases —
    /// "a selected Goal may expose its Phases contextually" rather than
    /// flattening every Goal and Phase into one row. A Goal with 0 or 1
    /// Phase (e.g. the un-phased "Visible Abs") never grows a phase row.
    static func scopeContext(
        selected: EvidenceScopeSelection,
        allLabel: String,
        goals: [CanonicalGoal] = canonicalGoals
    ) -> TrainingScopeContext {
        var options = goals.map { goal in
            TrainingScopeOption(id: EvidenceScopeSelection.goal(goalId: goal.id).pillID, label: goal.title, selected: selected.focusedGoalID == goal.id)
        }
        options.append(TrainingScopeOption(id: EvidenceScopeSelection.all.pillID, label: allLabel, selected: { if case .all = selected { true } else { false } }()))

        var phaseOptions: [TrainingScopeOption] = []
        if let focusedGoalID = selected.focusedGoalID, let goal = goals.first(where: { $0.id == focusedGoalID }), goal.phases.count > 1 {
            phaseOptions = goal.phases.sorted { $0.order < $1.order }.map { phase in
                let pill = EvidenceScopeSelection.phase(goalId: goal.id, phaseId: phase.id)
                let isSelected: Bool = { if case .phase(let g, let p) = selected { g == goal.id && p == phase.id } else { false } }()
                return TrainingScopeOption(id: pill.pillID, label: phase.name, selected: isSelected)
            }
        }

        return TrainingScopeContext(options: options, phaseOptions: phaseOptions, dateRangeLabel: dateRangeLabel(selected: selected, goals: goals))
    }

    /// `"Complete history"` for `.all`, otherwise a formatted
    /// `start → end`/`start → Present` range over the selection's real
    /// canonical boundary dates (a whole Goal's `[startDate, targetDate]`,
    /// or one Phase's `[startDate, completedAt]`).
    static func dateRangeLabel(selected: EvidenceScopeSelection, goals: [CanonicalGoal] = canonicalGoals) -> String {
        switch selected {
        case .all:
            return "Complete history"
        case .goal(let goalId):
            guard let goal = goals.first(where: { $0.id == goalId }) else { return "Complete history" }
            return formatRange(start: goal.startDate, end: goal.targetDate)
        case .phase(let goalId, let phaseId):
            guard let goal = goals.first(where: { $0.id == goalId }), let phase = goal.phases.first(where: { $0.id == phaseId }) else {
                return "Complete history"
            }
            return formatRange(start: phase.startDate, end: phase.completedAt)
        }
    }

    private static func formatRange(start: String, end: String?) -> String {
        let startLabel = TrainingDateFormatting.short(start)
        let endLabel = end.map(TrainingDateFormatting.short) ?? "Present"
        return "\(startLabel) → \(endLabel)"
    }
}
