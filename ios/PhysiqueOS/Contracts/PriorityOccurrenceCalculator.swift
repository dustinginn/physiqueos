import Foundation

/// Reproduces `scheduleAppliesOnDate`, `getWeekday`, `getPriorityState`, and
/// `getPreferredHour` from `src/domain/services/ExecutionPriorityProjectionService.js`
/// / `DailyFocusService.js` — algorithm, not reinterpretation, verified
/// directly against source for this task. Native does not invent Priority
/// occurrence generation; it mirrors the server's own pure functions over
/// fixture data standing in for the real read.
///
/// **Identity simplification, disclosed**: the real server's priority id is
/// `historyAnchorId ?? "execution-priority-{executionItemId}-{date}"`, where
/// `historyAnchorId` is a legacy, independently-seeded `Reminder.id` that
/// can predate any completion. Every execution item in this fixture-only
/// pass is execution-item-backed (none are bare legacy reminders with no
/// linked execution item), so the composite form is always the correct,
/// real identity for every occurrence modeled here — this is not a
/// different rule, just the one branch this fixture's data actually
/// exercises.
///
/// **Date-key convention**: every date string here is a bare
/// `"yyyy-MM-dd"` local-date key, resolved the same UTC-noon-anchored way
/// `getWeekday`/`scheduleAppliesOnDate` resolve theirs (`"${date}T12:00:00Z"`)
/// — never reinterpreted through the device's own time zone, matching this
/// codebase's established `TrainingDateFormatting`/`EvidenceChronology`
/// convention for exactly the same DST/midnight-shift reason.
enum PriorityOccurrenceCalculator {
    /// The server's own default local time zone
    /// (`DEFAULT_LOCAL_TIME_ZONE = "America/Los_Angeles"`,
    /// `src/domain/utils/localDate.js`) — Pacific-anchored, not UTC, not
    /// device-local.
    static let defaultTimeZone = TimeZone(identifier: "America/Los_Angeles")!

    private static let dateKeyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    private static func noonUTC(_ dateKey: String) -> Date? {
        guard let day = dateKeyFormatter.date(from: dateKey) else { return nil }
        return day.addingTimeInterval(12 * 3600)
    }

    /// `getWeekday(localDate)` — noon-UTC anchored so a device in any time
    /// zone resolves the exact same weekday for a given date key.
    static func weekday(of dateKey: String) -> String? {
        guard let date = noonUTC(dateKey) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        return names[calendar.component(.weekday, from: date) - 1]
    }

