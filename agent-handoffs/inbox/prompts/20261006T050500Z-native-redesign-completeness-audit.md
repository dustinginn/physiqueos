PhysiqueOS Native Redesign Completeness Audit — full production surface inventory

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.
READ-ONLY AUDIT ONLY.

This audit may run while Build 88 is processing. It must not modify, merge, commit, push, deploy, upload or otherwise disturb the Build 88 release lane.

GOAL

Answer definitively:

"Has every reachable production Native surface in PhysiqueOS received the intended redesign treatment? If not, exactly what remains?"

Do not rely on memory, handoff summaries or assumptions.

Build a complete inventory from the actual shipping Native navigation/presentation graph and classify every reachable production surface.

AUTHORITIES

Final pre-bump Native candidate:
96e724a9f40f9178a16ea492958c3acd4b1b282e

Build 88 release is being produced from that exact authority in a separate Claude chat.

Production Server:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8
deployment 6fa4e887

Known redesign authorities incorporated into 96e724a9 include:
- Batch 2 RC 793462b1;
- Workout Match L13 79a1a33d;
- workout reliability e9f8a957;
- Batch 3 A–E f5257ae1;
- macro correction 75160ae8;
- integrated contract restorations fc693aeb;
- Evidence reliability 9fa2428c.

Do not alter any of these.

WORKTREE RULE

Use the single RC-provided worktree.
No EnterWorktree.
No secondary worktree.

READ-ONLY means:
- no source edits;
- no generated-project writes unless absolutely necessary for inspection; prefer existing checked-in project/source;
- no commits;
- no pushes;
- no production writes;
- no Server changes;
- no TestFlight actions.

If simulator rendering is useful, use existing code/fixtures without committing anything.

AUDIT METHOD

Do not begin from a list of remembered screens.

Derive the inventory from actual code.

Trace all production-reachable Native presentation entry points including:

1. App/root composition.
2. Main tabs.
3. NavigationStack destinations.
4. NavigationLink destinations.
5. sheets.
6. fullScreenCover.
7. popovers/menus that open substantive product surfaces.
8. alerts that lead to flows.
9. deep links / notification routes / App intents that open UI.
10. Home cards and CTAs.
11. Log routes.
12. Evidence routes.
13. Goal/Operating Plan routes.
14. You/Settings routes.
15. Briefing routes/history/detail.
16. Progress Photo / DEXA / Evidence review flows.
17. Training Logger / Workout Match / completion/recap.
18. Peptide/support-editor flows.
19. Recovery/Sleep surfaces.
20. Sources/permissions/connection surfaces.
21. Live Activity / Widget configuration destinations if they open app UI.
22. Watch app production screens as a separate inventory section.

Also inspect route enums, destination switches and presentation coordinators for branches that may not be obvious from static view filenames.

PRODUCTION VS NON-PRODUCTION

Explicitly distinguish:
- Founder Production reachable;
- production-reachable for another future user but not currently exposed to Founder;
- Sandbox/debug/review-harness only;
- test fixture only;
- dead/unreachable legacy code.

Do not count Sandbox/debug-only surfaces as missing redesign work.

CLASSIFICATION

Every production-reachable surface must receive exactly one primary classification:

A. REDESIGNED + FOUNDER ACCEPTED
The new design was implemented and explicitly accepted.

B. REDESIGNED + IN BUILD 88, PHYSICAL ACCEPTANCE PENDING
Implemented/approved from simulator/design review but still needs real-device/data validation.

C. INTENTIONALLY RETAINED
The old/current presentation was deliberately kept because redesign was not desired or the specialized presentation remains authoritative.

D. PARTIALLY REDESIGNED
A parent/root received the new grammar but meaningful child/drawer/detail states remain on older presentation.

E. NOT YET REDESIGNED
Reachable production surface remains materially on the old design and has no explicit intentional-retention decision.

