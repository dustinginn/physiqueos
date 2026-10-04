PhysiqueOS product backlog — durable authority

Last updated: 2026-10-03
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
Status: **PROSPECTIVE POLICY ACTIVE / ZERO CURRENT INTENTS / OCT 9 ACCEPTANCE PENDING** (2026-10-03).
Report: agent-handoffs/reports/20261003T171246Z-dexa-healthkit-prospective-policy-activation.md
Current authority:
- Server `b47663b32372a78010dbc8e4aa41303012d98dc7`, deployment `b9449c52-5444-4dae-9f44-fd0261b1a9d3`, remains ACTIVE and healthy.
- Native Build 84 `bcd92c74602695766c270fe6af052de45afece4b`, delivery `a4b7b504-e0ba-4cb5-9909-3e01cc8156d5`, is installed and physically validated.
- Founder confirmed the bounded Sep 12 pair in Apple Health: BF% `8.1%` and fat-free Lean Body Mass `160.5 lb`; no Weight. Guarded deletion removed both samples, and production receipts now show the exact two final `deleted` / `absent` states.
- Read-only closeout found zero feedback-loop observations/evidence, zero DEXA Weight intent/receipt, no Sep 12 canonical semantic/revision change, no historical permanent intents, and zero current or candidate permanent intents.
- Founder authorized and the guarded create-only mutation created exactly one version-1 policy record at `2026-10-03T17:09:54.334Z`: enabled, effective canonical scan date `2026-10-09`, only `bodyFatPercentage` + `leanBodyMassFatFree`, prospective-only, no backfill.
- Fresh preflight, in-transaction checks, parent post-readback and an independent post-activation audit all passed. Current permanent intents remain `0`; all three existing DEXAs remain excluded; Sep 12 receipts remain final `deleted` / `absent`; all protected Weight/Evidence/Confidence/Briefing/Sleep/Training/Cardio counts and digests are unchanged.
- **Active prospectively:** the first eligible permanent write can only arise from an accepted canonical DEXA dated `2026-10-09` or later. No historical writeback occurred.
Validation controls: retain the guarded Sep 12 controls temporarily in installed Build 84 until the first real Oct 9 prospective write succeeds; do not invoke them again. Then hide/remove them in the next consolidated Native build rather than create a cosmetic-only build. The normal DEXA -> Apple Health toggle remains.
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

2. Performance Record celebration — PHYSICAL ACCEPTANCE PASS; larger polish shipped in Build 85 (VALID)
Status: the Build 84 real workout physically passed both session-volume (7,500 lb) and reps-at-load (15 reps at 125 lb) records. Exact Build 85 source `b8ee8690b194cb90086b62816b9a2c8c400dc026`, delivery `a8c393e7-7d2c-41f0-9ba0-d37f43e53dc1` VALID, makes the confetti noticeably larger while preserving one-time persistence and Reduce Motion.
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
- Server `89fe0a0340adee22d15b92a1f074a0bbd348ac77` (deployment `28678d4a-e3cc-4b2b-a479-1851ab7093bf`) carries Sleep v3 unchanged; Native Build 83 `3e61dd215e8474c52bd54230d2d9dfb2f3a93534` (TestFlight delivery `507b409f-a29f-48a0-93b4-49ab46b5ad6d`, VALID) remains v2+v3 stage-capable.
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
Position: design exploration active; shipping implementation not started.
Current state: Home direction locked in dark/mineral light; Log Compact Command Center direction locked in dark/mineral light; Weekly **B Immersive Story hero + C Dense Analytical body is LOCKED** as the briefing-family visual reference. Weekly/Midweek now share the approved recurring section family, and the final mineral-light surface-rhythm pass plus locked Log realistic-density/source treatment are ready for Founder review. Photos and the invalid standing Still Unresolved section are absent; Body Composition appears directly below Weight; Midweek carries its exact canonical Biggest Takeaway; Weight typography is aligned; Recovery remains graph-driven, future-only and uncoupled from Confidence; Weekly Priority Muscle Groups have a measured compact candidate. No implementation has started. Authority: `agent-handoffs/backlog/20261003-app-wide-ui-design-polish-home-exploration.md`.
Scope boundary: no Native implementation, Server behavior, production content projection, Recovery activation, build or TestFlight work is authorized by the exploration.

