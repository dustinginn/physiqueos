import ActivityKit
import SwiftUI
import WidgetKit

/// ActivityKit configuration for the Workout Logger Live Activity: Lock
/// Screen / banner plus the Dynamic Island. All presentation lives in the
/// shared views; this file only adapts ActivityKit's context to them.
struct WorkoutLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            WorkoutLockScreenView(attributes: context.attributes, state: context.state, isStale: context.isStale)
                // The app-owned appearance (System follows iOS, as before).
                .activityBackgroundTint(WorkoutActivityTheme.backgroundTint(for: context.state.appearance))
                .activitySystemActionForegroundColor(WorkoutActivityTheme.systemActionForeground(for: context.state.appearance))
                .widgetURL(WorkoutActivityDeepLink.url(sessionId: context.attributes.sessionId))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "dumbbell.fill").font(.system(size: 10, weight: .semibold))
                        Text("Workout").font(WorkoutActivityType.font(11, 500)).lineLimit(1)
                    }
                    .foregroundStyle(WorkoutActivityTheme.dark.text)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    WorkoutElapsedText(startedAt: context.attributes.startedAt, finishedAt: context.state.finishedAt)
                        .font(WorkoutActivityType.font(11, 500))
                        .foregroundStyle(WorkoutActivityTheme.dark.text)
                        .frame(width: 54, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    WorkoutIslandExpandedBottom(attributes: context.attributes, state: context.state, isStale: context.isStale)
                }
            } compactLeading: {
                WorkoutIslandCompactLeading()
            } compactTrailing: {
                WorkoutIslandCompactTrailing(attributes: context.attributes, state: context.state)
            } minimal: {
                WorkoutIslandMinimal(state: context.state)
            }
            .widgetURL(WorkoutActivityDeepLink.url(sessionId: context.attributes.sessionId))
            .keylineTint(WorkoutActivityPalette.accent)
        }
    }
}