F. PRODUCT/FEATURE WORK, NOT REDESIGN DEBT
Future capability that does not represent an existing production surface missing the redesign.

G. DEAD / SANDBOX / DEBUG / TEST ONLY
Not production redesign scope.

For A–E include evidence:
- source path/view;
- route/presentation path;
- redesign authority/commit when traceable;
- Founder acceptance evidence from handoff reports when traceable;
- whether Dark + Mineral Light are covered;
- whether physical real-data acceptance remains.

DO NOT INFER ACCEPTANCE

A surface is not "Founder accepted" merely because tests pass or it uses new shared tokens.

Use handoff/report evidence or explicit locked/accepted authority.

If acceptance cannot be proven, classify conservatively.

DESIGN-GRAMMAR CHECK

For every A/B/D/E production surface, inspect whether it follows the current redesign grammar where applicable:
- page background;
- navigation/header hierarchy;
- typography;
- card/row treatment;
- spacing;
- controls;
- disclosure treatment;
- semantic color usage;
- Dark/Mineral Light;
- loading/empty/error;
- tap targets/accessibility;
- charts;
- drawers/sheets;
- tab/nav relationship.

Do not declare a page redesigned just because colors changed.

SPECIAL AREAS TO AUDIT, NOT ASSUME

### Briefings

Audit:
- Midweek;
- Weekly;
- Monthly;
- Photo Briefing;
- Briefing History;
- briefing detail;
- briefing cards/entry surfaces;
- any report/zine subviews;
- chart interactions.

We currently believe Weekly/Monthly richer redesign work remains, but PROVE the exact state.

Remember:
- Midweek is intentionally the shortest briefing;
- Weekly richer;
- Monthly richest;
- Sleep is intentionally withheld from Midweek and will enter Weekly/Monthly only after the separate 14-night rule.

Do not change briefing semantics.

### Energy

Audit the complete Energy surface:
- root;
- charts;
- history/detail;
- disclosures;
- scope/filters;
- loading/error/empty;
- routes.

Determine whether Energy itself is old design, partially redesigned, or merely has the known old chart gesture overlay.

### Goals / Operating Plan

Inventory:
- Goals root;
- Goal detail;
- completed Goal;
- Operating Plan;
- strategy editing;
- phase progression;
- priority details;
- Morning Check-In;
- any drawers/subpages.

Founder previously visually staged many of these. Prove coverage.

### You / Settings / Sources

Inventory every reachable child:
- appearance;
- notifications;
- source/connection management;
- Founder Production connection status;
- peptide protocol/support editors;
- any diagnostics;
- account/session/reconnect;
- permissions;
- other settings destinations.

### Log / Logger

Keep distinct:
- Log root;
- Logger;
- exercise selection;
- workout editing;
- supersets;
- completion recap;
- PR celebration;
- Workout Match;
- review/confirmation states;
- Training Today;
- cardio/activity presentation.

Determine which are redesigned vs intentionally retained.

### Evidence

Batch 3 was intended to cover:
- Hub/Timeline;
- Training;
- Activity/Cardio;
- Nutrition;
- Weight;
- Photos;
- DEXA;
- Add Evidence;
- generic Review.

Audit all subpages/drawers/detail routes and classify any remaining old-style child.

### Progress Photos

Physical Founder-media validation is still pending after TestFlight.
That is acceptance debt, not automatically redesign debt.

### Watch

Create a separate Watch inventory.

Do not judge Watch against the iPhone redesign unless a Watch redesign was actually in scope.

Classify each Watch screen as:
- current intended Watch design;
- known functional backlog;
- visual redesign debt if any.

Known functional follow-ups should not be mislabeled as redesign debt:
- Review/Confirmation Complete Set gating;
- timed-set projection;
- possible reply-before-side-effects optimization pending latency evidence.

CROSS-CHECK REDESIGN ARTIFACTS

Inspect the locked redesign artifacts/harnesses and Batch 2/Batch 3 review packages to identify intended surfaces.

