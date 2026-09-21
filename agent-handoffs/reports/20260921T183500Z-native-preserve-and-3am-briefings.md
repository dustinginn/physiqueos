# native-preserve-and-3am-briefings-v2-20260921 — completion report

Task id: native-preserve-and-3am-briefings-v2-20260921

## Outcome

Part A done. Part B implemented, independently reviewed, deployed to production, verified with zero production writes. Part C recommendation below. HealthKit was not touched.

## Part A — Native Build 48 preserved on origin

- Ref `native/build48-accepted` created on origin by a normal (non-force) push; it points exactly at `bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a` ("Build 48: bump publication metadata to 1.0 (48)"). Verified with `git ls-remote`.
- `origin/main` and `combined-app-platform-cutover` were not altered by this step; nothing merged, nothing rewritten. 445 commits are reachable from the ref; 215 of them are not in the production Server branch as of a428fbda.
- `NATIVE_BUILD48_PRESERVED_ON_ORIGIN=YES`

## Part B — 3 AM scheduled briefings

### Source-derived trigger map

| Family | Trigger | Schedule before | Logical evidence window | Cutoff authority | Late evidence | Precedence |
| --- | --- | --- | --- | --- | --- | --- |
| Midweek | Worker cadence tick (every 5 min, `runBriefingCadenceLoop` -> executor -> registry -> generator) | Wed at the stored per-surface time. Founder's stored value was 05:30 (legacy default 00:00) | Sun-Tue before the Wednesday | End of last completed local day (23:59:59.999 local) | Existing planner: changedAt > artifact generatedAt, observed date inside window, following-local-day policy | Lowest |
| Weekly | same | Sun at stored time (05:30) | Sun-Sat completed week | same | same | Above Midweek |
| Monthly | same | 1st. Registry gate = stored time (05:30) but the Monthly generator's own gate hard-coded `>= 00:00` (mismatch) | Previous calendar month | Last day of month end-of-day local | same | Supersedes Weekly and Midweek |
| DEXA | Event: evidence review confirmation | Not scheduled | Event | Event | Existing event correction path | n/a |
| Photo | Event: photo session confirm (`generateEventBriefing`) | Not scheduled | Event | Event | Existing event correction path | n/a |
| Legacy Daily | `generateScheduledDailyBriefingForClosedWindow` | Retired, no caller | n/a | n/a | n/a | n/a |

Mismatches found: (1) the Founder's stored schedule was 05:30, not midnight; (2) Monthly's own generator gate (00:00) disagreed with the registry gate; (3) Weekly and Midweek generators re-read the stored time independently of the registry; (4) the cutoff was already frozen at end of the prior day while generation already fired hours after midnight, so the post-midnight buffer semantics already existed and only the time had to be unified. Evidence eligibility everywhere audited is by observed/effective local date (HealthKit canonical records carry the local date as observed_at), never by ingestion time.

### Semantic changes (candidate `ba250af13e66b967a4dc8add09c5c5942b0606dd`)

