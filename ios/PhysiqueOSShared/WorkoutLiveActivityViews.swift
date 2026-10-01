import AppIntents
import SwiftUI

// SwiftUI for the Workout Logger Live Activity, shared by the Widget
// Extension (which hosts it in ActivityKit) and by the app (unit tests and
// screenshot capture of the *shipping* views). Presentation authority is the
// Founder-approved visual prototype. These views only read
// `WorkoutActivityAttributes` / `ContentState`; they never compute workout
// semantics (the app's `TrainingSessionLiveProjection` already did).
//
// Timers use the system's date-based `Text(timerInterval:)`, so the rest
// clock and workout elapsed tick with no per-second activity updates.

enum WorkoutActivityPalette {
    static let background = Color(red: 8 / 255, green: 13 / 255, blue: 24 / 255)
    static let elevated = Color(red: 20 / 255, green: 31 / 255, blue: 49 / 255)
    static let muted = Color(red: 23 / 255, green: 34 / 255, blue: 53 / 255)
    static let accent = Color(red: 139 / 255, green: 140 / 255, blue: 255 / 255)
    static let success = Color(red: 74 / 255, green: 222 / 255, blue: 128 / 255)
    static let warning = Color(red: 251 / 255, green: 191 / 255, blue: 36 / 255)
    static let primaryText = Color(red: 243 / 255, green: 246 / 255, blue: 251 / 255)
    static let secondaryText = Color(red: 203 / 255, green: 213 / 255, blue: 225 / 255)
    static let mutedText = Color(red: 154 / 255, green: 168 / 255, blue: 186 / 255)
}

typealias WorkoutActivityState = WorkoutActivityAttributes.ContentState

enum WorkoutActivityPrivacy {
    /// Exercise names, set values and Complete Set are shown only when the
    /// system is not redacting for privacy (a locked device that hides
    /// widget content). The generic body still shows progress and the clock.
    static func showsSetDetails(redaction: RedactionReasons) -> Bool { !redaction.contains(.privacy) }
}

// MARK: - Timers

/// Workout elapsed since `startedAt`; freezes at `finishedAt`.
struct WorkoutElapsedText: View {
    let startedAt: Date
    let finishedAt: Date?

    var body: some View {
        Text(
            timerInterval: startedAt...startedAt.addingTimeInterval(24 * 3600),
            pauseTime: finishedAt,
            countsDown: false,
            showsHours: false
        )
        .monospacedDigit()
    }
}

/// The rest clock: Stopwatch counts up from `startedAt`; Countdown counts
/// down to `endsAt` (and holds at 0:00 after it).
struct WorkoutRestClockText: View {
    let rest: WorkoutActivityState.Rest

    var body: some View {
        switch rest.mode {
        case .stopwatch:
            Text(timerInterval: rest.startedAt...rest.startedAt.addingTimeInterval(24 * 3600), countsDown: false, showsHours: false)
                .monospacedDigit()
        case .countdown:
            let end = max(rest.endsAt ?? rest.startedAt, rest.startedAt.addingTimeInterval(1))
            Text(timerInterval: rest.startedAt...end, countsDown: true, showsHours: false)
                .monospacedDigit()
        }
    }
}

// MARK: - Shared pieces

private enum WorkoutRoleStyle {
    static func label(_ role: WorkoutActivityState.Row.Role) -> String {
        switch role {
        case .previous: "PREVIOUS"
        case .completed: "COMPLETED"
        case .current: "CURRENT"
        case .upNext: "UP NEXT"
        }
    }

    static func isDone(_ role: WorkoutActivityState.Row.Role) -> Bool { role == .previous || role == .completed }
}

private extension WorkoutActivityState.Row {
    var setText: String {
        let position = "S\(setNumber)/\(setCount)"
        return valueText.map { "\(position) · \($0)" } ?? position
    }
}

struct WorkoutCompleteSetButton: View {
    let attributes: WorkoutActivityAttributes
    let state: WorkoutActivityState
    var compact = true

    var body: some View {
        if let target = state.target, state.canCompleteSet {
            Button(intent: CompleteWorkoutSetIntent(
                sessionId: attributes.sessionId, authority: attributes.authority,
                exerciseId: target.exerciseId, setId: target.setId, expectedRevision: state.revision
            )) {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark").font(.system(size: 11, weight: .bold))
                    Text("Complete Set").font(.system(size: compact ? 11 : 13, weight: .bold))
                }
                .foregroundStyle(Color.black)
                .frame(maxWidth: compact ? 124 : .infinity, minHeight: 44)
                .padding(.horizontal, compact ? 9 : 0)
                .background(RoundedRectangle(cornerRadius: 13).fill(WorkoutActivityPalette.accent))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Complete Set")
            .accessibilityHint("Completes the current set and starts rest tracking")
        }
    }
}

