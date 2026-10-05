# Batch 2 · Checkpoint 2: Logger active workout and set entry

Start with **`primary-mobile-review-board.png`**.

## Exact authority

| Item | Value |
|---|---|
| Implementation commit | `0d59b45e63071ad1e0ac825eb45bf82fed3a3d90` |
| Branch | `claude/redesign-batch2-log-logger-20261005` |
| Base | Build 87 `f66c7fc6`, then CP1 `b540b323`, then You/Settings tap fix `bb6a6584` |
| Locked package | `origin/codex/utility-surfaces-design` @ `ca088e80` |
| Locked screens | L5, L5B, L6, L7, L8 and L10 (`utility-surfaces-design-20261004/screens/logger-l*.png`, each with a `-light` pair) |
| Founder Done-control correction | `5b47063b`: `utility-surfaces-acceptance-corrections-20261004/screens/logger-weighted-*` and `logger-superset-*` |

## Captures

- **How they were made:** real sandbox journeys on an iPhone 17 Pro simulator (iOS 27.0, status bar fixed at 9:41), in Dark and Mineral Light. The test `LoggerParityCaptureUITests.testCheckpoint2ActiveWorkout{Dark,MineralLight}` drives them.
- **No seeded state:** every state is reached by tapping the real UI.
- **Workout content:** the sandbox catalog's Bench Press, Cable Fly, Push-ups and Planks.

Boards:
- `boards/`: set types, keyboard, menu, superset, cancel and Ready for Watch.
- `boards/card-diff-{dark,light}.png`: the reference card, the simulator card and an amplified diff, aligned on the card top.

## Measured geometry (pt)

| Element | Locked | Simulator | Notes |
|---|---|---|---|
| Card header block (name, context, previous) | 71.0 | 71.3 | |
| Column header band | 28.0 | 28.0 | |
| Set rows | 51 / 52 / 52 | 51 / 52 / 52 | Founder correction: 52 pt rows |
| Field height | 36 | 36 | |
| Add set strip | 36 | 36 | |
| Card total (3 sets) | 294.7 | 294.0 | |
| Done control | 32 pt circle in a 44×44 target | 32 pt circle in a 44×44 target | Circle centers within 1 px; the UI test asserts the target is at least 44 pt |
| Save & Leave / Cancel controls | 41.7 | 41.7 | |
| Add Exercise | 47.7 | 47.7 | |
| Progress line | 4.7 | 4.7 | |
| Sticky Finish | 51.7 | 51.7 | |
| Gaps between blocks | 12.3 | 12.3 | |

**Colors:** canvas, paper, soft surface, hairline, green, amber, purple, red and teal all come from the shared redesign tokens. The new Logger roles (utility muted, red, utility field/navy) are additive.

## Remaining differences, each explained

1. **System navigation bar.** The pushed Logger has the iOS back button, so all content sits 58.7 pt lower than the harness, which has no navigation bar. Every internal gap is identical.
2. **Tab bar.** The Logger is pushed inside the Log tab, so the accepted Batch 1 Liquid Glass tab bar stays visible below the sticky Finish, as it does in shipping.
3. **Canonical copy (D3)**, pinned by the existing `TrainingLoggerTests` and `Build83FinishLifecycleTests`:
   - "Workout in progress" (locked shows "LIVE WORKOUT");
   - "Started now · N exercises" (locked shows "Today · Started 9:14 PM");
   - "2/11 sets" (locked shows "4 of 9");
   - "LOAD (LB)" (locked shows "LOAD");
   - "Ordinary · Standalone" (locked shows "Ordinary · Chest").
4. **Retained shipping controls (C7).** These are not drawn in L5, and canonical behavior wins:
   - the Rest preference control, 42 pt in the same secondary grammar, which shifts content below it by 54 pt;
   - progression guidance inside the card, when the Server recommends one.
5. **System surfaces.** The exercise menu (L7), Cancel alert (L10) and decimal keyboard (L6) are drawn by iOS. Menu hierarchy, alert copy and focus order are unchanged.
6. **SF Symbols for the harness glyphs.** ✓ is `checkmark.circle.fill`, ○ is `circle`, ⌫ is `delete.left`, ← is `arrow.left`.
7. **Glyph baselines.** Text sits up to about 1 pt off between CoreText and Chromium, with the identical Plus Jakarta Sans file.
8. **8 pt column headers and 10 pt card metadata,** exactly as locked. These are below the usual 11 pt floor; the locked density is kept and they scale with Dynamic Type.
9. **Superset context.** It reads "SUPERSET A · Ordinary": the locked label plus the canonical variant. The locked mockup's area name ("Chest") is not in the shipping context.

## Behavior safety

The change is presentation-only. These are untouched:
- `TrainingSessionAuthority`, steps, revisions and mutation calls;
- the Watch projection, HealthKit, Live Activity and finish lifecycle.

All identifiers, accessibility labels and source-pinned strings are preserved.

**Tests:** 348 unit tests, 0 failures:
- `TrainingSessionAuthorityTests`
- `TrainingLoggerTests` (including the source-string tripwires)
- `TrainingSessionLiveProjectionTests`
- `Build83FinishLifecycleTests`
- `TrainingRestPreferenceTests`
- the 4 Live Activity suites
- `WatchWorkoutTransportTests`
- `SharedUITests`
- `AppTabTests`

The Checkpoint 2 parity journeys passed in both appearances.