    /// Today's local date key in the given time zone (default Pacific) —
    /// the one place "now" becomes a date key, so every other function
    /// here works on plain strings, not scattered `Date()` calls.
    static func localDateKey(now: Date, timeZone: TimeZone = defaultTimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: now)
    }

    static func previousDateKey(_ dateKey: String) -> String? {
        guard let date = noonUTC(dateKey) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        guard let prior = calendar.date(byAdding: .day, value: -1, to: date) else { return nil }
        return dateKeyFormatter.string(from: prior)
    }

    /// `scheduleAppliesOnDate(schedule, localDate, cadence)` — ported
    /// exactly, plus the one additional `.scheduledDate` branch this port's
    /// read model makes explicit (see `ExecutionCadenceType`'s doc
    /// comment).
    static func scheduleApplies(schedule: ExecutionSchedule, cadence: ExecutionCadence, localDate: String) -> Bool {
        if let startDate = schedule.startDate, localDate < startDate { return false }
        if let endDate = schedule.endDate, localDate > endDate { return false }

        switch cadence.type {
        case .scheduledDate:
            return schedule.scheduledDate == localDate

        case .everyXDays:
            guard let anchor = schedule.anchorDate ?? schedule.startDate,
                  let anchorDate = noonUTC(anchor), let target = noonUTC(localDate) else { return false }
            let interval = cadence.interval ?? schedule.intervalDays ?? 1
            guard interval >= 1 else { return false }
            let elapsedSeconds = target.timeIntervalSince(anchorDate)
            let elapsedDays = Int((elapsedSeconds / 86400).rounded())
            return elapsedDays >= 0 && elapsedDays % interval == 0

        case .daily, .weekly, .specificWeekdays:
            let days = Set(schedule.daysOfWeek)
            if cadence.type == .daily && days.isEmpty { return true }
            guard !days.isEmpty, let today = weekday(of: localDate) else { return false }
            return days.contains(today)
        }
    }

    /// `getPreferredHour(timeOfDay)` — ported exactly.
    static func preferredHour(timeOfDay: String?) -> Int? {
        guard let timeOfDay else { return nil }
        switch timeOfDay {
        case "morning": return 7
        case "afternoon": return 14
        case "evening": return 18
        case "night": return 21
        default:
            let parts = timeOfDay.split(separator: ":")
            guard let first = parts.first, let hour = Int(first) else { return nil }
            return hour
        }
    }

    /// `getPriorityState(timeOfDay, now, timeZone)` — ported exactly
    /// (`hour < preferredHour - 1` → upcoming, `hour > preferredHour + 2` →
    /// overdue, else available; `nil` preferred hour → always available).
    static func urgency(timeOfDay: String?, now: Date, timeZone: TimeZone = defaultTimeZone) -> PriorityUrgency {
        guard let preferred = preferredHour(timeOfDay: timeOfDay) else { return .available }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let hour = calendar.component(.hour, from: now)
        if hour < preferred - 1 { return .upcoming }
        if hour > preferred + 2 { return .overdue }
        return .available
    }

    /// The below-title subtitle text — `getPriorityState`'s own `label`,
    /// falling back to a formatted time-of-day for `.upcoming` and a plain
    /// "Overdue"/"Available" otherwise, matching source.
    static func urgencyLabel(_ urgency: PriorityUrgency, timeOfDay: String?) -> String {
        switch urgency {
        case .upcoming: formattedTimeOfDay(timeOfDay) ?? "Upcoming"
        case .available: "Available"
        case .overdue: "Overdue"
        }
    }

    private static func formattedTimeOfDay(_ timeOfDay: String?) -> String? {
        switch timeOfDay {
        case "morning": "Morning"
        case "afternoon": "Afternoon"
        case "evening", "night": "Evening"
        default: nil
        }
    }

    static func occurrenceId(executionItemId: String, localDate: String) -> String {
        "execution-priority-\(executionItemId)-\(localDate)"
    }

    /// Projects every active execution item's occurrence for `localDate`,
    /// skipping ones whose cadence doesn't apply that day — the one shared
    /// entry point Home, Priority Detail, and Morning Check-In's "today"
    /// context all call, so their occurrence lists and identities can never
    /// independently drift.
    static func project(
        executionItems: [ExecutionItemFixture],
        completions: [String: PriorityCompletionRecord],
        localDate: String,
        now: Date = Date(),
        timeZone: TimeZone = defaultTimeZone
    ) -> [PriorityOccurrence] {
        executionItems
            .filter(\.active)
            .filter { scheduleApplies(schedule: $0.schedule, cadence: $0.cadence, localDate: localDate) }
            .map { item in occurrence(for: item, localDate: localDate, completions: completions, now: now, timeZone: timeZone) }
    }

    static func occurrence(
        for item: ExecutionItemFixture,
        localDate: String,
        completions: [String: PriorityCompletionRecord],
        now: Date = Date(),
        timeZone: TimeZone = defaultTimeZone
    ) -> PriorityOccurrence {
        let id = occurrenceId(executionItemId: item.id, localDate: localDate)
        let completion = completions[id]
        let urgencyState = urgency(timeOfDay: item.schedule.timeOfDay, now: now, timeZone: timeZone)
        return PriorityOccurrence(
            id: id,
            executionItemId: item.id,
            date: localDate,
            title: item.title,
            subtitle: urgencyLabel(urgencyState, timeOfDay: item.schedule.timeOfDay),
            metadata: item.contextDetail,
            changeLabel: nil,
            icon: item.icon,
            color: item.color,
            urgency: urgencyState,
            completed: completion != nil,
            completable: item.completable,
            actionLabel: item.completable ? nil : item.continueActionLabel,
            completionContext: item.completionMethod == .manualConfirmation
                ? PriorityCompletionContext(occurrenceDate: localDate, dose: item.contextDetail, protocolId: item.id)
                : nil,
            continueActionDestination: item.continueActionDestination,
            attributedScope: EvidenceChronology.attribution(forOccurrenceDate: localDate)
        )
    }

    /// `getPreviousDayIncompletePrioritySelection` — the exact set Morning
    /// Check-In surfaces: every active execution item that (a) was
    /// scheduled yesterday, and (b) has no completion and no terminal
    /// reconciliation recorded for that occurrence. Evidence-based
    /// auto-completion (`completionMethod == .canonicalEvidence`) is
    /// resolved by the caller passing `hasEvidence` — this function stays
    /// pure over the completion/reconciliation dictionaries it's given
    /// rather than reaching into a weigh-in store itself.
    static func previousDayIncomplete(
        executionItems: [ExecutionItemFixture],
        completions: [String: PriorityCompletionRecord],
        reconciliations: [String: PriorityReconciliationRecord],
        previousLocalDate: String,
        now: Date = Date(),
        timeZone: TimeZone = defaultTimeZone,
        hasEvidence: (ExecutionItemFixture, String) -> Bool = { _, _ in false }
    ) -> [PriorityOccurrence] {
        executionItems
            .filter(\.active)
            .filter { scheduleApplies(schedule: $0.schedule, cadence: $0.cadence, localDate: previousLocalDate) }
            .filter { item in
                let id = occurrenceId(executionItemId: item.id, localDate: previousLocalDate)
                if completions[id] != nil { return false }
                if reconciliations[id] != nil { return false }
                if item.completionMethod == .canonicalEvidence, hasEvidence(item, previousLocalDate) { return false }
                return true
            }
            .map { occurrence(for: $0, localDate: previousLocalDate, completions: completions, now: now, timeZone: timeZone) }
    }
}
