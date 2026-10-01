import SwiftUI
import WidgetKit

/// The Widget Extension's only content is the Workout Logger Live Activity;
/// there is no Home Screen widget.
@main
struct PhysiqueOSLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        WorkoutLiveActivityWidget()
    }
}
