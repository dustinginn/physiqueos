# Batch 2 · Checkpoint 5: Workout Match (L13)

Start with **`primary-mobile-review-board.png`**. The `boards/match-diff-*` images show the reference, the simulator and an amplified diff, aligned on the first card.

## Exact authority

| Item | Value |
|---|---|
| Implementation commit | `79a1a33d9113e05522e3369999f887a61361abf8` |
| Branch | `claude/redesign-batch2-log-logger-20261005`, on top of CP4 `7a422a98` |
| Locked screen | L13 (`origin/codex/utility-surfaces-design` @ `ca088e80`, `logger-l13.png` / `-light`) |

## Scope

- **What changed:** only the `workoutReconciliation` branch of `EvidenceReviewDetailView`.
- **What did not:** generic Evidence Review (Nutrition, DEXA, Photo, text and mixed reviews) keeps its current presentation.
- **Unchanged behavior:** the resolve command, the version guard, diagnostics, verification readback and the refresh-required and failure states. Non-idle states fall through to the existing action section.

## Captures

`LoggerParityCaptureUITests.testCheckpoint5WorkoutMatch{Dark,MineralLight}` runs this path:
1. Log, with the review fixture state `workout-match`;
2. tap the pending review band;
3. Workout Match;
4. Use Logger session 1, giving Match confirmed;
5. relaunch, then No match, giving No match recorded.

The sandbox has no Evidence Review API (it is Production-only by design). The DEBUG-only `WorkoutMatchReviewFixture`, behind `-physiqueos.redesign-review`, supplies the review and the command result. It is never in Release.

## Measured geometry (pt)

| Element | Locked | Simulator |
|---|---|---|
| Amber Apple Health workout field | 154.7 | 154.3 |
| Candidate boxes | 83.7 / 83.7 | 83.0 / 83.0 |
| Gap: field to candidate, candidate to candidate | 20.3 | 20.3 |
| Gap: last candidate to button | 12.3 | 12.3 |
| Use Logger session 1 / Use Logger session 2 / No match | 47.7 each | 47.7 each |
| Gaps between buttons | 12.3 | 12.3 |

## Remaining differences, each explained

1. **System chrome.** The system navigation bar sits above the content, with the existing Back button.
2. **Canonical copy (D3).**
   - The occurrence label is "Oct 3" (locked: "Oct 3, 2026").
   - Times read "9:14 PM – 9:51 PM" (locked: "9:14–9:51 PM").
   - Match bases use the canonical labels ("Logger time window", "Time and telemetry"); the locked mockup used "time + type" and "same day".
3. **Strongest-match highlight.** The highest-confidence candidate's match line uses the locked amber; others are muted. This is a presentation of the Server confidence and never changes order or selection.
4. **Glyph baselines** differ by about 1 pt (CoreText versus Chromium).

## Tests

- The Checkpoint 5 journeys pass in both appearances.
- Unit tests: 378, 0 failures. These are `EvidenceReviewHeaderDateTests`, `FounderServerAPITests` (including the reconciliation commands), `PriorityNotificationSchedulerTests` (reconciliation notifier), `WorkoutReconciliationDiagnosticsTests`, `ProgressPhotoPoseContractTests` and `LogReadModelTests`.
