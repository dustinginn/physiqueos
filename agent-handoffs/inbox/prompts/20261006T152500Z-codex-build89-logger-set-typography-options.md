PhysiqueOS Build 89 Codex small-fixes lane — ADDENDUM: Logger set-value typography options

Continue in the EXISTING Codex Build 89 small-fixes lane.

Founder has identified one additional Logger visual issue and wants OPTIONS before implementation is finalized.

CONTEXT

In the active Logger exercise/set table, the editable set values are visually too small for quick workout use.

Example:
- REPS values such as 12 / 10;
- LOAD values such as 160 / 90.

The small column labels SET / REPS / LOAD (LB) / DONE are acceptable and should not be enlarged as part of this request.

The concern is the actual editable numeric values inside the set rows.

TASK — DESIGN SELECTION FIRST

Create 2–3 real shipping SwiftUI typography options using the same representative Logger state and device size.

Do NOT select a winner.
Do NOT broadly change Logger typography yet.
Stop for Founder selection after publishing the comparison.

OPTIONS

Use the current shipping value typography as baseline and produce restrained increases.

At minimum:

Option A — modest increase
- increase editable REPS and LOAD numeric value size by approximately one meaningful type step;
- preserve current weight/spacing;
- goal: noticeably easier to scan without changing row geometry.

Option B — stronger workout-first increase
- larger than A;
- still fits comfortably for realistic 2–3 digit reps/load values;
- may use slightly stronger weight only if needed for legibility;
- preserve the current calm hierarchy.

Option C — optional balanced variant
- if useful, test a size between A/B with medium/semibold weight or another restrained typographic treatment.
- Do not alter the input boxes merely for decoration.

Also assess the SET number at far left. If it looks disproportionately small once REPS/LOAD increase, Option C may include a proportionate but smaller SET-number increase. Do not change the SET column header.

CONSTRAINTS

Preserve:
- row height unless absolutely necessary;
- input field dimensions;
- Done control;
- delete control;
- Add set;
- suggestion / Keep previous controls;
- exercise cards;
- Finish Workout;
- keyboard/edit behavior;
- accessibility;
- Dark + Mineral Light;
- Dynamic Type behavior.

Do not change actual set/reps/load values or Logger semantics.

Fit-check:
- 1–3 digit reps;
- 1–4 digit load where supported;
- decimal load if supported;
- bodyweight/timed-set variants if they share the component.

REVIEW BOARD

Produce one mobile-readable comparison board:
Current
Option A
Option B
Option C if useful

Use the same Mineral Light representative state shown in the Founder feedback if practical.

If typography is shared with Dark, one compact Dark verification strip is enough; Founder does not need a second full board.

Push board to the existing Codex branch and verify the GitHub browser link remotely.

TESTING

Only focused render/compile/accessibility checks are needed for the option checkpoint.

Do not run the full Native suite merely to produce options.

After Founder selects an option, continue the existing Build 89 small-fixes lane with the selected typography and normal final gates.

IMPORTANT

This addendum does not authorize changing the previously approved Logger redesign geometry.

STOP for Founder selection after the typography comparison board is published.

END ADDENDUM.