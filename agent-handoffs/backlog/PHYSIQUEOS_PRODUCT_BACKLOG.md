PhysiqueOS product backlog — durable authority

Last updated: 2026-10-02
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
Status: Build 77 VALID; implementation complete; natural workout acceptance pending. Build 78 (VALID) carries the same Live Activity behavior unchanged; acceptance can be done on Build 78.
Authority:
- shipping source c299fa29
- final report agent-handoffs/reports/20261001T220947Z-workout-live-activities-phase1-implementation.md
Next:
- Founder puts Build 77 through a normal workout.
- Observe Lock Screen/Dynamic Island rendering, load/reps legibility, Complete Set, Stopwatch, final-set transitions, supersets, deep link, and lifecycle behavior.
- Do not patch typography/density until real-workout feedback unless correctness is broken.

2. Performance Record celebration — SHIPPED in Build 78 (VALID), pending physical acceptance
Status: integrated (reconciled with Build 77 TrainingSessionAuthority) + celebratory haptic; Build 78 source 5911dd2a, delivery 32447de5 VALID. Not complete until a natural future PR workout is accepted.
Build 78 report: agent-handoffs/reports/20261002T010500Z-native-build78-completion-notification-polish.md
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

3. Actionable Priority notifications — add Skip action
Status: SHIPPED in Build 78 (VALID), pending physical acceptance. Simple binary Priorities get Complete (check-circle) + Skip + Snooze; peptides keep planned-dose Complete + Snooze; Morning Check-In/weight unchanged. Recovery Support (e.g. Foam Rolling) Skip remains Priority Detail only until the Server publishes a skip command in notificationAction.
Context:
- PhysiqueOS now supports a canonical skipped state for applicable actionable Priorities.
- Existing actionable notification flows already support actions such as completion and snooze.
Requirement:
- expose Skip from actionable Priority notifications when the underlying Priority/action supports canonical skipping;
- route through the same canonical Priority mutation semantics as in-app Skip;
- do not create a notification-only skip state;
- notification/UI state must reconcile after the action;
- preserve dose-aware/specialized completion semantics for priorities that require them;
- fail soft if Skip is not valid for that occurrence.
Build decision:
- do NOT create a dedicated build solely for this.
- integrate/review with the next consolidated Native release, currently expected Build 78, alongside the staged Performance Record celebration fix.
Acceptance:
- supported Priority can be skipped directly from notification;
- resulting occurrence is canonically skipped and reflected in Home/Priority detail;
- unsupported Priority does not offer an invalid Skip action;
- repeated/stale action is safe;
- notification clears/updates appropriately.

4. HealthKit Sleep — prospective canary acceptance
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

5. Recovery Briefing V1 — shadow calibration then publication
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

6. Beta-user readiness / DigitalOcean capacity
Status: not an immediate blocker; Founder may consider another user in roughly the coming month but has not authorized onboarding.
Next before beta:
- bounded production capacity/read-latency/cost audit;
- realistic two-user load estimate;
- confirm prior performance optimizations remain effective.
Trigger:
- Founder begins planning actual beta onboarding, or DO cost/performance symptoms recur.

7. Apple Watch companion
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

8. Shared Mac restart
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


FOUNDER IOS ROADMAP — 2026-10-01

Near-term ordering after current acceptance work:

1. Workout Logger Live Activities
Status: IN PROGRESS / Build 77 real-workout acceptance.
Founder plans several days of real use before finalizing ergonomics/typography.

2. Home Screen widget
Status: HIGH-INTEREST / likely next iOS feature after Live Activities settles.
Founder wants:
- daily totals displayed;
- Start Workout Logger action/button.
Exact daily-total composition and widget sizes/layout remain to be designed.

3. Apple Watch companion
Status: HIGH-INTEREST / likely after several days of Live Activity use, potentially next week.
Desired direction:
- Watch as workout execution surface;
- current/next set context;
- Complete Set;
- rest Stopwatch/Countdown;
- workout progress;
- phone remains editing/planning surface for load/reps/exercises;
- paired Watch app may become source of Apple Health strength workout start/end and workout-time heart rate/physiology;
- structured PhysiqueOS Logger remains authority for exercises/sets/reps/load;
- HealthKit remains physiological workout-observation layer.
Use Build 77 Live Activity real-world acceptance to inform Watch V1 interaction design.

BUILD 78 — SHIPPED (VALID, delivery 32447de5), pending Founder physical acceptance
Items A-D below shipped in Build 78 (source 5911dd2a). Keep until acceptance; Workout set-completion haptic intentionally deferred.

A. Performance Record celebration lifecycle fix
Authority: 69cad804e2ac7d74ed98914e1601f2e7863dadc3.
Integrate/review against current Native authority rather than releasing alone.
Add appropriate celebratory haptic alongside confetti/PR presentation.

B. Actionable Priority notification — Skip
Expose canonical Skip for notification actions where the Priority supports it.
No notification-only state.

C. Actionable Priority notification — one-tap Complete control
For simple binary Priorities that require no additional input, provide an Apple Reminders-style checkbox/check-circle action directly from the notification rather than requiring long-press -> Complete.
Do NOT apply this shortcut to Morning Check-In/weight or other flows that may require additional information.
Use canonical in-app completion semantics and preserve specialized/dose-aware behavior where applicable.

D. Targeted haptic feedback
Treat haptics as interaction polish, not a standalone feature project.
Initial accepted candidates:
- PR celebration: celebratory haptic + confetti;
- Priority completion: subtle success haptic;
- Priority Skip: lighter confirmation haptic;
- Workout set completion: DEFERRED (not in Build 78); consider subtle confirmation, especially interactive system surfaces, after real-use acceptance.
Avoid haptics on ordinary read-only navigation/charts/browsing.

PARKED IOS FEATURES

Native capture / quick intake
- Native Progress Photo capture: keep for possible later enhancement; current workflow is sufficient.
- DEXA quick upload / Files picker shortcut: keep for later. Current preferred workflow remains DEXA notification -> Priority -> Files because the Priority may carry the needed context/action.
- Broader Share-to-PhysiqueOS evidence intake enhancements: keep lower priority; current workflows are sufficient.

Face ID / biometric authentication
- Keep for future multi-user/login phase.
- Not needed for current Founder-stage app.

Home Screen quick actions
- Keep lower priority.
- Likely inexpensive, but not necessary yet.

REMOVED / CURRENTLY NOT WANTED

Siri / broad Shortcuts surface
- Founder currently sees no meaningful need.
- Remove from active roadmap/backlog for now.
- Existing AppIntent use required internally by features such as Live Activities does not imply a user-facing Siri/Shortcuts project.

CURRENT-SCOPE COMPLETE

General deep HealthKit integration
- Consider current non-Watch scope sufficiently robust/complete.
- Activity, Nutrition, Cardio and Sleep have substantially reached the desired current state.
- Do not reopen generic HealthKit work as a feature project.
- Next meaningful HealthKit expansion belongs to the paired Apple Watch project (Watch-owned strength workout + heart-rate/physiological observations).

Training Logger / Live Activities
- Existing broad Native Workout Logger feature vision has become the current Logger + Build 77 Live Activities work.
- Do not duplicate it as a separate future backlog item.

END BACKLOG.
