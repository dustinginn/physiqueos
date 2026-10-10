# PhysiqueOS pre-beta P0 guarded Server rollout — HOLD, production unchanged

- Generated: `2026-10-10T16:49:54Z`
- Founder-authorized assignment: `8e992ed95e2307e8e5bfb3fa96ceb3959825d4bb`
- Exact authorized Server candidate: `fb1efab8a53f56a1446a98e878077ae56eb148b6`
- Exact live Server source: `85a9802587de0ef23ff2021e803258dea825254d`
- Live deployment: `40122906-34f0-4d0a-91cf-8c943a15e603`
- Native production baseline: Build 95 source `59223a41052201121ca1ade24aaf3a4ad0db637e`
- Deployment result: **NOT DEPLOYED — mandatory safety gate failed before the first production mutation**
- External-beta decision: **NO-GO**

## Executive result

The controlled rollout stopped exactly as instructed. Production authority, candidate integrity, Recovery OFF, live/ready health, schema state, HealthKit policy, the October 9 DEXA lineage, and the absence of another deployment all reverified cleanly. The final evidence-processing preflight did not.

Production contains one pre-existing Training review that has remained in `committing` since September 14. Its claim is available, its lease is expired, it has no live continuation, and only four of nine post-confirmation steps are complete. The exact authorized candidate starts its reliability monitor immediately when the provider worker starts. On its first pass, that monitor classifies this record as stranded and calls the mutating recovery path. Deploying `fb1efab8` would therefore do more than install the authorized Server correction: it would immediately resume a historical confirmation whose disposition and replay were not authorized in this rollout.

That is unexpected production-state drift relative to the guarded deployment assumptions and a material scope expansion. No production branch was pushed, no DigitalOcean application spec was changed, no rebuild was started, no production record was written, no infrastructure alert was activated, and no Native archive or TestFlight upload was created. Production remains on the exact preflight deployment and source above.

The candidate remains technically sound and reviewable, but it is **not deployable to the current production state under the present authorization**. A separate decision about the historical Training review, or a newly reviewed candidate with an explicit pre-existing-work adoption boundary, is required before another deployment attempt.

## Gate ledger

| Gate | Verified evidence | Result |
|---|---|---:|
| Founder authority | Assignment `8e992ed9` authorizes only the exact Server candidate, bounded postflight reads, and report publication | PASS |
| Exact candidate ref | `origin/codex/prebeta-p0-reliability-round1-20261010` = `fb1efab8a53f56a1446a98e878077ae56eb148b6` | PASS |
| Exact live lineage | `origin/combined-app-platform-cutover` = `85a9802587de0ef23ff2021e803258dea825254d`; live source matches | PASS |
| Fast-forward ancestry | Live source is a direct ancestor; candidate is exactly two commits ahead | PASS |
| Candidate scope | 31 files, 1,408 insertions, 64 deletions; Server reliability/tests/docs only; no Native, migration, infrastructure, dependency, Recovery, Goal Adaptation, or DEXA Evidence UI change | PASS |
| Candidate hygiene | Clean detached worktree at exact SHA; `git diff --check` clean | PASS |
| Active deployment | `40122906-34f0-4d0a-91cf-8c943a15e603`, `ACTIVE`, 9/9 successful | PASS |
| Concurrent deployment | No deployment in progress | PASS |
| Web/worker authority | Both source hashes and all runtime SHA stamps = `85a98025…`; both build stamps = `physiqueos-85a98025-20261009` | PASS |
| Public liveness | `/api/v1/health/live` HTTP 200, correct build | PASS |
| Public readiness | `/api/v1/health/ready` HTTP 200, all nine checks ready | PASS |
| Schema | 15 migrations present; latest is `000015_sender_constrained_refresh_recovery`; readiness's named provider prerequisite `000014` remains satisfied | PASS |
| Recovery authority | Activation row absent; Recovery remains OFF | PASS |
| HealthKit authority | Workout v4 and prospective DEXA writeback v1 match the authorized policies; daily activation absent; historical backfill disabled | PASS |
| October 9 DEXA | One canonical row/revision/fingerprint, one bound DEXA briefing, two expected writeback receipts, Confidence `70`, prior `80`, direction `decreased` | PASS |
| Evidence outbox | No pending or processing continuation; 728 succeeded; 13 historical dead entries | PASS with known history |
| Pre-existing committing review | One September 14 Training review is stale, recoverable, and would be auto-resumed immediately by this candidate | **FAIL / STOP** |

