import Foundation

/// Loads the Home read model through the injected `HomeAPI` seam and holds
/// it for `HomeView`. No caching, retry, or offline behavior is
/// implemented here — Stage 1 is online-authoritative and this is a
/// fixture load, not production networking (see
/// docs/PHYSIQUEOS_NATIVE_V1.md, section 25).
@Observable
@MainActor
final class HomeViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(HomeReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: HomeAPI
    /// The shared Priority engine — `todaysFocus` is computed from here,
    /// not from the static Home fixture, so it can never drift from what
    /// the Priority detail screen and Morning Check-In show for the same
    /// occurrence ids (see `PriorityReadModel.swift`'s doc comment).
    private let priorityStore: LoggingSandboxStore
    /// The shared Goals engine — after a fixture Goal Transition, the
    /// active primary goal's identity can change (a new goal id replaces
    /// the completed one). Home's primary Goal row is projected from here
    /// rather than the static Home fixture so it never points at a goal
    /// id that no longer exists.
    private let goalsSandboxStore: GoalsSandboxStore
    /// The same Briefing fixture provider History and Detail read through —
    /// Home's briefing card is a *projection* over that one published
    /// collection (`latestForHome`), never a second Home-only Briefing
    /// fixture (see `BriefingSandboxStore.swift`'s doc comment).
    private let briefingStore: BriefingSandboxStore
    private let appliesSandboxProjections: Bool

    init(
        api: HomeAPI,
        priorityStore: LoggingSandboxStore,
        goalsSandboxStore: GoalsSandboxStore,
        briefingStore: BriefingSandboxStore,
        appliesSandboxProjections: Bool = true
    ) {
        self.api = api
        self.priorityStore = priorityStore
        self.goalsSandboxStore = goalsSandboxStore
        self.briefingStore = briefingStore
        self.appliesSandboxProjections = appliesSandboxProjections
    }

    func load(now: Date = Date()) async {
        do {
            var home = try await api.fetchHome()
            if appliesSandboxProjections {
                home.todaysFocus = Self.visiblePriorities(priorityStore.todaysPriorities(now: now))
                if let activeGoal = goalsSandboxStore.hub.activeGoal {
                    home.goals = Self.projectGoals(home.goals, from: activeGoal)
                }
                home.briefingCards = Self.projectBriefingCards(from: briefingStore.latestForHome(now: now))
            }
            state = .loaded(home)
        } catch {
            state = .failed("Home could not be loaded.")
        }
    }

    /// Re-reads only `todaysFocus` from the shared store — called after a
    /// Home inline completion so the tapped row's state updates without a
    /// full re-fetch of the rest of Home.
    func refreshTodaysFocus(now: Date = Date()) {
        guard case .loaded(var home) = state else { return }
        home.todaysFocus = Self.visiblePriorities(priorityStore.todaysPriorities(now: now))
        state = .loaded(home)
    }

    /// Once `priority.complete.v1` has durably committed, the successful
    /// write is authoritative. Remove that occurrence immediately, then
    /// reconcile Home in the background without turning a later read
    /// outage into a false "completion failed" state.
    func reconcileAfterConfirmedPriorityCompletion(occurrenceID: String) async {
        guard case .loaded(var current) = state else { return }
        current.todaysFocus.removeAll { $0.id == occurrenceID }
        state = .loaded(current)
        do {
            state = .loaded(try await api.fetchHome())
        } catch {
            // Preserve the acknowledged canonical success. Pull-to-refresh
            // remains available for later reconciliation.
        }
    }

    /// Replaces the identity (`id`/`title`/`destination`) of whichever
    /// Home goal row is presented as `.primary` with the Goals engine's
    /// current active goal — everything else about that row (icon, color,
    /// and the numeric current/target/unit display) stays as the Home
    /// fixture already renders it, since a brand-new transitioned goal
    /// has no evidence-derived numbers of its own yet and Home does not
    /// compute those independently.
    nonisolated static func projectGoals(_ goals: [HomeGoal], from activeGoal: GoalSummaryReadModel) -> [HomeGoal] {
        guard let index = goals.firstIndex(where: { if case .primary = $0.presentation { true } else { false } }) else { return goals }
        var updated = goals
        updated[index].id = activeGoal.id
        updated[index].title = activeGoal.title
        updated[index].destination = activeGoal.destination
        for candidateIndex in updated.indices {
            if case .supporting = updated[candidateIndex].presentation {
                updated[candidateIndex].destination = activeGoal.destination
            }
        }
        return updated
    }

    nonisolated static func visiblePriorities(_ priorities: [PriorityOccurrence]) -> [PriorityOccurrence] {
        priorities.filter { !$0.completed }
    }

    /// Home shows exactly one Briefing card — whichever artifact
    /// `latestForHome` selects (the same Monthly-collision-precedence
    /// projection History's own artifacts feed from), never a
    /// Home-specific duplicate. `nil` yields an empty list, matching
    /// `HomeReadModel.hasBriefingCards`'s existing "hide the section if
    /// there's nothing to show" contract.
    private static func projectBriefingCards(from briefing: BriefingReadModel?) -> [HomeBriefingCard] {
        guard let briefing else { return [] }
        // Verified real copy (`mapBriefingCard`, `HomeBriefingService.js`):
        // an active `.event` artifact's Home card always reads
        // "DEXA Analysis Ready" or "Progress Photo Analysis Ready" (by
        // trigger type) under an "Event Briefing" section label — fixed
        // copy, not the artifact's own hero title (unlike every other
        // cadence, which does use its own hero text on Home).
        let sectionLabel = briefing.cadence == .event ? "Event Briefing" : briefing.cadence.label
        let title: String = switch briefing.cadence {
        case .event: briefing.dexa != nil ? "DEXA Analysis Ready" : "Progress Photo Analysis Ready"
        default: briefing.historyTitle
        }
        let prompt: String = switch briefing.cadence {
        case .weekly: briefing.weekly?.heroBody ?? ""
        case .midweek: briefing.midweek?.heroSummary ?? ""
        case .monthly: briefing.monthly?.heroBody ?? ""
        case .event: briefing.dexa?.hero.body ?? briefing.photo?.heroBody ?? ""
        case .daily: ""
        }
        return [
            HomeBriefingCard(
                id: briefing.id,
                sectionLabel: sectionLabel,
                title: title,
                prompt: prompt,
                createdAt: briefing.generatedAt,
                destination: .briefingDetail(briefingId: briefing.id)
            )
        ]
    }
}
