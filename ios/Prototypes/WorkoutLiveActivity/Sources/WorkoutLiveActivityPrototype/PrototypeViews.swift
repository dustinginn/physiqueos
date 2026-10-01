import SwiftUI

public enum CompleteSetPlacement: String, Sendable {
    case trailing
    case fullWidth
}

public enum PrototypePalette {
    public static let background = Color(red: 8 / 255, green: 13 / 255, blue: 24 / 255)
    public static let elevated = Color(red: 20 / 255, green: 31 / 255, blue: 49 / 255)
    public static let muted = Color(red: 23 / 255, green: 34 / 255, blue: 53 / 255)
    public static let accent = Color(red: 139 / 255, green: 140 / 255, blue: 255 / 255)
    public static let success = Color(red: 74 / 255, green: 222 / 255, blue: 128 / 255)
    public static let warning = Color(red: 251 / 255, green: 191 / 255, blue: 36 / 255)
    public static let primaryText = Color(red: 243 / 255, green: 246 / 255, blue: 251 / 255)
    public static let secondaryText = Color(red: 203 / 255, green: 213 / 255, blue: 225 / 255)
    public static let mutedText = Color(red: 154 / 255, green: 168 / 255, blue: 186 / 255)
}

public struct LockScreenActivityCard: View {
    public let fixture: WorkoutActivityFixture
    public let placement: CompleteSetPlacement

    public init(fixture: WorkoutActivityFixture, placement: CompleteSetPlacement = .trailing) {
        self.fixture = fixture
        self.placement = placement
    }

