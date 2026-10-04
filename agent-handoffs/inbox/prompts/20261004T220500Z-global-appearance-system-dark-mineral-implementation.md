PhysiqueOS global appearance implementation — System / Dark / Mineral Light

TASK TYPE

Continue in Codex A.
Use High reasoning.
Same chat.

Founder has accepted the final Home Screen Widget design. The current Native app-wide redesign program is now DESIGN COMPLETE and all accepted design families are LOCKED.

Begin the first app-wide implementation prerequisite: global appearance architecture.

This is shipping implementation work, but do NOT upload TestFlight in this task.

PRODUCT REQUIREMENT

Implement one app-level appearance preference with exactly:

1. System
2. Dark
3. Light

Definitions:
- System = follow the iPhone/system appearance dynamically and is the default for new users.
- Dark = locked PhysiqueOS dark appearance.
- Light = locked PhysiqueOS Mineral Light appearance.

The selection must persist device-locally and apply immediately across the app.

Do not store appearance as canonical Evidence or Server profile data.

AUTHORITY

Reverify current Native implementation authority before coding. Claude may concurrently be preparing a separate next-build candidate for Watch/HealthKit + Foam Rolling; do not assume Build 85 remains the only relevant branch. Identify integration boundaries and avoid overwriting concurrent work.

Design authority is the completed/locked app-wide design program, including:
- accepted dark appearance;
- accepted Mineral Light appearance;
- accepted You / Settings / Appearance design;
- accepted Widget design;
- all locked screen-family designs.

Review:
agent-handoffs/reports/20261004T203501Z-you-settings-profile-ui-design.md
agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md
the final app-wide design closeout authority.

CURRENT KNOWN GAP

Earlier audit found:
- PhysiqueOSApp forces .preferredColorScheme(.dark);
- PhysiqueOSTheme is static/dark-only;
- no typed Native appearance preference/store exists;
- no device-local persistence exists.

Reverify all of this against current authority before changing it.

PART A — ARCHITECTURE

Create one typed appearance model/store owned at app level.

Requirements:
- enum/state for system/dark/light;
- System default for fresh install/no stored value;
- device-local persistence;
- immediate runtime updates;
- System resolves to no forced root scheme so OS changes can propagate;
- Dark explicitly resolves dark;
- Light explicitly resolves light;
- deterministic test seam/reset for tests;
- no Server dependency.

Avoid per-screen persisted flags.

PART B — THEME TOKENS

Refactor the shared Native theme so app-owned product surfaces can resolve locked Dark or Mineral Light tokens dynamically.

Do not mechanically invert colors.

Use the actual locked palettes and semantic ownership established by the design program:
- canvas/background;
- surfaces/cards;
- primary/secondary/tertiary text;
- borders/dividers;
- semantic accent families;
- success/warning/error;
- muted/disabled states;
- form/control treatment;
- chart/graph treatment where shared tokens own it.

Preserve intentional domain colors and semantic meaning.

Do not rewrite every screen from scratch. Centralize semantic tokens where feasible.

PART C — SETTINGS / APPEARANCE ENTRY

Implement the accepted Appearance UI only to the extent needed to make the global appearance feature user-accessible.

Use the locked You / Settings / Appearance design authority.

If the current Settings route family is not yet shipping and implementing Appearance requires a minimal Settings/Appearance route, add the narrowest production-safe route needed for:
You -> Settings -> Appearance.

Do NOT implement the rest of the deferred beta Settings architecture in this task:
- no Profile write contract;
- no Data Sources projection;
- no Sign Out coordinator;
- no public beta/account architecture.

If a minimal Settings shell is required, preserve the accepted design and clearly mark unrelated rows according to current implementability; do not add dead destinations.

PART D — APP-WIDE OWNERSHIP AUDIT

Audit every app-owned appearance owner:
- main app/tab/navigation;
- sheets/full-screen covers;
- alerts/dialogs where app styling applies;
- forms/controls;
- media viewers;
- Evidence intake/review;
- Briefings;
- Goals;
- Priority Detail;
- Operating Plan;
- Training Logger;
- Home;
- Log;
- You;
- widgets;
- Live Activities;
- Watch app.

