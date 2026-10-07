PhysiqueOS Build 91 — implement approved Operating Plan redesign + isolated Watch presentation/haptic work

Continue in the SAME Claude Build 91 remaining-redesign / Watch-audit conversation and its current Remote Control-provided worktree.

Do NOT create another Claude session, child task, sub-chat, or additional worktree.

AUTHORITIES

Current shipped Native:
Build 90
32baf1d5f43120cd07088df1210e1dc84ed26a78

Design/audit branch candidate:
edd0f62f

Main-visible report:
dee282f990f05a6965198e9b5d0c681865565a7b

Founder has reviewed the design boards and APPROVES them.

LOCKED FOUNDER DECISIONS

D1:
Approve OP translation boards OP-A through OP-D as designed.

D2:
Approve Native-only Next DEXA Scan page and direct DEXA editor anchor.

D3:
Include the Scheduled Evidence card on Coaching Updates detail.

D4:
Keep the locked Priority canvas tokens for Operating Plan in Build 91.
Do not broaden into an app-wide token redesign.

D5:
Approve the Watch Mineral Light footer candidate conceptually.
Implement the shared-component fix, but keep it isolated and covered so tomorrow's physical workout feedback can add/adjust Watch work before Build 91 integration.

D6:
Watch-ready haptic = WKInterfaceDevice .notification semantics as recommended.
10-minute freshness.
Exactly once per genuinely new prepared-workout lifecycle.

D7:
Energy phase-history Server projection = LATER.
Do not implement in Build 91.

D8:
Widget + P2/P3 redesign tail = Build 92+.
Do not implement here.

Founder will perform another physical workout review tomorrow and may add Watch/Logger feedback.

GOAL

Implement the already-approved Build 91 Operating Plan package now.

Also implement the already-approved Watch Mineral footer fix and Watch-ready haptic in a clean, isolated portion of this candidate so tomorrow's additional Watch/Logger feedback can be added before Build 91 integration.

Do not integrate with Claude A Evidence yet.

OPERATING PLAN — OP-A

Implement the approved Operating Plan root and Coaching Updates treatment.

Fix:
- duplicate Operating Plan title;
- missing Try Again/error affordance where designed;
- sub-44pt action targets identified by the audit.

Preserve Server-owned strategy/protocol authority and existing command/write boundaries.

NEXT DEXA SCAN

Replace the production DEXA dead end with the approved Native-only Next DEXA Scan experience.

Use the existing Operating Plan read to resolve the Server-owned Coaching Updates strategy ID.

Use the existing Coaching Updates detail/read.

States:
- scheduled;
- not scheduled;
- no active Coaching Updates;
- load failed.

Primary:
Edit DEXA Schedule.

It opens the existing atomic Coaching Updates editor anchored/scrolled directly to the DEXA section.

Secondary:
open Coaching Updates detail where approved.

Include the approved Scheduled Evidence card on Coaching Updates detail.

Preserve:
- existing Save;
- stale-version handling;
- command authority;
- DEXA reminders/upload reminder/preparation-note semantics;
- dexaEventBriefingEnabled semantics.

No new Server command.
No second write boundary.
No Server change.

OP-B

Implement approved strategy-detail/editor redesigns represented in the locked boards.

Preserve all strategy semantics and existing server projections.

Include the Training builder copy correction identified in the audit if it is purely Native copy/presentation and matches the approved design.

Do NOT implement Energy phase-history Server work.

OP-C

Implement the approved Peptides / Recovery support / Supplements treatment.

Peptide behavior authority remains the existing Build 70 simplified editor and Pause/Resume model plus Server peptide Skip.

Redesign legacy:
- peptide domain;
- execution page;
- sheets;
- dose-plan editor;
- related approved support surfaces.

Preserve:
- pause/resume semantics;
- dose schedule authority;
- completion/skip behavior;
- canonical protocol history;
- no duplicate peptide state machine.

Use 44pt Manage/Resume actions as designed.

OP-D

Implement approved Tracking + Tracking support redesign.

Preserve all existing tracking semantics/commands.

WATCH MINERAL LIGHT FOOTER

Implement the approved shared-component candidate from WATCH-MINERAL-FOOTER.

Current diagnosis:
physical Watch Mineral Light likely shows a system scroll-edge effect from the shared WatchPanelPage ScrollView extending into the bottom region.

The simulator did not reproduce the physical artifact, so implementation must remain conservative.

Approved candidate:
- when content fits, avoid unnecessary ScrollView using the audited ViewThatFits/shared layout approach;
- panel explicitly paints its own intended background;
- overflow fallback remains scrollable;
- hide the bottom scroll edge effect using public API where appropriate;
- preserve true-centered actions;
- preserve 18pt minimum gap/overflow behavior;
- preserve Dark appearance;
- preserve 49mm and 42mm layouts;
- preserve Start Workout, Idle/Refresh, Phone unavailable and Apple Health orphan actions.