    public var body: some View {
        Group {
            switch fixture.phase {
            case .active:
                activeBody
            case .allSetsComplete:
                statusBody(
                    symbol: "checkmark.circle.fill",
                    color: PrototypePalette.success,
                    title: "All sets complete",
                    message: "Finish when you're ready",
                    action: "Open Logger"
                )
            case .saving:
                statusBody(
                    symbol: "arrow.triangle.2.circlepath",
                    color: PrototypePalette.accent,
                    title: "Saving workout…",
                    message: "Keep PhysiqueOS nearby",
                    action: nil
                )
            case .completed:
                statusBody(
                    symbol: "checkmark.seal.fill",
                    color: PrototypePalette.success,
                    title: "Workout saved",
                    message: "18 sets · \(fixture.workoutElapsedText)",
                    action: "View summary"
                )
            case .stale:
                statusBody(
                    symbol: "exclamationmark.arrow.triangle.2.circlepath",
                    color: PrototypePalette.warning,
                    title: "Workout needs an update",
                    message: "Open Logger to refresh",
                    action: "Open Logger"
                )
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .frame(
            width: WorkoutPrototypeMetrics.lockScreenWidth,
            height: WorkoutPrototypeMetrics.lockScreenMaximumHeight
        )
        .background(
            RoundedRectangle(cornerRadius: 23, style: .continuous)
                .fill(PrototypePalette.background.opacity(0.96))
                .overlay(
                    RoundedRectangle(cornerRadius: 23, style: .continuous)
                        .stroke(Color.white.opacity(0.12), lineWidth: 0.75)
                )
        )
        .foregroundStyle(PrototypePalette.primaryText)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    private var activeBody: some View {
        VStack(spacing: 5) {
            header
            if fixture.privacyMode == .redacted {
                privacyBody
            } else {
                contextRows
            }
            footer
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(PrototypePalette.accent)
            Text(fixture.privacyMode == .redacted ? "Workout" : fixture.sessionLabel)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
            Spacer(minLength: 5)
            Text(fixture.progressText)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(PrototypePalette.mutedText)
            Text(fixture.workoutElapsedText)
                .font(.system(size: 11, weight: .semibold, design: .rounded).monospacedDigit())
        }
        .frame(height: 16)
    }

    @ViewBuilder
    private var contextRows: some View {
        if placement == .fullWidth, let current = fixture.currentSet {
            SetContextRow(role: .current, context: current)
        } else {
            switch fixture.contextPhase {
            case .normal:
                if let previous = fixture.previousCompletedSet {
                    SetContextRow(role: .previous, context: previous)
                }
                if let current = fixture.currentSet {
                    SetContextRow(role: .current, context: current)
                }
            case .finalSet:
                if let current = fixture.currentSet {
                    SetContextRow(role: .current, context: current)
                }
                if let next = fixture.nextExerciseFirstSet {
                    SetContextRow(role: .upNext, context: next)
                }
            case .postFinalSet:
                if let completed = fixture.previousCompletedSet {
                    SetContextRow(role: .completed, context: completed)
                }
                if let next = fixture.nextExerciseFirstSet {
                    SetContextRow(role: .upNext, context: next)
                }
            case .none:
                EmptyView()
            }
        }
    }

    private var privacyBody: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("ACTIVE WORKOUT")
                    .font(.system(size: 9, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(PrototypePalette.mutedText)
                Text("Set details hidden")
                    .font(.system(size: 14, weight: .semibold))
            }
            Spacer()
            Image(systemName: "eye.slash.fill")
                .foregroundStyle(PrototypePalette.secondaryText)
        }
        .padding(.horizontal, 9)
        .frame(maxWidth: .infinity, minHeight: 64)
        .background(RoundedRectangle(cornerRadius: 12).fill(PrototypePalette.muted.opacity(0.9)))
    }

    private var footer: some View {
        Group {
            if placement == .fullWidth {
                VStack(spacing: 4) {
                    restSummary(compact: true)
                    CompleteSetButton(compact: false)
                }
            } else {
                HStack(spacing: 8) {
                    restSummary(compact: false)
                    Spacer(minLength: 4)
                    CompleteSetButton(compact: true)
                }
            }
        }
        .frame(minHeight: placement == .fullWidth ? 49 : 44)
    }

    @ViewBuilder
    private func restSummary(compact: Bool) -> some View {
        if let timer = fixture.restTimerText {
            HStack(spacing: 6) {
                Image(systemName: fixture.restMode == .countdown ? "timer" : "stopwatch.fill")
                    .font(.system(size: compact ? 10 : 13, weight: .semibold))
                    .foregroundStyle(fixture.restMode == .countdown ? PrototypePalette.warning : PrototypePalette.success)
                VStack(alignment: .leading, spacing: 0) {
                    Text(fixture.restMode == .countdown ? "REST · COUNTDOWN" : "REST · STOPWATCH")
                        .font(.system(size: compact ? 7 : 8, weight: .bold))
                        .tracking(0.45)
                        .foregroundStyle(PrototypePalette.mutedText)
                    Text(timer)
                        .font(.system(size: compact ? 13 : 21, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(PrototypePalette.primaryText)
                }
            }
            .accessibilityLabel(fixture.restAccessibilityLabel ?? "")
        } else {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: compact ? 10 : 12, weight: .semibold))
                    .foregroundStyle(PrototypePalette.accent)
                VStack(alignment: .leading, spacing: 0) {
                    Text("WORKOUT")
                        .font(.system(size: 8, weight: .bold))
                        .tracking(0.45)
                        .foregroundStyle(PrototypePalette.mutedText)
                    Text(fixture.workoutElapsedText)
                        .font(.system(size: compact ? 12 : 17, weight: .bold, design: .rounded).monospacedDigit())
                }
            }
        }
    }

    private func statusBody(
        symbol: String,
        color: Color,
        title: String,
        message: String,
        action: String?
    ) -> some View {
        VStack(spacing: 11) {
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill(color.opacity(0.15)).frame(width: 42, height: 42)
                    Image(systemName: symbol)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(color)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.system(size: 16, weight: .bold))
                    Text(message)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(PrototypePalette.secondaryText)
                }
                Spacer()
                Text(fixture.workoutElapsedText)
                    .font(.system(size: 12, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(PrototypePalette.mutedText)
            }
            if let action {
                Text(action)
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .background(RoundedRectangle(cornerRadius: 13).fill(PrototypePalette.accent.opacity(0.2)))
                    .foregroundStyle(PrototypePalette.primaryText)
            }
        }
    }

    private var accessibilityLabel: String {
        var parts = fixture.visibleTextTokens
        if fixture.phase == .active { parts.append("Complete Set button") }
        return parts.filter { !$0.isEmpty }.joined(separator: ", ")
    }
}

