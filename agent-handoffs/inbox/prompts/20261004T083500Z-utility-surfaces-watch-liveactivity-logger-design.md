PhysiqueOS utility-surface design translation — Apple Watch + Live Activity + Training Logger

TASK TYPE

New Codex chat.
Use High reasoning.

This is an OVERNIGHT design exploration / system-translation task.

Do not modify shipping Native UI.
Do not create a TestFlight build.
Do not change Server behavior.
Do not change workout semantics, workout authority, Logger data model, Watch transport, HealthKit behavior, Live Activity lifecycle, canonical evidence behavior, or confirmation/reconciliation semantics.

GOAL

Apply the newly selected PhysiqueOS visual system consistently to three broad utility families:

1. Apple Watch
2. Live Activity / Dynamic Island
3. Training Logger

These are primarily FUNCTIONAL surfaces.

Do NOT pursue dramatic product redesign.

Primary objective:
make them visually coherent with the new locked app direction while preserving utility, speed, legibility and interaction clarity.

Secondary objective:
where there is an obvious UX issue, improve it conservatively.

Do not change behavior just to make the mockup prettier.

LOCKED VISUAL DIRECTION

Use the current accepted visual system from the recent Home / Log / Briefing work as tone authority.

Core visual language includes:
- dark deep navy base;
- teal/navy immersive or functional fields;
- mineral-light counterpart where relevant;
- restrained purple;
- semantic green/amber/teal;
- stronger typography consistency;
- reduced arbitrary card stacking;
- cards/surfaces where containment is useful;
- clear action hierarchy;
- low-shadow / border-driven depth;
- compact but legible spacing;
- SF Symbols / coherent icon strategy;
- clear contrast and accessibility.

For Watch and Live Activity, adapt this language appropriately to smaller/specialized Apple surfaces.
Do not literally transplant iPhone layouts.

DESIGN PHILOSOPHY

These are utility surfaces.

Optimize for:
- glanceability;
- speed;
- touch accuracy;
- state clarity;
- low cognitive load;
- legibility during training;
- clear destructive-action boundaries;
- minimal navigation ambiguity;
- strong primary-action visibility;
- visual continuity with the iPhone app.

Allowed:
- spacing cleanup;
- typography normalization;
- surface/color treatment;
- button hierarchy;
- icon cleanup;
- better grouping;
- clearer state indicators;
- compact layout improvements;
- removal of redundant visual chrome.

Not allowed without explicit Founder review:
- changing workflow semantics;
- moving critical actions into hidden gestures;
- changing confirmation requirements;
- altering data captured;
- removing existing controls;
- adding new auto-actions;
- changing Watch/phone authority boundaries;
- changing Finish/Cancel safety behavior;
- changing Logger evidence model.

SOURCE AUDIT FIRST

Before mocking anything:
- inspect current Build 85 Native source authority;
- inspect Watch app source;
- inspect Live Activity / ActivityKit / Dynamic Island source;
- inspect Training Logger flow from entry through completion;
- inventory every user-facing state/screen;
- map which states are materially distinct and which can share a visual template.

Create a complete coverage inventory before rendering.

Do not rely on memory alone.

PART A — APPLE WATCH SURFACE AUDIT

Cover the COMPLETE Watch workout experience.

At minimum audit and account for all current states/screens such as:

PRE-WORKOUT / HANDOFF
- waiting for workout/session;
- phone-prepared workout available;
- loading / syncing;
- any unavailable / reconnect state;
- HealthKit/authority readiness where surfaced.

ACTIVE WORKOUT MAIN
- current exercise;
- current set;
- next set/exercise;
- reps/load/time;
- progress indicator;
- rest timer if shown;
- set completion control;
- current metrics;
- status labels.

PAGING
- Workout page;
- Metrics page;
- Daily Totals page;
- Crown paging behavior.

CONTROL SURFACE
- swipe-right controls;
- Pause / Resume;
- Finish;
- Cancel;
- confirmation flows;
- paused state;
- destructive confirmation.

SET / EXERCISE STATES
- normal weighted set;
- timed set;
- bodyweight set if current Watch supports it;
- superset/linked set if surfaced;
- final set;
- next exercise;
- no next exercise.

CONNECTIVITY / RESILIENCE
- healthy connected state;
- display-inactive / Always-On state;
- genuinely unavailable phone-authority state;
- reconnect;
- mutation pending/retrying;
- HealthKit active independently if surfaced.

FINISH FLOW
- finishing / saving;
- long save / processing state;
- saved summary;
- workout stats;
- performance-record celebration if Watch shows it;
- Done / dismiss state;
- any retry/recovery state.

ERROR / EDGE STATES
- stale projection;
- failed command;
- invalid state;
- duplicate/retry prevention;
- any current user-facing fallback.

