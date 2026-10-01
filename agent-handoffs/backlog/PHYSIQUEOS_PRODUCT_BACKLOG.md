PhysiqueOS product backlog — durable authority

Last updated: 2026-10-01
Owner: Founder
Purpose: durable cross-chat authority for outstanding product work, accepted deferrals, natural acceptance gates, and next-build integration items.

USAGE

This file is the durable backlog authority across ChatGPT chats and coder sessions.

Before proposing or reconstructing the PhysiqueOS backlog:
1. read this file from origin/main;
2. read the latest relevant agent handoff reports;
3. do not resurrect items listed under Completed / Removed from backlog unless the Founder explicitly reopens them.

Agent handoff reports describe implementation state. This backlog describes what still needs product attention.

ACTIVE / NEXT

1. Workout Logger Live Activities — physical-device acceptance
Status: Build 77 VALID; implementation complete; natural workout acceptance pending.
Authority:
- shipping source c299fa29
- final report agent-handoffs/reports/20261001T220947Z-workout-live-activities-phase1-implementation.md
Next:
- Founder puts Build 77 through a normal workout.
- Observe Lock Screen/Dynamic Island rendering, load/reps legibility, Complete Set, Stopwatch, final-set transitions, supersets, deep link, and lifecycle behavior.
- Do not patch typography/density until real-workout feedback unless correctness is broken.

2. Performance Record celebration — integrate with next Native build
Status: root cause proven; bounded Native fix ready; intentionally not released alone.
Authority:
- fix branch codex/workout-pr-celebration-lifecycle-fix-20261001
- fix SHA 69cad804e2ac7d74ed98914e1601f2e7863dadc3
- audit agent-handoffs/reports/20261001T170354Z-workout-performance-record-celebration-audit.md
Decision:
- do NOT create a dedicated build solely for this fix.
- keep it ready for the next consolidated Native release, currently expected Build 78.
- when Build 78 scope is assembled, review/rebase/integrate this exact fix against current Native authority and rerun its lifecycle tests.
Acceptance:
- future natural workout with at least one supported canonical PR;
- PR details visible after confirmation;
- confetti once when appropriate;
- navigation/background timing cannot consume the celebration;
- no historical replay.

3. HealthKit Sleep — prospective canary acceptance
Status: historical Evidence + Build 76 UI + Server architecture complete. D0 2026-10-02 validation_only. Strategic Sleep OFF.
Authority:
- Server 5804e88dac0db6bb04cf43647d6387efeab25906
- Sleep closeout agent-handoffs/reports/20261001T203806Z-healthkit-sleep-server-midnight-window-closeout.md
Next:
- observe 2–3 naturally arriving prospective nights;
- no manual Sleep import;
- verify Oura preferred, background delivery without Log dependency, one canonical night/day, late update/reconciliation, stages/continuity, Evidence update, and strategic leakage zero.
After acceptance:
- authorize prospective validation-only Sleep as input to Recovery shadow assessment through a separately reviewed non-strategic composition boundary.

4. Recovery Briefing V1 — shadow calibration then publication
Status: visual design accepted; one-card hierarchy accepted; Server shadow assessment candidate implemented but intentionally unwired/un-deployed.
Authority:
- candidate 1bfa92ef874c3c96f05b23a9d3cbdfb956384156
- report agent-handoffs/reports/20261001T224516Z-recovery-briefing-v1-shadow-assessment.md
Accepted product direction:
- one contiguous Recovery card;
- Green / Yellow / Red / Not enough data;
- no Recovery Score;
- Green normally no commentary;
- prior-28-night personal baseline candidate;
- foam rolling execution context only;
- Midweek no Red;
- Recovery status does not automatically move Goal Confidence;
- training corroboration is non-causal.
Next:
- wait for prospective Sleep canary acceptance;
- review/authorize prospective-only non-strategic shadow input boundary;
- run shadow calibration;
- only later consider additive recoveryAssessment on NEW Weekly/Midweek/Monthly artifacts;
- historical Briefings remain unchanged;
- strategic Sleep/V3 graduation remains a separate Founder decision.

PARKED / LATER

5. Beta-user readiness / DigitalOcean capacity
Status: not an immediate blocker; Founder may consider another user in roughly the coming month but has not authorized onboarding.
Next before beta:
- bounded production capacity/read-latency/cost audit;
- realistic two-user load estimate;
- confirm prior performance optimizations remain effective.
Trigger:
- Founder begins planning actual beta onboarding, or DO cost/performance symptoms recur.

6. Apple Watch companion
Status: candidate next major feature, not started.
Current product hypothesis:
- Watch as execution surface: current/next set, Complete Set, Stopwatch/Countdown, workout progress;
- phone remains planning/editing surface for reps/load/exercises;
- Watch may become the source of the Apple Health strength workout and collect workout-time heart rate/physiology;
- structured PhysiqueOS Logger remains authority for exercise/set/reps/load;
- HealthKit remains physiological workout observation layer;
- reconcile the two rather than allowing HealthKit to own strength-program structure.
Trigger:
- Build 77 real-workout acceptance provides enough interaction evidence;
- Founder chooses Watch as next major feature.

OPERATIONAL / ENVIRONMENT

7. Shared Mac restart
Status: recommended when convenient, not currently blocking.
Last cleanup:
- free space recovered to approximately 25 GiB;
- remaining swap persisted without unsafe manual deletion.
Rule:
- maintain >=15 GiB free for heavy Xcode work;
- restart when convenient to clear residual swap;
- use safe generated-artifact cleanup before waiving disk floor.

COMPLETED / REMOVED FROM BACKLOG

A. Progress Photos / completed Visible Abs photos
Status: COMPLETED. Founder explicitly confirmed 2026-10-01.
Includes previously deferred concerns:
- retry/photo recovery behavior;
- misleading Photo Briefing preparation state;
- photo expansion behavior;
- completed Visible Abs first/last real progress photos.
Do not resurrect without new Founder report.

B. Exercise Performance Records current-record correctness / exercise identity audit
Status: COMPLETED. Founder explicitly confirmed 2026-10-01.
Includes previously deferred:
- recent session exceeding displayed current record;
- canonical exercise identity matching/reconciliation.
Do not confuse with the separate Performance Record celebration lifecycle fix, which remains ACTIVE for Build 78 integration.

C. Sleep Evidence UI
Status: ACCEPTED / complete for current scope.
Build 76 fixes accepted by Founder.

D. Sleep Server canonical/read architecture
Status: complete for current scope.
sleep-canon-v2, historical Evidence, Recovery reads, midnight-safe window math accepted/deployed.

E. Recovery Briefing V1 visual design
Status: accepted.
Future shadow/publication work remains active above.

BACKLOG MAINTENANCE RULE

When Founder adds, closes, defers, reopens, or reprioritizes a meaningful PhysiqueOS item:
- update this file on origin/main in the same planning turn when practical;
- preserve completed items in the Completed / Removed section so future chats do not resurrect them;
- include exact implementation/report authorities for staged fixes;
- do not treat speculative ideas as committed backlog unless Founder adopts them;
- when a build is assembled, review all items marked for next-build integration before bump/upload.

END BACKLOG.
