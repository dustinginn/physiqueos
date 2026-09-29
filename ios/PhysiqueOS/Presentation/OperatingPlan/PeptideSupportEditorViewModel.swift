import Foundation

/// The one action surface behind the simplified peptide screen (design §3):
/// every row's sheet, the inline Reminder toggle, Pause/Resume and the
/// Advanced dose-plan editor go through this model, so the Server's
/// canonical rules are applied in exactly one place —
///
/// - **Change dose** (S2) sends the existing full save with
///   `dosingStrategy = stay from effectiveDate` and everything else
///   unchanged; a past date is refused here before it can reach the wire.
/// - **Days / Time / Reminder / Notes** ride `supportSchedule`,
///   `reminderPreference` and `notes`; the dosing strategy is copied
///   verbatim so the dated timeline is never touched.
/// - **Pause / Resume** (S3) use `operating-plan.peptide-lifecycle.change.v1`
///   with `If-Match = executionRevision`.
/// - After every write the model re-fetches `operating-plan-peptide-support`
///   and takes `executionRevision` from the read; it never increments it
///   locally. A 412 re-reads and explains; a 400 shows the Server's title
///   verbatim; `status: "unchanged"` is a success.
///
/// Under the sandbox authority the same actions mutate
/// `OperatingPlanSandboxStore` (which mirrors S1's history-preserving
/// composition and a local pause), so the screen behaves the same way
/// against the fixture. Production never falls back to the sandbox store.
@Observable
@MainActor
final class PeptideSupportEditorViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(PeptideSupportDetail)
        case failed(String)
    }

    /// The editable subset of the read, in the Server's own vocabulary.
    struct Draft: Equatable {
        var supportSchedule: OperatingPlanSupportScheduleReadModel
        var dosing: PeptideDosingStrategyReadModel
        var reminderPreference: OperatingPlanReminderPreference
        var notes: String

        init(_ detail: PeptideSupportDetail) {
            supportSchedule = detail.supportSchedule
            dosing = detail.dosing
            reminderPreference = detail.reminderPreference
            notes = detail.notes
        }
    }

    private(set) var state: LoadState = .loading
    private(set) var isSaving = false
    var errorMessage: String?
    /// One line shown under the lifecycle button after a change
    /// ("Resumed. Next dose Thu, Oct 1 · 9:45 PM.").
    private(set) var resultMessage: String?

    let protocolId: String
    let authority: NativeAPIEnvironment
    private let supportAPI: PeptideSupportAPI
    private let lifecycleAPI: PeptideLifecycleAPI
    private let store: OperatingPlanSandboxStore
    private let reconcileNotifications: @MainActor () async -> Void
    /// Drops the cached `operating-plan` / protocol-domain reads after a
    /// write so the landing and the domain card behind this screen re-read
    /// the Server (the pause chip, the dose, the schedule).
    private let invalidateSiblingReads: @MainActor () async -> Void
    /// Withdraws every pending and already-delivered iOS notification for
    /// the peptide's priority right after a pause is accepted, so no fired
    /// banner keeps offering "Complete" for a dose the Server now refuses
    /// (`422 PRIORITY_OCCURRENCE_PAUSED`). Runs before the horizon re-read.
    private let withdrawOccurrenceNotifications: @MainActor (String) async -> Void
    private let deviceToday: () -> String

    static let unavailableCopy = "This peptide protocol is unavailable."
    static let loadFailureCopy = "This peptide Support plan couldn't be loaded. Pull to refresh or try again."
    static let genericSaveFailureCopy = "The peptide Support plan was not saved. Refresh before retrying."
    static let pastDateCopy = "Choose today or a later date. Doses already taken are kept."

    init(
        protocolId: String,
        authority: NativeAPIEnvironment,
        supportAPI: PeptideSupportAPI,
        lifecycleAPI: PeptideLifecycleAPI,
        store: OperatingPlanSandboxStore,
        reconcileNotifications: @escaping @MainActor () async -> Void = {},
        invalidateSiblingReads: @escaping @MainActor () async -> Void = {},
        withdrawOccurrenceNotifications: @escaping @MainActor (String) async -> Void = { _ in },
        deviceToday: @escaping () -> String = { PeptideSupportPresentation.deviceToday() }
    ) {
        self.protocolId = protocolId
        self.authority = authority
        self.supportAPI = supportAPI
        self.lifecycleAPI = lifecycleAPI
        self.store = store
        self.reconcileNotifications = reconcileNotifications
        self.invalidateSiblingReads = invalidateSiblingReads
        self.withdrawOccurrenceNotifications = withdrawOccurrenceNotifications
        self.deviceToday = deviceToday
    }

    convenience init(protocolId: String, environment: AppEnvironment) {
        self.init(
            protocolId: protocolId,
            authority: environment.nativeAuthority,
            supportAPI: environment.peptideSupportAPI,
            lifecycleAPI: environment.peptideLifecycleAPI,
            store: environment.operatingPlanStore,
            reconcileNotifications: { await environment.reconcileCanonicalPriorityNotifications() },
            invalidateSiblingReads: {
                await environment.productionNativeAPI.invalidateReadResources([
                    "operating-plan", "operating-plan-protocol-domain",
                ])
            },
            withdrawOccurrenceNotifications: { priorityId in
                await PriorityNotificationScheduler.withdrawOccurrences(priorityId: priorityId)
            }
        )
    }

    // MARK: - Read

    var detail: PeptideSupportDetail? {
        if case .loaded(let detail) = state { return detail }
        return nil
    }

    /// Feature detection (design §4 deploy order): the card, sheets and
    /// Pause exist only when the Server projects `lifecycle`, `currentDose`
    /// and a revision token. Otherwise the caller shows the Build 69 editor.
    var supportsSimpleEditor: Bool { detail?.supportsSimpleEditor ?? false }
    var isPaused: Bool { detail?.isPaused ?? false }
    var name: String { detail?.name ?? "" }
    var reminderEnabled: Bool { detail?.reminderPreference == .remind }
    var hasAdvancedPlan: Bool { detail?.advancedPlan ?? false }
    var isManualPlan: Bool { detail?.dosingMode == "legacy_custom" || detail?.dosing.pattern == .custom }

    /// Today has a scheduled dose that is still open (the Server clears
    /// `nextDueDate` past a completed occurrence and while paused), so the
    /// pause flow offers "Starting: Tomorrow".
    var todayHasScheduledDose: Bool {
        guard let next = detail?.nextDueDate else { return false }
        return next == today
    }

    /// The editable read model the Advanced editor and the legacy path
    /// start from — the same shape Build 69 edited in place.
    var editableModel: OperatingPlanPeptideExecutionReadModel? {
        detail.map(Self.readModel(from:))
    }

    static func readModel(from detail: PeptideSupportDetail) -> OperatingPlanPeptideExecutionReadModel {
        OperatingPlanPeptideExecutionReadModel(
            protocolId: detail.protocolId,
            name: detail.name,
            purpose: detail.purpose,
            state: detail.state,
            supportSchedule: detail.supportSchedule,
            dosing: detail.dosing,
            timeline: detail.timeline,
            reminderPreference: detail.reminderPreference,
            notes: detail.notes,
            nextDue: detail.nextDue,
            executionRevision: detail.executionRevision,
            lifecycle: detail.lifecycle,
            currentDose: detail.currentDose,
            currentDoseLabel: detail.currentDoseLabel,
            currentPhase: detail.currentPhase,
            plannedChanges: detail.plannedChanges,
            dosingHistory: detail.dosingHistory,
            dosingMode: detail.dosingMode,
            advancedPlan: detail.advancedPlan,
            nextDueDate: detail.nextDueDate,
            nextDueTime: detail.nextDueTime,
            priorityId: detail.priorityId
        )
    }

    /// The owner's canonical local date when the read carries one; the
    /// device date only as a fallback. Used for "Today"/"Tomorrow" and the
    /// past-date guard so the screen agrees with Home.
    var today: String { detail?.localDate ?? deviceToday() }

    func load() async {
        switch authority {
        case .sandbox:
            if let execution = store.peptideExecution(protocolId: protocolId) {
                state = .loaded(PeptideSupportDetail(sandbox: execution))
            } else {
                state = .failed(Self.unavailableCopy)
            }
        case .founderProduction:
            do {
                if let detail = try await supportAPI.fetchSupport(protocolId: protocolId) {
                    state = .loaded(detail)
                } else {
                    state = .failed(Self.unavailableCopy)
                }
            } catch {
                state = .failed(Self.loadFailureCopy)
            }
        }
    }

    /// Re-reads after a write. A failed re-read keeps the last loaded
    /// detail on screen (the write itself succeeded) and says so.
    private func refresh() async {
        switch authority {
        case .sandbox:
            await load()
        case .founderProduction:
            do {
                if let detail = try await supportAPI.fetchSupport(protocolId: protocolId) {
                    state = .loaded(detail)
                } else {
                    state = .failed(Self.unavailableCopy)
                }
            } catch {
                if detail == nil { state = .failed(Self.loadFailureCopy) }
                errorMessage = Self.loadFailureCopy
            }
        }
    }

    // MARK: - Actions

    /// S2 — "keep this dose from a date". `effectiveDate` is `YYYY-MM-DD`,
    /// today or later; the Server refuses an earlier one anyway
    /// (`PEPTIDE_PLAN_REWRITES_HISTORY`), but it must never be sent.
    @discardableResult
    func changeDose(amount: Double, unit: String, effectiveDate: String) async -> Bool {
        guard let detail else { errorMessage = Self.unavailableCopy; return false }
        let unit = unit.trimmingCharacters(in: .whitespacesAndNewlines)
        guard amount > 0 else { errorMessage = "Enter a dose greater than zero."; return false }
        guard !unit.isEmpty else { errorMessage = "Enter a dose unit."; return false }
        guard PeptideSupportPresentation.isDateKey(effectiveDate), effectiveDate >= today else {
            errorMessage = Self.pastDateCopy
            return false
        }
        var draft = Draft(detail)
        draft.dosing = PeptideDosingStrategyReadModel(
            pattern: .stay,
            startingDoseAmount: amount,
            startingDoseUnit: unit,
            startDate: effectiveDate,
            stepAmount: 0, stepInterval: 1, stepUnit: .weeks,
            targetDoseAmount: 0,
            holdDuration: 1, holdUnit: .weeks,
            decreaseAmount: 0, decreaseInterval: 1, decreaseUnit: .weeks,
            landingDoseAmount: 0,
            endDate: nil
        )
        return await save(draft, rewriteHistory: false)
    }

    /// Which weekdays. Seven days is the Server's `daily` cadence; anything
    /// else is `specific_days` (the shape the Founder's records hydrate to).
    @discardableResult
    func changeDays(daysOfWeek: [OperatingPlanWeekday]) async -> Bool {
        guard let detail else { errorMessage = Self.unavailableCopy; return false }
        let ordered = OperatingPlanWeekday.allCases.filter { daysOfWeek.contains($0) }
        guard !ordered.isEmpty else { errorMessage = "Choose at least one day."; return false }
        var draft = Draft(detail)
        if ordered.count == OperatingPlanWeekday.allCases.count {
            draft.supportSchedule.frequency = .daily
            draft.supportSchedule.daysOfWeek = []
        } else {
            draft.supportSchedule.frequency = .specificDays
            draft.supportSchedule.daysOfWeek = ordered
        }
        return await save(draft, rewriteHistory: false)
    }

    @discardableResult
    func changeInterval(everyNDays interval: Int) async -> Bool {
        guard let detail else { errorMessage = Self.unavailableCopy; return false }
        guard (1...365).contains(interval) else { errorMessage = "Choose an interval between 1 and 365 days."; return false }
        var draft = Draft(detail)
        draft.supportSchedule.frequency = .everyXDays
        draft.supportSchedule.intervalDays = interval
        draft.supportSchedule.daysOfWeek = []
        return await save(draft, rewriteHistory: false)
    }

    /// Exact local clock time (`HH:mm`).
    @discardableResult
    func changeTime(_ localTime: String) async -> Bool {
        guard let detail else { errorMessage = Self.unavailableCopy; return false }
        guard localTime.range(of: #"^([01]\d|2[0-3]):[0-5]\d$"#, options: .regularExpression) != nil else {
            errorMessage = "Choose a valid time."
            return false
        }
        var draft = Draft(detail)
        draft.supportSchedule.timing = .specific
        draft.supportSchedule.specificTime = localTime
        return await save(draft, rewriteHistory: false)
    }

    @discardableResult
    func setReminder(_ enabled: Bool) async -> Bool {
        guard let detail else { errorMessage = Self.unavailableCopy; return false }
        var draft = Draft(detail)
        draft.reminderPreference = enabled ? .remind : .none
        return await save(draft, rewriteHistory: false)
    }

    @discardableResult
    func setNotes(_ notes: String) async -> Bool {
        guard let detail else { errorMessage = Self.unavailableCopy; return false }
        var draft = Draft(detail)
        draft.notes = notes
        return await save(draft, rewriteHistory: false)
    }

    /// The Advanced editor's whole-strategy save. `rewriteHistory` is sent
    /// only after that editor's explicit "Rewrites your dose history before
    /// today" confirmation.
    @discardableResult
    func advancedSave(draft model: OperatingPlanPeptideExecutionReadModel, rewriteHistory: Bool) async -> Bool {
        guard let detail else { errorMessage = Self.unavailableCopy; return false }
        var draft = Draft(detail)
        draft.supportSchedule = model.supportSchedule
        draft.dosing = model.dosing
        draft.reminderPreference = model.reminderPreference
        draft.notes = model.notes
        return await save(draft, rewriteHistory: rewriteHistory)
    }

    /// S3 pause. `effectiveDate` is resolved by the Server on the owner's
    /// canonical local date; Native only chooses today or tomorrow.
    @discardableResult
    func pause(effectiveDate: PeptideLifecycleEffectiveDate) async -> Bool {
        guard let detail else { errorMessage = Self.unavailableCopy; return false }
        guard !isSaving else { return false }
        isSaving = true
        errorMessage = nil
        resultMessage = nil
        defer { isSaving = false }
        switch authority {
        case .sandbox:
            store.setPeptidePaused(protocolId: protocolId, paused: true)
            await load()
            await invalidateSiblingReads()
            resultMessage = effectiveDate == .tomorrow ? "Paused starting tomorrow." : "Paused."
            return true
        case .founderProduction:
            guard let revision = detail.executionRevision else {
                errorMessage = "Refresh \(detail.name) before pausing it."
                return false
            }
            do {
                let result = try await lifecycleAPI.pause(protocolId: protocolId, expectedRevision: revision, effectiveDate: effectiveDate)
                // The lifecycle result names the reminder (`priorityId`);
                // the read's own `priorityId` is the fallback. Withdraw
                // first, then re-read and reconcile the horizon.
                if let priorityId = result.priorityId ?? detail.priorityId, !priorityId.isEmpty {
                    await withdrawOccurrenceNotifications(priorityId)
                }
                await refresh()
                await invalidateSiblingReads()
                await reconcileNotifications()
                resultMessage = effectiveDate == .tomorrow ? "Paused starting tomorrow." : "Paused."
                return true
            } catch {
                await handle(error, name: detail.name)
                return false
            }
        }
    }

    @discardableResult
    func resume() async -> Bool {
        guard let detail else { errorMessage = Self.unavailableCopy; return false }
        guard !isSaving else { return false }
        isSaving = true
        errorMessage = nil
        resultMessage = nil
        defer { isSaving = false }
        switch authority {
        case .sandbox:
            store.setPeptidePaused(protocolId: protocolId, paused: false)
            await load()
            await invalidateSiblingReads()
            resultMessage = resumedCopy
            return true
        case .founderProduction:
            guard let revision = detail.executionRevision else {
                errorMessage = "Refresh \(detail.name) before resuming it."
                return false
            }
            do {
                _ = try await lifecycleAPI.resume(protocolId: protocolId, expectedRevision: revision)
                await refresh()
                await invalidateSiblingReads()
                await reconcileNotifications()
                resultMessage = resumedCopy
                return true
            } catch {
                await handle(error, name: detail.name)
                return false
            }
        }
    }

    /// "Resumed. Next dose Thu, Oct 1 · 9:45 PM." plus, when a plan with
    /// future changes was frozen across the pause (S3), "Planned changes
    /// moved to Oct 15 and Oct 29." The dates are the Server's own
    /// post-resume `plannedChanges`; Native never shifts them itself.
    var resumedCopy: String {
        var lines: [String] = []
        if let next = nextDoseLabel, next != "Paused" {
            lines.append("Resumed. Next dose \(next).")
        } else {
            lines.append("Resumed.")
        }
        if hasAdvancedPlan, let changes = detail?.plannedChanges, !changes.isEmpty {
            let dates = PeptideSupportPresentation.joinDates(changes.map(\.startDate))
            lines.append("Planned change\(changes.count == 1 ? "" : "s") moved to \(dates).")
        }
        return lines.joined(separator: " ")
    }

    // MARK: - Save core

    private func save(_ draft: Draft, rewriteHistory: Bool) async -> Bool {
        guard let detail else { errorMessage = Self.unavailableCopy; return false }
        guard !isSaving else { return false }
        isSaving = true
        errorMessage = nil
        resultMessage = nil
        defer { isSaving = false }
        switch authority {
        case .sandbox:
            guard var execution = store.peptideExecution(protocolId: protocolId) else {
                errorMessage = Self.unavailableCopy
                return false
            }
            execution.supportSchedule = draft.supportSchedule
            execution.dosing = draft.dosing
            execution.reminderPreference = draft.reminderPreference
            execution.notes = draft.notes
            switch store.savePeptideExecution(execution) {
            case .success:
                await load()
                await invalidateSiblingReads()
                return true
            case .failure(let error):
                errorMessage = error.message
                return false
            }
        case .founderProduction:
            do {
                // `status == "unchanged"` is a committed no-op: a success.
                _ = try await supportAPI.save(
                    protocolId: detail.protocolId,
                    expectedRevision: detail.executionRevision,
                    supportSchedule: draft.supportSchedule,
                    dosing: draft.dosing,
                    timingContext: detail.timingContext,
                    reminderPreference: draft.reminderPreference,
                    notes: draft.notes,
                    rewriteHistory: rewriteHistory
                )
                await refresh()
                await invalidateSiblingReads()
                await reconcileNotifications()
                return true
            } catch {
                await handle(error, name: detail.name)
                return false
            }
        }
    }

    /// 412 → re-read, then explain; 400 → the Server's title verbatim;
    /// 409 → re-read (the record is not in the expected lifecycle state) and
    /// show the title; network → the transport's own copy; anything else →
    /// the Build 69 copy.
    private func handle(_ error: Error, name: String) async {
        guard let production = error as? ProductionNativeError else {
            errorMessage = Self.genericSaveFailureCopy
            return
        }
        switch production {
        case .failedPrecondition:
            await refresh()
            errorMessage = Self.updatedElsewhereCopy(name: name)
        case .validation(let problem):
            errorMessage = problem.title
        case .conflict(let problem):
            await refresh()
            errorMessage = problem.title
        case .networkFailure:
            errorMessage = production.errorDescription
        default:
            errorMessage = Self.genericSaveFailureCopy
        }
    }

    static func updatedElsewhereCopy(name: String) -> String {
        "\(name) was updated elsewhere. We refreshed it; check the value and tap Save again."
    }

    // MARK: - Presentation

    /// The Dose row: the Server-formatted label first, the structured
    /// current dose next, the active timeline phase last. `nil` means the
    /// row reads "Set a dose".
    var doseLabel: String? {
        guard let detail else { return nil }
        if let label = detail.currentDoseLabel, !label.isEmpty { return label }
        if let dose = detail.currentDose { return PeptideSupportPresentation.formatDose(dose.amount, dose.unit) }
        if let phase = detail.timeline.first(where: { $0.status == "active" }) {
            return PeptideSupportPresentation.formatDose(phase.doseAmount, phase.doseUnit)
        }
        return nil
    }

    var daysLabel: String {
        detail.map { PeptideSupportPresentation.formatDays($0.supportSchedule) } ?? ""
    }

    var timeLabel: String {
        guard let schedule = detail?.supportSchedule else { return "" }
        return schedule.timing == .specific
            ? OperatingPlanSchedulePresentation.formattedLocalTime(schedule.specificTime)
            : schedule.timing.label
    }

    /// "Today · 9:45 PM" / "Tomorrow · 9:45 PM" / "Thu, Oct 1 · 9:45 PM" /
    /// "Paused". Falls back to the Server's own `nextDue` string when only
    /// that is present. `nil` hides the row.
    var nextDoseLabel: String? {
        guard let detail else { return nil }
        if detail.isPaused { return "Paused" }
        if let formatted = PeptideSupportPresentation.formatNextDose(date: detail.nextDueDate, time: detail.nextDueTime, today: today) {
            return formatted
        }
        return detail.nextDue
    }

    var pausedSinceLabel: String? {
        guard let detail, detail.isPaused, let since = detail.lifecycle?.since else { return nil }
        return PeptideSupportPresentation.shortDate(since)
    }

    /// "2.5 mg on Oct 8" — the first future dose change, or nil.
    var plannedChangeLabel: String? {
        guard let change = detail?.plannedChanges?.first else { return nil }
        return "\(PeptideSupportPresentation.formatDose(change.dose.amount, change.dose.unit)) on \(PeptideSupportPresentation.shortDate(change.startDate))"
    }

    /// The Change-dose sheet's caption when a plan exists.
    func changeDoseCaption(amount: Double, unit: String, effectiveDate: String) -> String? {
        guard let detail, detail.dosing.pattern != .stay || !(detail.plannedChanges ?? []).isEmpty else { return nil }
        var lines = [
            "Your dose plan becomes a steady \(PeptideSupportPresentation.formatDose(amount, unit)) from \(PeptideSupportPresentation.shortDate(effectiveDate)). Doses already taken are kept.",
        ]
        let removed = (detail.plannedChanges ?? []).filter { $0.startDate >= effectiveDate }
        if !removed.isEmpty {
            let list = PeptideSupportPresentation.joinDates(removed.map(\.startDate))
            lines.append("Planned change\(removed.count == 1 ? "" : "s") on \(list) will be removed.")
        }
        return lines.joined(separator: " ")
    }

    /// The Advanced disclosure's collapsed summary ("Keep this dose since
    /// May 24" / "Increase, hold, then decrease · finished Aug 6").
    var advancedSummary: String {
        guard let detail else { return "" }
        let pattern: String
        switch detail.dosing.pattern {
        case .stay: return "Keep this dose since \(PeptideSupportPresentation.shortDate(detail.dosing.startDate))"
        case .titrateUp: pattern = "Increase step by step"
        case .titrateDown: pattern = "Decrease step by step"
        case .upHoldDown: pattern = "Increase, hold, then decrease"
        case .custom: return "Manual plan"
        }
        if let next = detail.plannedChanges?.first {
            return "\(pattern) · next change \(PeptideSupportPresentation.shortDate(next.startDate))"
        }
        if let start = detail.currentPhase?.startDate {
            return "\(pattern) · finished \(PeptideSupportPresentation.shortDate(start))"
        }
        return pattern
    }

    /// "2 mg · Aug 6 – Ongoing" per past-or-current phase, newest first.
    var dosingHistoryLines: [String] {
        guard let detail else { return [] }
        if let history = detail.dosingHistory, !history.isEmpty {
            return history.map { entry in
                let window = "\(PeptideSupportPresentation.shortDate(entry.startDate)) – \(entry.endDate.map(PeptideSupportPresentation.shortDate) ?? "Ongoing")"
                return "\(PeptideSupportPresentation.formatDose(entry.dose.amount, entry.dose.unit)) · \(window)"
            }
        }
        return detail.timeline.reversed().map { "\(PeptideSupportPresentation.formatDose($0.doseAmount, $0.doseUnit)) · \($0.window)" }
    }
}