Recurring Briefing implementation backlog, not started:
- Photos: remove from recurring Weekly/Midweek presentation only; preserve Photo evidence/event and Photo Briefing.
- Still Unresolved: not a Briefing section; remove the current recurring presentation seam and do not replace it with another standing uncertainty card.
- Section parity: Hero/Confidence, Energy, Weight, Body Composition when available, Training, Recovery after graduation, Biggest Takeaway, What To Do, cadence-specific close, provenance.
- Recovery: graph-driven Sleep treatment is required for Midweek, Weekly and Monthly after graduation; Midweek uses Sun–Tue points, Weekly Sun–Sat points, Monthly weekly aggregates. No DEXA/Photo Recovery V1.
- Midweek: guarantee canonical Biggest Takeaway in the presentation contract and preserve shorter-horizon restraint.
- Midweek Weight: use the shared Weekly metric/delta/context typography hierarchy.
- Monthly: translate the accepted recurring-family system next, only after this Weekly/Midweek refinement is accepted.

Final appearance-translation review state:
- Founder accepted the dark Weekly/Midweek family and required one order correction: Weekly Body Composition now sits directly under Weight, matching Midweek.
- Corrected dark Weekly, unchanged dark Midweek, and direct mineral-light versions of both are ready at `agent-handoffs/artifacts/weekly-midweek-light-translation-final-20261004/`.
- Automated proof confirms exact dark/light content, semantics, geometry, Energy graphs, Recovery graphs and page-height parity. The accepted dark Midweek is structurally unchanged; all dark Weekly sections are unchanged apart from the authorized Body Composition move.
- Do not mark Weekly/Midweek dark + mineral light locked until the Founder confirms this final set.

Final polish review state:
- Selective mineral-light surface rhythm for Weekly/Midweek is ready at `agent-handoffs/artifacts/briefing-light-log-density-final-polish-20261004/`; exact content/order/graphs remain unchanged.
- Weekly Priority Muscle Groups compact candidate preserves all canonical labels/statuses/counts and reduces the measured block from 254 pt to 143 pt.
- Locked Log Compact Command Center realistic-density candidate covers simultaneous Strength + Cardio, calories + P/C/F, Activity, Weight and pending review in dark/mineral light with exact appearance parity.
- Centralized Log source/provenance candidate removes repeated Apple Health tile copy while preserving scope; Weight remains explicitly source-unavailable because the current Log projection exposes no Weight provenance.
- Implementation remains not started. Do not mark the light polish, muscle-group compaction or source treatment locked until Founder acceptance.

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
Status: BUILD 84 REAL WORKOUT GENERALLY PASSED / BUILD 85 SERVER + PROSPECTIVE POLICY ACTIVE AND INDEPENDENTLY VERIFIED / NATIVE BUILD 85 TESTFLIGHT VALID (2026-10-03). Final authority: `agent-handoffs/reports/20261003T225500Z-build85-server-policy-native-testflight-final.md`.
Current physical-acceptance facts:
- real Watch execution, set completion, phone editing, pause/resume, Finish confirmation, recovery, HealthKit save, Saved summary/Done, metrics, Daily Totals, Crown paging and green progress substantially passed;
- performance-record celebration physical acceptance PASS for session-volume and reps-at-load records; exact reviewed Build 85 candidate includes larger local confetti while preserving the one-time/Reduce Motion lifecycle;
- inactive/Always-On false `OFFLINE · HEALTH ON` root cause is corrected in exact reviewed Native `b8ee8690b194cb90086b62816b9a2c8c400dc026`; immediate reachability is passive, stale/failed authority stays visible, and structured mutations remain fail-closed;
- the real PhysiqueOS-created Strength workout incorrectly entered generic 95% Pending Review. The Founder manually confirmed it with the correct Logger session; that explicit pre-activation reconciliation remains unchanged and is not retroactively converted into trusted correlation;
- exact Server `3c0f4aefddbb9a6886f6ad012443978303d47024` is production deployment `e9ffc644-ba32-48d0-afc7-ec3d809d8c77`, ACTIVE 9/9 with healthy live/ready and exact web/worker source. The create-only prospective trusted-Watch policy is version 1 and active for exact source `com.physiqueos.native.dev`, type 50, indoor required, 120-second tolerance and effective `2026-10-05T07:00:00.000Z`; no backfill. It created exactly one policy row plus audit `healthkit_trusted_watch_correlation_audit_6dbb503923b0247b369bbd5e91b39e5c`. Independent verification passed with no workout/review/strategic/Sleep/DEXA mutation or duplicates;
- exact Native `b8ee8690b194cb90086b62816b9a2c8c400dc026` is Build 85, App Store Connect delivery `a8c393e7-7d2c-41f0-9ba0-d37f43e53dc1`, build/import VALID.
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
Phase 1A / Build 85 remaining gates:
- Founder remote-installs VALID Build 85;
- physical reconnect/stale-authority and inactive/Always-On presentation acceptance after Build 85;
- exact HealthKit-to-structured association proof with a new eligible workout after the prospective policy boundary;
- physical Cancel acceptance while active, while paused without Resume, and from phone remains a separate unfinished matrix item unless already recorded by a later acceptance report.

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