private struct WorkoutRestSummary: View {
    let state: WorkoutActivityState
    let isStale: Bool
    var compact = false

    var body: some View {
        if let rest = state.rest {
            let isCountdown = rest.mode == .countdown
            let expired = isCountdown && isStale
            HStack(spacing: 6) {
                Image(systemName: isCountdown ? "timer" : "stopwatch.fill")
                    .font(.system(size: compact ? 10 : 13, weight: .semibold))
                    .foregroundStyle(isCountdown ? WorkoutActivityPalette.warning : WorkoutActivityPalette.success)
                VStack(alignment: .leading, spacing: 0) {
                    Text(expired ? "REST · COMPLETE" : (isCountdown ? "REST · COUNTDOWN" : "REST · STOPWATCH"))
                        .font(.system(size: compact ? 7 : 8, weight: .bold))
                        .tracking(0.45)
                        .foregroundStyle(WorkoutActivityPalette.mutedText)
                    WorkoutRestClockText(rest: rest)
                        .font(.system(size: compact ? 13 : 21, weight: .bold, design: .rounded))
                        .foregroundStyle(WorkoutActivityPalette.primaryText)
                        .frame(width: compact ? 58 : 84, alignment: .leading)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(isCountdown ? "Rest countdown" : "Rest stopwatch")
        } else {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: compact ? 10 : 12, weight: .semibold))
                    .foregroundStyle(WorkoutActivityPalette.accent)
                VStack(alignment: .leading, spacing: 0) {
                    Text("WORKOUT")
                        .font(.system(size: 8, weight: .bold))
                        .tracking(0.45)
                        .foregroundStyle(WorkoutActivityPalette.mutedText)
                    WorkoutElapsedText(startedAt: attributesStartedAt, finishedAt: state.finishedAt)
                        .font(.system(size: compact ? 12 : 17, weight: .bold, design: .rounded))
                        .foregroundStyle(WorkoutActivityPalette.primaryText)
                        .frame(width: 70, alignment: .leading)
                }
            }
        }
    }

    // The elapsed fallback needs the activity's start; injected by the host.
    @Environment(\.workoutActivityStartedAt) private var attributesStartedAt
}

private struct WorkoutContextRow: View {
    let row: WorkoutActivityState.Row

    var body: some View {
        let emphasized = row.role == .current || row.role == .upNext
        HStack(spacing: 7) {
            Text(WorkoutRoleStyle.label(row.role))
                .font(.system(size: 8, weight: .bold))
                .tracking(0.45)
                .foregroundStyle(emphasized ? WorkoutActivityPalette.accent : WorkoutActivityPalette.mutedText)
                .frame(width: 54, alignment: .leading)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    if let label = row.supersetLabel {
                        Text("\(label)\(row.setNumber)")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(Color.black)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(WorkoutActivityPalette.warning))
                    }
                    Text(row.exerciseName)
                        .font(.system(size: emphasized ? 11 : 10, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.62)
                }
                if let partner = row.partnerName, row.role == .current {
                    Text("with \(partner)")
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(WorkoutActivityPalette.mutedText)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 3)
            Text(row.setText)
                .font(.system(size: emphasized ? 10 : 9, weight: .semibold, design: .rounded))
                .foregroundStyle(WorkoutRoleStyle.isDone(row.role) ? WorkoutActivityPalette.secondaryText : WorkoutActivityPalette.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if WorkoutRoleStyle.isDone(row.role) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(WorkoutActivityPalette.success)
            }
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, minHeight: 27)
        .background(RoundedRectangle(cornerRadius: 9).fill(emphasized ? WorkoutActivityPalette.accent.opacity(0.12) : WorkoutActivityPalette.muted.opacity(0.78)))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Lock Screen

struct WorkoutLockScreenView: View {
    let attributes: WorkoutActivityAttributes
    let state: WorkoutActivityState
    var isStale = false
    @Environment(\.redactionReasons) private var redactionReasons

    private var isPrivate: Bool { !WorkoutActivityPrivacy.showsSetDetails(redaction: redactionReasons) }

