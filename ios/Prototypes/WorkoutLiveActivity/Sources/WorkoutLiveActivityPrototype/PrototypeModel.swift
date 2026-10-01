import Foundation

/// NON-SHIPPING, fixture-only projection for visual review. It deliberately
/// has no ActivityKit, app-authority, persistence, networking, or mutation
/// dependency. The accepted TrainingSessionAuthority projection supersedes
/// this provisional shape when that architecture lane publishes.
public struct WorkoutActivityFixture: Identifiable, Hashable, Sendable {
    public enum Phase: String, Hashable, Sendable {
        case active
        case allSetsComplete
        case saving
        case completed
        case stale
    }

    public enum PrivacyMode: String, Hashable, Sendable {
        case full
        case redacted
    }

    public enum CompletionState: String, Hashable, Sendable {
        case inProgress
        case finishWhenReady
        case saving
        case saved
    }

    public struct SetContext: Hashable, Sendable {
        public enum Kind: String, Hashable, Sendable {
            case weighted
            case timed
            case bodyweight
        }

        public let exerciseName: String
        public let setNumber: Int
        public let setCount: Int
        public let targetText: String
        public let completed: Bool
        public let kind: Kind
        public let supersetLabel: String?
        public let supersetPartnerName: String?

        public init(
            exerciseName: String,
            setNumber: Int,
            setCount: Int,
            targetText: String,
            completed: Bool,
            kind: Kind = .weighted,
            supersetLabel: String? = nil,
            supersetPartnerName: String? = nil
        ) {
            self.exerciseName = exerciseName
            self.setNumber = setNumber
            self.setCount = setCount
            self.targetText = targetText
            self.completed = completed
            self.kind = kind
            self.supersetLabel = supersetLabel
            self.supersetPartnerName = supersetPartnerName
        }
    }

    public enum RestMode: String, Hashable, Sendable {
        case stopwatch
        case countdown
        case off
    }

    public struct Progress: Hashable, Sendable {
        public let completedSets: Int
        public let totalSets: Int
    }

    public let id: String
    public let sessionId: String
    public let sessionLabel: String
    public let startedAt: Date
    public let referenceDate: Date
    public let phase: Phase
    public let previousCompletedSet: SetContext?
    public let currentSet: SetContext?
    public let currentExercise: String?
    public let isFinalSetOfExercise: Bool
    public let nextExerciseFirstSet: SetContext?
    public let progress: Progress
    public let restMode: RestMode
    public let restStartedAt: Date?
    public let restEndsAt: Date?
    public let completionState: CompletionState
    public let privacyMode: PrivacyMode

    public var workoutElapsedText: String {
        Self.durationText(max(0, Int(referenceDate.timeIntervalSince(startedAt))))
    }

    public var restTimerText: String? {
        switch restMode {
        case .stopwatch:
            guard let restStartedAt else { return nil }
            return Self.durationText(max(0, Int(referenceDate.timeIntervalSince(restStartedAt))))
        case .countdown:
            guard let restEndsAt else { return nil }
            return Self.durationText(max(0, Int(restEndsAt.timeIntervalSince(referenceDate))))
        case .off:
            return nil
        }
    }

    public var restAccessibilityLabel: String? {
        guard let restTimerText else { return nil }
        switch restMode {
        case .stopwatch: return "Rest stopwatch, \(restTimerText) elapsed"
        case .countdown: return "Rest countdown, \(restTimerText) remaining"
        case .off: return nil
        }
    }

    public var fullContextRowCount: Int {
        switch phase {
        case .saving, .completed, .allSetsComplete, .stale:
            return 0
        case .active:
            if previousCompletedSet != nil && currentSet != nil { return 2 }
            if currentSet != nil && nextExerciseFirstSet != nil { return 2 }
            return [previousCompletedSet, currentSet, nextExerciseFirstSet].compactMap { $0 }.count
        }
    }

    /// A testable text inventory for the privacy gate. It mirrors the view's
    /// redacted branch rather than serializing hidden fixture values.
    public var visibleTextTokens: [String] {
        if privacyMode == .redacted {
            return ["Workout", "Active", workoutElapsedText, progressText] + (restTimerText.map { [$0] } ?? [])
        }
        return [sessionLabel, currentExercise ?? "", progressText]
            + [previousCompletedSet, currentSet, nextExerciseFirstSet]
                .compactMap { $0 }
                .flatMap { [$0.exerciseName, $0.targetText] }
            + (restTimerText.map { [$0] } ?? [])
    }

    public var progressText: String {
        "\(progress.completedSets)/\(progress.totalSets) sets"
    }

    public static func durationText(_ totalSeconds: Int) -> String {
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%d:%02d", minutes, seconds)
    }
}

