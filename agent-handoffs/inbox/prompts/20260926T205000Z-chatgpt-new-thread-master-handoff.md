PhysiqueOS — MASTER NEW-THREAD HANDOFF — 2026-09-26

PURPOSE
This is the durable handoff for a fresh ChatGPT planning/orchestration thread. Read this first, then read agent-handoffs/latest.json/latest.md and lane pointers and reverify GitHub authority before issuing engineering instructions. Do not blindly trust SHAs in this file if newer commits exist.

WORKFLOW
ChatGPT = planning/orchestration. Claude = primary long-running engineer/operator. Codex = complementary engineer/session orchestration. GitHub reports/pointers are durable authority. For coding prompts, explicitly identify coder, reasoning level, and existing/new chat. Copyable coder prompts must be plain text. Persistent Claude sessions use daemon/bg-PTY Remote Control. Never disturb another lane. Xcode/TestFlight uploads use the established guarded/Xcode flow; never browser-login to App Store Connect/Apple Developer. Obey agent-handoffs/STANDING_DISK_SAFETY.md: 15 GiB hard floor, 20 GiB preferred before heavy Xcode work.

CURRENT TOP PRIORITY
The next engineering task is the deeper HealthKit Strength reconciliation-confirmation diagnosis. Sep24 remains unresolved after real-device failures on Build61 and Build62. DO NOT ask the Founder to retry again until a deeper end-to-end diagnosis produces a proven fix.

CURRENT AUTHORITY — REVERIFY
Read:
agent-handoffs/latest.json
agent-handoffs/latest.md
agent-handoffs/goal-v3/latest.json
agent-handoffs/performance/latest.json
agent-handoffs/training-localday/latest.json
latest reports in agent-handoffs/reports/

At handoff time HealthKit latest reports production Server 49211870c552b104aaf7840939f55d9dc9ecc1df and Cardio graduation policy v3 with evidenceEligibility.domains [activity, cardio_training, nutrition], startLocalDate 2026-09-22. Latest final Cardio closeout: agent-handoffs/reports/20260927T003000Z-healthkit-cardio-v3-phase1-closeout-final.md.

Native release history: Build60 00321dcc was used for prospective Cardio acceptance. Build61 abb10e9c uploaded VALID and included the large batched Native work plus an attempted Strength reliability fix; real Sep24 confirmation failed. Build62 replacement was uploaded VALID, final lineage reported around 85c38104 and carried the scoped f72551be first-send retry; real Sep24 confirmation also failed. Reverify which build is installed on the Founder device rather than inferring from upload state.

HEALTHKIT CARDIO — PHASE 1 COMPLETE
Sep26 prospective Outdoor Walk acceptance PASSED, report commit c7e3c7953715c5a88542cd58ff078499cee517ed. Proven untouched automatic chain:
Apple Watch/HealthKit → Native observation → normal automatic sync → Server → Cardio classification → automatic canonicalization → canonicalType outdoor_walking → Training Day “Outdoor Walk” → correct Activity decomposition.
Proven: HKMetadataKeyIndoorWorkout=false, wire/server false, exactly one canonical Cardio workout, no deferred state, no duplicate, no Logger session/link/claim, no Activity double-count.

Cardio→V3 strategic graduation is also COMPLETE and ACTIVE. Final commit 90fc7a66eac185e4b4e8c5588311ed7e6e306eda. Policy evidence eligibility changed from [activity,nutrition] to [activity,cardio_training,nutrition], version 2→3, start date unchanged. No historical regeneration. Strength remains separate. During graduation Claude found/fixed canonical-evidence wrapper fields, a PhotoEventNarrativeService Cardio-as-resistance mislabel, and provenance. Natural future briefings are the live strategic acceptance point. Do not manufacture a briefing. HealthKit Sleep has NOT started.

HEALTHKIT STRENGTH — OPEN BLOCKER
Preserve this exact production diagnostic:
Sep24 Apple Health Traditional Strength Training, 11:22–11:50, 28 min, 206 active cal, 120 bpm avg HR.
Candidate Workout Logger session: Traditional Strength Training, 11:22–12:56, 60% match, structured exercises including Leg Press Machine and Walking Lunge.
UI: Pending Review → “Use Logger session 1” / “No match”.
Founder tapped Use Logger session 1. Workout Detail still showed “Possible match with Workout Logger.” Pending Review then showed “Refresh required — reconciliation outcome could not be verified as the action you requested.” Refresh Review did not fix it.
Fail-closed behavior is correct; underlying command reliability is not.

