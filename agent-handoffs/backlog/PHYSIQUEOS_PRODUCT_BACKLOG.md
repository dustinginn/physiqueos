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

DELIVERY WORKFLOW RULE (durable, 2026-10-02)
- Normal Native distribution is TestFlight-first: Claude/Codex archive on the Mac -> guarded App Store Connect upload -> TestFlight VALID -> Founder installs remotely -> physical acceptance.
- Tethered (USB / same-Wi-Fi / local device tunnel) installs are exceptional bring-up/debugging only.
- Future prompts must not make local Mac or device reachability a routine release gate.

ACTIVE / NEXT

00. DEXA -> Apple Health writeback — DUE before Founder DEXA Fri 2026-10-09
Status: AUDIT + PLAN COMPLETE (2026-10-02); Founder decisions PENDING; implementation NOT started; nothing written to HealthKit; no production mutation; no backfill.
Report: agent-handoffs/reports/20261002T235405Z-dexa-healthkit-writeback-audit-plan.md
Audit result (summary):
- No body measurement is written to Apple Health today (iPhone writes nothing; Watch writes workouts only). A dormant write registry exists (bodyMass + bodyFatPercentage); leanBodyMass is test-excluded.
- PhysiqueOS daily Weight is manual Morning Check-In only; HealthKit bodyMass is never ingested, so DEXA writeback cannot contaminate PhysiqueOS Weight today. It WOULD add a second scan-day point to Apple Health / third-party Weight.
- Accepted write point = active canonical DEXA record after the canonical_commit transaction (dexa_scan|owner|date + dexaRevision), not review status and not the dexaScans compatibility rows.
- Apple Health has no type for BMC, VAT, android/gynoid, regional, BMD; RMR must never map to cumulative basalEnergyBurned.
- PhysiqueOS leanMass = lean soft tissue (excludes BMC); Apple Lean Body Mass ≈ fat-free mass -> if written, write totalMass − fatMass.
Recommended V1: automatic, prospective-only (scan date >= 2026-10-09) Native reconciler converging to Server-owned writeback intents; HKMetadataKeySyncIdentifier/SyncVersion exact-once + correction replace; own samples never re-ingested; write Body Fat % (+ Lean Body Mass as fat-free mass if approved); do NOT write Weight/RMR/BMI.
Founder decisions pending (report §P): 1 measurement set; 2 DEXA Weight write (rec. No); 3 prospective-only vs backfill; 4 automatic vs manual; 5 correction auto-replace; 6 opt-in + toggle; 7 Phase D synthetic canary authorization.
Delivery: Server additive deploy (dormant policy) + Native Build 83 on e2cbcd0c (iPhone-only). Phases A decide Oct 3 / B implement Oct 3-5 / C synthetic validation + TestFlight Oct 5-6 / D physical opt-in + canary Oct 7-8 / E real scan Oct 9. Scan-date eligibility means a late Build 83 still writes the Oct 9 scan exactly once.
Pre-scan prep: make sure the Oct 9 DEXA appointment in PhysiqueOS has its local time set (used as the sample timestamp).
Incidental (not fixed): web Evidence Review discard lacks status guard; possible briefing-step lookup issue on same-date DEXA re-import (unverified).

0. Progress Photos flexible cadence (Every N Weeks / Months) — SHIPPED, pending Founder acceptance
Status: Server 4ffde0f5 deployed (deployment faaf66bd) and verified; Native Build 81 (source 6a093251) uploaded VALID (delivery 212d79dd-cc57-4319-ab8c-d9694f0585ad); next build 82. Report: agent-handoffs/reports/20261002T070000Z-progress-photos-flexible-cadence.md.
What changed:
- Coaching Updates > Progress Photos: "Every [1-12] [Weeks | Months]" + "On [day]" / "On the [first..fourth|last] [day]"; monthly = weekday of the month (not day of month).
- Existing Every 2 weeks schedule unchanged (no migration); cadence changes are future-only with a predictable first date; same-day changes amend with audit, and a same-day revert restores the original dates.
- Photo Event briefing semantics unchanged (completed confirmed session only).
Acceptance (Build 81): Every 2 weeks loads; 3 weeks and 1 month save/reopen retained; set the wanted cadence before Saturday; specific time, reminder toggle, Photo Event toggle unchanged; exactly one pending Progress Photos reminder.
Note: after a 3+ week or monthly cadence is saved, Builds <=80 cannot open Coaching Updates (fail closed by design).

