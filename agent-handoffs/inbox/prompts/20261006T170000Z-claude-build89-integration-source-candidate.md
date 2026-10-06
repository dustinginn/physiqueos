PhysiqueOS Build 89 — integrated release-candidate source

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.

This is a dedicated integration/validation lane.

Do not reuse Claude A or Claude B chats.

BASE

Start from exact shipped Build 88 source:
7fce3b9708c063f3c6b58571778c595012b5de6d

Use only the single Remote Control-provided worktree.
No EnterWorktree.
No secondary worktree.

PINNED INPUTS

Claude A final:
f3579d87b2f111bd6da0e78ff928e7492efffc00

Claude B final:
156808fae50fc99ddbd6e1f0e3e90abec69ed26b

Codex final:
5b79118f84ac15ac190e0d73e13e71606c2f6d2f

All three have Build 88 as merge base.

Build 88 remains current release/TestFlight authority until separately authorized.

GOAL

Integrate the exact three pinned candidates onto Build 88, apply the one required Live Activity stopwatch micro-fix, resolve the two known overlaps correctly, run full combined integration gates, and produce a clean Build 89 RELEASE-CANDIDATE SOURCE SHA for Founder review.

STOP before:
- build-number bump;
- archive;
- TestFlight upload;
- latest.json/latest.md release-authority change;
- Server deploy;
- production mutation.

INTEGRATION ORDER

1. Integrate Claude A exactly at:
f3579d87b2f111bd6da0e78ff928e7492efffc00

2. Immediately apply the required Live Activity state-specific stopwatch micro-fix.

3. Integrate Claude B exactly at:
156808fae50fc99ddbd6e1f0e3e90abec69ed26b

4. Resolve A/B overlap exactly as specified below.

5. Integrate Codex exactly at:
5b79118f84ac15ac190e0d73e13e71606c2f6d2f

6. Resolve B/Codex overlap exactly as specified below.

Do not integrate report-only main commits as product source.

LIVE ACTIVITY REQUIRED MICRO-FIX

Claude A owns:
ios/PhysiqueOSShared/WorkoutLiveActivityViews.swift

In WorkoutClockBlock.body there are two distinct states.

NO ACTIVE REST TIMER / BEFORE FIRST SET:
the elapsed WORKOUT timer currently uses the wrong workout/dumbbell/bars semantic.

Change ONLY this no-rest branch so:

WORKOUT
[elapsed duration]

uses the established:
stopwatch

glyph.

ACTIVE REST TIMER:
preserve exactly:
green stopwatch icon;
REST · STOPWATCH;
existing rest clock;
existing green treatment;
existing state semantics.

Do not globally replace icons.
Do not change Dynamic Island symbols unless the exact same incorrect no-rest elapsed-time semantic independently exists there and the pinned requirement explicitly applies.
Do not change timer/state-machine logic.

Add integration tests proving:
- no-rest/pre-first-set WORKOUT uses stopwatch;
- no bars/equalizer/dumbbell in that slot;
- active REST · STOPWATCH remains green and unchanged;
- Complete Set transitions from no-rest WORKOUT presentation to rest presentation;
- timer authority/state behavior unchanged.

KNOWN CONFLICT 1 — A/B

Expected shared file:
ios/PhysiqueOS/Presentation/Root/RootTabView.swift

Preserve BOTH:

Claude A:
- morning-check-in appearance/review route and any accepted A-owned routing additions.

Claude B:
- briefing-history route;
- briefing:<artifactId> fallback before evidenceReviewPath;
- accepted Briefings routing.

Do not choose one side wholesale.

After resolution, prove:
- Morning Check-In route works;
- Briefing History works;
- direct briefing artifact route works;
- Evidence routing still works;
- no DEBUG/review route leaks into Release unless it is an intentional accepted shipping route.

KNOWN CONFLICT 2 — B/CODEX

Expected shared file:
ios/PhysiqueOSUITests/TrainingAcceptanceUITests.swift

Preserve BOTH:

Claude B:
- stable briefing artifact-ID navigation;
- updated Briefing assertions/journeys.

Codex:
- appearance-aware launcher;
- Build 89 C1/C2 capture support where appropriate;
- canonical PR assertions;
- capture helper;
- relevant Logger/Training acceptance additions.