Server timing candidate 524f1882 was deployed and did not mutate/confirm Sep24. Earlier read-only postdeploy review saw detail reads but zero workout-reconciliation.resolve.v1 receipts; at that moment Refresh Review rather than confirm was the best explanation.

Then real confirm acceptance:
Build61 failed. command_receipts again had zero row. Unlike an earlier failure, there was no 401 nearby and unrelated command traffic succeeded. This disproved “token expiry only.” A generic retry inside shared submitCommand was tested then reverted because it broke other features’ deliberate lost-ack recovery. Candidate f72551be scoped retry to this one reconciliation call site; 282/282 and fresh review passed.
Build62 carried f72551be and also failed real Sep24 confirmation.

NO MORE FOUNDER RETRIES until diagnosis.

Next diagnosis must trace deterministically:
Native tap/action → command construction → first send/retry → auth/token → transport/network → HTTP actually leaves device → Server request/access logs → command_receipts insertion/absence → handler → transaction/result → readback endpoint → Native verification.
Instrument the path rather than guessing another retry. Preserve fail-closed verification/idempotency, no duplicate links/claims, no unrelated shared-command changes. Keep Sep24 Version1/60% pristine until a proven fix is ready for a separately authorized real acceptance.

RECONCILIATION NOTIFICATIONS
Notification infrastructure for HealthKit review shipped in Build61/62. Natural-event acceptance is still pending. Preserve it; do not call fully accepted until a genuinely new review exercises notification/deep link behavior normally.

ACTIVE GOAL V3 — FOUNDER-APPROVED
Old active Goal defects included stale DEXA, bad Aug15 arithmetic, technical confidence copy, fictional “next review,” weak guardrail interpretation, generic Training Progress, frozen Turning Points, redundant Strategy cards, and excessive repetition.

Canonical facts:
Goal Build Lean Mass, +10 lb by 2026-10-31.
Jul18 baseline: lean147.5, fat12.8, BF7.7%, weight167.4.
Aug15: lean148.3, fat12.8, BF7.6%, weight168.3.
Sep12 latest: lean153.3, fat14.2, BF8.1%, weight174.7.
Progress +5.8 lb =58%, 4.2 remaining. Correct Aug15 delta is +0.8.

Founder-approved active Goal layout:
1 Hero/display-only Confidence
2 Journey/current phase
3 Current Progress/Body Composition
4 Guardrail
5 Training Progress
6 Major Milestones
7 Latest Coaching/Coach’s Take LAST
Confidence is NOT tappable on currentState Goal; no detail sheet. Show score/band, concise V3 thesis and lightweight briefing provenance. Body Composition owns the primary progress numbers. Coach’s Take is the actual latest canonical briefing verbatim, dated/attributed. No Goal-local rewrite of historical briefing copy.

Round3 Native candidate was efcb8574, descendant of c15f0881, and is included in later Build61/62 lineage. Goal Server functionality was deployed and later incorporated into newer production lineage. Preserve the approved UX.

BRIEFING HEALTHKIT COMPLETENESS
Sep23 “logged meals rather than confirmed full-day total” wording was historically accurate and remains immutable. A prospective engine defect was fixed: minority meal-derived days no longer characterize/temper whole window; majority names share; all-meal-derived preserves wording; missing/partial/conflicting remains meaningful uncertainty. Natural new briefings are acceptance.

PERFORMANCE PHASE 2 — COMPLETE
Preserve c15f0881 lineage features: last-known Home snapshot, acknowledge-first Priority completion, retained view models, visible-only foreground refresh, bounded/preprojected reads. Common path hard ceiling <=3s, preferred <=1–2s. Performance Phase3 exists only as future optimization: more bounded projections, auth last-seen off read path, pool work, proactive token refresh, possibly more snapshots.

LOCAL DAY/TIMEZONE — IMPLEMENTED IN BATCHED NATIVE
Daily-driver Today follows device local day; historical canonical records retain source localDate/timezone; strategic briefings stay Server coaching-timezone owned. Fixes cover midnight foreground/background, timezone travel, DST, snapshot invalidation, weigh-ins. Preserve. Real-world exhaustive acceptance can be included in later batched Native testing.

