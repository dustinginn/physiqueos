import SwiftUI
import WidgetKit

/// One WidgetKit extension owns both system surfaces. The Home widget is a
/// read-only App Group projection; the Live Activity keeps its existing
/// ActivityKit lifecycle and Complete Set intent unchanged.
@main
struct PhysiqueOSLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        WorkoutLiveActivityWidget()
        HomeLoggedTodayWidget()
    }
}
