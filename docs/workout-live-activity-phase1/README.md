# Workout Live Activity Phase 1 — shipping-view screenshots

Rendered by `PhysiqueOSTests/WorkoutLiveActivityViewTests` from the SAME shared SwiftUI source
(`ios/PhysiqueOSShared/WorkoutLiveActivityViews.swift`) that the Widget Extension compiles.
The Lock Screen / Dynamic Island chrome around them is a test-only backdrop (the system draws the
real chrome on device). Timer text is live system date-based text, so digits differ from run to run.

Letters match the approved prototype set (`ios/Prototypes/WorkoutLiveActivity/screenshots/revision-1`
on branch `codex/workout-live-activities-visual-prototype-20261001`):
A–F Lock Screen, G–I and K expanded island, J1–J3 compact/minimal. Extra states: L all sets complete,
M saving, N saved, O long names, P/P2 privacy-redacted, Q stale-safe, R countdown complete,
S accessibility Dynamic Type.

Regenerate: `TEST_RUNNER_WORKOUT_LA_SCREENSHOT_DIR=<dir> xcodebuild test ... -only-testing:PhysiqueOSTests/WorkoutLiveActivityViewTests`.