Do not discard either suite.

After resolution, compile the UI-test target and run the affected combined journeys.

VERIFY NO OTHER CONFLICTS

Before resolving anything:
- perform changed-file intersection audit A↔B, A↔Codex, B↔Codex;
- compare against Codex consolidated report;
- if additional product-source overlaps exist, inspect semantically rather than auto-choosing ours/theirs;
- report any unexpected overlap.

FOUNDER-APPROVED AUTHORITIES TO PRESERVE

CLAUDE A

Watch:
- complete accepted Watch redesign;
- Dark + Mineral Light;
- independent iPhone and Watch appearance settings;
- Watch unset default Dark;
- local Watch persistence/offline appearance;
- Founder-selected compact Mineral clock capsule Option A;
- no full-width Mineral clock band;
- Complete Set Review/Confirmation gating;
- timed-set projection fix;
- existing superset/reliability improvements and instrumentation;
- do NOT add speculative reply-before-side-effects optimization.

Live Activity / Dynamic Island:
- accepted redesign;
- plus the required no-rest WORKOUT stopwatch correction above.

Priorities:
- accepted Priority Detail family.

Daily Capture:
- Morning Check-In;
- manual/backdated weight;
- Home Confidence.

CLAUDE B

Briefings:
- Midweek;
- Weekly;
- Monthly;
- Photo;
- DEXA;
- History/detail/states.

Preserve:
- no historical briefing regeneration;
- real canonical payload rendering;
- Midweek Sunday-through-Tuesday inclusive;
- Midweek presentation explicitly Sun–Tue and preserves missing/incomplete day slots;
- DEXA locked rail-based layout;
- DEXA goal/tissue-aware semantic delta colors;
- no generic large delta tables;
- DEXA WHAT THIS SCAN MEANS promotes canonical interpretation.opening as prominent lead without repetition;
- stable History titles;
- Monthly month/year qualifier;
- per-type History accent colors;
- chart vertical-scroll/scrub arbitration;
- Photo paired viewer.

CODEX

Preserve:

1. Training Detail PR card:
- canonical Server-owned performanceRecords only;
- below Workout Summary;
- omit when empty/non-authoritative;
- no local PR recalculation;
- Watch/phone finish parity.

2. Nutrition:
- Calories green semantic color;
- other macro mappings unchanged.

3. Home copy:
- KEEP green status: “4 weeks to goal target”;
- Remaining: “4 weeks”;
- Phase 2: “about 4 weeks remaining”.

4. Widget:
- refresh accent same teal/cyan semantic authority as Start Logger;
- no behavior/layout change.

5. Suggested Today:
- explicit unselected top-right selection affordance;
- selected teal check;
- card/control and Training Area tile share canonical selectedAreaIds state.

6. Logger typography:
FOUNDER SELECTED OPTION B.
- editable REPS/LOAD = 16 pt Semibold / weight 600;
- SET number remains 12 pt Bold;
- headers remain 8 pt;
- numeric field height remains 36 pt;
- geometry/edit behavior unchanged.

DO NOT ACCIDENTALLY ADD POST-BUILD-89 BACKLOG

GitHub issue #7 — iPhone Logger rest stopwatch for phone-only workouts — is explicitly for the build AFTER Build 89.

Do not implement it in this integration.

INTEGRATION AUDIT

After merging all three candidates and resolving conflicts:

1. Generate exact changed-file inventory vs Build 88.
2. Confirm no candidate commit was silently omitted.
3. Confirm no report/review artifact accidentally controls runtime behavior.
4. Confirm no DEBUG-only review seams leak into Release.
5. Confirm no Server files/semantics were unintentionally changed unless they were already part of the pinned Native candidates.
6. Confirm latest.json/latest.md still point to Build 88.

FOCUSED TESTS FIRST

Run the combined focused suites from all three lanes.

At minimum:

Codex:
- TrainingSessionDetailPresentationTests;
- EvidenceReviewHeaderDateTests;
- HomeReadModelTests;
- HomeWidgetTests;
- TrainingLoggerTests.

Claude A:
- Watch workout/unit suite;
- Watch appearance/offline/reconnect;
- Watch session authority;
- Live Activity view/intent/contract/coordinator tests;
- Priority Detail;
- Morning Check-In;
- manual weight;
- Home Confidence.

