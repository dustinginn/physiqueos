Task id: native-preserve-and-3am-briefings-v2-20260921

Goal

Complete the final pre-HealthKit infrastructure steps:
1. preserve accepted Native Build 48 history on GitHub so the Mac is not its only durable authority;
2. implement, review, deploy, and verify the Server change moving scheduled briefing generation to 3:00 AM local time with correct evidence-cutoff semantics for late ingestion/HealthKit synchronization.

Do not begin HealthKit activation/sync implementation in this task.

Remote Control

You are already in a Remote Control-managed isolated worktree. Do not create/delete/relocate additional worktrees.

Fresh phone-spawn behavior has been Founder-proven:
HEAD = bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a
clean isolated worktree
worktree.baseRef=head
persistent native-remote-control anchor is Build 48.

Reverify all authority before acting.

Expected Native accepted authority:
bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a
Build 48 / 1.0 (48)

Expected production Server:
a428fbda42757620750264e63eaee18950ab7132
deployment d3783f4c-bc14-469b-b10c-93635a047325
schema 000014

Part A — preserve accepted Native history on GitHub

The readiness audit found Builds 41–48 Native history has no origin ref and currently exists only on the Mac.

Create/push a dedicated preservation ref:
native/build48-accepted

Requirements:
- it must point exactly to bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a;
- normal non-force push only;
- do not alter origin/main;
- do not alter combined-app-platform-cutover;
- do not merge Native history into Server/main;
- do not rewrite history;
- verify remote ref after push;
- report ancestry/commit subject and exact SHA.

This is preservation only. No Native code changes.

Part B — scheduled briefing generation at 3:00 AM local

Founder intent

Midnight is too close to the preceding evidence day. The Founder wants all scheduled briefings to generate at 3:00 AM local time so:
- the entire preceding day can finish;
- late manual evidence uploads after midnight can still reconcile when they belong to the completed prior evidence day;
- HealthKit/device synchronization has a buffer for delayed delivery/canonicalization;
- briefings do not accidentally interpret an incomplete prior day simply because generation fired at midnight.

This is NOT merely a cron-time change. Audit generation scheduling, evidence cutoff, evidence eligibility, and cadence-window semantics together.

Scope

Audit every scheduled briefing family/path:
- Midweek
- Weekly
- Monthly
- scheduled DEXA briefing path, if DEXA briefing generation is actually scheduler-driven
- scheduled Photo/event briefing path, if any portion is scheduler-driven
- any shared cadence scheduler/tick/reconciliation path that can generate one of these artifacts

Do not assume DEXA/Photo are scheduled. Determine whether they are event-triggered. Event-triggered briefings should not be artificially delayed to 3 AM merely to satisfy the phrase "all briefings"; preserve event semantics unless source/product intent proves otherwise.

Required semantic distinction

Generation time and evidence cutoff are separate.

Desired recurring-cadence behavior:
- generation occurs at 03:00 in the Founder's configured/local briefing timezone;
- the cadence's logical evidence window remains date-based and should include the complete intended prior day/window;
- evidence whose observed/effective date belongs to that completed evidence window may arrive/canonicalize during the post-midnight buffer and should be eligible if it is present before the 03:00 generation cutoff;
- evidence belonging to the new calendar day must not leak backward merely because it arrived before 03:00;
- evidence arriving after the 03:00 cutoff follows existing late-evidence/reconciliation policy; do not silently expand historical artifacts unless the existing reconciliation contract authorizes it.

HealthKit-specific intent:
A HealthKit observation recorded on the completed prior day but delivered/canonicalized at 00:30–02:59 should be able to participate in the briefing if it reaches the appropriate canonical layer before generation and is otherwise eligible.
A HealthKit observation whose actual effective/observed date is the new day should not be pulled into the prior cadence window.

Do not let source-ingestion timestamp replace observed/effective-date authority.

Preserve HealthKit architecture:
HealthKit source observation -> canonical PhysiqueOS Activity/Workout record where appropriate -> evidence eligibility separately.
Do not make HealthKit provenance itself strategically meaningful.

Timezone

Identify the canonical briefing timezone authority. Do not use server UTC or process-local timezone accidentally.

03:00 means 3 AM in the briefing/Founder local timezone.

Tests must cover DST:
- spring-forward day
- fall-back day
- exactly 03:00 boundary
- 02:59:59 arrival/canonicalization
- 03:00:00/after cutoff
- date-only cadence boundaries

Monthly cadence

Monthly remains intentionally the 1st of each calendar month. Do not change that cadence.
Move its generation time from the current time to 03:00 local while preserving Monthly precedence over Weekly/Midweek collisions.

Weekly/Midweek cadence dates must remain unchanged.

Historical artifacts

Do not regenerate or mutate any historical briefing merely because scheduling semantics change.
The change applies prospectively.

Audit first

Before patching, produce a concise source-derived map:
family -> trigger -> current local/UTC schedule -> logical evidence window -> cutoff authority -> late-evidence behavior -> precedence/collision behavior.

Identify any existing mismatch where the scheduler already fires after midnight but cutoff is frozen at midnight, or vice versa.

Implementation

Prefer one shared schedule/cutoff authority rather than independent hard-coded 03:00 values across families.

