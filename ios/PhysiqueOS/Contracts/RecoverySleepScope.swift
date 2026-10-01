import Foundation

/// Goal-context time blocking for Recovery / Sleep Evidence. Display and
/// time filtering only: it narrows which already-quarantined Evidence nights
/// are shown and has no strategic meaning. Historical Sleep stays permanently
/// excluded from Goals, Confidence, Briefings and V3.
enum RecoverySleepScope: String, CaseIterable, Identifiable, Sendable {
    case buildLeanMass = "build-lean-mass"
    case visibleAbs = "visible-abs"
    case all

    var id: String { rawValue }

    /// Same pill identity the other Evidence verticals use.
    var pillID: String { self == .all ? "all" : "goal:\(rawValue)" }

    init?(pillID: String) {
        if pillID == "all" { self = .all; return }
        guard pillID.hasPrefix("goal:"), let scope = Self(rawValue: String(pillID.dropFirst(5))), scope != .all else { return nil }
        self = scope
    }

    var label: String {
        switch self {
        case .buildLeanMass: "Build Lean Mass"
        case .visibleAbs: "Visible Abs"
        case .all: "All Sleep"
        }
    }

    /// The Server's own context id for this Goal (`context=` on Native reads).
    var isGoal: Bool { self != .all }
}

/// A canonical Goal's own date window as the Server reports it
/// (`context.startDate` / `context.endDate`). `endDate == nil` means open.
struct RecoverySleepGoalWindow: Equatable, Sendable {
    let startDate: String?
    let endDate: String?
}

/// The bounded date range a scope resolves to once intersected with the
/// available Sleep Evidence (Evidence start through today). Every Sleep read
/// is requested only inside this range.
struct RecoverySleepScopeRange: Equatable, Hashable, Sendable {
    let scope: RecoverySleepScope
    let startDate: String
    let endDate: String
    /// `true` when the Goal's dates and the available Evidence do not overlap;
    /// no read is made.
    let isEmpty: Bool
    /// The range ends today (the Goal is still running, or "All").
    let isCurrent: Bool
    /// The canonical Goal start (for the date label); nil for All.
    let goalStartDate: String?

    var dateLabel: String {
        if isEmpty { return "No Sleep Evidence in this Goal's dates" }
        let start = TrainingDateFormatting.short(startDate)
        return "\(start) → \(isCurrent ? "Present" : TrainingDateFormatting.short(endDate))"
    }
}

enum RecoverySleepScopeResolver {
    static func resolve(
        scope: RecoverySleepScope,
        goalWindow: RecoverySleepGoalWindow?,
        evidenceStart: String = RecoverySleepQuery.evidenceStartSleepDay,
        today: String
    ) -> RecoverySleepScopeRange {
        let floor = min(evidenceStart, today)
        guard scope.isGoal else {
            return RecoverySleepScopeRange(scope: scope, startDate: floor, endDate: today, isEmpty: false, isCurrent: true, goalStartDate: nil)
        }
        let goalStart = goalWindow?.startDate
        let start = max(goalStart ?? floor, floor)
        let end = min(goalWindow?.endDate ?? today, today)
        let empty = goalWindow == nil || start > end
        return RecoverySleepScopeRange(
            scope: scope, startDate: start, endDate: end, isEmpty: empty,
            isCurrent: !empty && end == today, goalStartDate: goalStart
        )
    }
}

// MARK: - Session store

/// The selected Goal scope plus the canonical Goal windows, shared by the
/// Recovery landing, Trends and the night-history sheet so one selection
/// applies coherently across them. In-memory only: it resets to "All Sleep"
/// on relaunch and whenever the native authority changes.
@Observable
final class RecoverySleepScopeStore {
    enum WindowsState: Equatable, Sendable { case idle, loading, loaded, failed }

    private(set) var selected: RecoverySleepScope = .all
    private(set) var windows: [RecoverySleepScope: RecoverySleepGoalWindow] = [:]
    private(set) var windowsState: WindowsState = .idle
    private var windowsAuthority: String?
    private var inflight: Task<Void, Never>?

    func select(_ scope: RecoverySleepScope) {
        selected = scope
    }

    /// Loads the canonical Goal windows once per authority. Goal selection
    /// needs them; "All Sleep" never does.
    @MainActor
    func loadWindows(api: RecoverySleepAPI, authority: String) async {
        if windowsAuthority != authority {
            // A different authority invalidates the selection; the very first
            // load keeps whatever the Founder already tapped.
            if windowsAuthority != nil { selected = .all }
            windowsAuthority = authority
            windows = [:]
            windowsState = .idle
        }
        guard windowsState == .idle || windowsState == .failed else {
            // A second caller (another scope tap, Trends opening) waits for the
            // read already in flight instead of returning with no dates.
            if windowsState == .loading { await inflight?.value }
            return
        }
        windowsState = .loading
        // Unstructured so cancelling the first caller's task never fails the
        // shared read.
        let task = Task { @MainActor in
            do {
                windows = try await api.fetchGoalWindows()
                windowsState = .loaded
            } catch {
                windowsState = .failed
            }
        }
        inflight = task
        await task.value
    }

    /// The bounded range for the current selection; nil while a Goal is
    /// selected but its dates are not known (loading or failed).
    func range(today: String) -> RecoverySleepScopeRange? {
        let scope = selected
        if scope.isGoal {
            guard windowsState == .loaded, let window = windows[scope] else { return nil }
            return RecoverySleepScopeResolver.resolve(scope: scope, goalWindow: window, today: today)
        }
        return RecoverySleepScopeResolver.resolve(scope: .all, goalWindow: nil, today: today)
    }

    /// The pill selector contract the other Evidence verticals already use.
    func scopeContext(today: String) -> TrainingScopeContext {
        let label: String
        if let range = range(today: today) {
            label = range.dateLabel
        } else {
            switch windowsState {
            case .failed: label = "Goal dates could not be loaded"
            default: label = "Loading Goal dates…"
            }
        }
        return TrainingScopeContext(
            options: RecoverySleepScope.allCases.map {
                TrainingScopeOption(id: $0.pillID, label: $0.label, selected: $0 == selected)
            },
            dateRangeLabel: label
        )
    }
}