Classify each as:
1. inherits iOS/system appearance automatically;
2. uses shared PhysiqueOS tokens and is migrated in this task;
3. has intentional separate extension styling that must receive paired tokens;
4. cannot safely be migrated yet because its locked redesign implementation has not landed.

Do not falsely claim the entire redesigned visual hierarchy is implemented merely because theme tokens exist.

The goal of this task is GLOBAL APPEARANCE INFRASTRUCTURE, not implementation of every locked redesign.

PART E — WIDGET / LIVE ACTIVITY / WATCH

Reconcile app-level appearance with extension behavior correctly.

Home Screen Widget:
- implement appearance behavior consistent with WidgetKit/system environment and the locked dark/Mineral designs;
- do not assume the app's device-local preference can override system rendering if platform behavior does not support that contract;
- document exact behavior.

Live Activities:
- preserve locked Live Activity design and platform appearance semantics;
- migrate shared semantic tokens only where technically correct.

Watch:
- do not force an iPhone-only preference onto watchOS if it is not a supported/shared contract;
- document whether Watch follows its own system appearance or shared app preference;
- do not break Claude's concurrent Watch/HealthKit work.

PART F — LOCKED-DESIGN SAFETY

Do not use this theme project as permission to broadly implement every redesigned screen.

Existing old-layout screens may become correctly light/dark using semantic tokens while retaining their current geometry until their locked redesign implementation batch lands.

The accepted Foam Rolling pilot must remain visually correct.

PART G — VALIDATION

At minimum:
- fresh install/no preference => System;
- System follows simulated OS dark/light changes;
- explicit Dark remains dark regardless of OS;
- explicit Light remains Mineral Light regardless of OS;
- selection persists across relaunch;
- invalid/legacy stored value safely falls back to System;
- Appearance selection is not color-only;
- no major app-owned surface has unreadable text/background contrast in either appearance;
- existing tests remain green.

Capture real simulator screenshots for representative surfaces in:
- System resolved Dark;
- System resolved Light;
- explicit Dark;
- explicit Light/Mineral.

Representative validation should include at least:
Home;
Log;
one Briefing;
one Evidence page;
Training Logger;
Goals;
Priority Detail Foam Rolling if integrated in the chosen authority;
Operating Plan;
You/Settings/Appearance;
one modal/sheet/form;
Home Screen Widget where simulator tooling permits.

Do not require every locked redesign geometry to be implemented for this infrastructure acceptance.

Run focused unit/UI tests plus full relevant Native unit suite and Release compile including Watch/Live Activity/widget extensions.

PART H — CONCURRENT CLAUDE INTEGRATION

Claude is separately working on the post-workout Watch/HealthKit + Foam Rolling next-build candidate.

Do not silently merge/rebase over that work.

Before finalizing:
- identify Claude's current published implementation authority if available;
- state merge/integration order;
- identify overlapping files;
- prove no Watch/HealthKit fix or Foam Rolling pilot behavior is lost.

If Claude is not finished, keep this implementation isolated and produce a clean integration plan rather than guessing.

PART I — DELTA LEDGER

Review agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md.

Resolve the Appearance — System, Dark and locked Mineral Light entry only if its acceptance criteria are genuinely satisfied.

Do not close unrelated Settings/Profile/Data Sources/Sign Out or redesign implementation entries.

PART J — OUTPUT

Publish:
- concise implementation report;
- appearance ownership matrix;
- test/compile results;
- representative simulator comparison artifact;
- exact implementation commit(s);
- integration plan with Claude's next-build lane;
- physical-device acceptance checklist.

Use normal reporting/latest standard and make visual artifacts main-visible.

No production mutation.
No Server changes unless an unexpected hard requirement is discovered; stop before adding one.
No TestFlight upload.

STOP when the global appearance infrastructure and narrow user-accessible Appearance control are implemented, tested, Release-compiled, documented and ready to integrate with the next Native build candidate.

END TASK.