Then cross-check those against the code-derived production inventory.

Produce both:
1. code -> design coverage;
2. design artifact -> shipping implementation coverage.

Flag:
- locked design with no shipping route;
- shipping route with no locked redesign;
- route intentionally retained;
- duplicate/legacy view still reachable.

NAVIGATION INTEGRITY

Look for:
- orphaned destination;
- stale old view still reachable through a secondary path;
- two different presentations for the same concept;
- drawer/detail bypassing the redesigned parent;
- old navigation route that should have been removed;
- accidental Sandbox/review seam reachable in Release.

No changes; report only.

RELEASE-SEAM AUDIT

Cross-check the prior seam scans but independently inspect production routing for:
- synthetic media;
- review fixtures;
- appearance-review harness;
- Evidence-review harness;
- Debug-only navigation.

Confirm they cannot be reached in Release.

OUTPUT 1 — MASTER SURFACE MATRIX

Publish a main-visible Markdown report with a table containing at minimum:

Area
Surface
Production route
Source/view
Classification A–G
Redesign authority/evidence
Dark
Mineral
Physical acceptance
Notes / remaining action

Group by:
- Home;
- Goals / Operating Plan;
- Log / Logger;
- Evidence;
- Briefings;
- You / Settings / Sources;
- Peptides;
- Recovery/Sleep;
- Other iPhone;
- Watch;
- Widgets/Live Activity/deep-link destinations.

OUTPUT 2 — EXECUTIVE ANSWER

Answer plainly:
- Is Build 88 the complete redesign?
- How many production surfaces were inventoried?
- How many are A/B/C/D/E?
- Exactly which surfaces still require redesign?
- Exactly which merely need physical acceptance?
- Which are intentionally retained?
- Which previously suspected missing areas are actually complete?

OUTPUT 3 — REDESIGN REMAINDER

If D/E items exist, create a prioritized remainder list:

P0 — visual inconsistency that materially harms current Founder use.
P1 — meaningful production family still old.
P2 — child/detail consistency.
P3 — polish only.

Estimate implementation grouping only by shared ownership/files; do not implement.

Identify which items can safely be bundled and which should remain isolated.

OUTPUT 4 — BETA READINESS SEPARATION

Explicitly separate redesign debt from future Beta Readiness product work.

Reference current GH beta backlog:
- #2 First-class Steps evidence + dynamic Log composition;
- #3 User-defined Priorities / Priority Library;
- #4 Apple Health upstream-source compatibility;
- #5 Goal creation, evidence onboarding & first-user setup.

Do not count these as Build 88 missing redesign surfaces unless an existing production surface is actually involved.

OUTPUT 5 — RECOMMENDATION

Recommend whether:
- redesign program can be declared complete after Build 88 physical acceptance;
- one final redesign batch is warranted;
- or multiple distinct redesign families remain.

Be conservative and evidence-based.

TESTING

This is primarily static/navigation audit.

You may run existing targeted UI tests or render existing fixtures to verify reachability/presentation, but:
- do not modify source;
- do not create new tests;
- do not commit artifacts.

If a conclusion depends on a surface that cannot be rendered safely, report that limitation.

CONCURRENCY

Build 88 release lane is active in another Claude chat.

Do not touch its branch/worktree/archive/TestFlight state.

This audit should be safe to complete while App Store Connect processes Build 88.

REPORTING

Publish:
agent-handoffs/reports/<timestamp>-native-redesign-completeness-audit.md

Update normal reporting pointers only if doing so will not overwrite an active Build 88 release status. Prefer publishing the report without taking over latest.json/latest.md while the release lane is active.

NOTIFICATION

Notify Founder whenever Claude stops or needs input.

At completion notify:
PhysiqueOS Redesign Audit — complete production surface inventory ready.

STOP

No implementation.
No commit/push of source.
No TestFlight action.
No Server work.
No production mutation.

END TASK.