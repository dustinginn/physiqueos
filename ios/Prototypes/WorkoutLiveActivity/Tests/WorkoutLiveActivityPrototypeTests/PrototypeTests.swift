import Foundation
import Testing
@testable import WorkoutLiveActivityPrototype

@Suite("Workout Live Activity visual prototype")
struct PrototypeTests {
    @Test("Every required fixture state is present and uniquely identified")
    func fixtureCoverage() {
        let fixtures = WorkoutActivityFixtureCatalog.all
        #expect(fixtures.count == 14)
        #expect(Set(fixtures.map(\.id)).count == fixtures.count)
        #expect(Set(fixtures.map(\.id)).isSuperset(of: [
            "normal-stopwatch",
            "normal-countdown",
            "rest-off",
            "final-set",
            "post-final-set",
            "superset",
            "timed-set",
            "bodyweight-set",
            "all-sets-complete",
            "saving",
            "completed",
            "privacy-redacted",
            "stale",
        ]))
    }

    @Test("Absolute timestamps produce deterministic stopwatch and countdown text")
    func absoluteTimerProjection() {
        #expect(WorkoutActivityFixtureCatalog.normalStopwatch.restTimerText == "1:47")
        #expect(WorkoutActivityFixtureCatalog.normalCountdown.restTimerText == "1:13")
        #expect(WorkoutActivityFixtureCatalog.restOff.restTimerText == nil)
        #expect(WorkoutActivityFixtureCatalog.normalStopwatch.workoutElapsedText == "48:12")
    }

    @Test("Lock Screen remains within the verified Live Activity height budget")
    func lockScreenHeightBudget() {
        #expect(WorkoutPrototypeMetrics.lockScreenMaximumHeight <= 160)
        #expect(WorkoutPrototypeMetrics.lockScreenWidth == 365)
    }

    @Test("Complete Set retains a 44 point tap target")
    func completeSetTapTarget() {
        #expect(WorkoutPrototypeMetrics.completeSetMinimumHeight >= 44)
    }

    @Test("At most two full context rows are projected")
    func contextRowBudget() {
        for fixture in WorkoutActivityFixtureCatalog.all {
            #expect(fixture.fullContextRowCount <= 2, "\(fixture.id) exceeds the context-row budget")
        }
    }

    @Test("Privacy projection cannot expose exercise or load strings")
    func privacyGate() {
        let fixture = WorkoutActivityFixtureCatalog.privacyRedacted
        let renderedText = fixture.visibleTextTokens.joined(separator: " ")
        #expect(renderedText.contains("Workout"))
        #expect(!renderedText.contains("PRIVATE"))
        #expect(!renderedText.contains("999"))
        #expect(!renderedText.contains("888"))
        #expect(!renderedText.localizedCaseInsensitiveContains("exercise"))
    }

    @Test("Timed, bodyweight, superset, final, and post-final semantics are explicit")
    func specialSetSemantics() {
        #expect(WorkoutActivityFixtureCatalog.timedSet.currentSet?.kind == .timed)
        #expect(WorkoutActivityFixtureCatalog.timedSet.currentSet?.targetText == "45 sec")
        #expect(WorkoutActivityFixtureCatalog.bodyweightSet.currentSet?.kind == .bodyweight)
        #expect(WorkoutActivityFixtureCatalog.bodyweightSet.currentSet?.targetText == "BW × 8")
        #expect(WorkoutActivityFixtureCatalog.superset.currentSet?.supersetPartnerName != nil)
        #expect(WorkoutActivityFixtureCatalog.finalSet.isFinalSetOfExercise)
        #expect(WorkoutActivityFixtureCatalog.finalSet.nextExerciseFirstSet?.setNumber == 1)
        #expect(WorkoutActivityFixtureCatalog.postFinalSet.previousCompletedSet?.completed == true)
    }

    @Test("Long-content fixture exercises label and value pressure")
    func longContentPressure() {
        let fixture = WorkoutActivityFixtureCatalog.longContent
        #expect((fixture.currentSet?.exerciseName.count ?? 0) > 50)
        #expect((fixture.currentSet?.targetText.count ?? 0) > 20)
        #expect(fixture.isFinalSetOfExercise)
        #expect(fixture.nextExerciseFirstSet != nil)
    }

    @Test("Compact, minimal, and expanded metrics stay inside HIG reference sizes")
    func islandMetrics() {
        #expect(WorkoutPrototypeMetrics.dynamicIslandCompactHeight <= 36.67)
        #expect(WorkoutPrototypeMetrics.dynamicIslandMinimalWidth <= 36.67)
        #expect(WorkoutPrototypeMetrics.dynamicIslandExpandedWidth <= 371)
    }
}
