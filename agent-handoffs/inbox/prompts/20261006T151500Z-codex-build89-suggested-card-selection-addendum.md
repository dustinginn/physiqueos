PhysiqueOS Build 89 Codex small-fixes lane — ADDENDUM: Suggested Today explicit selection control

Continue in the EXISTING Codex Build 89 small-fixes lane.

Add one bounded Logger presentation correction.

CONTEXT

On Training Logger step 1, “What are you training?”, the Suggested Today card correctly becomes selected and shows a teal checkmark after the user selects the suggested Training Area.

However, in the unselected state the card currently has no obvious affordance showing that the suggestion itself can be selected.

Founder wants the pre-selection state to make selection obvious.

REQUIREMENT

On the Suggested Today card:

UNSELECTED:
- show an obvious selection control in the top-right position where the selected checkmark will appear;
- use the same visual language as the Training Area selection controls / redesigned Logger;
- it should clearly read as tappable/selectable without adding explanatory copy;
- prefer an outlined circle / check-target treatment that naturally transitions to the selected state;
- preserve the card’s Suggested Today label, suggested Training Area, and rationale.

SELECTED:
- preserve the existing obvious teal selected/checkmark state;
- the control should visually transition from unselected target to checked state;
- the corresponding Training Area tile remains selected exactly as it does now.

INTERACTION

- tapping the explicit control selects/deselects the suggested Training Area according to the existing multi-select semantics;
- tapping the Suggested Today card itself should continue/select the same Training Area if the existing card interaction supports it; if the whole card is not currently tappable, make the card and control share the same existing selection action;
- no duplicate state authority;
- selection must remain synchronized with the corresponding Training Area tile;
- selecting/deselecting through either representation must produce one canonical selected-area state.

DO NOT CHANGE

- suggestion algorithm;
- recurring-training-history logic;
- suggested-area copy;
- Training Area list;
- multi-select rules;
- Choose exercises behavior;
- Save & Leave;
- Logger navigation;
- Watch projection;
- Server behavior.

APPEARANCE

Dark + Mineral Light.

Use semantic redesign tokens, not a one-off hard-coded screenshot color.

Accessibility:
- at least 44 pt effective tap target;
- selected/unselected trait/state is announced;
- meaningful label such as “Select suggested Shoulders” / selected equivalent through existing accessibility patterns.

TESTS

Add focused coverage proving:
- unselected Suggested Today has an explicit visible selection affordance;
- tapping it selects the suggested area;
- corresponding Training Area tile reflects the same state;
- selected state shows the existing checkmark;
- deselection remains synchronized;
- no change to suggestion calculation;
- Dark + Mineral Light.

Add this to the existing Codex candidate/review package.

Do not touch Claude A or Claude B owned files unless this exact Logger source overlaps unexpectedly. If overlap exists, report it before editing.

No merge.
No build bump.
No TestFlight.
No Server deploy.

END ADDENDUM.