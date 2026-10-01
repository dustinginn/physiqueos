Workout Live Activities visual prototype — Founder revision 1

Parent task:
agent-handoffs/inbox/prompts/20261001T161500Z-workout-live-activities-visual-prototype.md

FOUNDER REVIEW

Founder prefers the "Recommended · trailing action" Lock Screen layout from the first prototype.

Lock this in as the base direction:
- large rest clock on the lower left;
- trailing Complete Set action with >=44 pt target;
- set/context rows above;
- preserve workout header/progress/elapsed treatment unless a later mockup proves a clear issue.

REQUIRED REVISION

1. MAXIMUM TWO CONTEXT ROWS

There must NEVER be three full set/context rows on the Lock Screen.

Normal exercise:
Row 1 = Previous
Row 2 = Current

Final current set of an exercise:
Row 1 = Current
Row 2 = Up Next

Do NOT show Previous + Current + Up Next simultaneously.

Immediately after final set completion:
Row 1 = Completed
Row 2 = Up Next

Then, as the next exercise begins/progresses, return naturally to the normal Previous + Current model.

2. FINAL-SET RULE

When Current is the final set:
- Previous drops away;
- Current moves to the top row;
- Up Next becomes the second row;
- Up Next should include next exercise and first-set context where available;
- keep labels clear enough that the transition is obvious without explanation.

3. LARGE REST CLOCK

Founder explicitly prefers the large stopwatch treatment from the recommended layout over the small centered clock in the full-width-action alternative.

Preserve the large clock.

Stopwatch:
REST · STOPWATCH
1:47

Countdown:
REST · COUNTDOWN
1:13
or similarly clear "remaining" treatment if visually superior.

Use the same hierarchy for both modes.

4. COMPLETE SET

Keep the recommended trailing action arrangement as the primary direction.

Do not switch to the full-width bottom button.

Ensure:
- >=44 pt target;
- clear separation from rest clock;
- does not compress the two context rows;
- no destructive adjacent actions.

5. REVISE SCREENSHOT SET

Produce updated Founder-review screenshots at minimum:

A. Lock Screen — normal Previous + Current, Stopwatch
B. Lock Screen — normal Previous + Current, Countdown
C. Lock Screen — final set: Current + Up Next, Stopwatch
D. Lock Screen — immediately after final completion: Completed + Up Next, newly reset Stopwatch
E. Lock Screen — Rest Off with two-row rule
F. Lock Screen — Superset using maximum-two-row rule
G. Dynamic Island expanded — normal
H. Dynamic Island expanded — final-set transition
I. Dynamic Island expanded — active rest
J. compact/minimal workout/rest states

Do not need to re-present the rejected full-width-action alternative unless needed for documentation.

6. DYNAMIC ISLAND

Carry the same semantic rule into expanded Island:
- never try to show Previous + Current + Up Next as three full contexts;
- normal = Previous/Current where space allows;
- final set = Current/Up Next;
- post-final = Completed/Up Next;
- rest clock remains prominent when active.

Compact/minimal remain intentionally sparse.

7. PROJECTION

If Claude's TrainingSessionAuthority report is now available, reconcile this rule against its final Live Activity projection.

If Claude is not yet finished, keep the prototype fixture provisional and document the expected mapping.

Do not alter Claude architecture.

8. NON-SHIPPING

Still visual prototype only.

No production target, signing, App ID, TestFlight, real LiveActivityIntent or workout mutation.

9. REPORT

Update/publish the visual prototype report with:
- Founder revision accepted direction;
- revised screenshot paths;
- two-row invariant;
- final-set transition rule;
- large rest-clock rule;
- Claude reconciliation status;
- remaining visual decisions, if any.

Publish GH before stopping.