public enum WorkoutActivityFixtureCatalog {
    private static let reference = ISO8601DateFormatter().date(from: "2026-10-01T16:15:00Z")!
    private static let sessionStart = reference.addingTimeInterval(-48 * 60 - 12)
    private static let standardPrevious = WorkoutActivityFixture.SetContext(
        exerciseName: "Incline Dumbbell Press",
        setNumber: 2,
        setCount: 4,
        targetText: "80 lb × 10",
        completed: true
    )
    private static let standardCurrent = WorkoutActivityFixture.SetContext(
        exerciseName: "Incline Dumbbell Press",
        setNumber: 3,
        setCount: 4,
        targetText: "85 lb × 8",
        completed: false
    )
    private static let nextExercise = WorkoutActivityFixture.SetContext(
        exerciseName: "Cable Lateral Raise",
        setNumber: 1,
        setCount: 3,
        targetText: "20 lb × 12",
        completed: false
    )

    public static let normalStopwatch = make(
        id: "normal-stopwatch",
        previous: standardPrevious,
        current: standardCurrent,
        progress: .init(completedSets: 6, totalSets: 18),
        restMode: .stopwatch,
        restStartedAt: reference.addingTimeInterval(-107)
    )

    public static let normalCountdown = make(
        id: "normal-countdown",
        previous: standardPrevious,
        current: standardCurrent,
        progress: .init(completedSets: 6, totalSets: 18),
        restMode: .countdown,
        restStartedAt: reference.addingTimeInterval(-47),
        restEndsAt: reference.addingTimeInterval(73)
    )

    public static let restOff = make(
        id: "rest-off",
        previous: standardPrevious,
        current: standardCurrent,
        progress: .init(completedSets: 6, totalSets: 18),
        restMode: .off
    )

    public static let finalSet = make(
        id: "final-set",
        previous: .init(
            exerciseName: "Incline Dumbbell Press",
            setNumber: 3,
            setCount: 4,
            targetText: "85 lb × 8",
            completed: true
        ),
        current: .init(
            exerciseName: "Incline Dumbbell Press",
            setNumber: 4,
            setCount: 4,
            targetText: "85 lb × 8",
            completed: false
        ),
        isFinalSet: true,
        next: nextExercise,
        progress: .init(completedSets: 7, totalSets: 18),
        restMode: .stopwatch,
        restStartedAt: reference.addingTimeInterval(-92)
    )

    public static let postFinalSet = make(
        id: "post-final-set",
        previous: .init(
            exerciseName: "Incline Dumbbell Press",
            setNumber: 4,
            setCount: 4,
            targetText: "85 lb × 8",
            completed: true
        ),
        current: nextExercise,
        next: nil,
        progress: .init(completedSets: 8, totalSets: 18),
        restMode: .stopwatch,
        restStartedAt: reference.addingTimeInterval(-12)
    )

    public static let superset = make(
        id: "superset",
        sessionLabel: "Upper · Superset",
        previous: .init(
            exerciseName: "Cable Fly",
            setNumber: 2,
            setCount: 3,
            targetText: "30 lb × 12",
            completed: true,
            supersetLabel: "A1",
            supersetPartnerName: "Chest-Supported Row"
        ),
        current: .init(
            exerciseName: "Chest-Supported Row",
            setNumber: 2,
            setCount: 3,
            targetText: "70 lb × 10",
            completed: false,
            supersetLabel: "A2",
            supersetPartnerName: "Cable Fly"
        ),
        progress: .init(completedSets: 9, totalSets: 16),
        restMode: .stopwatch,
        restStartedAt: reference.addingTimeInterval(-38)
    )

    public static let timedSet = make(
        id: "timed-set",
        sessionLabel: "Core · Stability",
        previous: .init(
            exerciseName: "Dead Bug",
            setNumber: 2,
            setCount: 3,
            targetText: "10 / side",
            completed: true,
            kind: .bodyweight
        ),
        current: .init(
            exerciseName: "Hollow Body Hold",
            setNumber: 1,
            setCount: 3,
            targetText: "45 sec",
            completed: false,
            kind: .timed
        ),
        progress: .init(completedSets: 4, totalSets: 12),
        restMode: .countdown,
        restStartedAt: reference.addingTimeInterval(-30),
        restEndsAt: reference.addingTimeInterval(60)
    )

    public static let bodyweightSet = make(
        id: "bodyweight-set",
        sessionLabel: "Pull · Back & Biceps",
        previous: .init(
            exerciseName: "Pull-Up",
            setNumber: 1,
            setCount: 4,
            targetText: "BW × 9",
            completed: true,
            kind: .bodyweight
        ),
        current: .init(
            exerciseName: "Pull-Up",
            setNumber: 2,
            setCount: 4,
            targetText: "BW × 8",
            completed: false,
            kind: .bodyweight
        ),
        progress: .init(completedSets: 2, totalSets: 17),
        restMode: .stopwatch,
        restStartedAt: reference.addingTimeInterval(-64)
    )