- New `BriefingScheduleAuthority` (03:00 local, DST-safe due instant, next-due resolver, briefing timezone resolver). Registry, each generator gate (Monthly's 00:00 hard-code removed), Home routing, and the Coaching Updates read model consume it. Stored per-surface localTime is history, not a scheduling input. Saved schedules record the shared time; a time-only edit is an unchanged configuration.
- Cadence dates, evidence windows, cutoff, artifact identities, Monthly precedence, event triggers, V3, Confidence, Energy, HealthKit and Native presentation are unchanged. No stored data rewritten; no schema.
- Docs: `docs/NARRATIVE_SCHEDULE.md` updated first per its own rule.

### Tests and gates

- New: 22 (cadence, DST, boundaries, precedence, historical, event) + 14 (authority) + 9 (evidence buffer and late-evidence contract) tests. Mutation check confirmed the cadence tests fail if the time changes.
- Modified existing tests were moved to the new contract (time-only edits became day/enabled edits; DST rows moved to 03:00 instants), not weakened.
- Full unit suite vs pristine base a428fbda: base 8194 tests / 298 failed; candidate 8246 / 298 failed; identical failing set (environmental: missing private Founder fixtures, Windows-only). One failing test was renamed (Monthly eligibility) and fails for the same missing-fixture reason; its updated assertions are verified by inspection only.
- phase3, phase6, phase6.photo, migration-safety: same failures as base, zero new. phase2/4/5/6.training/access-gate/foundation all green. V3 golden fixtures and HealthKit suites are inside the unit run: no new failures.
- ESLint clean, `git diff --check` clean, production build with the exact SHA succeeded.
- Independent fresh-context review: APPROVE on 2bdaf4d3 (no blockers), re-review APPROVE on the exact final SHA ba250af1 (delta is test/doc only, no non-test source change).
- Review observations (non-blocking, reported): Home shows nothing on the 1st from 00:00 until Monthly is generated (about 03:05 now; it was until about 05:30 under the stored preference); registry timezone is config-first while generators use the profile timezone (identical for the Founder, both America/Los_Angeles); the editor still shows a "Preferred delivery time" picker that now always reads 03:00; latent lenient date-only filter in the V3 evidence universe is masked by a strict downstream filter and was not touched.

### Deployment

- Verified authority first: Server a428fbda, deployment d3783f4c, schema 000014, 1 vcpu / 1 GB x1 web and worker.
- The auto-mode classifier blocked the production-branch push until the Founder authorized it in chat. Fast-forward (non-force) push of ba250af1 to `combined-app-platform-cutover`.
- Stamp-only spec update built the stale commit again (deployment 016112a7 resolved a428fbda; canceled). `create-deployment --force-rebuild` produced deployment **c353b945-0d36-4867-9f6e-386cb15f4b13**, ACTIVE, web and worker `source_commit_hash` both ba250af13e66b967a4dc8add09c5c5942b0606dd. `/api/v1/health/live` and `/ready` 200 with build id physiqueos-ba250af1-20260921. First worker cadence tick on the new build: all three cadences ineligible (Monday), no errors.
- No schema, no instance size or count change, no cost change.

### Zero-write audit

Bounded read-only baseline before and after (REPEATABLE READ READ ONLY, rollback): 29 canonical collections (briefings 52, confidence history, HealthKit observation rows 10, training, photo/DEXA, evidence, protocols incl. the coaching version), briefing-cadence operation records, migration state, outbox. Zero differences in any section. Nothing was written by the deployment.

### Functional proof from deployed worker code (in-memory, no database)

- Next due at 03:00 local: Midweek Wed 2026-09-23 (10:00:00Z), Weekly Sun 2026-09-27 (10:00:00Z), Monthly Thu 2026-10-01 (10:00:00Z). Cadence dates unchanged; the Founder's stored 05:30 does not delay them.
- Boundary: Weekly 02:59:59.999 not eligible, 03:00:00.000 eligible (window weekly 2026-09-20..2026-09-26, cutoff 2026-09-27T06:59:59.999Z, unchanged). Same for Midweek and Monthly.
- DST: 03:00 due instants 2027-03-14 (spring forward) = 10:00Z with 01:59 local one minute earlier; 2026-11-01 and 2027-11-07 (fall back) = 11:00Z. Monthly supersedes Weekly on Sunday 2026-11-01 and Midweek on Wednesday 2026-07-01. Five-minute tick simulations over the 23-hour and 25-hour local days produce exactly one generation.
- Registry contains only Midweek, Weekly, Monthly; DEXA and Photo remain event-triggered. An existing occurrence is `already_completed` with zero generator calls.

### Decision needed from the Founder

The stored 05:30 "preferred delivery time" was overridden by the shared 03:00 authority (no data mutation). The Web and Native editors still show the picker. Choose whether to hide or lock the control in a follow-up so it does not imply a choice.

## Part C — Recommended next HealthKit task (do not start before the canary)

State: Server ingestion and the validation-only canary are in production (10 raw observation rows). Activity summaries with ingestion purpose validation_only are permanently raw. The server-owned activation policy record (`healthKitConfiguration` / `healthkit_activity_activation_policy`) is not configured, so operational Activity summaries are assessed `activity_activation_not_configured`. No code path currently writes that record; only the reader exists. Native Build 48 (bbb46e19, uploaded VALID) contains N0/N1/canary code and entitlements.

1. Founder action first: install Build 48 from TestFlight, grant HealthKit read access, run the Founder Activity canary, and say so. The agent then verifies read-only that new rows are validation_only, no canonical Activity/Workout object was created, and no briefing, Confidence, or evidence collection changed.
2. Activation-policy mutation (still needed): one Founder-authorized, dry-run-first, single-record write of the `healthkit_activity_activation_policy` record with status enabled and an explicit `effectiveLocalDate` set to a future local date (no historical backfill), fenced on expected-absent or expected-current state, with a bounded pre/post audit and one audit trail record. Build it as a minimal gated operation, not a public route. Nothing else is written.
3. Native operational slice: switch the canary from validation-only to operational ingestion for Activity summaries and workouts from the effective date, with background delivery (HKObserverQuery plus background delivery, anchored queries, replay-safe staged partitions, offline retry that treats HTTP 400 as permanent only for contract violations; see FU-2). Observed date is the local calendar date the record occurred on; do not use delivery or sync time as the date, so late deliveries before the 03:00 generation join the prior day and later ones use the existing late-evidence reconciliation.
4. Server changes: the activation-policy write (2), keep the 5 MiB request bound and tripwire tests, and decide FU-1 (authenticate before reading bodies over a few KiB) before enabling background delivery at volume. Preserve source observation -> canonical Activity/Workout record -> separate evidence eligibility; provenance stays non-strategic.
5. Acceptance gates: unit and phase suites equal to base plus new tests; an exact-SHA independent review; read-only zero-write audits; a Founder canary night that crosses 03:00 with a prior-day observation delivered between 00:00 and 03:00 appearing in the next briefing and a new-day observation not; production build; no schema change unless the policy record needs one; no effect on V3, Confidence, or Energy semantics.

Start from Server ba250af1 (deployment c353b945) and Native bbb46e19.

## Explicit flags

NATIVE_BUILD48_PRESERVED_ON_ORIGIN=YES
BRIEFING_TRIGGER_MAP_COMPLETE=YES
WEEKLY_3AM_LOCAL=YES
MIDWEEK_3AM_LOCAL=YES
MONTHLY_3AM_LOCAL=YES
MONTHLY_PRECEDENCE_UNCHANGED=YES
PRIOR_DAY_LATE_INGESTION_BUFFER_CORRECT=YES
NEW_DAY_EVIDENCE_EXCLUDED_FROM_PRIOR_WINDOW=YES
DST_SPRING_FORWARD_CORRECT=YES
DST_FALL_BACK_CORRECT=YES
DEXA_EVENT_BEHAVIOR_UNCHANGED=YES
PHOTO_EVENT_BEHAVIOR_UNCHANGED=YES
V3_BEHAVIOR_UNCHANGED=YES
HEALTHKIT_BEHAVIOR_UNCHANGED=YES
HISTORICAL_BRIEFINGS_MUTATED=NO
SERVER_3AM_FIX_REVIEW_APPROVED=YES
SERVER_3AM_FIX_DEPLOYED=YES
ZERO_WRITE_POSTDEPLOY_AUDIT_PASSED=YES
SCHEMA_UNCHANGED=YES
INCREMENTAL_COST=NONE
READY_FOR_HEALTHKIT_NEXT_PHASE=YES (after the Founder runs the Build 48 canary)
