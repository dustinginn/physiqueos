import SwiftUI
import WidgetKit

struct HomeLoggedTodayEntry: TimelineEntry {
    let date: Date
    let snapshot: HomeWidgetSnapshot?
}

struct HomeLoggedTodayTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeLoggedTodayEntry {
        .init(date: HomeWidgetSamples.referenceDate, snapshot: HomeWidgetSamples.snapshot())
    }

    func getSnapshot(in context: Context, completion: @escaping (HomeLoggedTodayEntry) -> Void) {
        completion(.init(
            date: context.isPreview ? HomeWidgetSamples.referenceDate : Date(),
            snapshot: context.isPreview ? HomeWidgetSamples.snapshot() : HomeWidgetSnapshotFileStore.shared()?.read()
        ))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HomeLoggedTodayEntry>) -> Void) {
        let now = Date()
        let snapshot = HomeWidgetSnapshotFileStore.shared()?.read()
        var entries = [HomeLoggedTodayEntry(date: now, snapshot: snapshot)]
        let zone = snapshot.flatMap { TimeZone(identifier: $0.timeZoneIdentifier) } ?? .current
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        if let midnight = calendar.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ), midnight.timeIntervalSince(now) >= 5 * 60 {
            entries.append(.init(date: midnight, snapshot: snapshot))
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(45 * 60))))
    }
}

struct HomeLoggedTodayWidget: Widget {
    static let kind = HomeWidgetContract.kind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: HomeLoggedTodayTimelineProvider()) { entry in
            HomeLoggedTodayWidgetView(snapshot: entry.snapshot, date: entry.date)
        }
        .configurationDisplayName("PhysiqueOS Logged Today")
        .description("Training, nutrition, activity, and Workout Logger access.")
        .supportedFamilies([.systemSmall, .systemLarge])
    }
}
