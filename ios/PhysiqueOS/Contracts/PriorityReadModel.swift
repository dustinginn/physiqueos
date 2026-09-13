import Foundation

/// Native transport mirror of the web's real ownership chain: **Goal →
/// Operating Plan → Execution Item → Priority occurrence → completion/skip/
/// note → Morning Check-In/Home/history.** Verified directly against
/// source for this task (`src/domain/models/executionItem.js`,
/// `src/domain/services/ExecutionPriorityProjectionService.js`,
/// `src/domain/services/DailyFocusService.js`,
/// `src/domain/services/MorningPriorityReconciliationService.js`,
/// `src/domain/services/PriorityDetailService.js`).
///
/// **A Priority is not a persisted entity.** It is a computed occurrence
/// view over `(ExecutionItem × calendar date)`, projected fresh every read
/// by `projectExecutionPriority()` on the server — never a stored row with
/// its own identity. This file mirrors that: `ExecutionItemFixture` is the
/// one canonical source (cadence, schedule, Goal link); `PriorityOccurrence`
/// is the derived, non-persisted view `PriorityOccurrenceCalculator`
/// produces from it. Completion is the one piece of real, persisted state
/// (mirroring the server's `Reminder.completedAt`/`completionHistory`);
/// skip/note dispositions persist too, but as a reconciliation record keyed
/// by occurrence, not as a field on the execution item itself (mirroring
/// `DailyCheckIn.reconciliation[]`, which never touches the Reminder/
/// execution-item record). No independent "Priority" business model exists
/// here — Home, the Priority detail screen, and Morning Check-In all read
/// and write through this exact same occurrence/completion contract.
///
/// The web itself has **no dedicated Priorities landing page** (confirmed
/// absent by this task's own route audit — `src/app/priorities/page.js`
/// does not exist, and the 5-tab bottom nav has no Priorities entry) —
/// Home's "Today's Priorities" section *is* the live Priorities-for-today
/// surface; the only other real route is `/priorities/[priorityId]`
/// (detail/action). This file's models serve both.

// MARK: - Canonical execution item (Operating Plan's own real domain object)

/// `cadence.type` — verified exhaustively from
/// `validateExecutionItem`/`scheduleAppliesOnDate`. `scheduledDate` (DEXA's
/// real cadence: `cadence.type: "scheduled_date"`) is modeled as its own
/// case rather than forced through the weekday/interval logic
/// `scheduleAppliesOnDate` uses for the other four types, since the server
/// source shown does not route `scheduled_date` through that function —
/// this is the minimal, honest reading of the confirmed real cadence value,
/// not a guess at unseen server internals.
enum ExecutionCadenceType: String, Codable, Equatable {
    case daily
    case weekly
    case specificWeekdays = "specific_weekdays"
    case everyXDays = "every_x_days"
    case scheduledDate = "scheduled_date"
}

struct ExecutionCadence: Codable, Equatable {
    var type: ExecutionCadenceType
    /// `every_x_days`' own interval, when it differs from
    /// `schedule.intervalDays` — `scheduleAppliesOnDate` reads
    /// `cadence?.interval ?? schedule.intervalDays ?? schedule.interval ?? 1`
    /// in that order; this fixture always sets `schedule.intervalDays`
    /// directly and leaves this `nil`, matching the simpler of the two
    /// equally-valid real inputs.
    var interval: Int? = nil
}

/// Mirrors the execution item's `preferredSchedule`/schedule fields exactly
/// (`daysOfWeek`, `timeOfDay`, `intervalDays`, `anchorDate`, `startDate`,
/// `endDate`) plus `scheduledDate` for the one `.scheduledDate`-cadence
/// case (DEXA). `daysOfWeek` uses the server's own lowercase weekday
/// strings (`"sunday"`...`"saturday"`, `getWeekday()`), not a Swift
/// `Calendar` weekday index, so `PriorityOccurrenceCalculator` can compare
/// them directly without a translation step that could silently drift.
struct ExecutionSchedule: Codable, Equatable {
    var daysOfWeek: [String] = []
    /// `"morning" | "afternoon" | "evening" | "night" | "HH:mm"` — the
    /// exact vocabulary `getPreferredHour`/`formatTimeOfDayLabel` accept.
    var timeOfDay: String? = nil
    var intervalDays: Int? = nil
    /// `every_x_days`' cycle anchor — falls back to `startDate` when absent,
    /// mirroring `scheduleAppliesOnDate`'s own `schedule.anchorDate ??
    /// schedule.startDate`.
    var anchorDate: String? = nil
    var startDate: String? = nil
    var endDate: String? = nil
    /// `.scheduledDate` cadence only (e.g. DEXA's booked scan date).
    var scheduledDate: String? = nil
}

/// `completionMethod` — verified real values from the founder seed:
/// `"manual"` (Foam Rolling), `"manual_confirmation"` (peptide doses),
/// `"canonical_evidence"` (Morning Weigh-In/Progress Photos/DEXA — these
/// complete automatically once matching Evidence exists, never via a tap).
enum ExecutionCompletionMethod: String, Codable, Equatable {
    case manual
    case manualConfirmation = "manual_confirmation"
    case canonicalEvidence = "canonical_evidence"
}

