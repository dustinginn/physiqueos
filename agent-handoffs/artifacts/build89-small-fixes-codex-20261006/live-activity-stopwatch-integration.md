# Live Activity elapsed-workout icon integration note

Authority: clarification commit `f9e9fa8db00dc4c336972d9a0c594a86c0a3becf`, which supersedes the earlier icon prompt.

The redesigned Lock Screen Live Activity source exists only on the unmerged Claude A candidate `f3579d87`. Per the authority's concurrency rule, this Build 88-based Codex lane does not recreate or modify that design.

## Exact post-merge correction

In `ios/PhysiqueOSShared/WorkoutLiveActivityViews.swift`, inside Claude A's `WorkoutClockBlock.body`:

- Preserve the active-rest branch exactly, including `glyph: isCountdown ? "timer" : "stopwatch"`, its `REST · STOPWATCH` label, green treatment, clocks, and accessibility.
- In only the `else` branch used when `state.rest == nil`, change `block(glyph: "dumbbell.fill", label: "WORKOUT")` to `block(glyph: "stopwatch", label: "WORKOUT")`.
- Do not change `WorkoutActivityState`, intents, rest timing, transition logic, colors, or any other symbol.

The branch is selected solely by `if showsRest, let rest = state.rest`. Completing a set creates `state.rest` through the existing intent/state pipeline, which naturally switches the presentation from elapsed `WORKOUT` to the existing rest stopwatch.

## Focused integration coverage

After Claude A is merged, verify:

1. A no-rest/pre-first-set render contains the `WORKOUT` elapsed block with `stopwatch`, and not `dumbbell.fill` or the former bars/equalizer semantic.
2. A stopwatch-rest render still contains `REST · STOPWATCH`, uses `stopwatch`, and retains the existing green treatment.
3. Completing a set changes `state.rest` from `nil` to stopwatch rest and the rendered block changes from `WORKOUT` to `REST · STOPWATCH`.
4. Existing Live Activity intent, contract, state-mapping, and rendering suites pass unchanged apart from the new state-specific assertion.