## DEXA -> Apple Health writeback — PROSPECTIVE ACTIVE / OCT 9 ACCEPTANCE PENDING (updated 2026-10-03)

Status: Server/Native implementation shipped in Build 84; bounded real Sep 12 write/verify/delete validation passed; permanent prospective policy activated create-once on 2026-10-03; zero current intents; Oct 9 real-scan acceptance pending.

Audit authority:
- agent-handoffs/reports/20261002T235405Z-dexa-healthkit-writeback-audit-plan.md
- main report commit 789aafd9cc2b4b95dee71c0fd3ee9eb0d51a2422

Founder-approved product decisions:
1. V1 writes Body Fat Percentage plus Apple Health Lean Body Mass calculated as fat-free mass = canonical DEXA totalMass - fatMass. Do not write raw DEXA lean soft tissue as Apple Health Lean Body Mass.
2. Do NOT write DEXA total mass to Apple Health Weight.
3. Permanent writeback is prospective-only for scan dates >= 2026-10-09. No historical Apple Health backfill is authorized.
4. Write automatically after canonical DEXA acceptance, with quiet status/retry.
5. Canonical corrections automatically replace PhysiqueOS-owned Apple Health samples using versioned exact-once semantics.
6. One-time explicit opt-in plus persistent You -> Apple Health toggle. Turning off stops future writes but does not automatically delete prior samples.
7. Physical pre-scan validation must use the Founder's REAL canonical 2026-09-12 DEXA, not fabricated health data. Temporarily authorize only that scan, write its real Body Fat % and calculated fat-free Lean Body Mass, verify source/timestamp/units/exactly-once/no feedback loop, then delete both PhysiqueOS-owned samples and verify removal. Permanent policy remains prospective from 2026-10-09.
8. After the Sep 12 physical test passes, other real historical DEXA figures may be used freely as deterministic/simulator test fixtures for mapping, units, revisions and edge cases, but must NOT be written into the Founder's real Apple Health history unless separately authorized.

Execution gate:
- DO NOT backfill or write another historical DEXA. The Sep 12 physical controls are complete and should not be invoked again.
- Permanent policy is now active. Do not update/overwrite it without a separately reviewed and authorized correction operation.
- For the Oct 9 scan, use the normal DEXA intake and verify exactly two permanent intents/samples: Body Fat Percentage plus fat-free Lean Body Mass; no Weight. Retain the guarded Sep 12 controls until this succeeds, but do not invoke them.
- Target readiness remains the Founder DEXA on Friday 2026-10-09.


## Build 83 Cardio classification — LOCKED Founder decision 2026-10-02

Status: **SHIPPED and production-repaired 2026-10-02.** Server `89fe0a0340adee22d15b92a1f074a0bbd348ac77` is ACTIVE in deployment `28678d4a-e3cc-4b2b-a479-1851ab7093bf`; bounded D3 is complete and independently verified. Native Build 83 source `3e61dd215e8474c52bd54230d2d9dfb2f3a93534` is TestFlight `VALID`, delivery `507b409f-a29f-48a0-93b4-49ab46b5ad6d`. Final report: `agent-handoffs/reports/20261003T055504Z-build83-server-d3-native-testflight-final.md`.

