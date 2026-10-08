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

/// Mirror of the app/Watch `WorkoutPrimaryActionToken` for the extension
/// (the Widget Extension does not compile the Watch contract). Tests hold the
/// two equal. The iPhone Logger's Finish Workout amber per appearance, with its
/// dark ink label in both (Founder decision 2026-10-08).
enum WorkoutActivityPrimaryAction {
    static let darkHex: UInt32 = 0xEFB84F
    static let mineralLightHex: UInt32 = 0xC88228
    static let foregroundHex: UInt32 = 0x10202A
}

/// Live Activity palettes (Founder decisions 2026-10-08): Dark keeps the deep
/// navy field with WARM AMBER highlights replacing teal; Mineral Light is the
/// Option B mineral-neutral treatment (light mineral page, paper rows, ink
/// text, restrained amber highlights). In both, Complete Set is the iPhone
/// Finish Workout amber with the iPhone execution ink. Green stays rest and
/// success; purple stays finishing/reviewing. The Lock Screen follows the
/// app-owned PhysiqueOS appearance carried in the state (System = the iOS
/// appearance); the Dynamic Island is system black, so it always uses Dark.
struct WorkoutActivityTheme: Equatable {
    var page: Color
    var row: Color
    var privacyRow: Color
    var text: Color
    var secondaryText: Color
    var mutedText: Color
    /// Current / up-next labels and highlight tints (warm amber).
    var accent: Color
    /// The Complete Set fill and its label (iPhone Finish Workout amber + ink).
    var primaryAction: Color
    var onPrimaryAction: Color
    /// Rest and lifecycle success.
    var green: Color
    /// Needs-update and the final-set cue.
    var amber: Color
    /// Finishing / reviewing (restrained brand purple).
    var purple: Color

    static let dark = WorkoutActivityTheme(
        page: .activityHex(0x061019), row: .activityHex(0x132735), privacyRow: .activityHex(0x172235),
        text: .activityHex(0xF3F8FA), secondaryText: .activityHex(0xC3D2D9), mutedText: .activityHex(0x92A5AF),
        accent: .activityHex(0xEFB84F),
        primaryAction: .activityHex(WorkoutActivityPrimaryAction.darkHex),
        onPrimaryAction: .activityHex(WorkoutActivityPrimaryAction.foregroundHex),
        green: .activityHex(0x55E39A), amber: .activityHex(0xEFB84F), purple: .activityHex(0xAA98FF)
    )

    /// Option B: the existing Mineral Light canvas/paper/ink; small amber
    /// text uses the deeper amber ink (#925500) so it reads on paper.
    static let mineralLight = WorkoutActivityTheme(
        page: .activityHex(0xE8ECE5), row: .activityHex(0xFBFAF4), privacyRow: .activityHex(0xFBFAF4),
        text: .activityHex(0x102431), secondaryText: .activityHex(0x526970), mutedText: .activityHex(0x526970),
        accent: .activityHex(0x925500),
        primaryAction: .activityHex(WorkoutActivityPrimaryAction.mineralLightHex),
        onPrimaryAction: .activityHex(WorkoutActivityPrimaryAction.foregroundHex),
        green: .activityHex(0x16875F), amber: .activityHex(0x925500), purple: .activityHex(0x5C3FD2)
    )

    /// The Lock Screen palette: the app-owned appearance when the state
    /// carries one; System (or an older activity with none) follows iOS.
    static func resolve(_ appearance: WorkoutActivityState.Appearance?, system scheme: ColorScheme) -> Self {
        switch appearance {
        case .dark: .dark
        case .mineralLight: .mineralLight
        case .system, nil: scheme == .light ? .mineralLight : .dark
        }
    }

    /// The system-appearance palette (kept for callers without a state).
    static func of(_ scheme: ColorScheme) -> Self { resolve(nil, system: scheme) }

    /// ActivityKit's container tint (drawn behind the view): the Mineral page
    /// for an explicit Mineral Light choice, otherwise the navy field.
    static func backgroundTint(for appearance: WorkoutActivityState.Appearance?) -> Color {
        appearance == .mineralLight ? mineralLight.page : dark.page.opacity(0.96)
    }

    /// System action (e.g. the dismiss control) foreground for the appearance.
    static func systemActionForeground(for appearance: WorkoutActivityState.Appearance?) -> Color {
        appearance == .mineralLight ? mineralLight.text : dark.accent
    }
}