Claude B:
- Briefing Founder corrections;
- Briefing locked presentation;
- Briefing V3/read model;
- DEXA;
- Photo;
- Weekly/Midweek/Monthly;
- History/routing/accessibility.

Integration-specific:
- RootTabView combined route tests;
- Live Activity stopwatch tests;
- combined TrainingAcceptanceUITests affected by B + Codex.

If focused tests fail, diagnose and fix only integration regressions. Do not reopen accepted product design.

FULL GATES

Once focused gates are green:

1. Full Native unit suite.
2. Full relevant iPhone UI acceptance suite.
   - avoid shared-simulator contention;
   - use dedicated simulator(s) sequentially where needed.
3. Full Watch unit suite.
4. Full Watch UI suite.
   - account for the previously proven Build 88 WCSession fixture limitation;
   - do not waive a new failure merely because one historical harness failure existed.
5. Watch↔phone workout/session/finish parity tests.
6. Briefing journeys including all five types + History.
7. Training Logger journeys.
8. Evidence/Home/Goals/You smoke/parity as appropriate for changed shared routing.
9. Debug compile.
10. Generic Release compile including:
   - iPhone app;
   - Watch app;
   - Widget/Live Activity extension.
11. verify_release_configuration.py.
12. generator determinism.
13. git diff --check.
14. Release seam scan for DEBUG/review-only routes and option-selection seams.
15. changed-file/conflict audit.

Do NOT archive/sign/upload yet.

STORAGE

Codex restored approximately 25.41 GiB free.

Before heavy gates:
- measure current free space;
- if below a safe threshold, perform only low-risk cleanup of regenerable DerivedData/test artifacts;
- protect Build 88 archive and all pinned source refs;
- do not delete active integration worktree.

After gates:
- remove disposable DerivedData if needed;
- report remaining free space.

VISUAL / ARTIFACT VALIDATION

Do not create a giant new redesign package.

Produce a concise integrated acceptance board/package only for high-risk merged areas:

I1 — Live Activity:
- no-rest WORKOUT stopwatch;
- active green REST · STOPWATCH.

I2 — Root routing:
- Morning Check-In;
- Briefing History/direct briefing route.

I3 — Logger:
- Suggested Today explicit selection control;
- Option B 16 pt Semibold REPS/LOAD.

I4 — Training Detail:
- PR card.

I5 — one representative corrected DEXA Briefing view showing rail layout + WHAT THIS SCAN MEANS lead.

Use real shipping SwiftUI/simulator.

Founder has already approved source-lane visual designs; this package is integration proof, not another redesign review.

REAL DATA / PRIVACY

Do not pair a simulator to Founder Production merely to validate integration.

Use safe fixtures/sandbox for automated integration.

Physical-device acceptance of real canonical records happens after an integrated build is authorized.

NO RELEASE ACTIONS

Do NOT:
- change CFBundleVersion / Build 89 metadata;
- archive;
- sign for distribution;
- upload TestFlight;
- update latest.json/latest.md to Build 89;
- deploy Server;
- mutate production.

OUTPUT

Push a clean integration candidate branch.

Publish a main-visible REPORT-ONLY handoff using the established agent reporting flow.

Report:

- exact integration candidate SHA;
- base SHA;
- exact A/B/Codex pinned SHAs integrated;
- merge/cherry-pick strategy used;
- conflict resolutions;
- Live Activity micro-fix commit;
- changed-file inventory;
- focused test results;
- full test results;
- Watch results;
- UI results;
- Debug/Release compile;
- seam scan;
- generator/diff checks;
- storage before/after;
- direct verified links to I1–I5;
- known remaining issues;
- physical-device acceptance checklist;
- explicit statement that build bump/TestFlight were NOT performed.

STATUS LANGUAGE

If every source/test gate passes:
“BUILD 89 INTEGRATED SOURCE CANDIDATE READY FOR FOUNDER PHYSICAL ACCEPTANCE / RELEASE AUTHORIZATION.”

Do not call it released.
Do not call it TestFlight-ready until release metadata/archive gates are separately run.

latest.json/latest.md remain Build 88.

FINAL NOTIFICATION

Notify:
PhysiqueOS Build 89 — integrated source candidate ready for Founder review.

STOP.

END TASK.