    public static let allSetsComplete = make(
        id: "all-sets-complete",
        phase: .allSetsComplete,
        previous: nil,
        current: nil,
        progress: .init(completedSets: 18, totalSets: 18),
        restMode: .off,
        completionState: .finishWhenReady
    )

    public static let saving = make(
        id: "saving",
        phase: .saving,
        previous: nil,
        current: nil,
        progress: .init(completedSets: 18, totalSets: 18),
        restMode: .off,
        completionState: .saving
    )

    public static let completed = make(
        id: "completed",
        phase: .completed,
        previous: nil,
        current: nil,
        progress: .init(completedSets: 18, totalSets: 18),
        restMode: .off,
        completionState: .saved
    )

    public static let privacyRedacted = make(
        id: "privacy-redacted",
        sessionLabel: "PRIVATE FIXTURE NAME",
        previous: .init(
            exerciseName: "PRIVATE EXERCISE PREVIOUS",
            setNumber: 2,
            setCount: 4,
            targetText: "999 lb × 99",
            completed: true
        ),
        current: .init(
            exerciseName: "PRIVATE EXERCISE CURRENT",
            setNumber: 3,
            setCount: 4,
            targetText: "888 lb × 88",
            completed: false
        ),
        progress: .init(completedSets: 6, totalSets: 18),
        restMode: .stopwatch,
        restStartedAt: reference.addingTimeInterval(-107),
        privacyMode: .redacted
    )

    public static let stale = make(
        id: "stale",
        phase: .stale,
        previous: nil,
        current: nil,
        progress: .init(completedSets: 6, totalSets: 18),
        restMode: .off
    )

    public static let longContent = make(
        id: "long-content",
        sessionLabel: "Posterior Chain · Strength Endurance",
        previous: .init(
            exerciseName: "Single-Leg Romanian Deadlift with Contralateral Cable Resistance",
            setNumber: 11,
            setCount: 12,
            targetText: "127.5 lb × 12 each side",
            completed: true
        ),
        current: .init(
            exerciseName: "Single-Leg Romanian Deadlift with Contralateral Cable Resistance",
            setNumber: 12,
            setCount: 12,
            targetText: "132.5 lb × 10 each side",
            completed: false
        ),
        isFinalSet: true,
        next: .init(
            exerciseName: "Half-Kneeling Single-Arm Lat Pulldown",
            setNumber: 1,
            setCount: 4,
            targetText: "65 lb × 12 each side",
            completed: false
        ),
        progress: .init(completedSets: 23, totalSets: 24),
        restMode: .countdown,
        restStartedAt: reference.addingTimeInterval(-30),
        restEndsAt: reference.addingTimeInterval(90)
    )

    public static let all: [WorkoutActivityFixture] = [
        normalStopwatch,
        normalCountdown,
        restOff,
        finalSet,
        postFinalSet,
        superset,
        timedSet,
        bodyweightSet,
        allSetsComplete,
        saving,
        completed,
        privacyRedacted,
        stale,
        longContent,
    ]

    private static func make(
        id: String,
        sessionLabel: String = "Push · Chest & Shoulders",
        phase: WorkoutActivityFixture.Phase = .active,
        previous: WorkoutActivityFixture.SetContext?,
        current: WorkoutActivityFixture.SetContext?,
        isFinalSet: Bool = false,
        next: WorkoutActivityFixture.SetContext? = nil,
        progress: WorkoutActivityFixture.Progress,
        restMode: WorkoutActivityFixture.RestMode,
        restStartedAt: Date? = nil,
        restEndsAt: Date? = nil,
        completionState: WorkoutActivityFixture.CompletionState = .inProgress,
        privacyMode: WorkoutActivityFixture.PrivacyMode = .full
    ) -> WorkoutActivityFixture {
        WorkoutActivityFixture(
            id: id,
            sessionId: "fixture-session-20261001",
            sessionLabel: sessionLabel,
            startedAt: sessionStart,
            referenceDate: reference,
            phase: phase,
            previousCompletedSet: previous,
            currentSet: current,
            currentExercise: current?.exerciseName,
            isFinalSetOfExercise: isFinalSet,
            nextExerciseFirstSet: next,
            progress: progress,
            restMode: restMode,
            restStartedAt: restStartedAt,
            restEndsAt: restEndsAt,
            completionState: completionState,
            privacyMode: privacyMode
        )
    }
}

public enum WorkoutPrototypeMetrics {
    public static let lockScreenWidth: Double = 365
    public static let lockScreenMaximumHeight: Double = 160
    public static let completeSetMinimumHeight: Double = 44
    public static let dynamicIslandCompactHeight: Double = 36.67
    public static let dynamicIslandMinimalWidth: Double = 36.67
    public static let dynamicIslandExpandedWidth: Double = 371
}