1. Workout Logger Live Activities — physical-device acceptance
Status: Build 77 VALID; implementation complete; natural workout acceptance pending. Builds 78 and 79 (both VALID) carry the same Live Activity behavior unchanged (in Build 79 the same extension also hosts the Home Screen widget); acceptance can be done on Build 79.
Authority:
- shipping source c299fa29
- final report agent-handoffs/reports/20261001T220947Z-workout-live-activities-phase1-implementation.md
Next:
- Founder puts Build 77 through a normal workout.
- Observe Lock Screen/Dynamic Island rendering, load/reps legibility, Complete Set, Stopwatch, final-set transitions, supersets, deep link, and lifecycle behavior.
- Do not patch typography/density until real-workout feedback unless correctness is broken.

2. Performance Record celebration — SHIPPED in Build 78 (VALID), carried unchanged in Build 79 (VALID); pending physical acceptance
Status: integrated (reconciled with Build 77 TrainingSessionAuthority) + celebratory haptic; Build 78 source 5911dd2a, delivery 32447de5 VALID; Build 79 source a75f93df, delivery 8937b165 VALID (PR lifecycle UI journey re-passed). Not complete until a natural future PR workout is accepted.
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
Status: SHIPPED in Build 78 (VALID), pending physical acceptance. Simple binary Priorities get Complete (check-circle) + Skip + Snooze; Morning Check-In/weight unchanged. Build 79 (VALID) extends Skip to peptides and Foam Rolling from the Server-owned skipCommand (see BUILD 79 below); supplements remain Complete + Snooze.
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
Status: HOLD (not PASS) since 2026-10-02 22:00Z. sleep-canon-v3 ACTIVE for ordinary prospective Sleep (effective 2026-10-02; policy healthkit_sleep_canonical_algorithm_policy). P2 Oura copy splice resolved prospectively: Oct 2 corrected v2 rev2 -> v3 rev3 (asleep ~455, deep ~98.5, REM ~117.5, core ~239, awake ~25 min, 73 segments; one coherent revision, 0 ambiguity). Activation changed exactly 2 of 52 collections (config + Oct 2 day); historical mutation 0; strategic mutation 0. Founder accepted the rare out-of-order Oura revision ambiguity as a known residual (visible via ambiguousContinuationCount). D0 2026-10-02 validation_only. Strategic Sleep OFF.
Authority:
- Server d0ff65965233fa44e108387f01b649a2bdb476df (deployment 64533990); Native Build 82 e2cbcd0c (TestFlight f3d09d99, Founder-installed, v2+v3 stage-capable).
- activation report agent-handoffs/reports/20261002T220000Z-healthkit-sleep-canon-v3-prospective-activation.md
- v3 design report agent-handoffs/reports/20261002T201500Z-healthkit-sleep-canon-v3-copy-coherence.md
- canary audit agent-handoffs/reports/20261002T182755Z-healthkit-sleep-prospective-canary-audit.md
Remaining natural gates (canary -> PASS only after all):
1. >=2 (prefer 3) natural prospective nights (Oct 3+) accepted under sleep-canon-v3; ideally one Oura duplicate-revision night (check copySelection diagnostics).
2. Closed-app background delivery: Oura syncs while PhysiqueOS stays unopened >=75 min; Sleep receipt precedes any Founder command.
3. Post-boundary strategic-leakage checks: Sun Oct 4 Weekly (and Wed Oct 7 Midweek if needed) scanned — zero Sleep/Recovery markers; Goal/Strategy Confidence unmoved by Sleep.
4. 14 reliable prospective nights before any Recovery baseline interpretation (~Oct 15 at the earliest).
- no manual Sleep import; no backfill; no historical recanonicalization (historical stays sleep-canon-v2).
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
- wait for prospective Sleep canary acceptance (HOLD since 2026-10-02: v3 active, natural-night/background/leakage gates pending; see item 4);
- note: a prospective-only prior-28 baseline needs >=14 reliable nights, so non-"Not enough data" shadow output is not possible before ~Oct 15 even once authorized;
- review/authorize prospective-only non-strategic shadow input boundary;
- run shadow calibration;
- only later consider additive recoveryAssessment on NEW Weekly/Midweek/Monthly artifacts;
- historical Briefings remain unchanged;
- strategic Sleep/V3 graduation remains a separate Founder decision.