Do not change narrative/V3 composition, Confidence, strategy interpretation, Energy semantics, or Native presentation in this task.

Do not alter the recently accepted V3 plumbing.

Required tests

At minimum:
1. Weekly generates at 03:00 local on its existing cadence date.
2. Midweek generates at 03:00 local on its existing cadence date.
3. Monthly generates at 03:00 local on the 1st and still supersedes Weekly/Midweek collision.
4. Prior-day canonical evidence arriving/canonicalizing at 02:59 and observed on prior day is included.
5. New-day evidence arriving before 03:00 but observed on new day is excluded from prior window.
6. Eligible prior-day evidence arriving after cutoff follows existing late/reconciliation semantics, not silent inclusion.
7. DST spring-forward produces exactly one intended generation.
8. DST fall-back produces exactly one intended generation.
9. Historical published artifacts unchanged.
10. DEXA/Photo event-triggered behavior unchanged if they are not scheduled.
11. V3 golden fixtures remain green.
12. HealthKit validation-only/canary behavior unchanged.

Run focused scheduler/cadence tests, V3/briefing regression suites, full relevant Server unit suite comparison against pristine production base, ESLint, git diff --check, production build, and existing migration/access gates appropriate to the change.

Independent review

Before deployment, independent fresh-context review of exact candidate. Require no blocker on:
- timezone/DST correctness
- evidence-date vs ingestion-time semantics
- cadence dates/precedence unchanged
- no historical regeneration
- no V3 semantic regression
- HealthKit separation preserved
- event-triggered DEXA/Photo unchanged
- no schema/data mutation required
- deployment safety

Fix blockers, rerun affected gates, re-review exact final SHA.

Production deployment

If and only if all gates/review clear, deployment is Founder-authorized.

Use verified production branch and established deployment context.
Non-force fast-forward only.
No schema/DDL/migration expected; stop if one becomes necessary.
No instance size/count/cost change.

Remember App Platform stale-source behavior: verify actual web/worker source_commit_hash and force rebuild using established procedure if spec update builds stale source.

Pre/postdeploy zero-write audit

Capture bounded baseline of:
- briefing records/history digests
- cadence/scheduler state where persisted
- V3/confidence history
- HealthKit observation counts/state
- Training authority/events
- Photo/DEXA artifacts
- schema/migration
- relevant owner collections

Postdeploy require zero production-data changes from deployment itself.

Functional proof

Using deployed code/config without creating a real historical briefing:
- prove next Midweek/Weekly/Monthly due instants resolve to 03:00 local;
- prove cadence dates unchanged;
- prove DST calculations;
- prove evidence window/cutoff behavior with deterministic fixture/simulation;
- prove event-triggered DEXA/Photo behavior unchanged;
- prove V3 and HealthKit canary unchanged.

Do not wait until the real next briefing to call the deployment correct; source/tests/simulation should establish it.

Part C — HealthKit next-step handoff

After successful deploy, do NOT implement HealthKit.

Publish the exact recommended next HealthKit task from current production/Native authority:
- what activation-policy mutation is needed, if still needed;
- what Build 48 canary Founder action/observation is required;
- next Native operational sync/background-delivery slice;
- Server changes, if any;
- acceptance gates.

The next task should work from current Server candidate after this deploy and Native bbb46e19.

Backlog preserved

- Workout Logger draft survival across termination/eviction/restart/TestFlight update.
- Photo Briefing real-production Tap to expand mismatch.
- Optional photo accessibility polish.

GitHub completion

Claim/complete through established protocol. Any terminal blocker requiring Founder action is a mandatory handoff publication point.

Report:
- Native preservation ref result
- source-derived briefing trigger/schedule/cutoff map
- exact semantic changes
- candidate SHA/diff
- tests/gates/review
- deployment id/source
- zero-write audit
- next due times at 03:00 local
- DST proof
- HealthKit unchanged
- exact next HealthKit task recommendation

Explicit flags:
NATIVE_BUILD48_PRESERVED_ON_ORIGIN
BRIEFING_TRIGGER_MAP_COMPLETE
WEEKLY_3AM_LOCAL
MIDWEEK_3AM_LOCAL
MONTHLY_3AM_LOCAL
MONTHLY_PRECEDENCE_UNCHANGED
PRIOR_DAY_LATE_INGESTION_BUFFER_CORRECT
NEW_DAY_EVIDENCE_EXCLUDED_FROM_PRIOR_WINDOW
DST_SPRING_FORWARD_CORRECT
DST_FALL_BACK_CORRECT
DEXA_EVENT_BEHAVIOR_UNCHANGED
PHOTO_EVENT_BEHAVIOR_UNCHANGED
V3_BEHAVIOR_UNCHANGED
HEALTHKIT_BEHAVIOR_UNCHANGED
HISTORICAL_BRIEFINGS_MUTATED
SERVER_3AM_FIX_REVIEW_APPROVED
SERVER_3AM_FIX_DEPLOYED
ZERO_WRITE_POSTDEPLOY_AUDIT_PASSED
SCHEMA_UNCHANGED
INCREMENTAL_COST
READY_FOR_HEALTHKIT_NEXT_PHASE