Continuation authority:
- Build 83 continuity checkpoint: agent-handoffs/reports/20261003T033236Z-build83-first-real-workout-corrections-checkpoint3.md
- checkpoint main commit: b2e1779aa8b639ca8508c817204b96df4b4ba511
- pushed Native candidate: abb131d9e1a4cd9eeb6c1a5caca1e1ad9e1b9c4e
- final reviewed Native authority: 3e61dd215e8474c52bd54230d2d9dfb2f3a93534

Founder locked classification:
- Stair Stepper / HealthKit type 44: canonical Cardio and prospectively strategically eligible under the accepted Cardio framework.
- Cooldown / HealthKit type 80: canonical workout/history record labeled Cooldown, but NOT Cardio anywhere.

Cooldown must NOT:
- count as a Cardio session;
- contribute Cardio session totals;
- contribute Cardio minutes/totals;
- set hasCardio or equivalent flags;
- satisfy Cardio targets;
- appear as Cardio in Home, Active Goal, Training reporting or indicators;
- enter Cardio strategic evidence;
- affect V3 Confidence, Narrative, recommendations, Briefings or Cardio strategy.

Cooldown MAY:
- appear as Cooldown in Log;
- appear as Cooldown in Training Day/history;
- appear as Cooldown in Activity/history where canonical workout history is presented.

Architecture requirement:
canonical workout/history inclusion is independent from workout-family reporting classification and strategic evidence eligibility.

No production policy change is authorized merely to implement this distinction. If the current policy/model cannot represent it safely and backward-compatibly, stop for Founder review.

Build 82 compatibility is mandatory for Server read responses until Build 83 adoption. Do not introduce an enum/value that causes Build 82 Training Day/Log decoding failure.

WITHDRAWN SERVER CANDIDATE:
- 22925625 is explicitly withdrawn and MUST NOT be deployed or used for D3 repair.
- A new exact Server SHA implementing the locked Cooldown non-Cardio rule must pass tests and fresh independent review before Founder deploy authorization.

D3 completion contract was:
- bounded repair of exactly the Oct 2 Stair Stepper and Cooldown source_only observations;
- dry-run first;
- Stair Stepper repaired as Cardio;
- Cooldown repaired as canonical non-Cardio;
- no Activity calorie/exercise-minute inflation;
- no other records affected;
- no historical strategic artifact rewrite.

Completion result:
- the replacement Server candidate was reviewed, directly authorized and deployed; withdrawn `22925625` was never deployed and is not an ancestor;
- the fail-closed dry run matched exactly the two reviewed Oct. 2 observations;
- D3 applied exactly six writes: one audit row, two canonical creates, one Stair coexistence update and two observation reconciliation updates;
- Stair Stepper is canonical strategically eligible Cardio;
- Cooldown is canonical Cooldown history, reporting family `other`, strategic role `history_only`, and contributes nothing to Cardio reporting, targets, indicators or strategy;
- duplicate workouts `0`; Activity canonical-day count/digest and live calories/exercise minutes unchanged; no historical strategic artifact rewritten;
- physical TestFlight acceptance remains observational and is listed in the final report.


## Mac disaster-recovery / iCloud backup V1 — SMALL TIER IMPLEMENTED / ARCHIVE COPY + INDEPENDENT REMOTE PROOF PENDING (2026-10-03)

Audit authority:
- `agent-handoffs/reports/20261003T174554Z-mac-icloud-backup-disaster-recovery-audit-plan.md`
- prompt authority `5b7ece032abc2a10fd83da6c6c36ad578f1c1e1b`
- implementation prompt authority `b84428fe54121f5a0d5198157fe972d99586a59a`
- local Phase 7 implementation authority `54b4ba82ed089a98e2c5950fecbe9b9a7a7e4dc8`
- iCloud status/archive-integrity implementation authority `6a3e6199` (full SHA in post-copy checkpoint)
- final scheduler/upload-gate implementation authority `b53c26ed8d3be583dd8b0dd3becece436689bcd9`