    var body: some View {
        Group {
            switch effectivePhase {
            case .inProgress: activeBody
            case .allSetsComplete:
                statusBody(symbol: "checkmark.circle.fill", color: WorkoutActivityPalette.success,
                           title: "All sets complete", message: "Finish when you're ready", action: "Open Logger")
            case .reviewing:
                statusBody(symbol: "list.clipboard.fill", color: WorkoutActivityPalette.accent,
                           title: "Reviewing workout", message: "Finish in PhysiqueOS", action: "Open Logger")
            case .finishing:
                statusBody(symbol: "arrow.triangle.2.circlepath", color: WorkoutActivityPalette.accent,
                           title: "Saving workout…", message: "Keep PhysiqueOS nearby", action: nil)
            case .saved:
                statusBody(symbol: "checkmark.seal.fill", color: WorkoutActivityPalette.success,
                           title: "Workout saved", message: "\(state.completedSets) sets", action: nil)
            case .paused:
                statusBody(symbol: "exclamationmark.arrow.triangle.2.circlepath", color: WorkoutActivityPalette.warning,
                           title: "Workout needs an update", message: "Open Logger to refresh", action: "Open Logger")
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .foregroundStyle(WorkoutActivityPalette.primaryText)
        .environment(\.workoutActivityStartedAt, attributes.startedAt)
        .accessibilityElement(children: .contain)
    }

    /// A stale activity (no update for hours) falls back to the safe state,
    /// unless the staleness is only a Countdown reaching zero.
    private var effectivePhase: WorkoutActivityState.Phase {
        if isStale, state.phase == .inProgress, state.rest?.mode != .countdown { return .paused }
        return state.phase
    }

    private var activeBody: some View {
        VStack(spacing: 5) {
            header
            if isPrivate {
                privacyBody
            } else {
                ForEach(Array(state.rows.prefix(2).enumerated()), id: \.offset) { _, row in
                    WorkoutContextRow(row: row)
                }
            }
            HStack(spacing: 8) {
                WorkoutRestSummary(state: state, isStale: isStale)
                Spacer(minLength: 4)
                if !isPrivate { WorkoutCompleteSetButton(attributes: attributes, state: state) }
            }
            .frame(minHeight: 44)
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(WorkoutActivityPalette.accent)
            Text(isPrivate ? "Workout" : state.label)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
            Spacer(minLength: 5)
            Text(state.progressText)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(WorkoutActivityPalette.mutedText)
            WorkoutElapsedText(startedAt: attributes.startedAt, finishedAt: state.finishedAt)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .frame(width: 46, alignment: .trailing)
        }
        .frame(height: 16)
    }

    private var privacyBody: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("ACTIVE WORKOUT")
                    .font(.system(size: 9, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(WorkoutActivityPalette.mutedText)
                Text("Set details hidden").font(.system(size: 14, weight: .semibold))
            }
            Spacer()
            Image(systemName: "eye.slash.fill").foregroundStyle(WorkoutActivityPalette.secondaryText)
        }
        .padding(.horizontal, 9)
        .frame(maxWidth: .infinity, minHeight: 64)
        .background(RoundedRectangle(cornerRadius: 12).fill(WorkoutActivityPalette.muted.opacity(0.9)))
    }

    private func statusBody(symbol: String, color: Color, title: String, message: String, action: String?) -> some View {
        VStack(spacing: 11) {
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill(color.opacity(0.15)).frame(width: 42, height: 42)
                    Image(systemName: symbol).font(.system(size: 20, weight: .semibold)).foregroundStyle(color)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.system(size: 16, weight: .bold))
                    Text(message).font(.system(size: 12, weight: .medium)).foregroundStyle(WorkoutActivityPalette.secondaryText)
                }
                Spacer()
                WorkoutElapsedText(startedAt: attributes.startedAt, finishedAt: state.finishedAt)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(WorkoutActivityPalette.mutedText)
                    .frame(width: 48, alignment: .trailing)
            }
            if let action {
                Text(action)
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .background(RoundedRectangle(cornerRadius: 13).fill(WorkoutActivityPalette.accent.opacity(0.2)))
            }
        }
    }
}

// MARK: - Dynamic Island

/// Expanded bottom region: the same max-two-row semantics as the Lock
/// Screen, the large rest clock lower-left, Complete Set trailing.
struct WorkoutIslandExpandedBottom: View {
    let attributes: WorkoutActivityAttributes
    let state: WorkoutActivityState
    var isStale = false
    @Environment(\.redactionReasons) private var redactionReasons

