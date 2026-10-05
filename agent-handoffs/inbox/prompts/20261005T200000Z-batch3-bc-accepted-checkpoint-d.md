PhysiqueOS Redesign Batch 3 — B/C accepted; implement Checkpoint D Progress Photos + DEXA

Continue in the EXISTING Claude Batch 3 Evidence takeover Remote Control chat using High reasoning. Same chat.

WORKTREE RULE

Stay in the single RC-provided worktree.
No EnterWorktree.
No secondary worktree.

FOUNDER ACCEPTANCE

Checkpoint A — Evidence Hub + Timeline: ACCEPTED and locked.
Checkpoint B — Training + Activity/Cardio: ACCEPTED and locked, including the corrected Training Area icon system.
Checkpoint C — Nutrition + Weight: ACCEPTED and locked, including regression proof for drawers/sheets/routes and the chart gesture correction.

Current accepted Batch 3 candidate:
8aa2d00b835a9a3cbbbc16f001d032db9e7cd7ce

Do not reopen A/B/C.

GOAL

Implement Checkpoint D only:
Progress Photos + DEXA Evidence.

Use the same strict measured pixel-parity process that succeeded on A/B/C.

PROGRESS PHOTOS

Implement every locked Progress Photos Evidence surface/state represented by design authority, including as applicable:
- history/root;
- session/set detail;
- canonical pose ordering;
- first/latest/session treatment;
- previous/current comparison;
- interpretation;
- capture conditions;
- source/provenance;
- single-photo inspection;
- paired/comparison inspection;
- empty/loading/error/retry states;
- Photo Briefing relationship where represented, without moving briefing semantics into Evidence;
- navigation and enlargement/viewer behavior.

REAL FOUNDER PHOTO REQUIREMENT

The Founder previously established that placeholder/blank photos are insufficient for final visual acceptance.

Use the existing safe Founder-photo mechanism locally to verify actual Founder progress photos render correctly for:
- sizing;
- aspect/crop;
- pose/date mapping;
- previous/current pairing;
- viewer/enlargement;
- comparison layout.

Do NOT commit private Founder photo bytes to GH.

Public review artifacts must use safe synthetic/redacted fixture media, while the report explicitly states that the same layout was locally validated with real Founder media.

Do not regress the known requirement that completed Visible Abs and Progress Photos surfaces use real first/latest photos when available.

DEXA

Implement every locked DEXA Evidence surface/state represented by design authority:
- current scan;
- prior/history;
- current/prior comparison;
- Since Last Scan treatment;
- lean/fat/BF/BMC and supplemental/regional metrics;
- charts;
- history;
- PDF/source treatment;
- Apple Health writeback state;
- confirmation/correction/dismiss behavior where owned by Evidence;
- loading/error/empty;
- navigation/detail states.

Preserve the already accepted cleaner DEXA Since Last Scan design. Do not regress to the older production styling.

DEXA CHART GESTURE DEFECT — FIX IN THIS CHECKPOINT

B/C identified that the shared zero-distance chart drag overlay can trap vertical page scrolling.

For DEXA charts:
- tap selects;
- horizontal pan scrubs;
- vertical swipe must scroll the page;
- preserve chart selection/scrub semantics;
- add deterministic UI coverage.

Do not broaden this fix to Energy or Briefings in this task. Retain those as follow-up notes for their owning families.

PIXEL PARITY

For every materially distinct Progress Photos and DEXA surface:
- exact locked reference;
- real shipping SwiftUI simulator;
- Dark + Mineral Light;
- matched scale;
- measure margins, hierarchy, typography, image frames/crops, chart geometry, cards, rows, controls, labels, safe areas, nav/tab relationships and visible density;
- diff tooling where practical;
- correct and rerender until remaining differences are unavoidable system chrome/rasterization or truthful dynamic content.

Passing tests is not visual acceptance.
Do not use “close enough.”

BEHAVIOR SAFETY

Preserve canonical:
- Progress Photo pose/date mapping;
- staged upload/processing semantics;
- viewer behavior;
- DEXA units/data authority;
- DEXA correction/replacement semantics;
- Apple Health writeback;
- provenance;
- read models;
- loading/error/empty;
- stable accessibility/test identities;
- full-row hit regions.

No Server change unless the locked design truly lacks required data. Stop and report if so.

REVIEW PACKAGE

Publish a mobile-readable Checkpoint D package with verified GH links:
- Progress Photos Dark;
- Progress Photos Mineral;
- comparison/viewer states;
- DEXA Dark;
- DEXA Mineral;
- Since Last Scan;
- chart interaction proof;
- states;
- parity notes;
- real-Founder-photo local validation statement without private media.

TESTS

Run focused:
- Progress Photos;
- pose/date mapping;
- processing;
- photo viewer/comparison;
- DEXA;
- DEXA correction/replacement;
- Apple Health writeback;
- chart interaction;
- SharedUI/appearance;
- Evidence navigation/journeys;
- A/B/C regression sufficient to prove no visual/behavior drift.

Run generic Release compile.

NOTIFICATION

Notify Founder whenever Claude stops or needs input.

At completion notify:
PhysiqueOS Batch 3 — Progress Photos + DEXA ready for review.

STOP

STOP after Checkpoint D review package.
Do not begin E.
Do not upload TestFlight.
Do not bump build number.

END TASK.