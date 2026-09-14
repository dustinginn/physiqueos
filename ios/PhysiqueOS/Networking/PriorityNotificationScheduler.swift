import UserNotifications

/// Schedules and reconciles local notifications for Today's Priorities
/// against the canonical Home read — never against a Native-maintained
/// schedule. Every notification's fire time comes directly from the
/// server-resolved `notificationAction.scheduledTime`; this type never
/// interprets a daypart word or invents a time of its own. Call `sync`
/// every time Home successfully loads/refreshes (cold load, pull-to-
/// refresh, foreground) so the locally-scheduled set always mirrors the
/// current canonical state — completing a priority through ANY path
/// (notification, in-app, or elsewhere) is naturally reflected the next
/// time Home is read, without this type needing to know how completion
/// happened.
enum PriorityNotificationScheduler {
    private static let scheduledPrefix = "priority.scheduled."
    private static let snoozedPrefix = "priority.snoozed."
    static let snoozeInterval: TimeInterval = 3600

    static func identifier(priorityId: String, occurrenceDate: String) -> String {
        "\(scheduledPrefix)\(priorityId).\(occurrenceDate)"
    }

    static func snoozeIdentifier(priorityId: String, occurrenceDate: String) -> String {
        "\(snoozedPrefix)\(priorityId).\(occurrenceDate)"
    }

    static func sync(
        items: [PriorityOccurrence],
        now: Date = Date(),
        calendar: Calendar = .current,
        center: UNUserNotificationCenter = .current()
    ) async {
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }

        let pending = await center.pendingNotificationRequests()
        let existingScheduledIds = Set(pending.map(\.identifier).filter { $0.hasPrefix(scheduledPrefix) })

        var desired: [UNNotificationRequest] = []
        var completedIdentifiersToCancel: [String] = []

        for item in items {
            let priorityId = item.routePriorityId ?? item.id
            let scheduledId = identifier(priorityId: priorityId, occurrenceDate: item.date)
            let snoozeId = snoozeIdentifier(priorityId: priorityId, occurrenceDate: item.date)

            if item.completed {
                // Suppress both the regular and any snoozed notification the
                // instant a completion is known, regardless of how it
                // happened — this is the only place staleness is resolved,
                // by re-deriving desired state from scratch every sync.
                completedIdentifiersToCancel.append(contentsOf: [scheduledId, snoozeId])
                continue
            }
            guard let action = item.notificationAction,
                  let scheduledTime = action.scheduledTime,
                  let fireDate = fireDate(scheduledTime, occurrenceDate: item.date, calendar: calendar),
                  fireDate > now
            else { continue }

            desired.append(request(identifier: scheduledId, item: item, action: action, fireDate: fireDate, calendar: calendar))
        }

        let desiredIds = Set(desired.map(\.identifier))
        let staleIds = existingScheduledIds.subtracting(desiredIds)
        let toRemove = Array(staleIds) + completedIdentifiersToCancel
        if !toRemove.isEmpty { center.removePendingNotificationRequests(withIdentifiers: toRemove) }
        // `add` replaces any existing request with the same identifier in
        // place (e.g. the canonical schedule's time changed) — no separate
        // "already scheduled, skip" branch is needed for correctness.
        for request in desired {
            try? await center.add(request)
        }
    }

    /// Device-only: reschedules the same notification content one hour
    /// later, under a distinct identifier so it doesn't collide with (or
    /// get silently replaced by) the next regular `sync`. Never touches the
    /// canonical priority — no server call happens here at all.
    static func scheduleSnooze(for originalRequest: UNNotificationRequest, center: UNUserNotificationCenter = .current()) async {
        guard let priorityId = originalRequest.content.userInfo["priorityId"] as? String,
              let occurrenceDate = originalRequest.content.userInfo["occurrenceDate"] as? String,
              let content = originalRequest.content.mutableCopy() as? UNMutableNotificationContent
        else { return }
        let identifier = snoozeIdentifier(priorityId: priorityId, occurrenceDate: occurrenceDate)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: snoozeInterval, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
    }

    /// Internal (not private) so this pure date computation is directly
    /// unit-testable without needing a live `UNUserNotificationCenter`.
    static func fireDate(_ scheduledTime: String, occurrenceDate: String, calendar: Calendar) -> Date? {
        let time = scheduledTime.split(separator: ":").compactMap { Int($0) }
        let date = occurrenceDate.split(separator: "-").compactMap { Int($0) }
        guard time.count == 2, date.count == 3 else { return nil }
        var components = DateComponents()
        components.year = date[0]
        components.month = date[1]
        components.day = date[2]
        components.hour = time[0]
        components.minute = time[1]
        return calendar.date(from: components)
    }

    private static func request(
        identifier: String, item: PriorityOccurrence, action: PriorityNotificationAction, fireDate: Date, calendar: Calendar
    ) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = item.title
        content.body = item.subtitle ?? "Open PhysiqueOS to view this priority."
        content.sound = .default
        content.categoryIdentifier = PriorityNotificationCategory.category(for: action.classification)
        content.userInfo = userInfo(for: item, action: action)
        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fireDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        return UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
    }

    /// Carries everything `PriorityNotificationDelegate` needs to act on a
    /// response without re-fetching anything: the canonical identity, the
    /// exact destination to open (encoded from `PriorityOccurrence
    /// .destination` — the SAME computed property in-app taps already use,
    /// so a notification's "Open" never re-derives routing separately),
    /// and — only when direct completion is allowed — the ready-to-submit
    /// completion command.
    private static func userInfo(for item: PriorityOccurrence, action: PriorityNotificationAction) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [
            "priorityId": item.routePriorityId ?? item.id,
            "occurrenceDate": item.date,
        ]
        if let destinationData = try? JSONEncoder().encode(item.destination) {
            info["destination"] = destinationData
        }
        if let command = action.completionCommand {
            info["commandType"] = command.commandType
            info["expectedVersion"] = command.expectedVersion
            info["payloadPriorityId"] = command.payload.priorityId
            info["payloadOccurrenceDate"] = command.payload.occurrenceDate
        }
        return info
    }
}
