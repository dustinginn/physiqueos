PhysiqueOS Build 90 — implement Founder-selected Logger / Watch handoff / Photo viewer / Watch placement

Continue in this existing Claude A Build 90 Founder-design conversation and its current Remote Control-provided worktree.

Do NOT create another Remote Control session or another worktree.

BASE / DESIGN AUTHORITY

Shipped Build 89:
51399425b683d6a6e36b5c91836290259e31a7e0

Build 90 Founder design package:
3d7c54abdde81b937974d68f4da7f3a40d08ce50

Founder has completed ALL selections.

LOCKED FOUNDER DECISIONS

B90-1 — iPhone Logger rest stopwatch:
OPTION A — docked timer tile beside Finish Workout in the sticky bottom region.

Phone rest control:
YES — include End Rest while rest is active.
Use the existing canonical endRest authority.
Do NOT add phone Pause/Resume.

No active rest:
show the WORKOUT elapsed stopwatch consistent with the accepted Live Activity semantics.

Active rest:
show the canonical rest stopwatch plus a restrained End action.

B90-2 — guided iPhone → Watch handoff:
OPTION B — centered modal/card over the dimmed Logger.

Handoff dismissal:
dismiss only after authoritative Watch Start acknowledgment using existing watchStartedAt semantics.

Do NOT dismiss merely because the phone sent a readiness request.

Flow:
- paired/reachable Watch + before first set -> centered handoff modal;
- primary Ready on Watch;
- secondary Use without Watch;
- Ready initiates established Watch preparation and HKHealthStore.startWatchApp where legitimately available;
- always provide truthful instruction that user may need to open PhysiqueOS on Watch and tap Start Workout;
- wait for Watch Start acknowledgment;
- watchStartedAt -> auto-dismiss -> normal Logger;
- Use without Watch -> dismiss immediately, no re-prompt during that workout;
- after successful Watch start use the quiet On Watch treatment from the approved design;
- remove the redundant large Ready for Watch onboarding card.

B90-3 — Photo Briefing expanded viewer:
OPTION B — centered comparison group.

Use:
- intentionally bounded comparison stage;
- labels on photos as approved;
- synchronized pinch/pan unchanged;
- interpretation in the approved card below the photo group;
- canonical persisted per-pose narrative only;
- no blank full-height image columns;
- no decorative filler.

B90-4 — Watch primary button placement:
OPTION A — true centered.

Apply the approved centered vertical placement to the shared WatchPanelPage behavior identified in the design audit.

Preserve:
- button size;
- style;
- tap target;
- action;
- all unrelated geometry.

Validate both 49 mm and 42 mm and Dark + Mineral Light.

IMPLEMENTATION PRINCIPLES

Use the approved real-SwiftUI designs, not a reinterpretation.

Delete/remove unselected A/B/C production branches and DEBUG option-selection seams once no longer needed.

Do not retain a runtime option picker.

ITEM 1 — TIMER AUTHORITY

Do not create a second timer state machine.

Use canonical workout/rest authority already feeding Watch and Live Activity.

Phone-only must work without:
- Watch;
- WatchConnectivity reachability;
- Live Activity.

When Watch/Live Activity are present, all surfaces remain synchronized.

End Rest:
- invoke canonical endRest;
- update phone/Watch/Live Activity consistently;
- test repeated/late/stale actions safely;
- do not create phone-only timer mutation semantics.

Preserve Build 83 Finish-confirmation rule: stopwatch treatment hides/does not interfere during Finish confirmation.

ITEM 2 — WATCH HANDOFF ARCHITECTURE

Audit and implement using existing session authority.

Important design-audit findings to address:

A. Current handoff is pull-oriented and has no phone-side paired/reachable observation sufficient for the desired UX.
Implement the minimum truthful observation/coordination required.

B. HKHealthStore.startWatchApp is sanctioned but cannot guarantee foregrounding for locked/asleep/off-wrist/out-of-range Watch.
Never claim successful launch merely because the request was sent.

C. Acknowledgment authority is watchStartedAt.
Use that for modal dismissal.

