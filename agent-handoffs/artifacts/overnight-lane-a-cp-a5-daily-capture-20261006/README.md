# Overnight Lane A — Checkpoint A5: Morning Check-In, manual weight, Home Confidence

**Status: ready for Founder review (not accepted).**

- **Code commit:** `97028dbc` on `claude/overnight-lane-a-watch-live-priorities-capture-20261006`.
- **Base:** Build 88 `7fce3b97`.
- **Visual authority:** Final Design Batch 2, `final-design-batch2-daily-capture-explanation-20261004`, accepted P:20261004T213500Z. Rows H02, L04 and L05.
- **Briefing History (B06)** is in the same batch but belongs to Claude B's Briefings lane, so it is untouched here.

## Boards

`boards/cap-dark.png` and `boards/cap-light.png` (Mineral Light), 16 states each:
- Morning: unfinished priorities, existing weight, no reconciliation, validation, saving, still reconciling, complete.
- Manual weight: new date, correction, validation, saving, still reconciling, saved, failed.
- Confidence: V3 and V2.

Each row shows the locked board (402 pt, first screen) beside the real shipping SwiftUI on the iPhone 17 Pro simulator.

## What changed

**Shared grammar:**
- A 52 pt crumb row ("‹ Home" or "‹ Log") replaces the navigation title.
- Hero: 12 pt purple eyebrow, 31 pt / 800 title, date or lede.
- Bordered, softly shadowed form surfaces (18 pt radius).
- 52 pt input wells.
- A 52 pt primary action: teal→blue field on Dark, solid deep teal with a white label on Mineral.
- An outlined secondary action.
- Left-ruled messages: error red, success green, still-reconciling amber.
- SF Pro, as on the locked harness, with Dynamic Type via `@ScaledMetric`.

**Tokens:** shared `PhysiqueOSTheme.capture*` at the exact locked values (`#06131E` / `#EFEEE7` canvas, `#0E2230` surface, teal `#2CCDC0`, …).

**Morning Check-In:**
- The Yesterday's-unfinished-priorities surface: one 15 pt row per occurrence.
  - Three 44 pt disposition chips (Completed / Skipped / Add note). The selected chip carries a tint, a border and the **selected accessibility trait**.
  - An always-available optional note.
- The 74 pt leading-aligned weight field with "lb".
- One atomic **Complete Morning Weigh-In**.
- The durable-success panel with Return Home.
- The Sandbox-only recovery and briefing cards are restyled but stay Sandbox-only (the locked Production boundary).

**Manual / backdated weight:**
- Date measured (system compact picker capped at today, over the locked well).
- Weight plus a 104 pt Unit menu (lb / kg).
- Save Weight.
- **Return to Log appears only after a durable save.** The lock says "Success alone reveals Return to Log"; Build 88 also showed it while still reconciling.

**Home Confidence sheet:**
- Header: "Goal confidence" eyebrow, "Why confidence is N%", lede, and an 80 pt ring.
- Green qualitative band.
- Divided factor groups with teal glyphs and bullets.
  - V3: why / increased / supports / holding back / raise / lower / next evidence / Coach's take. **Assumptions is never shown.**
  - V2: summary, four groups and the purple-ruled uncertainty callout.
- Medium/large detents are unchanged.
- Goal Detail's legacy fallback uses the same sheet.

**Preserved (byte-for-byte logic):**
- `MorningCheckInSubmissionLifecycle` and `WeightSubmissionLifecycle`;
- canonical occurrence identity in submissions;
- validation messages;
- the reconciling copy and idempotent retry;
- kg → lb conversion;
- the date-change reload of the canonical Weight;
- Home widget refresh;
- the Production write guards.

## Tests

**Unit** (unchanged suites, all pass): `MorningCheckInModelTests` 35, `HomeReadModelTests` 27, `LoggingSandboxTests` 85.

**UI** (simulator): `FoamRollingPriorityDetailUITests`, 14 tests. All pass after one tolerance fix: the manual-weight test first failed only on a 51.9999 pt float rounding, and a re-run passed. The new tests are:
- `testMorningCheckInLockedDispositionsAndAtomicAction`: the selected trait, chips at least 44 pt, the atomic action at least 52 pt, and the complete state.
- `testManualWeightRevealsReturnToLogOnlyAfterADurableSave`: saved, reconciling and failed.
- `testConfidenceSheetShowsTheLockedV3GroupsWithoutAssumptions`: V3 and V2 groups.
- `testWatchAppearanceIsAnIndependentAccessibleControl`: the addendum. The Watch choice never changes the iPhone choice, and the target is at least 44 pt.

## DEBUG capture seams (compiled out of Release)

- `-physiqueos.capture-review morning-<state>|weight-<state>`: a fixture of the board's exact copy. Save is a no-op while it is active.
- `-physiqueos.confidence-review v3|v2`: presents the sheet at the large detent from the Home review fixture.
- Review route `morning-check-in`.