private struct CompleteSetButton: View {
    let compact: Bool

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .bold))
            Text("Complete Set")
                .font(.system(size: compact ? 11 : 13, weight: .bold))
        }
        .foregroundStyle(Color.black)
        .frame(
            maxWidth: compact ? 124 : .infinity,
            minHeight: WorkoutPrototypeMetrics.completeSetMinimumHeight
        )
        .padding(.horizontal, compact ? 9 : 0)
        .background(RoundedRectangle(cornerRadius: 13).fill(PrototypePalette.accent))
        .accessibilityLabel("Complete Set")
        .accessibilityHint("Completes the current set and starts rest tracking")
    }
}

private struct SetContextRow: View {
    enum Role {
        case previous
        case current
        case completed
        case upNext

        var label: String {
            switch self {
            case .previous: "PREVIOUS"
            case .current: "CURRENT"
            case .completed: "COMPLETED"
            case .upNext: "UP NEXT"
            }
        }
    }

    let role: Role
    let context: WorkoutActivityFixture.SetContext

    var body: some View {
        HStack(spacing: 7) {
            Text(role.label)
                .font(.system(size: 8, weight: .bold))
                .tracking(0.45)
                .foregroundStyle(role == .current || role == .upNext ? PrototypePalette.accent : PrototypePalette.mutedText)
                .frame(width: 54, alignment: .leading)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    if let supersetLabel = context.supersetLabel {
                        Text(supersetLabel)
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(Color.black)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(PrototypePalette.warning))
                    }
                    Text(context.exerciseName)
                        .font(.system(size: role == .current || role == .upNext ? 11 : 10, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.62)
                }
                if let partner = context.supersetPartnerName, role == .current {
                    Text("with \(partner)")
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(PrototypePalette.mutedText)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 3)
            Text("S\(context.setNumber)/\(context.setCount) · \(context.targetText)")
                .font(.system(size: role == .current || role == .upNext ? 10 : 9, weight: .semibold, design: .rounded))
                .foregroundStyle(role == .previous || role == .completed ? PrototypePalette.secondaryText : PrototypePalette.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if role == .previous || role == .completed {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(PrototypePalette.success)
            }
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, minHeight: 27)
        .background(
            RoundedRectangle(cornerRadius: 9)
                .fill(role == .current || role == .upNext ? PrototypePalette.accent.opacity(0.12) : PrototypePalette.muted.opacity(0.78))
        )
    }
}

public struct LockScreenScene: View {
    public let fixture: WorkoutActivityFixture
    public let placement: CompleteSetPlacement

    public init(fixture: WorkoutActivityFixture, placement: CompleteSetPlacement = .trailing) {
        self.fixture = fixture
        self.placement = placement
    }

    public var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 27 / 255, green: 24 / 255, blue: 66 / 255),
                    PrototypePalette.background,
                    Color.black,
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Circle()
                .fill(PrototypePalette.accent.opacity(0.16))
                .frame(width: 300, height: 300)
                .blur(radius: 70)
                .offset(x: 145, y: -240)
            Circle()
                .fill(Color.blue.opacity(0.12))
                .frame(width: 260, height: 260)
                .blur(radius: 64)
                .offset(x: -155, y: 170)

            VStack(spacing: 0) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .padding(.top, 17)
                Text("Thursday, October 1")
                    .font(.system(size: 18, weight: .medium, design: .rounded))
                    .padding(.top, 13)
                Text("9:41")
                    .font(.system(size: 78, weight: .thin, design: .rounded))
                    .tracking(-3)
                Spacer()
                LockScreenActivityCard(fixture: fixture, placement: placement)
                    .shadow(color: Color.black.opacity(0.42), radius: 16, y: 8)
                    .padding(.bottom, 98)
                HStack {
                    systemCircle("flashlight.off.fill")
                    Spacer()
                    systemCircle("camera.fill")
                }
                .padding(.horizontal, 46)
                .padding(.bottom, 34)
            }
            .foregroundStyle(Color.white)
        }
        .frame(width: 393, height: 852)
        .clipped()
    }

    private func systemCircle(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 18, weight: .medium))
            .frame(width: 50, height: 50)
            .background(Circle().fill(Color.black.opacity(0.45)))
    }
}

public enum DynamicIslandPresentation: Sendable {
    case compactWorkout
    case compactRest
    case minimal
    case expandedNormal
    case expandedFinalRest
    case expandedPostFinal
    case expandedActiveRest
}

public struct DynamicIslandScene: View {
    public let presentation: DynamicIslandPresentation
    public let fixture: WorkoutActivityFixture

    public init(presentation: DynamicIslandPresentation, fixture: WorkoutActivityFixture) {
        self.presentation = presentation
        self.fixture = fixture
    }