D. PRE-EXISTING DEFECT:
the Ready-card predicate does not exclude Watch-started sessions; re-tapping it could clear startedAt.
Fix this as part of implementing the replacement flow and add regression coverage.

E. SEPARATE WATCH BUG:
didReceiveApplicationContext drops the appearance slot.
Audit whether the selected handoff implementation touches that path.
If the fix is tiny, isolated and clearly correct, fix it with regression coverage.
If not, report/backlog it rather than expanding scope.

Use without Watch:
- first-class;
- no repeated modal for same workout;
- persisted/restored appropriately for active draft/session;
- reconnect later must not suddenly nag.

Handle:
- paired + reachable;
- paired but unreachable;
- Watch app not running;
- locked/asleep;
- stale acknowledgment;
- already active Watch session;
- app background/foreground;
- restored Logger;
- Save & Leave / cancel;
- no Watch paired.

Do not create a second Watch session authority.

ITEM 3 — PHOTO VIEWER

Preserve:
- existing real-media mapping;
- Previous/Current dates;
- synchronized zoom/pan;
- pose identity;
- canonical narrative;
- accessibility;
- close behavior.

Validate portrait and wider/flexed image aspect ratios.

Do not publish Founder media in review artifacts.

ITEM 4 — WATCH CENTERING

The shared WatchPanelPage also affects Idle/Refresh and orphan prompt states.

Apply true-centered placement consistently where the shared component intends it.

Do not accidentally center screens that intentionally use another layout.

Run 49 mm + 42 mm fit checks.

TESTS

Add/adjust focused tests for:

Logger stopwatch:
- no-rest WORKOUT clock;
- active rest;
- canonical anchor;
- End Rest;
- phone-only;
- Watch-connected synchronization;
- Live Activity synchronization;
- Finish confirmation;
- restore/background;
- no duplicate timer authority.

Watch handoff:
- paired/reachable offer;
- Ready action;
- startWatchApp request semantics;
- unreachable fallback;
- truthful instruction;
- watchStartedAt dismissal;
- Use without Watch no-reprompt;
- restore;
- stale acknowledgment;
- already Watch-started;
- pre-existing Ready-card/start-clearing defect regression;
- no-Watch path.

Photo:
- Option B layout;
- narrative below;
- no full-height blank pane behavior;
- zoom/pan;
- dates/labels;
- aspect variants;
- accessibility.

Watch:
- centered Start Workout;
- shared Idle/orphan impact;
- 49/42 fit;
- Dark/Mineral;
- existing Watch workout/session tests.

Then run:
- focused iOS tests;
- focused Watch tests;
- affected UI journeys;
- full PhysiqueOSTests;
- full Watch unit suite;
- relevant Watch UI suite;
- generic Release compile app + embedded Watch + Widget/Live Activity;
- Release seam scan;
- generator determinism if needed;
- git diff --check.

STORAGE

Shared Mac was safely cleaned to approximately 28.27 GiB free.

Avoid unnecessary duplicate build products.

If validation consumes too much space, remove only this lane's regenerable DerivedData/test output after results are recorded. Do not delete worktrees or archives.

CONCURRENCY

Claude B separately owns approved Energy + Recovery implementation.

Do not touch:
- Energy;
- Recovery/Sleep;
- its DEXA dead-end disposition;
- Codex progression;
- production-access tooling;
- Server.

Report any file overlap with Claude B before later integration.

NO RELEASE

Do NOT:
- bump Build 90;
- archive;
- upload TestFlight;
- change latest release authority;
- deploy Server;
- mutate production.

OUTPUT

Push a clean Claude A Build 90 implementation candidate.

Publish a main-visible report-only handoff with:
- exact candidate SHA;
- all Founder selections;
- architecture changes;
- pre-existing defect disposition;
- Watch appearance-slot bug disposition;
- files changed;
- focused/full tests;
- Release compile;
- seam scan;
- storage after;
- expected conflicts with Claude B;
- physical-device acceptance checklist.

Status:
Build 90 Founder-selected Native changes ready for integration.

Notify:
PhysiqueOS Build 90 Founder changes — implementation candidate ready.

STOP.

END TASK.