    private var isPrivate: Bool { !WorkoutActivityPrivacy.showsSetDetails(redaction: redactionReasons) }

    var body: some View {
        VStack(spacing: 7) {
            if state.phase == .inProgress {
                if isPrivate {
                    Text("Set details hidden")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(RoundedRectangle(cornerRadius: 9).fill(WorkoutActivityPalette.muted))
                } else {
                    HStack(spacing: 8) {
                        ForEach(Array(state.rows.prefix(2).enumerated()), id: \.offset) { _, row in
                            context(row)
                        }
                    }
                }
                HStack(spacing: 10) {
                    WorkoutRestSummary(state: state, isStale: isStale)
                    Spacer(minLength: 4)
                    if !isPrivate { WorkoutCompleteSetButton(attributes: attributes, state: state).frame(width: 122, height: 44) }
                }
            } else {
                Text(statusText).font(.system(size: 13, weight: .semibold)).frame(maxWidth: .infinity, minHeight: 44)
            }
        }
        .foregroundStyle(WorkoutActivityPalette.primaryText)
        .environment(\.workoutActivityStartedAt, attributes.startedAt)
    }

    private var statusText: String {
        switch state.phase {
        case .allSetsComplete: "All sets complete · open Logger to finish"
        case .reviewing: "Reviewing workout"
        case .finishing: "Saving workout…"
        case .saved: "Workout saved · \(state.completedSets) sets"
        case .paused, .inProgress: "Open Logger to refresh"
        }
    }

    private func context(_ row: WorkoutActivityState.Row) -> some View {
        let isFinalCurrent = row.role == .current && state.layout == .currentAndUpNext
        let label = isFinalCurrent ? "CURRENT · FINAL" : WorkoutRoleStyle.label(row.role)
        let accent: Color = {
            switch row.role {
            case .previous: WorkoutActivityPalette.mutedText
            case .completed: WorkoutActivityPalette.success
            case .current: isFinalCurrent ? WorkoutActivityPalette.warning : WorkoutActivityPalette.accent
            case .upNext: WorkoutActivityPalette.accent
            }
        }()
        return VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 7, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(accent)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(row.exerciseName)
                .font(.system(size: 10, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
            Text("Set \(row.setNumber)/\(row.setCount)" + (row.valueText.map { " · \($0)" } ?? ""))
                .font(.system(size: 9, weight: .medium, design: .rounded))
                .foregroundStyle(WorkoutActivityPalette.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, minHeight: 38, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 9).fill(accent.opacity(0.12)))
    }
}

/// Compact trailing: the rest clock while resting, else workout elapsed.
struct WorkoutIslandCompactTrailing: View {
    let attributes: WorkoutActivityAttributes
    let state: WorkoutActivityState

    var body: some View {
        if let rest = state.rest, state.phase == .inProgress {
            HStack(spacing: 3) {
                Circle().fill(WorkoutActivityPalette.success).frame(width: 5, height: 5)
                WorkoutRestClockText(rest: rest)
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundStyle(WorkoutActivityPalette.success)
                    .frame(width: 44, alignment: .trailing)
            }
        } else {
            WorkoutElapsedText(startedAt: attributes.startedAt, finishedAt: state.finishedAt)
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .frame(width: 46, alignment: .trailing)
        }
    }
}

/// Minimal: an unmistakable rest-stopwatch/timer ring while resting,
/// else the workout glyph.
struct WorkoutIslandMinimal: View {
    let state: WorkoutActivityState

    var body: some View {
        if let rest = state.rest, state.phase == .inProgress {
            ZStack {
                Circle()
                    .trim(from: 0.12, to: 0.82)
                    .stroke(WorkoutActivityPalette.success, style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(3)
                Image(systemName: rest.mode == .countdown ? "timer" : "stopwatch.fill")
                    .font(.system(size: 11, weight: .semibold))
            }
        } else {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(WorkoutActivityPalette.accent)
        }
    }
}

// MARK: - Environment plumbing

private struct WorkoutActivityStartedAtKey: EnvironmentKey {
    static let defaultValue = Date.distantPast
}

extension EnvironmentValues {
    /// The activity's immutable start, used by the elapsed fallback when
    /// Rest is Off.
    var workoutActivityStartedAt: Date {
        get { self[WorkoutActivityStartedAtKey.self] }
        set { self[WorkoutActivityStartedAtKey.self] = newValue }
    }
}
