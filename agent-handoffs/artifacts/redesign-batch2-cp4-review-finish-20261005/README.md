# Batch 2 · Checkpoint 4: Logger review, finish and complete

Start with **`primary-mobile-review-board.png`**.

## Exact authority

| Item | Value |
|---|---|
| Implementation commit | `7a422a98782db58cf77ffdac8fcd420da554fba3` |
| Branch | `claude/redesign-batch2-log-logger-20261005`, on top of CP3 `6d79f057` |
| Locked screens | L11, L12, L14, L15 and L16 (`origin/codex/utility-surfaces-design` @ `ca088e80`, each with a `-light` pair) |

## Captures

`LoggerParityCaptureUITests.testCheckpoint4ReviewFinishComplete{Dark,MineralLight}` runs real sandbox journeys on a clean install, in two groups.

**Real states:**
- Workout Review.
- Final Confirmation.
- Workout Complete with records. Server-only records are shown through a DEBUG seam that sets view-model presentation only.
- Workout Complete without records.

**Server-durability states**, through the DEBUG-only `LoggerReviewSeam` (`-physiqueos.logger-review.finish saving|waiting|retry`). The sandbox finishes locally and instantly, so it cannot reach these. The seam is nil in Release and never touches the session authority.
- Saving.
- Waiting for network.
- Retry needed with Discard.

## D2: source-bound finish legs

| Leg | Shown when | Values |
|---|---|---|
| PhysiqueOS | always | "Ready" before Finish. "Pending" while submitting or awaiting durability. "Not saved yet" after a confirmed Finish that needs Retry. |
| Apple Health | only when `draft.expectsWatchHealthWorkout` (a Watch-recorded HealthKit workout) | "After save" before the Watch stamps a result, then "Saving", "Saved" or "Not saved" from `watchHealthSaveState`. |
| Workout operation · same key | only once `watchFinishOperationId` exists (the finish operation identity) | — |

Sandbox workouts never expect a Watch HealthKit workout. The Apple Health leg is therefore correctly absent from these captures, and the locked static "Apple Health match · After save" row is not rendered.

## Measured geometry (pt)

| Element | Locked | Simulator |
|---|---|---|
| Review metric tile | 55.7 | 55.0 |
| Supporting screenshots card | 127.7 | 127.7 |
| Continue / Back / Finish / Return buttons | 47.7 | 47.7 |
| Workout ready field (2 lines) | 84.7 | 85.0 |
| Waiting for network field | 142.7 | 143.0 |
| Legs card (two rows) | 90.7 | 89.3 |
| Performance records field (2 records) | 167.7 | 165.0 |

## Remaining differences, each explained

1. **System chrome.** The system navigation bar sits above the content. The canonical toolbar Save & Leave appears on the review steps.
2. **Canonical copy and content (D3).**
   - Review lists every completed set on its own line, as in shipping. The locked mockup compresses them into one line.
   - Metric labels keep the canonical plurals "VARIANTS" and "SUPERSETS".
   - The sandbox Final Confirmation subtitle is the canonical sandbox copy. Production shows the locked "Confirm your exercises and completed sets."
3. **Text the mockup invented is not rendered.** The locked L14 line "No pending Workout Match was created." is a claim that no state backs.
4. **Supporting-screenshot pending and unrecognized rows** are implemented in the locked grammar and covered by the existing OCR and evidence unit tests. They are not captured: the out-of-process system Photos picker could not be driven reliably from XCUITest.
5. **Confetti** is a sub-second, one-time effect, so the captures may miss it. Reduce Motion suppression and one-time gating are unchanged and covered by `TrainingLoggerTests`.
6. **Harness glyphs** are replaced by SF Symbols; glyph baselines differ by about 1 pt.

## Behavior safety

Exactly-once finish, durability recovery, the frozen confirmed finish and the celebration gate are unchanged. The source-pinned strings remain byte-identical, and the Build 83 finish lifecycle tests pass.