Goal:
Create a safe, automated backup path for non-reproducible PhysiqueOS development state on the Founder Mac, with iCloud Drive as a likely off-device destination.

Founder preference:
- simple iCloud Drive folder;
- at least once daily;
- also after major patches/releases/checkpoints where useful;
- coders may produce/update the backup artifact automatically once the design is accepted.

Architecture constraints:
- DO NOT place active Git worktrees, Xcode projects-in-use, DerivedData, simulator device data, node_modules, caches or other high-churn development trees directly under iCloud synchronization.
- Prefer a staged, immutable/versioned backup bundle or snapshot copied atomically into a dedicated iCloud Drive/PhysiqueOS Backups folder.
- Never copy secrets, keychain contents, PATs, App Store Connect credentials, DigitalOcean credentials/database URLs, signing private keys or other sensitive credential material into the backup bundle.
- Preserve references/inventory for credential-dependent tooling without exporting credentials themselves.
- Do not rely on iCloud as the only source-control backup. GitHub remains source authority for pushed source/handoffs.

Audit findings:
- iCloud Drive is locally available, but the dedicated `PhysiqueOS Backups` folder does not exist and no remote upload was attempted or claimed.
- Current and legacy shared Git object databases have 22 local branch tips not reachable from any freshly fetched GitHub head/tag (12 tips / 14 commits current; 10 legacy).
- Five worktrees have verified dirty/untracked state. Thirteen older checkouts under `~/Documents` remain `UNKNOWN-REVIEW` because read-only status scans stalled in the File Provider-backed estate.
- `iCloud Drive/Documents` points to `~/Documents`, where an older PhysiqueOS repo/worktree estate already lives. Do not move it in this project; capture/review first, then handle any later migration as a separate controlled operation.
- No Time Machine destination or local snapshot is configured.
- Seven signed Xcode archives (Builds 79-84) total about 673 MiB. One usable Apple Development identity and seven profiles are present, but private keys/keychain/profiles remain excluded from the recovery bundle.
- The guarded release tool is local-only and small; safe tool source, schema-validated receipts and sanitized state are backup candidates, while release configs, ASC key material and auth containers are never-copy.
- Small daily recovery state is expected to be about 5-25 MiB with a 100 MiB fail-closed review ceiling. Builds/caches/simulators/agent session stores remain excluded.

Accepted design pending Founder choices:
- stage outside iCloud under a generation-specific incomplete path;
- import fresh GitHub refs and all local refs into a temporary bare aggregator, then create one local-only Git bundle with GitHub prerequisites;
- capture staged/unstaged state with binary patches plus exact content-addressed file bytes; capture untracked files only through an explicit allowlist;
- fail closed on deterministic filename/content/structured/Git-object scans and report categories/paths only, never secret values;
- SHA-256 every file, verify the bundle, and perform a fresh-clone scratch restore before any iCloud promotion;
- copy into iCloud under an incomplete name, destination-rehash, locally rename, then track local completion, File Provider upload-reported completion and independently downloaded remote confirmation as distinct states;
- never rotate on local copy success or unknown remote status; keep immutable daily/weekly/monthly/release generations;
- restore onto a new Mac by cloning GitHub first, importing local-only refs/dirty state, recreating worktrees outside iCloud, restoring safe tools, and reauthenticating all credential-dependent systems.

Audit/design covered the truly non-reproducible local state, including:
- repo/worktree/branch/SHA inventory;
- dirty/uncommitted changes;
- unpushed commits/branches;
- safe git bundle/patch representation where appropriate;
- agent handoff/config/operational files not already durable on GitHub;
- release/archive inventory and whether signed archives need a separate backup policy;
- local scripts/tools that are not tracked but are necessary to recover;
- simulator/Founder test fixtures only if genuinely irreplaceable;
- Xcode project generator/source authority;
- sanitized deployment/config metadata;
- restoration procedure onto a replacement Mac.