TRAINING AGGREGATION — COMPLETE
Unified presented-workout semantics fixed. Controls: Sep21=3, Sep22=3 not5, Sep23=3, Sep24=3. Cardio canonical workouts count; screenshot/canonical duplicates suppress; Strength telemetry does not duplicate Logger session; PR/exercise surfaces remain Strength-specific. Do not reopen absent regression.

OPEN NATIVE PRESENTATION GAP
Log / Logged Today Training still does not include canonical Cardio under unified Training presentation even though Training Day does. This is explicitly backlog item C and should be batched into the next Native candidate after Strength diagnosis.

COMPLETED ITEMS — DO NOT RECYCLE
Progress Photos/Photo Briefing cleanup completed.
Exercise substitution/superset enhancements completed.
Exercise identity/performance-record correctness completed.
Provider migration/custom domain/stabilization foundation completed.
Training/Cardio presentation and aggregation accepted.
Performance Phase2 accepted.

NEXT BATCHED NATIVE ITEMS AFTER STRENGTH FIX
A. Proven Strength reconciliation confirmation fix.
B. Active Goal “Your Journey” phase-progress bars should visually match Home.
C. Log/Logged Today Training should include canonical Cardio.
D. Completed Visible Abs Goal should show Founder’s real first/final canonical progress photos rather than placeholders.
E. Preserve and naturally accept reconciliation-review notifications.
F. Preserve Performance Phase2.
G. Preserve accepted Training/Cardio presentation.
H. Include local-day/timezone regression/acceptance checks.
Batch these sensibly into the next release rather than generating unnecessary TestFlight builds.

OTHER BACKLOG
- V3 guardrail risk phrase can omit % in stored whatCouldLowerIt; not currently user-facing on Goal.
- Home goal-progress DEXA authority filter is a separate read-path follow-up.
- HealthKit graduation ops dry-run does not model Cardio overlay; future ops-tool enhancement.
- Minor Cardio overlay observability: failures do not set settlement evidenceOverlayFailure by design; future log/counter useful.
- HealthKit Sleep is next major HealthKit domain only after Strength reliability is closed.
- Performance Phase3 as above.

CLAUDE/CODEX SESSION RULES
Existing long-running lanes have included HealthKit Founder Takeover, Midweek, Performance Phase2, Training+Local Day, Active Goal V3. Before creating/restoring a session enumerate worktrees and persistent daemon/bg-PTY hosts. Never create duplicates accidentally. HealthKit original session historically: 704e1bcb-f52f-44e3-8f0a-5c38ed991eb0, Remote Control title HealthKit Founder Takeover; reverify current state. Codex may restore Remote Control but must not do engineering when instructed setup-only.

PRODUCTION SAFETY
Use established guarded read-only production runner. SQL audits: BEGIN READ ONLY / verify transaction_read_only=on / bounded owner-scoped SELECTs / explicit rollback. Never expose credentials. Deploys use guarded exact-SHA fast-forward/spec/force-rebuild process with pre/post authority and health verification. No production writes without explicit Founder authorization. Do not infer success from UI; verify canonical state.

FOUNDER PRODUCT PREFERENCES
Founder trusts real daily use as primary product guide. Goal system vs execution model is central. Coaching language should be concrete/user-facing, not engine jargon. Avoid fictional workflows. Canonical facts establish state; V3 supplies interpretation; Native presents faithfully. Avoid redundant numbers/copy. Coach’s Take belongs at bottom of active Goal. DEXA is authoritative for body composition. Build Lean Mass guardrail ~8–9% BF.

IMMEDIATE NEXT-THREAD ACTION
1. Read current GitHub latest pointers/reports and confirm nothing newer supersedes this handoff.
2. Summarize current authority briefly to Founder.
3. Proceed with the deeper Strength confirmation diagnosis as the next engineering project, using the existing HealthKit lane or a new dedicated lane only if current session/worktree state requires it.
4. Do not ask Founder to retry Sep24 until a deterministic diagnosis and reviewed candidate exist.
5. Once Strength is fixed/accepted, batch the listed Native backlog into the next build and then consider HealthKit Sleep.

This handoff is planning authority, not authorization for deploys, TestFlight uploads, production writes, policy changes, or Founder-device actions. Those still require explicit Founder approval at the relevant gate.