/// Fixed tokens kept for ActivityKit modifiers and test backdrops. Every
/// Live Activity color is a plain sRGB `Color`: ActivityKit archives the
/// view's display list, and UIKit-backed (dynamic or descriptor-based)
/// colors and fonts crash that encoder in the extension.
enum WorkoutActivityPalette {
    static let background = Color.activityHex(0x061019)
    static let elevated = Color.activityHex(0x132735)
    static let muted = Color.activityHex(0x172235)
    static let accent = Color.activityHex(0xEFB84F)
    static let success = Color.activityHex(0x55E39A)
    static let warning = Color.activityHex(0xEFB84F)
    static let primaryText = Color.activityHex(0xF3F8FA)
    static let secondaryText = Color.activityHex(0xC3D2D9)
    static let mutedText = Color.activityHex(0x92A5AF)
}

extension Color {
    static func activityHex(_ hex: UInt32) -> Color {
        Color(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

/// Live Activity type: SF system faces. The utility package allows SF where
/// Apple owns the surface, and a custom variable font cannot be archived by
/// ActivityKit's display-list encoder (it crashed the extension).
enum WorkoutActivityType {
    static func font(_ size: CGFloat, _ weight: CGFloat) -> Font {
        let mapped: Font.Weight = switch weight {
        case ..<450: .regular
        case ..<550: .medium
        case ..<650: .semibold
        case ..<750: .bold
        default: .heavy
        }
        return .system(size: size, weight: mapped)
    }
}

typealias WorkoutActivityState = WorkoutActivityAttributes.ContentState

/// What the Lock Screen and Island show for a state, decided in one place so
/// both surfaces agree and tests can assert it without pixels.
struct WorkoutActivityPresentation: Equatable {
    var phase: WorkoutActivityState.Phase
    var showsSetDetails: Bool
    var showsCompleteSet: Bool

    /// A stale activity (no update for hours) falls back to the safe
    /// "needs an update" state and offers no Complete Set, unless the
    /// staleness is only a Countdown reaching zero. Privacy redaction hides
    /// names, values and Complete Set (completing a set you cannot see).
    static func make(state: WorkoutActivityState, isStale: Bool, redaction: RedactionReasons) -> Self {
        var phase = state.phase
        if isStale, phase == .inProgress, state.rest?.mode != .countdown { phase = .paused }
        let details = WorkoutActivityPrivacy.showsSetDetails(redaction: redaction)
        return .init(phase: phase, showsSetDetails: details,
                     showsCompleteSet: phase == .inProgress && state.canCompleteSet && details)
    }
}

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
    /// "3/4 · 85 lb × 8" (the board's up-next format, used for every row so
    /// the set position is never lost).
    var setText: String {
        let position = "\(setNumber)/\(setCount)"
        return valueText.map { "\(position) · \($0)" } ?? position
    }
}

struct WorkoutCompleteSetButton: View {
    let attributes: WorkoutActivityAttributes
    let state: WorkoutActivityState
    var compact = true
    @Environment(\.colorScheme) private var colorScheme
    /// The Island is system black: it always uses the Dark tokens.
    var forceDark = false

    var body: some View {
        if let target = state.target, state.canCompleteSet {
            let theme = forceDark ? WorkoutActivityTheme.dark : .resolve(state.appearance, system: colorScheme)
            Button(intent: CompleteWorkoutSetIntent(
                sessionId: attributes.sessionId, authority: attributes.authority,
                exerciseId: target.exerciseId, setId: target.setId, expectedRevision: state.revision
            )) {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark").font(.system(size: 11, weight: .bold))
                    Text("Complete Set").font(WorkoutActivityType.font(compact ? 11 : 13, 760))
                }
                .foregroundStyle(theme.onPrimaryAction)
                .frame(maxWidth: compact ? 124 : .infinity, minHeight: 44)
                .padding(.horizontal, compact ? 6 : 0)
                .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(theme.primaryAction))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Complete Set")
            .accessibilityHint("Completes the current set and starts rest tracking")
        }
    }
}

/// The clock block's glyph and label, decided in one place so tests can
/// assert them without pixels. Rest shows the rest timer's own glyph; with no
/// rest (Rest Off, before the first set, or privacy) the elapsed WORKOUT clock
/// uses the stopwatch glyph. Both render in the block's green.
struct WorkoutClockPresentation: Equatable {
    enum Clock: Equatable { case rest, workoutElapsed }