/// The one canonical source: an Operating Plan execution item. Mirrors
/// `executionItem.js`'s real field set (id, type, title, cadence, active,
/// `linkedGoalIds`, `completionMethod`, `reminderPreference`, `notes`) —
/// every real id below (`execution_morning_weigh_in`, `execution_foam_roll`,
/// `execution_retatrutide`, `execution_tesamorelin`,
/// `execution_progress_photos`, `execution_dexa`) is copied verbatim from
/// `src/data/founderSeed/executionItems.js`, not invented. "Fadogia" is
/// **not** a real execution item — confirmed absent from source during this
/// task's own audit — and is deliberately not included here.
struct ExecutionItemFixture: Codable, Equatable, Identifiable {
    var id: String
    /// `"evidence" | "recovery" | "protocol"` — real `type` values.
    var type: String
    var title: String
    /// Presentation subtitle/context shown on the occurrence row and detail
    /// screen (e.g. a peptide's dose text, a supplement's dose+unit) —
    /// server-composed text in the real product; fixtured verbatim here,
    /// never recomputed.
    var contextDetail: String?
    var completionMethod: ExecutionCompletionMethod
    var cadence: ExecutionCadence
    var schedule: ExecutionSchedule
    var active: Bool = true
    /// Soft FK — real execution items reference a Goal by id array, never a
    /// strict `phaseId` (confirmed by source audit: no `phaseId` field
    /// exists on the real model). Phase ownership for a given occurrence
    /// date is resolved the same way every other Evidence vertical resolves
    /// it this session — `EvidenceChronology.attribution(forOccurrenceDate:)`
    /// — not a second, execution-item-specific chronology.
    var linkedGoalIds: [String] = []
    var reminderPreference: String = "remind"
    var notes: String = ""
    var icon: HomeFocusIcon = .target
    var color: HomeColorToken = .primary
    /// `priority.completable` — false for items whose detail-page action is
    /// "Continue"/"View Execution" rather than "Mark Complete" (mirrors
    /// `PriorityDetailScreen.jsx`'s own `completable` branch). `true` for
    /// every execution item in this pass; kept explicit rather than always
    /// assumed, matching the real read model's own boolean.
    var completable: Bool = true
    /// The non-completable action's label/destination, when `completable`
    /// is `false`. `nil` for every completable item.
    var continueActionLabel: String? = nil
    var continueActionDestination: AppDestination? = nil
}

// MARK: - Priority occurrence (derived, non-persisted — the view every screen reads)

/// `getPriorityState()`'s own three named states, ported verbatim
/// (`hour < preferredHour - 1` → upcoming, `hour > preferredHour + 2` →
/// overdue, else available) — presentation-only, recomputed from the
/// current hour, never persisted.
enum PriorityUrgency: String, Codable, Equatable {
    case upcoming
    case available
    case overdue
}

/// The completion-write context a dosed/protocol occurrence's completion
/// carries — mirrors the real hidden form fields
/// (`occurrenceDate`/`dose`/`protocolId`) `completePriority`/
/// `completeHomePriority` submit. `nil` fields mean a plain completion
/// (`completeReminder`), matching the real server's own branch: evidence-
/// aware completion (`completeReminderFromEvidence`) only fires when
/// occurrenceDate, dose, AND protocolId are all present.
struct PriorityCompletionContext: Codable, Equatable {
    var occurrenceDate: String
    var dose: String?
    var protocolId: String?
}

struct PrioritySessionItem: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var completed: Bool
    var satisfiedByEvidence: Bool?
}

/// The one shared occurrence view Home, the Priority detail screen, and
/// Morning Check-In's reconciliation list all read — computed by
/// `PriorityOccurrenceCalculator.project`, never independently re-derived
/// per screen. `id` mirrors the server's own real identity rule: the linked
/// Reminder/history-anchor id when completion has ever been recorded for
/// this occurrence, otherwise the deterministic composite
/// `"execution-priority-{executionItemId}-{localDate}"` — never a random
/// UUID, so completing an occurrence on Home and re-opening it from the
/// detail screen (or seeing it again in Morning Check-In) always resolves
/// to the exact same identity.
struct PriorityOccurrence: Codable, Equatable, Identifiable {
    var id: String
    /// Canonical reminder identity used by the occurrence-bound detail
    /// resource. Completed Home rows can have a presentation/history id
    /// in `id`; routing must continue to use the server's priority id.
    var routePriorityId: String? = nil
    var executionItemId: String
    var date: String
    var title: String
    var subtitle: String?
    var metadata: String?
    var changeLabel: String?
    var icon: HomeFocusIcon
    var color: HomeColorToken
    var urgency: PriorityUrgency
    var completed: Bool
    var completable: Bool
    /// Canonical Reminder revision required by `priority.complete.v1`.
    var expectedVersion: Int? = nil
    var actionLabel: String?
    var completionContext: PriorityCompletionContext?
    /// Server-owned composite/session children, such as Morning Check-In.
    var sessionItems: [PrioritySessionItem]? = nil
    var continueActionDestination: AppDestination?
    /// Goal/Phase ownership for *this occurrence's own date* — resolved via
    /// the shared `EvidenceChronology`, never a second chronology system.
    /// `nil` when the date falls outside every known canonical Goal window,
    /// matching the same "honestly unattributed" policy every other
    /// Evidence vertical this session already established.
    var attributedScope: EvidenceScopeAttribution? = nil
    /// Founder Production only — the real `priority` resource's full
    /// `sections[]` (What/When/Why it matters/Related Goals/Completion,
    /// though not every variant sends every section — `getPriorityDetail`
    /// never guarantees a fixed set). `nil` under Sandbox, which has no
    /// wire equivalent to decode from and keeps using `metadata` directly.
    /// Native renders every section verbatim rather than assuming a fixed
    /// four-section shape or re-deriving any of it (a section's own
    /// `label`/`detail` already carries the server's fully-formatted text
    /// — including any real scheduled clock time — so Native never
    /// invents a time from a daypart word like "Tonight").
    var detailSections: [PrioritySectionReadModel]? = nil
    /// Founder Production's exact server-resolved Weight relationship for
    /// this Morning Check-In occurrence. It is intentionally occurrence-
    /// bound and never populated from a generic latest/today read.
    var relatedWeight: PriorityRelatedWeight? = nil

