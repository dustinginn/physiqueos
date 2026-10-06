# Build 89 integrated source candidate · integration proof package

Integration proof only. This is not a redesign review: the Founder already approved each lane's visual design. Every capture comes from the integrated tree on branch `claude/native-build89-integrated-source-candidate-20261006`. Captures use real shipping SwiftUI views on the dedicated `Build89Int iPhone 17 Pro` simulator (iOS 27.0) with Sandbox fixtures. No simulator was paired to Founder Production.

## Boards

| Board | Shows | Provenance |
|---|---|---|
| `boards/I1-live-activity-stopwatch.png` | No-rest / pre-first-set **WORKOUT** clock now uses the green `stopwatch` glyph. Active **REST · STOPWATCH** is unchanged: green stopwatch, label and rest clock. Dark + Mineral. | `WorkoutLiveActivityViewTests`, shipping `WorkoutLockScreenView` (the same shared source the Widget extension compiles). |
| `boards/I2-root-routing.png` | Combined RootTabView routes: A's Morning Check-In; B's Briefing History and direct `briefing:<artifactId>`; the existing Evidence path. | `Build89IntegrationUITests.testCombinedRootReviewRoutes{Dark,MineralLight}` (DEBUG review table, absent from Release). |
| `boards/I3-logger.png` | Suggested Today: explicit unselected control and selected teal check, with the Training Area tile in sync. Option B set values: REPS/LOAD 16 pt Semibold, SET 12 pt Bold, 36 pt fields. | Suggested Today: `TrainingLoggerTests` shipping component renders; it is Production-payload-only, so Sandbox never offers it. Set values: `Build89IntegrationUITests.testLoggerOptionBSetValues{Dark,MineralLight}`, real Logger. |
| `boards/I4-training-detail-pr-card.png` | Performance Records card directly below Workout Summary, from canonical Server-owned `performanceRecords`. | Codex `testBuild89TrainingDetailReview{Dark,MineralLight}` on the integrated tree. |
| `boards/I5-dexa-briefing.png` | DEXA event briefing: data-derived change rails with goal-aware delta colors, and the WHAT THIS SCAN MEANS lead (canonical `interpretation.opening`). | `Build89IntegrationUITests` direct `briefing:dexa_event_dexa-fixture-005` route. |

Raw screenshots are in `captures/`. The I1 captures are cropped to the Live Activity card, out of the full test-only lock-screen backdrop. `source/render-boards.swift` composes the boards deterministically (`swift source/render-boards.swift <package-dir>`); it touches no app code or runtime.