    var clock: Clock
    var glyph: String
    var label: String
    var accessibilityLabel: String

    static func make(state: WorkoutActivityState, isStale: Bool, showsRest: Bool) -> Self {
        if showsRest, let rest = state.rest {
            let isCountdown = rest.mode == .countdown
            let expired = isCountdown && isStale
            return .init(
                clock: .rest,
                glyph: isCountdown ? "timer" : "stopwatch",
                label: expired ? "REST · COMPLETE" : (isCountdown ? "REST · COUNTDOWN" : "REST · STOPWATCH"),
                accessibilityLabel: isCountdown ? "Rest countdown" : "Rest stopwatch"
            )
        }
        return .init(clock: .workoutElapsed, glyph: "stopwatch", label: "WORKOUT", accessibilityLabel: "Workout time")
    }
}

/// The lower-left clock block: green glyph, a 7 pt label and a 20 pt value.
/// Rest when resting; otherwise (Rest Off, or privacy) the workout clock.
private struct WorkoutClockBlock: View {
    let state: WorkoutActivityState
    let isStale: Bool
    let theme: WorkoutActivityTheme
    var showsRest = true
    var compact = false
    @Environment(\.workoutActivityStartedAt) private var attributesStartedAt

    var body: some View {
        let content = WorkoutClockPresentation.make(state: state, isStale: isStale, showsRest: showsRest)
        if showsRest, let rest = state.rest {
            block(glyph: content.glyph, label: content.label) {
                WorkoutRestClockText(rest: rest)
            }
            .accessibilityLabel(content.accessibilityLabel)
        } else {
            block(glyph: content.glyph, label: content.label) {
                WorkoutElapsedText(startedAt: attributesStartedAt, finishedAt: state.finishedAt)
            }
            .accessibilityLabel(content.accessibilityLabel)
        }
    }

    private func block<Clock: View>(glyph: String, label: String, @ViewBuilder clock: () -> Clock) -> some View {
        HStack(spacing: 7) {
            Image(systemName: glyph)
                .font(.system(size: compact ? 12 : 14, weight: .semibold))
                .foregroundStyle(theme.green)
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .font(WorkoutActivityType.font(7, 760))
                    .foregroundStyle(theme.mutedText)
                    .lineLimit(1)
                clock()
                    .font(WorkoutActivityType.font(compact ? 15 : 20, 700))
                    .foregroundStyle(theme.text)
                    .frame(width: compact ? 58 : 84, alignment: .leading)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// One 31 pt context row: a 57 pt role column (amber for current / up next),
/// the exercise, and the set position + value.
private struct WorkoutContextRow: View {
    let row: WorkoutActivityState.Row
    let theme: WorkoutActivityTheme

    var body: some View {
        let emphasized = row.role == .current || row.role == .upNext
        HStack(spacing: 7) {
            Text(WorkoutRoleStyle.label(row.role))
                .font(WorkoutActivityType.font(7, 780))
                .tracking(0.49)
                .foregroundStyle(emphasized ? theme.accent : theme.mutedText)
                .frame(width: 57, alignment: .leading)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    if let label = row.supersetLabel {
                        Text("\(label)\(row.setNumber)")
                            .font(WorkoutActivityType.font(8, 760))
                            .foregroundStyle(theme.onPrimaryAction)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(theme.primaryAction))
                    }
                    Text(row.exerciseName)
                        .font(WorkoutActivityType.font(11, 700))
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.62)
                }
                if let partner = row.partnerName, row.role == .current {
                    Text("with \(partner)")
                        .font(WorkoutActivityType.font(8, 500))
                        .foregroundStyle(theme.mutedText)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 3)
            Text(row.setText)
                .font(WorkoutActivityType.font(9, 500))
                .monospacedDigit()
                .foregroundStyle(WorkoutRoleStyle.isDone(row.role) ? theme.secondaryText : theme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if WorkoutRoleStyle.isDone(row.role) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(theme.green)
            }
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, minHeight: 31)
        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(theme.row))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Lock Screen

struct WorkoutLockScreenView: View {
    let attributes: WorkoutActivityAttributes
    let state: WorkoutActivityState
    var isStale = false
    @Environment(\.redactionReasons) private var redactionReasons
    @Environment(\.colorScheme) private var colorScheme