FUTURE MAJOR PROJECTS (roadmap only — NOT started; do not implement without a separate Founder-authorized prompt)

F1. App-wide UI/design polish
Position: next major maturity project after the Apple Watch daily-driver is accepted.
Scope placeholder: consistent PhysiqueOS design language across Native surfaces (spacing, typography, control patterns, empty/loading states, settings/editor consistency), informed by the accumulated small polish requests. Not started; no audit or implementation authorized yet.

F2. Briefing Narrative + Confidence quality/tuning audit
Position: next major strategic-quality project.
Scope placeholder: audit and tune Briefing narrative quality and Goal Confidence behavior across Daily/Midweek/Weekly/Monthly/Event briefings (accuracy, calibration, tone, repetition, evidence grounding). Not started; no audit or implementation authorized yet.

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
Status: PHASE 1A CANCEL PARITY BUILD 82 PHYSICALLY INSTALLED + LAUNCHED on `codex/apple-watch-workout-v1-phase1a-overnight` at `a173f27b4a9ab208021a1f3cd7febc7402cf3b42`; not uploaded. Physical checkpoint: `agent-handoffs/reports/20261002T173031Z-watch-v1-cancel-workout-parity-physical-checkpoint.md`.
Locked V1:
- phone is the sole structured `TrainingSessionAuthority` and planning surface; Watch starts one phone-prepared Ready-for-Watch plan only while the paired phone is reachable;
- after start, a disconnected Watch HealthKit workout may continue, but every structured mutation fails closed until phone authority returns;
- Watch owns `traditionalStrengthTraining` + `indoor` HealthKit lifecycle and physiology; Logger owns exercise/set/reps/load evidence;
- Finish never happens automatically and always confirms, including after the final planned set;
- Total Calories is active + basal only when both measurements are legitimately available; otherwise `—`;
- watchOS 11+ and PhysiqueOS dark navy/purple visual language; Apple Workout green/orange is not the product identity.
- Founder-selected normal-set treatment is split metrics: separate large Load and Reps tiles are the Phase 1A baseline. Preserve a future focus-then-Crown adjustment seam, but do not ship Crown editing in Phase 0 or initial V1 without separate authorization and conflict/navigation design.
Phase 0 implemented:
- partial-superset early-finish correctness blocker fixed through one performed-session projection used by commit and durability comparison; only completed sets survive, empty exercises disappear, and relationships retain only performed members when at least two remain;
- deterministic pause/resume, active elapsed ledger, Stopwatch/Countdown freeze and re-anchor, paused Live Activity parity;
- minimal Ready-for-Watch marker/selection, pure versioned Watch commands/acks/projections/metrics, and phone authority router with compare-and-set/idempotency semantics;
- trusted exact PhysiqueOS Watch workout correlation seam is additive and default-disabled; trusted exact links do not create duplicate performed Training evidence, and a second exact workout claim fails closed;
- non-shipping Watch target/signing feasibility is proven against the Founder's physical Apple Watch; no Watch target or TestFlight build was shipped.
Phase 1A implemented:
- generator-owned watchOS target/test target, shared schema-v2 contracts, phone `WCSession` bridge and deterministic latest-projection delivery;
- Ready-for-Watch phone affordance and locked PhysiqueOS Watch Start/execution/metrics/controls/paused/final/offline/superset/single-set surfaces with split Load/Reps;
- real Watch-owned HealthKit strength lifecycle, metrics, mirroring/recovery, phone-authoritative pause parity, two-leg recoverable Finish saga, completion summary, haptics and Always-On treatment;
- latest shipping Build 81 Progress Photos authority reconciled; paired simulator builds/renders and full/focused regressions complete with no new deterministic failures;
- signed Release archive contains iPhone + Live Activity/Widget + embedded Watch with version/build parity; every signature/profile/entitlement/companion boundary was inspected cleanly;
- automatic signing created the explicit HealthKit-capable Watch profile and the signed candidate is installed on the Founder iPhone.
- physical Watch Developer Mode/pairing, Watch-authorized provisioning, signed installation, launch and phone-reachable empty-state proof are complete;
- physical launch exposed and fixed a WatchConnectivity reply-callback actor-isolation trap; off-main regression tests pass and the fixed Watch app remains running without a new crash log.
- canonical confirmed Cancel Workout is available while active and paused without Resume; it abandons the structured draft, creates no Training evidence, discards the Watch HealthKit workout and ends the Live Activity;
- phone Cancel now publishes an authoritative terminal projection that clears Watch execution, metrics, controls, pending/rest/pause state and prevents delayed same-session resurrection across reconnect/relaunch;
- generator-owned PhysiqueOS Watch AppIcon is compiled into the signed archive and the physical Watch returns the installed 216x216 icon as non-placeholder;
- fresh paired Build 82 archive, strict signature/profile/entitlement inspection, physical iPhone+Watch install, launch and idle reachability proof are complete.
Phase 1A remaining physical/release gates:
- Founder prepares a short phone workout, marks it Ready for Watch, taps Start on Watch, and grants the requested Health authorization on-device;
- one physical Start/Complete/Pause/Resume/Finish acceptance, including disconnect/reconnect and relaunch recovery;
- physical Cancel acceptance while active, while paused without Resume, and from phone with immediate Watch terminal teardown;
- battery/Always-On observation and exact HealthKit-to-structured correlation proof on the saved workout;
- independent post-acceptance review before enabling the production trusted Watch bundle allowlist or uploading a Watch TestFlight build.

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
Status: SHIPPED in Build 79 (VALID, delivery 8937b165); Build 79 physically verified working on the Founder's device. Number formatting polished in Build 80 (VALID, delivery 39ae9ddd); remaining physical acceptance pending — see BUILD 80 / BUILD 79 below. Founder-approved V1 = systemSmall four-tile square (primary) + optional systemLarge detailed Logged Today alternate.
Founder clarified desired V1 on 2026-10-01:
- mirror the existing Native "Logged Today" summary as closely as WidgetKit allows;
- include Training summary;
- include Nutrition total plus macros;
- include Activity active calories / current-day status;
- include today's Weight when available;
- add a clear Start Workout Logger action that becomes Resume Workout when an active live session exists.
Design direction:
- preserve the existing Logged Today information hierarchy rather than reducing V1 to only three standalone totals;
- prefer a large Home Screen widget as the primary V1 if needed for legibility; medium may be evaluated as a condensed secondary family;
- missing current-day values must not fall back to yesterday or display as zero;
- Start/Resume remains navigation into the authoritative Workout Logger rather than creating a session inside the widget.

