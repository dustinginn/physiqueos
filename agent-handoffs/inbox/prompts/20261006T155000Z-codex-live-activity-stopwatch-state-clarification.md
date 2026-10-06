PhysiqueOS Build 89 Codex small-fixes lane — CLARIFICATION to Live Activity stopwatch-icon addendum

Continue in the EXISTING Codex Build 89 small-fixes lane.

This clarifies prompt commit 9d04c3205e035a55b905d5b67d2d3306bafd405b BEFORE implementation.

FOUNDER OBSERVATION

There are two distinct timer presentations in the redesigned Lock Screen Live Activity.

STATE 1 — NO ACTIVE REST TIMER / BEFORE FIRST SET

The bottom-left metric shows approximately:

[incorrect purple bars/equalizer icon]
WORKOUT
7:26

THIS is the state Founder wants corrected.

Replace the purple bars/equalizer/training icon beside the elapsed WORKOUT timer with the established stopwatch/timer semantic icon.

STATE 2 — ACTIVE REST TIMER AFTER A SET

The bottom-left metric shows:

[green stopwatch icon]
REST · STOPWATCH
0:11

THIS IS ALREADY CORRECT.

Do NOT change the green rest stopwatch icon, its color, label, timer semantics or presentation.

REQUIREMENT

The correction is state-specific:

- elapsed workout duration when no rest timer is active -> stopwatch/timer icon, using the established elapsed-time semantic;
- active rest stopwatch -> preserve existing green stopwatch treatment exactly.

Do not perform a broad symbol replacement across Live Activity.

The two states may use the same underlying stopwatch glyph if that is the established semantic, but their surrounding semantic color/state presentation remains distinct:
- workout elapsed = existing appropriate workout/neutral accent treatment;
- rest stopwatch = existing green rest treatment.

AUDIT

Trace the state branch that selects the bottom-left metric/icon and make the narrow correction only in the elapsed-WORKOUT branch.

Add focused coverage proving:
1. pre-first-set/no-rest state: WORKOUT elapsed time uses stopwatch/timer icon, not bars;
2. active-rest state: REST · STOPWATCH remains green and unchanged;
3. transitioning after Complete Set correctly switches from workout elapsed presentation to rest stopwatch presentation;
4. no timer behavior or state-machine change.

CONCURRENCY

The same ownership caveat from the prior addendum remains:
Claude A final candidate f3579d87 owns the redesigned Live Activity.

If this exact source is absent from the Codex Build 88-based branch, do not recreate Claude A's implementation. Record the precise state-specific micro-fix for integration after Claude A is merged.

This clarification supersedes any interpretation of the previous prompt that would globally replace timer icons.

END CLARIFICATION.