    var destination: AppDestination {
        if sessionItems != nil, id == "morning-check-in" {
            return .checkIn(checkInType: "morning")
        }
        if Self.isMorningWeighIn(executionItemId: executionItemId, id: id), !completed {
            return .checkIn(checkInType: "morning")
        }
        return .priorityOccurrence(priorityId: routePriorityId ?? id, occurrenceDate: date)
    }

    /// Checked against both `executionItemId` and `id` because the exact
    /// field the real `home` resource uses for this comparison was only
    /// verified against founder-seed fixture data, not confirmed live
    /// production wire data (see `ExecutionItemFixture`'s doc comment) —
    /// matching either the fixture-verified id or the server's own
    /// canonical `reminder_morning_weight` constant
    /// (`MORNING_WEIGH_IN_REMINDER_ID`) avoids silently falling through to
    /// generic Priority Detail if production sends the other one.
    static func isMorningWeighIn(executionItemId: String, id: String) -> Bool {
        let candidates: Set<String> = ["execution_morning_weigh_in", "reminder_morning_weight"]
        return candidates.contains(executionItemId) || candidates.contains(id)
    }
}

struct PriorityRelatedWeight: Codable, Equatable {
    var canonicalId: String
    var date: String
    var value: Double
    var unit: String
    var version: Int?
}

/// One `priority` resource `sections[]` entry (`PriorityDetailService.js`).
/// Titles vary by priority type and are NOT guaranteed present (the plain
/// reminder path has no "Why it matters"; the unresolved-id fallback has
/// only "Why it matters") — Native renders whatever arrives, in order,
/// rather than assuming a fixed set.
struct PrioritySectionReadModel: Codable, Equatable, Identifiable {
    var id: String { title }
    var title: String
    var items: [PriorityDetailFieldReadModel]
}

struct PriorityDetailFieldReadModel: Codable, Equatable, Identifiable {
    var id: String { label }
    var label: String
    var detail: String?
}

// MARK: - Completion / reconciliation records (the one real persisted state)

/// Mirrors the Reminder's own `completedAt`/`completionHistory` — the
/// canonical write every completion (from Home's inline check button, or
/// the Priority detail screen's "Mark Complete") lands on. Snapshotted at
/// write time; never rewritten by a later Operating Plan/dose change,
/// matching the real server's append-only `completionHistory` semantics.
struct PriorityCompletionRecord: Codable, Equatable {
    var occurrenceId: String
    var completedAt: String
    /// Snapshotted dose/protocol context, when the completion was
    /// evidence-aware (`completeReminderFromEvidence`) — `nil` for a plain
    /// completion (`completeReminder`), preserved exactly as the real
    /// server keeps both write shapes distinct.
    var context: PriorityCompletionContext?
}

/// `"completed" | "skipped" | "note"` — `MORNING_PRIORITY_RECONCILIATION_DISPOSITIONS`,
/// verbatim.
enum PriorityDisposition: String, Codable, CaseIterable, Identifiable, Equatable {
    case completed, skipped, note
    var id: String { rawValue }
    var label: String {
        switch self {
        case .completed: "Completed"
        case .skipped: "Skipped"
        case .note: "Add note"
        }
    }
}

/// Mirrors one `DailyCheckIn.reconciliation[]` entry, keyed by
/// `createPriorityOccurrenceKey(reminderId, occurrenceDate)` — real web
/// behavior confirmed by this task's audit: the optional note textarea is
/// always visible regardless of which disposition radio is selected, so a
/// note can accompany a Completed or Skipped disposition too, not only
/// "note" on its own.
struct PriorityReconciliationRecord: Codable, Equatable, Identifiable {
    var occurrenceId: String
    var occurrenceDate: String
    var disposition: PriorityDisposition
    var note: String

    var id: String { "\(occurrenceId)|\(occurrenceDate)" }
}
