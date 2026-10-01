import XCTest
@testable import PhysiqueOS

@MainActor
final class TrainingRestPreferenceTests: XCTestCase {
    private func defaults() -> UserDefaults {
        let suite = "TrainingRestPreferenceTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        return defaults
    }

    func testStopwatchIsTheDefault() {
        let preferences = UserDefaultsTrainingRestPreferences(defaults: defaults())
        XCTAssertEqual(preferences.configuration, .stopwatch)
        XCTAssertEqual(preferences.restConfiguration(canonicalExerciseId: nil), .stopwatch)
        XCTAssertEqual(preferences.summary, "Stopwatch")
    }

    func testCountdownOffAndStopwatchAreSelectableAndPersist() {
        let store = defaults()
        let preferences = UserDefaultsTrainingRestPreferences(defaults: store)
        preferences.selectCountdown(seconds: 120)
        XCTAssertEqual(preferences.configuration, .countdown(seconds: 120))
        XCTAssertEqual(preferences.summary, "Countdown 2:00")
        XCTAssertEqual(UserDefaultsTrainingRestPreferences(defaults: store).configuration, .countdown(seconds: 120))

        preferences.select(.off)
        XCTAssertEqual(UserDefaultsTrainingRestPreferences(defaults: store).configuration, .off)
        XCTAssertEqual(preferences.summary, "Off")

        preferences.select(.stopwatch)
        XCTAssertEqual(UserDefaultsTrainingRestPreferences(defaults: store).configuration, .stopwatch)
    }

    func testCountdownRemembersItsLengthWhileAnotherModeIsSelected() {
        let store = defaults()
        let preferences = UserDefaultsTrainingRestPreferences(defaults: store)
        XCTAssertEqual(preferences.countdownSeconds, 90, "Default Countdown length.")
        preferences.selectCountdown(seconds: 150)
        preferences.select(.off)
        XCTAssertEqual(preferences.countdownSeconds, 150)
        preferences.select(.countdown)
        XCTAssertEqual(preferences.configuration, .countdown(seconds: 150))
        XCTAssertEqual(UserDefaultsTrainingRestPreferences(defaults: store).countdownSeconds, 150)
    }

    func testInvalidDurationsAndCorruptStoreFallBackSafely() {
        let store = defaults()
        let preferences = UserDefaultsTrainingRestPreferences(defaults: store)
        preferences.selectCountdown(seconds: 0)
        preferences.selectCountdown(seconds: 99_999)
        XCTAssertEqual(preferences.configuration, .stopwatch, "Out-of-range lengths are ignored.")

        store.set(Data("not json".utf8), forKey: UserDefaultsTrainingRestPreferences.globalKey)
        XCTAssertEqual(UserDefaultsTrainingRestPreferences(defaults: store).configuration, .stopwatch)

        store.set(try! JSONEncoder().encode(TrainingRestConfiguration(mode: .countdown, countdownDurationSeconds: nil)), forKey: UserDefaultsTrainingRestPreferences.globalKey)
        XCTAssertEqual(UserDefaultsTrainingRestPreferences(defaults: store).configuration, .stopwatch, "A Countdown with no usable length is never in effect.")
    }

    func testPresetsAreValidAndIncludeTheDefault() {
        XCTAssertTrue(UserDefaultsTrainingRestPreferences.countdownPresets.allSatisfy { TrainingRestConfiguration.countdownDurationRange.contains($0) })
        XCTAssertTrue(UserDefaultsTrainingRestPreferences.countdownPresets.contains(UserDefaultsTrainingRestPreferences.defaultCountdownSeconds))
    }

    // MARK: The active session resolves the preference at the next completion

    private func authority(preferences: UserDefaultsTrainingRestPreferences) -> TrainingSessionAuthority {
        let clock = ClockBox()
        var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-10-01", startedAt: "2026-10-01T16:30:00Z")
        draft.id = "s"
        draft.step = .workout
        draft.exercises = [WorkoutLiveActivityTestFixtures.exercise("e", "E", sets: (1...4).map { WorkoutLiveActivityTestFixtures.set("e\($0)", $0) })]
        return TrainingSessionAuthority(
            store: MemoryTrainingLoggerDraftStore(drafts: [draft]), environment: .sandbox, restPreferences: preferences, now: { clock.now }
        )
    }

    private final class ClockBox: @unchecked Sendable { let now = WorkoutLiveActivityTestFixtures.now }

    func testDefaultStopwatchStartsRestOnTheFirstCompletion() {
        let authority = authority(preferences: UserDefaultsTrainingRestPreferences(defaults: defaults()))
        authority.completeSet(sessionId: "s", exerciseId: "e", setId: "e1")
        XCTAssertEqual(authority.draft(id: "s")?.rest?.mode, .stopwatch)
    }

    func testChangingThePreferenceMidWorkoutAppliesToTheNextSetAndLeavesARunningRestAlone() {
        let preferences = UserDefaultsTrainingRestPreferences(defaults: defaults())
        let authority = authority(preferences: preferences)
        authority.completeSet(sessionId: "s", exerciseId: "e", setId: "e1")
        let running = authority.draft(id: "s")?.rest
        XCTAssertEqual(running?.mode, .stopwatch)

        preferences.selectCountdown(seconds: 60)
        XCTAssertEqual(authority.draft(id: "s")?.rest, running, "A running interval keeps the mode it started with.")
        authority.completeSet(sessionId: "s", exerciseId: "e", setId: "e2")
        XCTAssertEqual(authority.draft(id: "s")?.rest?.mode, .countdown)
        XCTAssertEqual(authority.draft(id: "s")?.rest?.durationSeconds, 60)

        preferences.select(.off)
        authority.completeSet(sessionId: "s", exerciseId: "e", setId: "e3")
        XCTAssertNil(authority.draft(id: "s")?.rest, "Off creates no rest state.")
    }

    func testASessionOverrideStillWinsOverTheGlobalPreference() {
        let preferences = UserDefaultsTrainingRestPreferences(defaults: defaults())
        let authority = authority(preferences: preferences)
        authority.setRestConfiguration(sessionId: "s", .countdown(seconds: 45))
        authority.completeSet(sessionId: "s", exerciseId: "e", setId: "e1")
        XCTAssertEqual(authority.draft(id: "s")?.rest?.durationSeconds, 45)
    }
}