Do not globally disable watchOS affordances outside the affected shared component.

Add tests proving default-size layouts still fit and overflow remains reachable.

Tomorrow Founder will report:
- physical watchOS version;
- whether the bar appears on swipe-right Controls page;
- any other Watch/Logger feedback.

Keep this implementation easy to adjust before integration.

WATCH-READY HAPTIC

Implement the approved truthful ready cue.

Meaning:
Your Watch is genuinely prepared and ready for the user to tap Start Workout.

It must NOT mean:
- phone merely sent Ready;
- WCSession is reachable;
- watchOS launch request was delivered;
- workout started.

Fire exactly once on the first transition for a NEW preparation lifecycle into:
- phase prepared;
- exact Start-enabled predicate true;
- app active.

Use event-driven evaluation, never view-body side effects.

Lifecycle identity:
sessionId + preparedAt.

Additive projection:
preparedAt derived from draft.readyForWatchAt.

Persist the last-cued lifecycle on Watch so:
- redraw;
- application-context replay;
- reconnect;
- cold launch;
- reachability churn
do not replay the cue.

Freshness:
10 minutes.

Haptic:
.notification once.

Do not use:
.success
.start
.directionUp

Existing Start Workout haptic/semantics remain unchanged.

Never cue:
- Use without Watch;
- stale preparation;
- duplicate preparation;
- fixtures;
- reachability alone.

Phone behavior remains Build 90:
watchStartedAt is authoritative;
phone modal dismisses only after Watch Start.

BACKWARD COMPATIBILITY

preparedAt must be additive and backward-decodable.

No second Watch session authority.

Do not disturb Build 90 handoff reliability fixes:
- Ready/start-clearing guard;
- appearance-slot forwarding;
- fractional startedAt parsing;
- Use without Watch persistence/no-reprompt.

TOMORROW FEEDBACK SEAM

Do not final-integrate this candidate tonight.

Organize commits so Operating Plan work and Watch work are distinguishable.

Prefer at least:
- OP implementation commit(s);
- Watch footer/haptic commit(s);
- proof/report commit.

Tomorrow's Watch/Logger feedback should be addable without reopening Operating Plan.

TESTS — OPERATING PLAN

Run focused tests for:
- OP root;
- strategy details/editors;
- Coaching Updates;
- Next DEXA Scan all states;
- DEXA editor anchor;
- Scheduled Evidence card;
- stale version/save;
- Peptides pause/resume/editor;
- Tracking;
- action tap targets/accessibility;
- routing/back labels.

Run relevant Operating Plan UI suites.

TESTS — WATCH

Run:
- Watch unit;
- handoff/session authority;
- preparedAt decoding/projection;
- ready cue exactly once;
- duplicate/replay/cold-launch suppression;
- stale >10 min suppression;
- app inactive -> cue only when appropriate on activation;
- reachability alone no cue;
- Use without Watch no cue;
- Start remains authoritative;
- footer shared component at 49/42;
- Mineral/Dark;
- overflow fallback;
- existing Watch UI suites.

Run generic Release compile and seam scan.

Then:
- full PhysiqueOSTests;
- relevant Native UI;
- git diff --check;
- generator determinism if required.

CONCURRENCY

Claude A owns Evidence Option A implementation.

Do not touch Evidence visual-system files unless an unavoidable shared primitive is required.
If overlap is unavoidable, report it rather than redesigning Evidence.

Do not touch Server Adaptive Progression V1.

NO RELEASE / NO FINAL INTEGRATION

Do NOT:
- merge into final Build 91 integration;
- bump Build 91;
- archive;
- upload TestFlight;
- change latest release authority;
- change Server;
- mutate production.

OUTPUT

Push one clean isolated Build 91 OP + Watch candidate.

Publish a main-visible report-only handoff with:
- exact candidate SHA;
- Founder decisions D1–D8;
- OP implementation;
- DEXA dead-end resolution;
- Peptides/Tracking;
- Watch footer implementation;
- ready-haptic contract;
- files changed;
- focused/full/UI/Watch tests;
- Release compile/seam scan;
- physical-device items still requiring tomorrow verification;
- expected overlap/conflicts with Claude A;
- confirmation no final integration/build bump/TestFlight/Server/production mutation.

Status:
Build 91 Operating Plan + Watch implementation ready for tomorrow feedback and later integration.

Notify:
PhysiqueOS Build 91 OP + Watch — implementation candidate ready; physical workout feedback still pending.

STOP.

END TASK.