You do NOT need to render every single state for Founder review.

But you MUST:
1. inventory every state;
2. map it to a design template;
3. prove every state is covered by the proposed design system;
4. render representative screens that demonstrate each materially different template.

WATCH MOCKUP SET — MINIMUM

Render enough to prove the system, likely including:

W1. Active weighted set — primary workout page
W2. Metrics page
W3. Daily Totals page
W4. Swipe-right controls — active
W5. Swipe-right controls — paused
W6. Finish confirmation
W7. Saving / processing
W8. Workout Saved summary + Done
W9. Genuine connectivity-authority warning/reconnect state
W10. Representative timed/bodyweight/superset state if materially different

If more are necessary to demonstrate a distinct layout/state, add them.

Founder does not need redundant screenshots of every near-identical set state.

WATCH DESIGN CONSTRAINTS

Apple Watch is not miniature iPhone.

Use:
- high-contrast dark surfaces;
- larger tap targets;
- minimal text;
- strong state color;
- clear current-vs-next hierarchy;
- highly legible numbers;
- restrained decoration;
- no tiny metadata;
- no excessive gradients if they hurt legibility;
- Always-On compatibility;
- Reduce Motion;
- accessibility.

Retain the accepted gesture model:
- swipe RIGHT for workout controls;
- Crown reserved for Workout -> Metrics -> Daily Totals.

Do not change that.

PART B — LIVE ACTIVITY / DYNAMIC ISLAND

Audit all current ActivityKit states.

Inventory:
- initial/start;
- active workout;
- rest timer if represented;
- exercise/set update;
- paused;
- finishing;
- saved/completed;
- stale/error/end;
- Dynamic Island compact/minimal/expanded variants;
- Lock Screen Live Activity;
- any phone-screen banner/compact presentation.

The Founder does NOT need every state rendered.

Create one coherent visual system and show representative states.

LIVE ACTIVITY MOCKUP SET — MINIMUM

LA1. Lock Screen active workout
LA2. Dynamic Island expanded active workout
LA3. Dynamic Island compact/minimal representation
LA4. Paused or rest-timer state
LA5. Finishing / saved state if current product shows it

If current implementation has materially different content, reflect source authority.

DESIGN GOAL

Live Activity should feel like PhysiqueOS immediately but remain Apple-native and glanceable.

Carry:
- navy/teal identity;
- semantic green;
- restrained purple;
- clear numbers;
- compact hierarchy.

Avoid:
- overcrowding;
- too much copy;
- trying to replicate full Watch or Logger content.

Do not change lifecycle or data contract.

PART C — TRAINING LOGGER COMPLETE FLOW

This must cover the ENTIRE Logger workflow, not only the entry screen.

Audit from the moment Founder taps Training Logger through final confirmation.

Inventory ALL current screens / sheets / states.

Likely categories include, but source authority wins:

ENTRY
- Training Logger launch;
- today/past workout choice if present;
- workout date/type;
- start state.

SESSION
- active workout header;
- workout timer;
- current workout state;
- exercise list;
- add exercise;
- exercise picker/search;
- category navigation;
- recent/favorite/library behaviors if present.

EXERCISE
- exercise detail within logger;
- sets;
- reps;
- load;
- timed;
- bodyweight;
- variants;
- notes if present;
- add set;
- delete set;
- edit set.

SUPERSETS / RELATIONSHIPS
- superset creation;
- linked exercises;
- substitute exercise;
- variant change;
- exercise replacement;
- cross-category add behavior.

SESSION CONTROLS
- pause if applicable;
- save;
- finish;
- cancel/discard;
- unsaved-change confirmation.

WATCH-COORDINATED STATES
- phone-prepared Watch workout;
- Watch active;
- phone edits while Watch session is active;
- reconciliation/authority indicators if surfaced.

FINISH / REVIEW
- finish workout;
- evidence review / matching;
- unchecked sets;
- discard/confirm flows;
- Apple Health workout matching when genuinely ambiguous;
- trusted Watch-originated exact correlation path should NOT create generic match review in future eligible sessions;
- any pending review state;
- duplicate protection.

CONFIRMATION
- Workout logged/confirmed screen;
- performance records;
- confetti/celebration;
- Return to Log;
- error/retry state.

LOGGER UTILITY PRINCIPLE

Do not dramatically redesign.

This is a high-frequency data-entry surface.

Improve:
- density;
- scanability;
- numeric-entry clarity;
- primary-vs-secondary actions;
- destructive action safety;
- exercise/set hierarchy;
- keyboard interactions;
- reachability;
- visual continuity.

Avoid:
- burying set controls;
- decorative layouts that slow entry;
- excessive card nesting;
- huge headers that waste space;
- ambiguous tap targets;
- tiny text.

