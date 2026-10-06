PhysiqueOS Build 89 Codex small-fixes lane — ADDENDUM: restore Live Activity stopwatch icon

Continue in the EXISTING Codex Build 89 small-fixes lane.

Add one bounded Live Activity presentation correction.

FOUNDER FEEDBACK

On the current redesigned Lock Screen Live Activity, the icon immediately beside the elapsed WORKOUT timer was changed to a bar-chart/equalizer-style symbol.

That is incorrect.

The elapsed workout timer previously used the established stopwatch/timer icon, and Founder wants that semantic restored.

CHANGE

Where the Lock Screen Live Activity presents:

WORKOUT
[elapsed workout time]

restore the prior established stopwatch/timer icon next to that timer.

Do not use the bar-chart/equalizer/training-bars icon for elapsed time.

AUDIT FIRST

Identify the exact pre-redesign/Build 88 icon used for this elapsed workout-time presentation and restore that same semantic/icon if still available.

Do not invent a new timer glyph if the established one exists.

SCOPE

Apply consistently to Live Activity states where this elapsed WORKOUT timer icon is presented.

Do NOT change:
- elapsed-time calculation;
- timer updates;
- ActivityKit state;
- workout metrics;
- Complete Set action;
- current exercise row;
- Live Activity geometry;
- Dynamic Island unless it independently has the same erroneous elapsed-time semantic icon;
- Watch UI;
- any other approved Claude A redesign.

CONCURRENCY NOTE

This file area originated in Claude A candidate f3579d87, which is not yet integrated onto Build 88.

The active Codex lane is based on Build 88.

Therefore:
- DO NOT independently recreate or overwrite Claude A's Live Activity redesign in the Codex branch if the relevant redesigned source is not present.
- If the exact icon correction cannot be applied cleanly because it depends on Claude A's unmerged source, record this as an integration-time micro-fix and provide the exact intended one-line/symbol correction for the integration lane.
- Do not cherry-pick/merge Claude A merely to make this change.
- Avoid creating a conflicting parallel implementation.

TEST

Focused semantic/render test:
- elapsed WORKOUT timer uses stopwatch/timer icon;
- no bar-chart/equalizer icon in that timer slot;
- timer behavior unchanged.

If applied directly, include in the Codex candidate.
If deferred because of branch ownership, include it prominently in the integration notes as REQUIRED before Build 89.

No build bump.
No TestFlight.
No Server work.

END ADDENDUM.