Design requirements established:
- daily backup cadence;
- post-major-patch/release trigger;
- atomic write (stage locally, validate, then move/copy into iCloud destination);
- checksums/manifests;
- retention/rotation policy;
- size ceiling;
- disk-floor awareness;
- verify iCloud destination is actually available before deleting/rotating anything;
- never delete the only copy of local state merely because a backup was attempted;
- restore drill/test;
- human-readable latest manifest;
- optional notification only on failure or meaningful backup problem.

Founder-approved V1 decisions:
1. destination — recommend exactly `iCloud Drive/PhysiqueOS Backups`;
2. cadence — recommend 03:30 local daily with next-wake catch-up plus post-major-main-checkpoint and post-TestFlight-VALID runs;
3. retention — recommend 14 daily, 8 weekly, 12 monthly and 12 release/checkpoint generations;
4. signed archives — recommend a separate post-release tier beginning with current Build 84 + rollback Build 83, plus named milestones;
5. untracked policy — recommend strict explicit path/type/size allowlist; unknown paths block promotion;
6. Time Machine and a second destination are intentionally outside V1 and do not block it.

Status / hard gate:
- Phase 1 audit/design is complete and the approved local V1 tool is implemented on the pushed feature branch.
- Live `audit`, deterministic tests, full `dry-run`, local `create`, checksum verification and fresh-GitHub scratch restore all pass. The first local immutable generation is `PhysiqueOS-Recovery-20261003-191629Z`, 5,260,954 bytes, manifest SHA-256 `7b712856eb9437ffce9d0e9d63d12abb80f177fe7a1d2bb78f49eb9d1e96413d`.
- The generation contains 22 local-only recovery refs, five exact dirty-worktree reconstructions, four guarded tool sources, 37 schema-validated release receipts, and sanitized inventory. The secret scanner reports `PASS`; credentials, keychains/private keys, auth sessions, raw production/health exports, build trees, dependencies and caches remain excluded.
- Fourteen File Provider/legacy checkouts are recorded `UNKNOWN_FILE_PROVIDER_OR_TIMEOUT`; their common-database refs are captured, but dirty-state coverage is not claimed.
- The mandatory pre-write checkpoint was published and verified on `origin/main` at `b181dd54c98ba27aab6717eef2996d0ce3039d8c` before the first iCloud write.
- The dedicated destination now exists. Generation `PhysiqueOS-Recovery-20261003-191629Z` was copied through `.incoming`, destination-rehashed, renamed, and made current through atomic `LATEST.json`. Scratch restore from the final iCloud destination copy passes.
- Foundation metadata produced a clean 97/97 `ICLOUD_UPLOAD_REPORTED_COMPLETE` observation during status refresh and again at scheduler installation, but later queries returned metadata unavailable. Historical upload-reported completion is recorded; current live state and independent remote state are conservatively `REMOTE_ICLOUD_SYNC_UNKNOWN`.
- A clean exported `origin/main` snapshot review passed 19 tests before enablement; after fresh-metadata, scheduled-upload failure and idempotent reinstall gates were hardened, the suite passed 22 tests. The 03:30 local launchd agent is installed, loaded and idle with last exit `0`; its RunAtLoad catch-up correctly skipped because the generation was under 24 hours old.
- Explicit hooks are installed for post-major-main-checkpoint and post-TestFlight-VALID use, with recursion prevention verified against the recovery report.
- Retention is implemented but generation #1 deletion is disabled. Current upload metadata unknown additionally disables all retention deletion.
- A conservative cache-only cleanup raised data-volume free space from 13.174 GiB to 21.248 GiB before archive copying. The exact deletions were Apple media-analysis cache, stale Sparkle install staging and inactive Chrome cache; no repository/worktree, simulator, archive, recovery generation, credential/signing state, evidence or unknown checkout was touched. All 22 local-only refs and all five dirty-state hashes reverified unchanged, and the installed recovery audit passed.
- The separate archive tier now contains **Build 84 + Build 83 only**. Both local iCloud-container copies have 52-file checksum manifests with zero mismatches, and the original Organizer archives remain intact. The immediate File Provider query returned errors/unavailable metadata, so archive upload-reported completion and independent remote durability remain unproven. Final observed free space after the tier copy was about 21.1 GiB.