/// Pure, locale-fixed formatting for the peptide screen. Dates are
/// `YYYY-MM-DD` keys parsed and printed in GMT so a key never shifts by a
/// day; "today" is always passed in (the Server's local date when known).
enum PeptideSupportPresentation {
    static func isDateKey(_ value: String) -> Bool {
        value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }

    static func deviceToday(now: Date = Date()) -> String {
        DailyDriverLocalDay.resolve(at: now, in: DailyDriverLocalDay.currentDeviceTimeZone()).dateKey
    }

    /// Trims trailing zeros the way the Server's `formatDecimal` does:
    /// 2.50 → "2.5", 3.0 → "3", 0.125 → "0.125".
    static func formatDoseAmount(_ value: Double) -> String {
        doseFormatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    static func formatDose(_ amount: Double, _ unit: String) -> String {
        let unit = unit.trimmingCharacters(in: .whitespacesAndNewlines)
        return unit.isEmpty ? formatDoseAmount(amount) : "\(formatDoseAmount(amount)) \(unit)"
    }

    /// Days row: 7 days → "Every day"; 1 → "Thursday"; 3+ consecutive in
    /// Sunday-first order → "Sun–Thu"; otherwise "Mon, Thu"; every N days →
    /// "Every 3 days" / "Every other day".
    static func formatDays(_ schedule: OperatingPlanSupportScheduleReadModel) -> String {
        switch schedule.frequency {
        case .daily: return "Every day"
        case .everyXDays: return formatInterval(schedule.intervalDays)
        case .weekly: return schedule.daysOfWeek.first?.label ?? "Weekly"
        case .specificDays: return formatWeekdays(schedule.daysOfWeek)
        }
    }

    static func formatInterval(_ days: Int) -> String {
        switch days {
        case ...1: "Every day"
        case 2: "Every other day"
        default: "Every \(days) days"
        }
    }

    static func formatWeekdays(_ days: [OperatingPlanWeekday]) -> String {
        let all = OperatingPlanWeekday.allCases
        let ordered = all.filter { days.contains($0) }
        guard let first = ordered.first, let last = ordered.last else { return "No days chosen" }
        if ordered.count == all.count { return "Every day" }
        if ordered.count == 1 { return first.label }
        let indices = ordered.compactMap { all.firstIndex(of: $0) }
        let consecutive = zip(indices, indices.dropFirst()).allSatisfy { $1 == $0 + 1 }
        if ordered.count >= 3, consecutive { return "\(first.shortLabel)–\(last.shortLabel)" }
        return ordered.map(\.shortLabel).joined(separator: ", ")
    }

    /// "Today · 9:45 PM" / "Tomorrow · 9:45 PM" / "Thu, Oct 1 · 9:45 PM";
    /// without a time only the day part. `nil` when there is no date.
    static func formatNextDose(date: String?, time: String?, today: String) -> String? {
        guard let date, let day = dateFormatter.date(from: date) else { return nil }
        let dayLabel: String
        if date == today {
            dayLabel = "Today"
        } else if let todayDate = dateFormatter.date(from: today),
                  let tomorrow = calendar.date(byAdding: .day, value: 1, to: todayDate),
                  dateFormatter.string(from: tomorrow) == date {
            dayLabel = "Tomorrow"
        } else {
            dayLabel = weekdayFormatter.string(from: day)
        }
        if let time, !time.isEmpty {
            return "\(dayLabel) · \(OperatingPlanSchedulePresentation.formattedLocalTime(time))"
        }
        return dayLabel
    }

    /// "Oct 8" from "2026-10-08"; the key itself when it does not parse.
    static func shortDate(_ key: String) -> String {
        guard let date = dateFormatter.date(from: key) else { return key }
        return shortDateFormatter.string(from: date)
    }

    /// "Oct 8" / "Oct 8 and Oct 22" / "Oct 8, Oct 15 and Oct 22".
    static func joinDates(_ keys: [String]) -> String {
        let dates = keys.map(shortDate)
        guard let last = dates.last else { return "" }
        if dates.count == 1 { return last }
        return dates.dropLast().joined(separator: ", ") + " and " + last
    }

    /// The Time sheet's preview: "Thursdays at 9:45 PM" for one weekday,
    /// otherwise the Days label ("Sun–Thu at 9:45 PM", "Every day at 8:00 AM").
    static func timePreview(_ schedule: OperatingPlanSupportScheduleReadModel, localTime: String) -> String {
        let clock = OperatingPlanSchedulePresentation.formattedLocalTime(localTime)
        let days = OperatingPlanWeekday.allCases.filter { schedule.daysOfWeek.contains($0) }
        if schedule.frequency != .daily, schedule.frequency != .everyXDays, days.count == 1, let day = days.first {
            return "\(day.label)s at \(clock)"
        }
        return "\(formatDays(schedule)) at \(clock)"
    }

    /// The `HH:mm` the Time wheel opens on: the exact time when the schedule
    /// has one, otherwise a representative clock for the bucket (morning
    /// 08:00 / afternoon 13:00 / evening 20:00) so the wheel never opens on
    /// an unrelated 09:00 and a bucket is only overwritten deliberately.
    static func seedTime(for schedule: OperatingPlanSupportScheduleReadModel) -> String {
        switch schedule.timing {
        case .specific:
            return schedule.specificTime.range(of: #"^([01]\d|2[0-3]):[0-5]\d$"#, options: .regularExpression) != nil
                ? schedule.specificTime
                : "08:00"
        case .morning: return "08:00"
        case .afternoon: return "13:00"
        case .evening: return "20:00"
        }
    }

    /// "Currently set to Evening" while the schedule is still a bucket.
    static func bucketCaption(for schedule: OperatingPlanSupportScheduleReadModel) -> String? {
        schedule.timing == .specific ? nil : "Currently set to \(schedule.timing.label)"
    }

    /// The Days sheet's initial selection: every day for `daily`, the
    /// chosen days otherwise (an interval cadence starts with none).
    static func seedDays(for schedule: OperatingPlanSupportScheduleReadModel) -> [OperatingPlanWeekday] {
        switch schedule.frequency {
        case .daily: return OperatingPlanWeekday.allCases
        case .weekly, .specificDays: return OperatingPlanWeekday.allCases.filter { schedule.daysOfWeek.contains($0) }
        case .everyXDays: return []
        }
    }

    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }()

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let shortDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "MMM d"
        return formatter
    }()

    private static let weekdayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, MMM d"
        return formatter
    }()

    private static let doseFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 3
        formatter.minimumIntegerDigits = 1
        return formatter
    }()
}