## Read-only production evidence

The database preflight used the approved application-console source and a single bounded owner-scoped connection. Each pass enforced:

- expected runtime SHA before opening the audit;
- exact owner `user_founder_001`;
- `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
- explicit proof that `transaction_read_only = on`;
- guarded `SELECT` statements only;
- at most 64 returned rows per query;
- sanitized output with no raw evidence payloads;
- explicit `ROLLBACK`.

Two clean read-only passes produced the same release-relevant state. No SQL write statement was issued.

### Recovery and HealthKit authority

- Recovery activation authority row: absent, therefore **OFF**.
- Daily HealthKit activation row: absent.
- Workout activation: v4, enabled for `workout`, Cardio and Strength families, open-ended, effective September 23, link auto-confirm disabled, strategic-evidence eligibility quarantined, historical backfill disabled.
- Graduation v4: projections enabled for Activity and Nutrition; evidence eligibility enabled for Activity, Cardio Training, Nutrition, and Sleep; historical briefing regeneration disabled.
- DEXA HealthKit writeback v1: enabled prospectively from October 9 for body-fat percentage and lean-body mass; historical backfill disabled.

### October 9 DEXA lineage

- one active DEXA row, one logical key, one fingerprint, revision 1;
- one DEXA briefing with one evidence binding, one publication binding, and one narrative binding;
- Confidence score 70, prior score 80, movement `decreased`;
- two HealthKit receipts across the two expected kinds and identities;
- both receipt outcomes `already_present`, with materialized targets present.

The two intervention-sensitive DEXA confirmation outcomes therefore remain canonically clean. This rollout performed no real or synthetic production confirmation.

### Evidence-processing state that failed the gate

The owner-scoped status distribution was:

| Status | Count |
|---|---:|
| `confirmed` | 203 |
| `discarded` | 38 |
| `resolved_confirmed` | 8 |
| `committing` | **1** |

Sanitized identity hash for the single non-terminal review: `a413c0b4c9a5`.

- source: `training_logger`
- evidence type: `training`
- created: `2026-09-14T16:57:25.929Z`
- last updated: `2026-09-14T17:01:32.232Z`
- claim: `available`, with an expired lease
- live continuation count: 0
- automatic resume count: 0
- completed checkpoints: `canonical_commit`, `compatibility_writes`, `scheduled_completion`, `analysis`
- unfinished checkpoints: five of the nine-step post-confirmation sequence

This is not merely an alert-only condition. `EvidenceProcessingReliabilityMonitor.runOnce()` chooses the first stale review and calls `store.recover(...)`. The provider worker invokes `runOnce()` immediately, before its first 30-second wait. The PostgreSQL recovery path atomically increments the resume count and re-enqueues or revives continuation work. As a result, a successful deployment would have mutated this review and begun historical continuation without a separate operator decision.

Recovery OFF does not neutralize this behavior. The Recovery feature authority and the candidate's evidence-processing watchdog are separate controls.

## Exact candidate integrity and inherited verification

Fresh rollout-time checks reconfirmed the immutable object, its remote ref, direct ancestry, two-commit range, clean worktree, changed-path boundary, and diff hygiene. The immutable candidate's already-published test evidence remains:

| Verification group | Exact result |
|---|---:|
| Focused P0 suite | 19 files, **163/163 pass** |
| Manual evidence regression matrix | 22 files, **188 pass, 1 skip** |
| PostgreSQL atomic-recovery target | **1 pass, 18 skipped** |
| Provider worker artifact boot | **4/4 pass** |
| Changed-file ESLint | PASS |
| Next.js production build | PASS |

The candidate's synthetic 1 GiB service model reduced DEXA confirmation entry from 885 MiB RSS to 333 MiB and held the maximum tested confirmation/concurrency case to 663 MiB RSS, leaving 35.3% nominal headroom with no OOM or restart. Its crash matrix recovered each of the nine durable boundaries, rejected recovery under a live lease, revived a dead continuation without duplicating identity, and bounded automatic resumes to two.

Those candidate results were not rerun after the production gate failed: the deployment procedure stopped rather than continuing through later release steps. The exact candidate object has not changed.

## Mutation ledger

| Action | Result |
|---|---:|
| Push candidate to `combined-app-platform-cutover` | **NO** |
| Change Web or worker source/stamps | **NO** |
| Change DigitalOcean application spec | **NO** |
| Force rebuild or create deployment | **NO** |
| Write production database/object storage | **NO** |
| Resume or dispose the historical Training review | **NO** |
| Activate provider or custom alerts | **NO** |
| Modify/release Native | **NO** |
| Upload TestFlight | **NO** |
| Merge queued DEXA Evidence cleanup `a26d89ad` | **NO** |
| Publish this report to GitHub `main` | YES |

## Deployment disposition and safe resolution choices

### Recommended path

1. Run a separately authorized, bounded read-only diagnostic of the September 14 Training review against today's canonical Training, Goal, Event, Briefing, and scheduled-completion state.
2. Produce a sealed disposition preview that states exactly which five continuation handlers would execute, which existing records each would read or replace, and whether replay would create any current-day user-visible change.
3. Obtain explicit Founder authorization for one disposition:
   - resume the exact continuation once;
   - retire it to an operator-visible failed/partial terminal state without replay; or
   - replace the rollout candidate with a reviewed startup-adoption boundary.
4. Re-run every guarded rollout gate from a fresh authority snapshot.

The safest general candidate correction is a deployment adoption watermark: on first activation, detect and alert on pre-existing stranded reviews but do not automatically recover work whose last transition predates the deployed build's observed-at boundary. Recovery of that historical set would require an explicit operator action; new stalls would retain the candidate's bounded automatic recovery. That would be a new SHA and would need its own review and authorization. It must not be substituted for the exact authorized `fb1efab8` silently.

## Durable operational alert-routing plan — review only

No alert destination or infrastructure configuration was changed. The live application currently exposes only deployment-failed and domain-failed provider alerts; no component CPU, memory, restart, or evidence-processing route is active.

### 1. Signals and severity

| Signal | Warning | Critical / page | Recovery event |
|---|---|---|---|
| Committing review age | over 2 minutes | over 10 minutes, or automatic resume exhausted | all affected reviews terminal/healthy |
| Continuation queue age | over 2 minutes | over 10 minutes | queue returns below 2 minutes |
| Dead continuation count | none | any count above zero | count returns to zero after authorized handling |
| Worker heartbeat | one expected heartbeat missed; age over 90 seconds | two consecutive misses or age over 150 seconds | two consecutive healthy samples |
| Worker restart | record every new worker identity | more than 0.5 restarts per 5 minutes | stable for 15 minutes |
| RSS fraction | at least 70% for two samples | at least 85% once | below 65% for five minutes |
| CPU | at least 85% for five minutes | at least 85% for ten minutes with queue/review pressure | below 70% for five minutes |
| Auto-recovery failure | none | any non-benign recovery failure | explicit subsequent success/operator closure |

Native provider alerts should cover Web and worker CPU, memory, and restart signals. Application-specific evidence signals should be routed from the candidate's structured events: `evidence.processing.reliability`, `evidence.processing.alert`, `evidence.processing.recovered`, and `evidence.processing.recovery_failed`.

### 2. Durable routing and privacy boundary

The route must preserve delivery evidence outside the process that emitted it. Before activation, select and approve one accountable operator destination plus one escalation destination. A provider log-forwarding/rule path is preferred if it can acknowledge and retain delivery; otherwise introduce a small durable, deduplicated operational-alert outbox as a separately reviewed Server/migration candidate.

Allowed alert fields:

- event code and severity;
- Server build and component;
- observed timestamp and process uptime;
- counts and maximum ages;
- RSS bytes/fraction and CPU percentage;
- a one-way correlation hash when individual incident correlation is necessary.

Disallowed fields include user IDs, raw review IDs, evidence text, filenames, measurements, URLs, tokens, database strings, and interpreted/canonical payloads.

### 3. Deduplication and escalation behavior

- Incident key: `environment + component + alert code`; a correlation hash may refine a single-review incident without disclosing identity.
- Notify once on healthy-to-warning and warning-to-critical transitions.
- Repeat critical delivery no more often than every 15 minutes while unacknowledged.
- Send exactly one recovery notification after the defined healthy interval.
- Keep startup heartbeat grace to two polling intervals, but do not suppress an already-stale review/dead-message alert.
- Do not automatically restart, dispose, replay, or mark work complete from an alert.
- Treat pre-deployment stranded work as operator-attention-only until an adoption policy is authorized.

### 4. Verification before activation

1. Review an exact application-spec/configuration diff proving that only alert entries and destinations change; source, topology, instance sizes, domains, runtime stamps, Recovery authority, and cost remain unchanged.
2. Unit-test thresholds, transition dedupe, cooldown, recovery notification, serialization, and redaction.
3. In synthetic/staging execution, inject stale reviews, expired and live leases, dead continuations, heartbeat loss, worker restart, 70%/85% RSS, and sustained CPU.
4. Deliver labeled test notifications to the approved primary and escalation destinations; record provider receipt and human acknowledgment time.
5. Run a 24-hour noise/burn observation with no false page under healthy idle and ordinary cadence load.
6. Document an owner, acknowledgment target, incident runbook, and route-disable rollback.

Alert activation requires separate authorization naming the exact destination, spec/configuration diff, any cost, and the test-notification window.

## Native durable processing-state integration plan — review only

No Native source, build number, archive, signing state, or TestFlight state changed. Build 95 already has polling and Log-processing seams, but it models processing largely as a string and overlays the claim `Confirmation accepted · No action required`. The candidate's Server truth is richer and must become the UI authority in a later consolidated Native build.

### 1. Contract additions

Add a forward-compatible `EvidenceProcessingState` value that recognizes:

- `accepted`
- `queued`
- `processing`
- `retrying`
- `ready`
- `failed`
- unknown future values without failing the whole payload

Add an optional typed processing object to `ProductionEvidenceReviewConfirmation` and the read models:

| Field | Native use |
|---|---|
| `state` | authoritative lifecycle presentation |
| `completedSteps` / `totalSteps` | bounded progress such as 4 of 9 |
| `nextStep` | diagnostics only; never expose internal identifiers verbatim as consumer copy |
| `canonicalStateDurable` | allow the relevant canonical read to refresh without claiming the whole flow is ready |
| `actionRequired` | choose passive progress versus actionable failure presentation |
| `message` | Server-owned safe fallback copy, with Native localization/version fallback |

Older Server payloads must continue decoding. Unknown states must render neutral “Still processing” copy and refresh, not fail closed or claim success.

### 2. Reconciliation and presentation

- Server durable state outranks the process-local accepted-confirmation acknowledgment.
- Keep the local acknowledgment only between command acceptance and the first successful Server read.
- Remove `Confirmation accepted · No action required`; render accepted, queued, processing, retrying, ready, and failed distinctly.
- Show step counts only when both values are valid and total is positive.
- `canonicalStateDurable` may trigger exact canonical-resource refresh, but only `ready`/confirmed removes the processing state.
- `failed` must deep-link to the exact review and clearly preserve that the confirmation was saved. Never auto-submit or silently retry a write from presentation code.
- Guard against state regression within one review/version: a stale read must not replace `ready` with `processing` or reduce observed completed steps.

### 3. App lifecycle and notification behavior

- On foreground/resume, refresh Log/pending reviews and every locally acknowledged review ID before clearing acknowledgments.
- Persist the minimal acknowledgment identity and last Server state so termination does not turn accepted work back into a new Confirm action.
- Clear the acknowledgment only after durable `ready`/confirmed, durable failed/action-required handling, or an authoritative Server removal/disposition.
- Offline presentation must say that it is last-known state and must not infer completion.
- Keep killed-app remote delivery as a separate architecture decision. Build 95's review-ready notifier is process-owned local polling and explicitly cannot guarantee delivery after termination.

### 4. Native verification matrix

- decode every state, missing processing object, and unknown future state;
- command response lost after durable acceptance, followed by idempotent repeat;
- app background, termination, relaunch, and foreground reconciliation;
- offline/reconnect and out-of-order read responses;
- monotonic progress and terminal-state precedence;
- failed/action-required routing to the exact review;
- DEXA, Training, Nutrition, Activity, PDF/photo/screenshot, and mixed evidence;
- VoiceOver labels, Dynamic Type, Dark/Mineral contrast, and reduced-motion behavior;
- no duplicate confirmations, notifications, canonical records, Events, or Briefings;
- server-old/native-new and server-new/native-old compatibility.

Only after this matrix passes should a new Native candidate be archived and presented for separate release authorization. The queued DEXA Evidence cleanup at `a26d89ad` remains separate so cosmetic changes do not obscure durable-state verification.

## Remaining risks and severity-ranked next steps

### P0

1. Resolve or explicitly adopt the September 14 historical Training continuation before deploying the exact candidate.
2. Re-run the guarded Server rollout from a fresh production snapshot and complete bounded read-only postflight verification.
3. Activate and prove durable operator routing under separate authorization.
4. Observe at least seven clean production days: p95 RSS below 75%, every operation below 85%, at least 30% headroom, zero OOM restarts, zero unalerted dead continuations, and no review beyond two leases.
5. Integrate and verify durable processing states in a separately authorized consolidated Native build.

### P1 retained from the comprehensive audit

1. Fix Weight full-ISO normalization and pass provider/legacy regressions.
2. Bring Home, Goals, Log, evidence reads, and HealthKit ingestion inside the proposed latency budgets.
3. Explain and eliminate observed production 500/statement-timeout paths.
4. Reconcile and prevent the duplicate active Nutrition day under separate authorization.
5. Implement production note intake or remove the unsupported note promise.
6. Prove killed-app/next-open notification behavior and new-user Production pairing recovery.
7. Further bound the remaining 35-collection DEXA briefing step.

## Beta assessment

- Exact Server candidate: **HOLD for the current production state**, despite passing source and synthetic gates.
- Production P0 correction: **NOT DEPLOYED**.
- Founder-only operation: continue under existing observation and manual recovery runbooks; do not assume watchdog coverage.
- External beta: **NO-GO** until the P0 actions and clean observation window above are complete, followed by reassessment of the retained P1 gates.

## Flags

- `FOUNDER_DEPLOY_AUTHORIZATION=YES`
- `EXACT_CANDIDATE_REVERIFIED=YES`
- `LIVE_AUTHORITY_REVERIFIED=YES`
- `RECOVERY_AUTHORITY=OFF`
- `PUBLIC_HEALTH=PASS_9_OF_9`
- `OCT9_DEXA_LINEAGE=PASS`
- `PREEXISTING_COMMITTING_REVIEW=1`
- `HISTORICAL_AUTO_RECOVERY_GATE=FAIL_STOP`
- `SERVER_DEPLOYED=NO`
- `PRODUCTION_MUTATED=NO`
- `ALERT_ROUTING_ACTIVATED=NO`
- `NATIVE_CHANGED_OR_RELEASED=NO`
- `DEXA_EVIDENCE_CLEANUP=QUEUED`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. `agent-handoffs/latest.md`, `agent-handoffs/latest.json`, release pointers, production, infrastructure, Native, TestFlight, Recovery authority, and the queued DEXA Evidence cleanup remain unchanged.