    public var body: some View {
        ZStack(alignment: .top) {
            LinearGradient(
                colors: [PrototypePalette.elevated, PrototypePalette.background],
                startPoint: .top,
                endPoint: .bottom
            )
            loggerBackdrop
                .padding(.top, 84)
                .opacity(0.62)
            HStack {
                Text("9:41")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: "cellularbars")
                    Image(systemName: "wifi")
                    Image(systemName: "battery.100percent")
                }
                .font(.system(size: 10, weight: .semibold))
            }
            .padding(.horizontal, 28)
            .padding(.top, 12)
            .foregroundStyle(Color.white)

            island
                .padding(.top, 7)
                .shadow(color: Color.black.opacity(0.6), radius: 12, y: 6)
        }
        .frame(width: 393, height: 300)
        .clipped()
    }

    @ViewBuilder
    private var island: some View {
        switch presentation {
        case .compactWorkout:
            compact(restDominant: false)
        case .compactRest:
            compact(restDominant: true)
        case .minimal:
            minimal
        case .expandedNormal, .expandedFinalRest, .expandedPostFinal, .expandedActiveRest:
            expanded
        }
    }

    private func compact(restDominant: Bool) -> some View {
        HStack(spacing: 0) {
            HStack(spacing: 5) {
                Image(systemName: "dumbbell.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PrototypePalette.accent)
            }
            .frame(width: 48, alignment: .leading)
            Spacer(minLength: 25)
            HStack(spacing: 3) {
                if restDominant {
                    Circle().fill(PrototypePalette.success).frame(width: 5, height: 5)
                }
                Text(restDominant ? (fixture.restTimerText ?? "0:00") : fixture.workoutElapsedText)
                    .font(.system(size: 11, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(restDominant ? PrototypePalette.success : Color.white)
            }
            .frame(width: 49, alignment: .trailing)
        }
        .padding(.horizontal, 10)
        .frame(width: 139, height: WorkoutPrototypeMetrics.dynamicIslandCompactHeight)
        .background(Capsule().fill(Color.black))
        .accessibilityLabel(restDominant ? (fixture.restAccessibilityLabel ?? "Active workout") : "Active workout, \(fixture.progressText), elapsed \(fixture.workoutElapsedText)")
    }

    private var minimal: some View {
        ZStack {
            Circle().fill(Color.black)
            Circle()
                .trim(from: 0.12, to: 0.82)
                .stroke(PrototypePalette.success, style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .padding(5)
            Image(systemName: "stopwatch.fill")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color.white)
        }
        .frame(width: WorkoutPrototypeMetrics.dynamicIslandMinimalWidth, height: WorkoutPrototypeMetrics.dynamicIslandCompactHeight)
        .accessibilityLabel("Workout rest stopwatch active")
    }

    private var expanded: some View {
        VStack(spacing: 7) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "dumbbell.fill")
                        .foregroundStyle(PrototypePalette.accent)
                    Text("Workout")
                        .font(.system(size: 11, weight: .semibold))
                        .lineLimit(1)
                }
                .frame(width: 105, alignment: .leading)
                Spacer()
                Text(fixture.workoutElapsedText)
                    .font(.system(size: 11, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(PrototypePalette.secondaryText)
                    .frame(width: 54, alignment: .trailing)
            }
            expandedContexts
            HStack(spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: fixture.restMode == .countdown ? "timer" : "stopwatch.fill")
                        .foregroundStyle(fixture.restMode == .countdown ? PrototypePalette.warning : PrototypePalette.success)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(fixture.restMode == .countdown ? "REST COUNTDOWN" : "REST STOPWATCH")
                            .font(.system(size: 7, weight: .bold))
                            .tracking(0.45)
                            .foregroundStyle(PrototypePalette.mutedText)
                        Text(fixture.restTimerText ?? "—")
                            .font(.system(size: 17, weight: .bold, design: .rounded).monospacedDigit())
                    }
                }
                Spacer()
                CompleteSetButton(compact: true)
                    .frame(width: 122, height: 44)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(width: WorkoutPrototypeMetrics.dynamicIslandExpandedWidth, height: 156)
        .background(RoundedRectangle(cornerRadius: 35, style: .continuous).fill(Color.black))
        .overlay(alignment: .top) {
            Capsule().fill(Color.black).frame(width: 108, height: 29).offset(y: -1)
        }
    }

    @ViewBuilder
    private var expandedContexts: some View {
        HStack(spacing: 8) {
            switch fixture.contextPhase {
            case .normal:
                if let previous = fixture.previousCompletedSet {
                    expandedContext(label: "PREVIOUS", context: previous, accent: PrototypePalette.mutedText)
                }
                if let current = fixture.currentSet {
                    expandedContext(label: "CURRENT", context: current, accent: PrototypePalette.accent)
                }
            case .finalSet:
                if let current = fixture.currentSet {
                    expandedContext(label: "CURRENT · FINAL", context: current, accent: PrototypePalette.warning)
                }
                if let next = fixture.nextExerciseFirstSet {
                    expandedContext(label: "UP NEXT", context: next, accent: PrototypePalette.accent)
                }
            case .postFinalSet:
                if let completed = fixture.previousCompletedSet {
                    expandedContext(label: "COMPLETED", context: completed, accent: PrototypePalette.success)
                }
                if let next = fixture.nextExerciseFirstSet {
                    expandedContext(label: "UP NEXT", context: next, accent: PrototypePalette.accent)
                }
            case .none:
                EmptyView()
            }
        }
    }

    private func expandedContext(
        label: String,
        context: WorkoutActivityFixture.SetContext,
        accent: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 7, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(accent)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(context.exerciseName)
                .font(.system(size: 10, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
            Text("Set \(context.setNumber)/\(context.setCount) · \(context.targetText)")
                .font(.system(size: 9, weight: .medium, design: .rounded))
                .foregroundStyle(PrototypePalette.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .padding(.horizontal, 8)
        .frame(width: 169.5, height: 38, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 9).fill(accent.opacity(0.12)))
    }

    private var loggerBackdrop: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Workout Logger")
                        .font(.system(size: 17, weight: .bold))
                    Text("Tap the Live Activity to return")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(PrototypePalette.mutedText)
                }
                Spacer()
                Image(systemName: "ellipsis")
            }
            RoundedRectangle(cornerRadius: 18)
                .fill(PrototypePalette.elevated)
                .frame(height: 102)
                .overlay(alignment: .topLeading) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Incline Dumbbell Press")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Set 3 of 4")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(PrototypePalette.mutedText)
                    }
                    .padding(14)
                }
        }
        .padding(.horizontal, 18)
        .foregroundStyle(Color.white)
    }
}