    private var theme: WorkoutActivityTheme { .resolve(state.appearance, system: colorScheme) }
    private var isPrivate: Bool { !WorkoutActivityPrivacy.showsSetDetails(redaction: redactionReasons) }

    private var presentation: WorkoutActivityPresentation {
        .make(state: state, isStale: isStale, redaction: redactionReasons)
    }

    var body: some View {
        Group {
            switch presentation.phase {
            case .inProgress: activeBody
            case .allSetsComplete:
                statusBody(symbol: "checkmark", color: theme.green,
                           title: "All sets complete", message: "Finish when you're ready")
            case .reviewing:
                statusBody(symbol: "list.clipboard", color: theme.purple,
                           title: "Reviewing workout", message: "Finish in PhysiqueOS")
            case .finishing:
                statusBody(symbol: "arrow.triangle.2.circlepath", color: theme.purple,
                           title: "Saving workout…", message: "Keep PhysiqueOS nearby")
            case .saved:
                statusBody(symbol: "checkmark", color: theme.green,
                           title: "Workout saved", message: "\(state.completedSets) sets")
            case .paused:
                statusBody(symbol: "exclamationmark", color: theme.amber,
                           title: "Workout needs an update", message: "Open Logger to refresh")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .foregroundStyle(theme.text)
        // The page is drawn here (not as a dynamic activity tint) so the
        // Lock Screen follows the app-owned appearance with archivable colors.
        .background(theme.page)
        .environment(\.workoutActivityStartedAt, attributes.startedAt)
        .accessibilityElement(children: .contain)
    }

    private var activeBody: some View {
        VStack(spacing: 5) {
            header
            if isPrivate {
                privacyBody
            } else {
                ForEach(Array(state.rows.prefix(2).enumerated()), id: \.offset) { _, row in
                    WorkoutContextRow(row: row, theme: theme)
                }
            }
            HStack(spacing: 8) {
                // Privacy keeps only progress and a generic clock (LA9).
                WorkoutClockBlock(state: state, isStale: isStale, theme: theme, showsRest: !isPrivate)
                Spacer(minLength: 4)
                if presentation.showsCompleteSet { WorkoutCompleteSetButton(attributes: attributes, state: state) }
            }
            .frame(minHeight: 44)
            .padding(.top, 1)
        }
    }

    private var header: some View {
        HStack(spacing: 7) {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(theme.text)
            Text(isPrivate ? "Workout" : state.label)
                .font(WorkoutActivityType.font(11, 650))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
            Spacer(minLength: 5)
            Text(state.progressText)
                .font(WorkoutActivityType.font(11, 650))
            WorkoutElapsedText(startedAt: attributes.startedAt, finishedAt: state.finishedAt)
                .font(WorkoutActivityType.font(11, 650))
                .frame(width: 40, alignment: .trailing)
        }
        .frame(height: 20)
    }

    private var privacyBody: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text("ACTIVE WORKOUT")
                    .font(WorkoutActivityType.font(8, 500))
                    .foregroundStyle(theme.mutedText)
                Text("Set details hidden").font(WorkoutActivityType.font(14, 700))
            }
            Spacer()
            Image(systemName: "eye.slash").font(.system(size: 14, weight: .semibold)).foregroundStyle(theme.text)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, minHeight: 64)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(theme.privacyRow))
    }

    /// The sparse lifecycle template: a 44 pt tinted glyph, title + reason,
    /// and the frozen workout clock. The whole activity opens the Logger.
    private func statusBody(symbol: String, color: Color, title: String, message: String) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(color.opacity(0.13)).frame(width: 44, height: 44)
                Image(systemName: symbol).font(.system(size: 19, weight: .bold)).foregroundStyle(color)
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(WorkoutActivityType.font(16, 700)).lineLimit(1).minimumScaleFactor(0.8)
                Text(message).font(WorkoutActivityType.font(11, 500)).foregroundStyle(theme.secondaryText)
            }
            Spacer()
            WorkoutElapsedText(startedAt: attributes.startedAt, finishedAt: state.finishedAt)
                .font(WorkoutActivityType.font(16, 500))
                .frame(width: 52, alignment: .trailing)
        }
        .frame(minHeight: 96)
    }
}

// MARK: - Dynamic Island