LOGGER MOCKUP COVERAGE — REQUIRED

Founder needs enough screens to understand the full visual translation.

Render at minimum:

L1. Logger entry / workout start
L2. Active workout with several exercises
L3. Exercise expanded with multiple sets
L4. Add/Edit set state
L5. Exercise picker/search
L6. Substitute/variant flow
L7. Superset state
L8. Watch-coordinated active session on phone
L9. Finish workout confirmation
L10. Evidence Review / ambiguous HealthKit match state
L11. Successful trusted Watch-originated finish path if visually distinct
L12. Workout confirmed + performance records / confetti
L13. Error/retry or duplicate-protection state if materially distinct

If current flow contains more materially distinct screens, include them.

You may group several states into boards for review.

Do not omit a state merely because it is inconvenient to mock.

PART D — SHARED DESIGN TOKENS

Extract a utility-surface token proposal from the locked visual system:

DARK
- background;
- primary surface;
- elevated/action surface;
- teal functional surface;
- amber destructive/caution;
- green success;
- purple brand/selection;
- primary/secondary text;
- border/divider.

MINERAL LIGHT
For iPhone Logger only, because Watch/Live Activity may remain dark/system-driven where platform constraints warrant.

- mineral background;
- ink text;
- pale teal surface;
- warm action accent;
- semantic colors;
- borders.

WATCH
Create Watch-specific token mapping for OLED/dark usage.

LIVE ACTIVITY
Create ActivityKit token mapping that respects platform constraints.

Do not implement global tokens yet.

PART E — COMPONENT REUSE

Identify reusable visual primitives across utility surfaces:

Examples:
- workout status pill;
- metric cell;
- primary action button;
- destructive action;
- exercise row;
- set row;
- progress indicator;
- state banner;
- save/processing treatment;
- success summary;
- connectivity status;
- source/provenance label.

Do not force reuse where platform differences make it awkward.

PART F — ACCESSIBILITY

APPLE WATCH
- minimum tap targets;
- Always-On;
- VoiceOver;
- Dynamic Type where supported;
- high contrast;
- Reduce Motion;
- state not encoded by color alone.

LIVE ACTIVITY
- compact legibility;
- color contrast;
- VoiceOver labels where applicable;
- no overdependence on animation.

LOGGER
- Dynamic Type;
- keyboard avoidance;
- numeric input;
- VoiceOver;
- focus order;
- reachability;
- destructive confirmation clarity;
- minimum tap targets.

PART G — IMPLEMENTATION FEASIBILITY

For each family:
- current components reusable;
- new visual primitives needed;
- likely SwiftUI files affected;
- complexity;
- regression risk;
- platform constraints;
- any current hard-coded styling that blocks light/dark consistency.

Do not implement yet.

PART H — COVERAGE MATRIX

Create a complete matrix:

Surface/state | Current source component | Proposed visual template | Mocked? | Covered by template?

This is REQUIRED.

No state may be left "uncovered".

If a state does not deserve its own render, show which rendered template governs it.

PART I — OUTPUT

Create:

1. Watch full coverage board
2. Live Activity / Dynamic Island board
3. Training Logger full-flow board
4. Individual full-resolution key screens
5. dark/mineral-light Logger comparison where useful
6. utility token proposal
7. coverage matrix
8. implementation notes

Founder review priority:
- Logger full flow
- Watch active/control/save flow
- Live Activity active/paused/completed representative states

PART J — VISUAL AMBITION

This is NOT a dramatic redesign exercise.

Aim for:
- 70% visual-system translation;
- 20% spacing/hierarchy cleanup;
- 10% conservative usability refinement.

Do not exceed that without documenting why.

PART K — SHIPPING ISOLATION

No shipping code changes.
No Server changes.
No Watch behavior changes.
No HealthKit changes.
No ActivityKit lifecycle changes.
No Logger data/authority changes.
No theme implementation.
No build number.
No TestFlight.

Disposable design harness / previews only.

PART L — BACKLOG

Update App-wide UI/design polish:
- Watch utility-surface translation in review;
- Live Activity translation in review;
- Logger full-flow translation in review;
- implementation not started.

Do not mark directions locked until Founder reviews them.

PART M — REPORT

Publish:
agent-handoffs/reports/<timestamp>-utility-surfaces-watch-liveactivity-logger-design.md

Include:
- exact Native authority;
- source audit;
- complete coverage matrix;
- artifact paths;
- visual token mapping;
- accessibility;
- implementation complexity;
- UX changes proposed;
- exact behavior explicitly preserved;
- confirmation shipping code unchanged.

STOP only after all three surface families are completely covered and review artifacts are ready.

END TASK.
