PhysiqueOS Build 90 — remaining redesign surfaces, next batch

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.

This is a separate design lane from the active Build 90 Founder-changes design chat.

DESIGN / AUDIT FIRST.
Do not implement final production behavior until Founder reviews the boards.

BASE AUTHORITY

Use shipped Build 89 source:
51399425b683d6a6e36b5c91836290259e31a7e0

Build 89 is VALID in TestFlight.

Do not use older Build 88 completeness assumptions blindly. Re-audit the exact Build 89 tree first because Watch, Live Activity, Priorities, Daily Capture and Briefings were redesigned in Build 89.

CONCURRENCY

Another Claude design lane owns exactly:
- iPhone Logger rest stopwatch (#7);
- guided iPhone → Watch handoff (#8);
- Photo Briefing expanded-viewer cleanup;
- Watch primary-button vertical centering.

Do NOT touch those four items.

A Codex lane independently owns Training progression Server deployment-readiness.

Do not touch progression logic, Server deployment work or that Codex branch.

GOAL

Continue the broader Native redesign program after Build 89.

Priority order from Founder:

1. ENERGY
2. RECOVERY / SLEEP
3. Then the remaining genuinely old/untranslated production surfaces in whatever sensible order the Build 89 audit identifies.

Founder explicitly uses Energy and Recovery less frequently than the already-completed high-priority surfaces, which is why they come now rather than earlier.

PHASE 1 — BUILD 89 COMPLETENESS RE-AUDIT

Start by comparing the exact shipped Build 89 production-reachable Native surfaces against the accepted redesign system.

Classify every reachable surface/state as:

A. redesigned/accepted in Build 89 or earlier;
B. partially redesigned / mixed grammar;
C. still old presentation;
D. intentionally platform-specific / no redesign required;
E. obsolete/unreachable.

Do not count DEBUG review routes as production surfaces.

Explicitly re-check the families previously identified as remaining:
- Energy;
- Recovery/Sleep;
- Operating Plan;
- Peptides/protocol support;
- any remaining Priority child states not actually covered by Build 89;
- any Daily Capture child states not actually covered;
- Widget extensions beyond the accepted Build 89 micro-fix;
- any residual settings/source/detail sheets;
- any child drawers/modals inside redesigned Evidence pages;
- any remaining utility/secondary surfaces.

Do not reopen:
- Home;
- Goals;
- core Log;
- redesigned Evidence hub/timeline;
- Training/Activity/Nutrition/Weight/DEXA Evidence;
- Progress Photos except where another active lane owns the expanded Photo Briefing viewer;
- Watch/Live Activity;
- Priorities;
- Morning Check-In/manual weight/Home Confidence;
- Briefings;
unless the audit finds a concrete production-reachable old child state. If so, report it rather than silently redesigning the accepted parent.

Publish the updated Build 89 coverage matrix before design work.

PHASE 2 — ENERGY REDESIGN

Audit every production Energy surface/state and its current canonical data/interactions.

Likely include, if production-reachable:
- Energy root/overview;
- trends/charts;
- date/range controls;
- intake vs activity/expenditure presentation;
- energy-balance interpretation;
- detail/drill-down;
- loading;
- empty;
- partial/incomplete evidence;
- stale/as-of;
- error/retry;
- drawers/sheets.

Use the accepted Evidence redesign grammar from Build 89.

Founder product intent:
PhysiqueOS is a physique-goal app, not a cardio-fitness app.
Energy should help answer whether intake/activity are supporting the physique goal.
Wearable expenditure has acknowledged uncertainty; do not present estimated burn as false precision.
Do not reopen evidence-engine semantics in a visual task.

Preserve canonical data and behavior.

DESIGN

Create a coherent locked-design candidate for Energy in:
- Dark;
- Mineral Light.

Use real shipping SwiftUI / production components with safe fixtures.

If Energy has interaction/chart ambiguity, include the accepted tap-select / horizontal-scrub / vertical-scroll arbitration already used by redesigned Evidence/Briefings.

Produce one compact mobile-readable Energy coverage board plus focused state board if needed.

PHASE 3 — RECOVERY / SLEEP REDESIGN

The Build 89 physical review confirmed Recovery still visibly uses the old presentation grammar.

Audit and redesign the complete production Recovery/Sleep family.

Likely include, if reachable:
- Recovery root;
- Sleep Trends;
- Night Detail;
- All Nights/history;
- source/as-of states;
- loading;
- empty;
- partial/incomplete;
- error/retry;
- relevant drawers/sheets.

Use the accepted Evidence redesign grammar while preserving Recovery/Sleep's own identity.

Do NOT turn PhysiqueOS into a sleep app.

Recovery exists to support physique-goal coaching/training interpretation.

Preserve:
- canonical sleep/recovery data;
- source provenance;
- existing calculations;
- existing eligibility semantics;
- existing briefing thresholds;
- navigation;
- date/history behavior.

Do not change the previously established Sleep evidence rule/14-night strategic eligibility unless a separate product task explicitly authorizes it.

DESIGN

Dark + Mineral Light.
Real shipping SwiftUI.
Mobile-readable root + child-state coverage boards.

PHASE 4 — REMAINING SURFACES

After Energy and Recovery designs are complete, use the Build 89 re-audit to identify the next remaining old family.

Expected candidate:
Operating Plan / Peptides.

Do NOT automatically implement/design every remaining surface in one enormous package.

Instead:

- identify the next coherent family;
- produce a compact inventory and recommended batching;
- if Operating Plan/Peptides is clearly the next family and scope is manageable, create its design boards in this same lane;
- if the audit reveals multiple large families, stop after Energy + Recovery and publish the recommended next batch rather than flooding Founder with dozens of boards.

OPERATING PLAN / PEPTIDES IF REACHED

Preserve all established semantics:
- current strategy;
- phase history;
- phase transition behavior;
- Energy Strategy;
- peptide schedules;
- pause/resume;
- dose-aware behavior;
- supplements;
- recovery support;
- tracking;
- canonical server authority;
- no simplification that removes data/functionality.

Founder has previously asked for simpler peptide schedule UI, but do not reinterpret protocol semantics merely to modernize visuals.

VISUAL AUTHORITY

Use the accepted Build 89 redesign system:
- typography;
- cards;
- spacing;
- semantic accents;
- Dark;
- Mineral Light;
- chart interaction;
- navigation;
- drawers/sheets.

Do not invent another design language.

Do not mechanically make every page identical; retain domain-specific information hierarchy.

REAL SWIFTUI / REVIEW PROCESS

Use real shipping SwiftUI where practical.

For each family:
- audit;
- render;
- compare against accepted redesign grammar;
- correct;
- rerender.

Review boards should be mobile-readable, not giant desktop contact sheets.

No placeholder/blank states where real safe fixtures can represent the state accurately.

Do not connect a simulator to Founder Production.

IMPLEMENTATION BOUNDARY

This is primarily a design/coverage lane.

You MAY make DEBUG-only review seams and non-shipping fixture changes required to render options.

Do NOT merge final production redesign implementation unless Founder explicitly approves the boards in a follow-up.

No build bump.
No TestFlight.
No Server deploy.
No production mutation.

TEST / TECHNICAL AUDIT

For each proposed redesign family report:
- current source files/components;
- canonical data authority;
- existing interactions;
- drawers/child states;
- expected implementation files;
- likely conflicts;
- regression tests required;
- whether any Server change is actually needed.

Default expectation: visual redesign should be Native-only and preserve canonical contracts.

OUTPUT

Push isolated design branch.

Publish a main-visible report-only handoff containing:

1. updated Build 89 production-surface coverage matrix;
2. Energy review-board links;
3. Recovery/Sleep review-board links;
4. any additional family boards created;
5. exact remaining redesign backlog after this lane;
6. recommended implementation batching;
7. technical/interaction findings;
8. confirmation the other active Build 90 Founder-changes lane was untouched.

STATUS

If Energy + Recovery options are complete:
Build 90 remaining redesign — Energy and Recovery ready for Founder review.

If an additional family is also complete, name it explicitly.

FINAL NOTIFICATION

Notify:
PhysiqueOS Build 90 remaining redesign — next surfaces ready for Founder review.

STOP.

END TASK.