/// Expanded bottom region (system black): two side-by-side context cards,
/// the rest clock lower-left, Complete Set trailing.
struct WorkoutIslandExpandedBottom: View {
    let attributes: WorkoutActivityAttributes
    let state: WorkoutActivityState
    var isStale = false
    @Environment(\.redactionReasons) private var redactionReasons

    private let theme = WorkoutActivityTheme.dark
    private var isPrivate: Bool { !WorkoutActivityPrivacy.showsSetDetails(redaction: redactionReasons) }

    private var presentation: WorkoutActivityPresentation {
        .make(state: state, isStale: isStale, redaction: redactionReasons)
    }

    var body: some View {
        VStack(spacing: 7) {
            if presentation.phase == .inProgress {
                if isPrivate {
                    Text("Set details hidden")
                        .font(WorkoutActivityType.font(12, 700))
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(RoundedRectangle(cornerRadius: 9).fill(theme.accent.opacity(0.125)))
                } else {
                    HStack(spacing: 7) {
                        ForEach(Array(state.rows.prefix(2).enumerated()), id: \.offset) { _, row in
                            context(row)
                        }
                    }
                }
                HStack(spacing: 8) {
                    WorkoutClockBlock(state: state, isStale: isStale, theme: theme, showsRest: !isPrivate)
                    Spacer(minLength: 4)
                    if presentation.showsCompleteSet {
                        WorkoutCompleteSetButton(attributes: attributes, state: state, forceDark: true).frame(width: 124, height: 44)
                    }
                }
            } else {
                Text(statusText).font(WorkoutActivityType.font(13, 650)).frame(maxWidth: .infinity, minHeight: 44)
            }
        }
        .foregroundStyle(theme.text)
        .environment(\.workoutActivityStartedAt, attributes.startedAt)
    }

    private var statusText: String {
        switch presentation.phase {
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
            case .previous: theme.mutedText
            case .completed: theme.green
            case .current: theme.accent
            case .upNext: theme.accent
            }
        }()
        return VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(WorkoutActivityType.font(7, 760))
                .foregroundStyle(accent)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(row.exerciseName)
                .font(WorkoutActivityType.font(10, 700))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
            Text("Set \(row.setNumber)/\(row.setCount)" + (row.valueText.map { " · \($0)" } ?? ""))
                .font(WorkoutActivityType.font(9, 500))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(accent.opacity(0.125)))
        .accessibilityElement(children: .combine)
    }
}

/// Compact leading: the workout glyph (white on system black).
struct WorkoutIslandCompactLeading: View {
    var body: some View {
        Image(systemName: "dumbbell.fill")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(WorkoutActivityTheme.dark.text)
    }
}

/// Compact trailing: a green rest dot + rest clock while resting, else the
/// workout elapsed.
struct WorkoutIslandCompactTrailing: View {
    let attributes: WorkoutActivityAttributes
    let state: WorkoutActivityState

    var body: some View {
        if let rest = state.rest, state.phase == .inProgress {
            HStack(spacing: 4) {
                Circle().fill(WorkoutActivityTheme.dark.green).frame(width: 6, height: 6)
                WorkoutRestClockText(rest: rest)
                    .font(WorkoutActivityType.font(12, 760))
                    .foregroundStyle(WorkoutActivityTheme.dark.text)
                    .frame(width: 40, alignment: .trailing)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Rest")
        } else {
            WorkoutElapsedText(startedAt: attributes.startedAt, finishedAt: state.finishedAt)
                .font(WorkoutActivityType.font(12, 760))
                .foregroundStyle(WorkoutActivityTheme.dark.text)
                .frame(width: 44, alignment: .trailing)
        }
    }
}

/// Minimal: an unmistakable rest ring + glyph while resting, else the
/// workout glyph.
struct WorkoutIslandMinimal: View {
    let state: WorkoutActivityState

    var body: some View {
        if let rest = state.rest, state.phase == .inProgress {
            ZStack {
                Circle()
                    .stroke(WorkoutActivityTheme.dark.green.opacity(0.33), lineWidth: 2)
                    .padding(2)
                Image(systemName: rest.mode == .countdown ? "timer" : "stopwatch")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(WorkoutActivityTheme.dark.green)
            }
            .accessibilityLabel("Resting")
        } else {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(WorkoutActivityTheme.dark.text)
                .accessibilityLabel("Workout")
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