3. Apple Watch companion
Status: promoted to active backlog item 7; audit approved and Phase 0 foundation implemented. See item 7 for locked V1 decisions and Phase 1A next work.

BUILD 80 — SHIPPED (VALID, delivery 39ae9ddd-271e-438c-80c2-f24137637e2f), Home widget formatting polish
Source 1783691d (branch claude/native-build80-widget-number-formatting-20261002) = Build 79 a75f93df + one display-formatting patch. Report: agent-handoffs/reports/20261002T043000Z-native-build80-widget-number-formatting.md.
Trigger (Build 79 physical acceptance finding): the widget worked on device but showed decimal fractions (Nutrition 2463.3 cal, P 182.2 C 166.7 F 110.1, Active 890.1 cal).
Shipped: one HomeWidgetValueFormatter for every widget family/state — calories and active calories as whole numbers with grouping (2,463 / 890), macros as whole grams (P 182 C 167 F 110), Weight keeps one decimal (176.1 lb). Display only; canonical precision unchanged.
Acceptance pending: Founder confirms small + large show whole Nutrition/Activity/macros and one-decimal Weight. All other Build 79 items below keep their status (carried unchanged into Build 80).

BUILD 79 — SHIPPED (VALID, delivery 8937b165-e7df-4f46-87b5-63efd3ce8244), pending Founder physical acceptance
Physical finding 2026-10-02: Home Screen widget verified working on device; requested whole-number Nutrition/Activity formatting → shipped in Build 80.
Source a75f93df (branch claude/native-build79-widget-priority-skip-integration-20261002) = Build 78 + Priority Skip 88d597b2 + Home Screen Widget 82040143 + integration review fixes. Production Server 2d967e48 (skipCommand contract verified read-only). Report: agent-handoffs/reports/20261002T040500Z-native-build79-widget-priority-skip-integration.md.
Keep each item until the Founder confirms on device:
- Home Screen widget V1: gallery discovery; small square (Nutrition cal + P/C/F, active cal, today's Weight); optional large (adds Training); no-weight; refresh; Start Logger / Resume Workout; stale/offline and locked/privacy; real App Group population; widget empties after Production revoke/re-pair, then refills.
- Item E peptide/Foam Skip: peptide Detail Mark Skipped; peptide notification Complete (planned dose) / Skip / Snooze; skipped peptide records no dose; Foam Rolling notification Complete / Skip / Snooze; supplement Complete / Snooze (no Skip); Morning Check-In no actions.
- Build 78 items A-D are carried unchanged in Build 79; their acceptance can be done on Build 79.
Residual non-blocking review notes are listed in the Build 79 report (known limitations).

BUILD 78 — SHIPPED (VALID, delivery 32447de5), pending Founder physical acceptance
Items A-D below shipped in Build 78 (source 5911dd2a) and are carried unchanged in Build 79. Keep until acceptance; Workout set-completion haptic intentionally deferred.

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


E. Priority Skip capability expansion — peptides + Foam Rolling notifications
Status: SHIPPED — Server 2d967e48 (deployed 2026-10-02) + Native Build 79 (VALID); pending Founder physical acceptance (see BUILD 79). Supplement Skip and peptide un-skip remain deferred product decisions.

Peptides:
- peptide occurrences must support canonical Skip even though Complete remains specialized/dose-aware;
- Skip means intentionally not taken for that occurrence;
- no dose should be recorded on Skip;
- planned-dose / took-a-different-amount completion semantics remain unchanged;
- peptide notifications should expose Skip once the occurrence contract advertises it safely.

Foam Rolling:
- Foam Rolling already supports canonical Skip from Priority Detail;
- actionable notifications should expose Skip as well;
- do not rely on Native guessing that all Recovery Support priorities are skippable.

Architecture direction:
- make Skip capability independent from completion mode;
- a Priority may be specialized for Complete and still support Skip;
- prefer Server-owned explicit skip capability/skipCommand in notificationAction so Native does not infer by Priority name/type;
- Native renders Skip only when the occurrence contract authorizes it;
- use the same canonical priority.skip.v1 mutation path as in-app Skip;
- stale/duplicate Skip remains idempotent and reconciles Home/Priority Detail/notifications.

Acceptance:
- peptide detail screen exposes Skip;
- peptide notification exposes Skip without weakening dose-aware Complete;
- skipped peptide records no dose;
- Foam Rolling notification exposes Skip;
- Home/Priority Detail reflect canonical Skipped state;
- unsupported Support priorities do not accidentally inherit Skip.

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
