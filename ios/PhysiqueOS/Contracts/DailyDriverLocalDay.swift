import Combine
import Foundation

/// The daily-driver "Today" authority: the device's CURRENT local calendar day
/// in its CURRENT time zone.
///
/// Three date authorities exist and are deliberately separate:
/// 1. Daily-driver "Today" UX (Log's Logged Today, today-scoped caches): this
///    type. It follows travel and rolls over at the device's local midnight.
/// 2. Canonical record dates: every record keeps the `localDate` the Server (or
///    HealthKit's workout/sample time zone) stamped when it was created. A
///    change here NEVER rewrites or re-buckets a historical record.
/// 3. Strategic briefing windows and priority occurrences: Server-owned in the
///    canonical coaching time zone (`HomeReadModel.notificationTimeZone`), never
///    the transient device zone.
///
/// A value is always recomputed from the system clock and zone on every
/// trigger (foreground, midnight, significant time change, zone change); it is
/// never advanced by incrementing a cached day.
struct DailyDriverLocalDay: Equatable, Hashable, Sendable {
    let dateKey: String
    let timeZoneIdentifier: String

    var key: String { "\(dateKey)@\(timeZoneIdentifier)" }

    static func resolve(at instant: Date, in timeZone: TimeZone) -> DailyDriverLocalDay {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: instant)
        return DailyDriverLocalDay(
            dateKey: String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0),
            timeZoneIdentifier: timeZone.identifier
        )
    }

    /// The device's current zone for a read. Cheap: no cache reset per call.
    static func currentDeviceTimeZone() -> TimeZone {
        TimeZone.current
    }

    /// The device's current zone for a day re-evaluation. `resetSystemTimeZone()`
    /// drops Foundation's cached system zone so a zone change made while the
    /// process was alive is observed immediately rather than at the next launch;
    /// every read after the re-evaluation then sees the new zone.
    static func refreshedDeviceTimeZone() -> TimeZone {
        NSTimeZone.resetSystemTimeZone()
        return TimeZone.current
    }

    /// Reads whose content depends on which day is "today" (or on the day's
    /// accumulating totals). None of them may be served from a cache filled on
    /// a different local day or in a different zone.
    static let dayScopedReadResources: Set<String> = [
        "home", "evidence-review-queue", "morning-check-in", "weight", "activity", "nutrition",
        "energy", "training-landing", "training-reporting", "training-logger", "priority",
        "active-goal", "confidence", "goals",
    ]
}

/// The notifications after which "today" must be recomputed from the system
/// calendar. `NSCalendarDayChanged` covers a foregrounded app crossing local
/// midnight; the significant-time-change notification also covers manual clock
/// changes, carrier time updates and DST; the zone notification covers travel.
/// A suspended app receives none of these reliably, which is why the root scene
/// also recomputes on every transition to `.active`.
enum DailyDriverDayTrigger {
    static let notificationNames: [Notification.Name] = [
        .NSCalendarDayChanged,
        Notification.Name("UIApplicationSignificantTimeChangeNotification"),
        .NSSystemTimeZoneDidChange,
    ]

    /// One main-thread stream of every trigger (posters may use any thread).
    static func publisher(center: NotificationCenter = .default) -> AnyPublisher<Notification, Never> {
        Publishers.MergeMany(notificationNames.map { center.publisher(for: $0) })
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
}