public struct DensityAlternativesScene: View {
    public init() {}

    public var body: some View {
        ZStack {
            PrototypePalette.background
            VStack(alignment: .leading, spacing: 20) {
                title("A · Normal density", subtitle: "Previous + Current")
                LockScreenActivityCard(fixture: WorkoutActivityFixtureCatalog.normalStopwatch)
                title("B · Final-set transition", subtitle: "Current + Up Next · Previous drops away")
                LockScreenActivityCard(fixture: WorkoutActivityFixtureCatalog.finalSet)
                title("C · After completion", subtitle: "Completed + Up Next")
                LockScreenActivityCard(fixture: WorkoutActivityFixtureCatalog.postFinalSet)
            }
            .padding(24)
        }
        .frame(width: 425, height: 740)
    }

    private func title(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.system(size: 16, weight: .bold))
            Text(subtitle)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(PrototypePalette.mutedText)
        }
        .foregroundStyle(Color.white)
    }
}

public struct CompleteSetPlacementScene: View {
    public init() {}

    public var body: some View {
        ZStack {
            PrototypePalette.background
            VStack(alignment: .leading, spacing: 22) {
                title("Recommended · trailing action", subtitle: "Preserves rest dominance and a 44 pt target")
                LockScreenActivityCard(
                    fixture: WorkoutActivityFixtureCatalog.normalStopwatch,
                    placement: .trailing
                )
                title("Alternative · full-width action", subtitle: "Clearer affordance, but compresses set context")
                LockScreenActivityCard(
                    fixture: WorkoutActivityFixtureCatalog.normalStopwatch,
                    placement: .fullWidth
                )
            }
            .padding(24)
        }
        .frame(width: 425, height: 520)
    }

    private func title(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.system(size: 15, weight: .bold))
            Text(subtitle)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(PrototypePalette.mutedText)
        }
        .foregroundStyle(Color.white)
    }
}
