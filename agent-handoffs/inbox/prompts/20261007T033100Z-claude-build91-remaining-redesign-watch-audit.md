PhysiqueOS Build 91 — remaining redesign inventory + next design batch + Watch presentation audit

Continue in the existing Claude Native redesign conversation/work environment best suited to remaining-page inventory and Watch design.

Do not create child sessions or unnecessary worktrees.

TASK TYPE

AUDIT + DESIGN ONLY.

Do NOT implement production Build 91 behavior yet.
Do NOT bump a build.
Do NOT upload TestFlight.
Do NOT change Server.
Do NOT mutate production.

Founder will perform another Build 90 physical workout review tomorrow and may add Watch/Logger feedback. Keep implementation paused until that review is consolidated.

CURRENT RELEASE

Build 90 Native:
32baf1d5f43120cd07088df1210e1dc84ed26a78

GOAL A — EXACT REMAINING REDESIGN INVENTORY

Reconcile:
- current Native navigation tree;
- shipped Build 90;
- prior Build 89/90 design packages;
- accepted redesigns;
- implemented redesigns;
- deferred redesigns/backlog.

Produce the exact remaining page/subpage inventory that has NOT yet received the intended current-generation Native redesign.

Do not rely on stale backlog names alone.

Inspect actual reachable routes/screens.

Classify:
- already redesigned and shipped;
- redesigned but not yet implemented;
- not yet redesigned;
- intentionally legacy/deferred;
- dead-end/bug requiring behavior fix rather than visual redesign.

Known likely remaining family:
OPERATING PLAN, including its subpages.

Known deferred defect:
DEXA appointment action/page dead end. Prior audit found canonical Coaching Updates strategy ID is Server-owned and the fix is broader than a tiny navigation patch. Treat this as OP-A's first behavior/navigation issue.

Known later family:
PEPTIDES / peptide protocol/support UI, including pause/resume and simplification feedback where still applicable.

Verify these against current source rather than assuming.

GOAL B — DESIGN NEXT COHERENT BATCH

After inventory, immediately design the next coherent remaining redesign batch that can be reviewed independently.

Prefer:
1. Operating Plan remaining pages/subpages + DEXA appointment routing UX;
2. then Peptides if enough capacity remains.

Do not redesign Evidence visual colors in this lane; Claude A owns that.

Use real SwiftUI mockups/boards where practical.

Publish clear board links for Founder review.

GOAL C — WATCH MINERAL LIGHT WHITE-BOTTOM-BAR AUDIT

Build 90 physical-device feedback:

In Watch Mineral Light appearance, a white horizontal/footer-like bar is visible at the bottom on screens using the shared primary button/action treatment.

It appears in every place where the affected button is present.

Founder does NOT want it if it is merely a presentation artifact.

Audit exact cause:
- safe-area background;
- container background;
- ScrollView/GeometryReader;
- shared WatchPanelPage action container;
- system affordance;
- another source.

Determine whether watchOS requires it.

Expected design intent if not required:
- Mineral Light background continues cleanly to bottom edge;
- no white footer/bar;
- true-centered primary button remains exactly as Build 90 approved;
- Dark unchanged;
- 49 mm and 42 mm;
- Start Workout;
- Idle/Refresh;
- Apple Health orphan prompt;
- any other shared affected state.

Create before/after real-SwiftUI captures if feasible.

Do NOT implement production fix yet.

GOAL D — WATCH READY HAPTIC DESIGN

New Founder-approved product direction:

When user taps Ready on Watch in the iPhone Logger handoff flow, the Watch should provide one restrained haptic ONLY when the Watch has actually received/prepared the workout and is presenting the state where the user can tap Start Workout.

Semantic contract:

Phone tap Ready on Watch:
- sends/prepares request;
- may invoke sanctioned watch-app launch request;
- does NOT itself trigger the Watch haptic.

Watch:
- receives/prepares the workout;
- reaches truthful ready-to-start state with Start Workout available;
- emits one restrained confirmation haptic.

Meaning:
Your Watch is ready for you.

It does NOT mean:
- workout started;
- phone request merely sent;
- watchOS definitely foregrounded due to the launch request.

Phone continues waiting.

User taps Start Workout on Watch:
- existing watchStartedAt remains authoritative;
- phone modal dismisses as Build 90 currently does.

Audit current Watch handoff/state authority and identify the exact truthful event where the haptic should fire.

Design safeguards:
- exactly once per preparation lifecycle;
- no repeated haptics on redraw/state refresh/application-context replay;
- no haptic on stale/duplicate preparation;
- no haptic for Use without Watch;
- no haptic merely because WCSession is reachable;
- if Watch was already prepared when phone reconnects, do not spam another haptic unless a genuinely new preparation lifecycle occurs;
- preserve accessibility/system haptic expectations;
- choose a restrained standard Watch haptic appropriate for confirmation/ready, not success-of-workout-completion.

Recommend exact haptic type and why.

No implementation yet.

GOAL E — TOMORROW FEEDBACK HOLD

Explicitly mark this Build 91 Watch/Logger batch as DESIGN READY / IMPLEMENTATION HOLD until Founder completes tomorrow's workout review.

Do not start implementation automatically after boards are produced.

REPORTING

Publish:
1. exact remaining redesign inventory;
2. next-batch design boards and links;
3. DEXA dead-end disposition/design;
4. Peptides status;
5. Watch Mineral Light footer root-cause/design;
6. Watch-ready haptic event contract and recommended haptic;
7. any decisions Founder must make;
8. exact proposed Build 91 implementation batches AFTER tomorrow's workout feedback.

Publish a main-visible report-only handoff.

Status:
Build 91 remaining redesign + Watch audit ready for Founder review — implementation held for workout feedback.

Notify:
PhysiqueOS Build 91 remaining redesign and Watch audit — ready for review.

STOP.

END TASK.