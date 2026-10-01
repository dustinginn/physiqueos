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
                .activityBackgroundTint(WorkoutActivityPalette.background.opacity(0.96))
                .activitySystemActionForegroundColor(WorkoutActivityPalette.accent)
                .widgetURL(WorkoutActivityDeepLink.url(sessionId: context.attributes.sessionId))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "dumbbell.fill").foregroundStyle(WorkoutActivityPalette.accent)
                        Text("Workout").font(.system(size: 11, weight: .semibold)).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    WorkoutElapsedText(startedAt: context.attributes.startedAt, finishedAt: context.state.finishedAt)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(WorkoutActivityPalette.secondaryText)
                        .frame(width: 54, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    WorkoutIslandExpandedBottom(attributes: context.attributes, state: context.state, isStale: context.isStale)
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(WorkoutActivityPalette.accent)
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
