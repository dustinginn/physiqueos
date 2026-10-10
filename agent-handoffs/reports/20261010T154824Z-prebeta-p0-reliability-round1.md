# PhysiqueOS pre-beta P0 reliability remediation round 1 — candidate PASS, beta NO-GO

- Generated: `2026-10-10T15:48:24Z`
- Assignment and report-publication baseline: `6b32450a64397053e861679e1e91af3adbe88386`
- Exact live Server baseline remediated: `85a9802587de0ef23ff2021e803258dea825254d`
- P0-A memory commit: `947bbe8022eb965944de602fa537d201fe58e713`
- P0-B processing-reliability commit / final candidate: `fb1efab8a53f56a1446a98e878077ae56eb148b6`
- Candidate branch: [`codex/prebeta-p0-reliability-round1-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/prebeta-p0-reliability-round1-20261010)
- Scope: Server-first source candidate and synthetic local testing only
- Source-candidate decision: **PASS for controlled deployment consideration**
- External-beta decision: **NO-GO**

## Executive result

Round 1 produced two bounded, independently reviewable commits. The final source candidate closes the excessive DEXA confirmation-entry allocation, removes whole-collection analysis rewrites from the DEXA path, serializes DEXA and cadence memory-intensive work behind one admission budget, exposes durable processing states, and adds owner-scoped detection plus bounded recovery for stranded evidence work.

On the exact 1 GiB audit model, the fresh baseline DEXA confirmation entry reached **885 MiB RSS** and only **13.6% headroom**. The final candidate reduced entry to **333 MiB RSS** and the largest tested DEXA/concurrency scenario to **663 MiB RSS**, or **64.7%** of the nominal service limit with **35.3% headroom**. No candidate scenario OOMed. When confirmation and briefing cadence competed, confirmation completed inside the budget and cadence was retryably deferred instead of overlapping memory peaks.

The candidate also passed an injected crash at every one of the nine durable confirmation boundaries, retry/idempotency tests, dead-outbox revival, lease-expiry recovery, repeat-confirm handling, and realistic manual-evidence regressions. A local production build completed successfully.

This is not authorization to release. Nothing was deployed or changed in production, no infrastructure was modified, no Native archive was produced, and no TestFlight build was uploaded. External beta remains NO-GO because production does not yet contain this candidate or externally routed alerts, there is no clean post-deployment observation window, and the audit's P1 correctness/performance gates remain open.

## Safety and coordination

- No production record, database, object, configuration, deployment, alert policy, domain, app spec, Server component, worker component, Native build, or TestFlight build was changed.
- Production was not load-tested. All performance measurements below are deterministic local synthetic measurements against the exact live Server source and the final candidate.
- Recovery activation and Goal Adaptation were not changed or enabled.
- Claude's Goal Adaptation workstreams (`99f11ae6`, `225204af`) and Recovery preparation workstream (`3653ccda`) were inspected for scope coordination and were not merged. This candidate stays in evidence confirmation, worker reliability, and bounded provider-read surfaces.
- The DEXA Evidence presentation cleanup remains queued at `a26d89ad` for a later consolidated Native build. It was not merged, archived, or promoted.
- Build 95 Native remains the current audited Native baseline at `59223a41052201121ca1ade24aaf3a4ad0db637e`; this round contains no Native source change.

## Candidate architecture

### P0-A — bound DEXA confirmation memory

Commit [`947bbe8022eb965944de602fa537d201fe58e713`](https://github.com/dustinginn/physiqueos/commit/947bbe8022eb965944de602fa537d201fe58e713) makes these changes:

1. **Targeted entry and resume reads.** Provider confirmation entry now reads the review edit context directly instead of hydrating the Founder runtime. Durable resume proof fetches exact canonical and analysis IDs plus bounded recovery inputs.
2. **Owner-scoped bounded DEXA store.** `PostgresDexaConfirmationReadStore` performs exact named-record reads with hard limits: 64 named records, 128 DEXA history records, and 16 recovery inputs.
3. **Record-level DEXA writers.** DEXA confirmation uses stable IDs and `mutateCanonicalRecords`; it no longer loads and rewrites the roughly 26 MiB analysis collection. Other evidence categories retain their existing behavior.
4. **Shared memory admission.** `EvidenceProcessingMemoryBudget` is one FIFO gate shared by all nine DEXA continuation handlers and provider cadence. It samples RSS/heap, targets 70% of the declared 1 GiB service budget, hard-stops at 85%, and returns explicit retryable busy/deferred outcomes rather than beginning unsafe concurrent work.
5. **Measured harness expansion.** The audit harness now covers direct entry, the entire bounded confirmation, and confirmation-versus-cadence concurrency, while retaining the 87.9 MiB larger-account fixture and 150 MiB retained ballast.

The remaining DEXA briefing computation still loads 35 bounded collections and is the dominant operation at 663 MiB RSS. It is below this round's threshold but remains the first target for further optimization.

### P0-B — expose, detect, and recover stranded processing

Commit [`fb1efab8a53f56a1446a98e878077ae56eb148b6`](https://github.com/dustinginn/physiqueos/commit/fb1efab8a53f56a1446a98e878077ae56eb148b6) makes these changes:

1. **Truthful durable states.** The Server projects `accepted`, `queued`, `processing`, `retrying`, `ready`, and `failed`, including completed/total step counts. Log copy no longer says “No action required” while confirmation work remains pending.
2. **Owner-scoped reliability view.** `PostgresEvidenceProcessingReliabilityStore` uses bounded reads, capped at 64 reviews/outbox records, to expose review age, queue age, dead count, latest worker heartbeat, and recovery eligibility.
3. **Worker watchdog.** A 30-second monitor emits structured measurements for review age, queue age, dead messages, heartbeat, worker identity/restart signal, RSS, and CPU. Candidate thresholds are two minutes for review/queue age, 90 seconds for heartbeat, 70% RSS warning, and 85% RSS/CPU critical.
4. **Bounded recovery.** Only an expired/available committing review can be resumed. A live lease is rejected atomically. At most two automatic resumes are allowed; exhaustion moves the review to an operator-visible partial/failed state instead of looping silently.
5. **Dead-message revival.** Recovery can atomically revive an existing dead continuation with the same durable identity rather than inserting a duplicate.
6. **Worker lifecycle evidence.** The worker emits a startup identity event and starts the monitor only after provider composition is available. Operational semantics are documented in `docs/operations/EVIDENCE_PROCESSING_RELIABILITY.md`.

The monitor's notification boundary is a structured alert log. External routing/paging is intentionally not configured in this source-only round because that would change production infrastructure. Until a separately authorized rollout connects and proves that route, the production alerting portion of P0-B remains open.

## Memory measurements against the audit gate

Harness conditions: exact source under test; `--max-old-space-size=512`; V8 observed approximately 560 MiB heap limit; 150 MiB retained ballast; approximately 87.9 MiB serialized synthetic Founder runtime; nominal service limit 1,024 MiB. The fresh baseline measurement differs by 2 MiB from the prior audit's 887 MiB observation and confirms the same condition.

| Scenario | Live-source baseline RSS | Candidate RSS | Candidate heap growth | Candidate collection behavior | Result |
|---|---:|---:|---:|---|---|
| Confirmation entry scope | 885 MiB | **333 MiB** | 0 MiB | 0 collection loads | PASS |
| Compatibility write | 337 MiB | **337 MiB** | 13 MiB | 1 load, 1 record write | PASS |
| Analysis | 649 MiB | **338 MiB** | 13 MiB | 1 load, 1 record write; no collection rewrite | PASS |
| Goal evaluation | 682 MiB | **338 MiB** | 7 MiB | 6 bounded loads, 1 record write | PASS |
| Briefing | 662 MiB | **663 MiB** | 231 MiB | 35 bounded loads; daily briefing write | PASS, dominant residual |
| Full bounded DEXA confirmation | Not present | **654 MiB** | 174 MiB | 44 loads, 4 record writes; only daily briefing collection rewrite | PASS |
| Confirmation + cadence contention | Unsafe/unmeasured | **663 MiB** | 232 MiB | cadence retryably deferred | PASS |

Threshold reconciliation:

| Proposed beta threshold | Baseline | Candidate observation | Disposition |
|---|---:|---:|---|
| Steady/p95 RSS <75% | Entry was 86.4% of nominal limit | Scenario-set observed p95/max **64.7%** | PASS in synthetic suite |
| Single operation <85% | Entry was 86.4% | Maximum **64.7%** | PASS |
| At least 30% operational headroom | 13.6% | **35.3%** at maximum | PASS |
| Zero OOM/restart under candidate scenarios | Legacy compatibility previously OOMed | 0 OOM; 0 process restart | PASS |

Confirmation entry improved by **552 MiB RSS (62.4%)**. The scenario-set percentile is a small synthetic sample, not production population telemetry; controlled deployment must confirm these thresholds over a clean observation window before external beta.

## Processing reliability and crash matrix

| Injected condition | Verified candidate outcome |
|---|---|
| Crash after canonical commit | Durable progress resumes without a second canonical revision |
| Crash at each of 9 continuation boundaries | All nine boundary cases resume to terminal success |
| Worker restart / lost in-memory state | Durable review/outbox state is rediscovered; startup identity and heartbeat make the restart visible |
| Live lease during recovery | Recovery is rejected atomically; no concurrent duplicate execution |
| Expired lease | One bounded resume is allowed |
| Dead continuation | Existing durable identity is revived; no duplicate outbox row is required |
| Repeated confirm | Idempotent state/progress is returned; no duplicate canonical effects |
| Repeated failure/recovery | Maximum two automatic resumes, then operator-visible partial/failed state |
| Confirmation/cadence concurrency | One memory-intensive operation runs; the other receives a retryable deferral |
| App leaves and returns | Server truth remains `queued`/`processing`/`retrying`/`ready`/`failed`; pending work is not collapsed to a success claim |

The watchdog can now detect a stalled review independently of the originating request and can perform one bounded recovery selection per tick. It does not silently “mark complete,” skip unfinished steps, or activate the separate Recovery feature.

## Verification results

| Verification group | Result | Coverage |
|---|---:|---|
| Final focused P0 candidate suite | **19 files, 163/163 pass** | memory admission, direct reads, bounded steps/writers, DEXA continuation/resume, nine-boundary crash matrix, orchestrator/review, recovery, durable states, Log copy, monitor/store, outbox worker/dead hook, cadence and provider worker artifact boot |
| Manual evidence regression matrix | **22 files, 188 pass, 1 skip** | PDF, photo, screenshot, staged/native intake, notes contract, weight, training, nutrition, activity, mixed-category classification, storage failure, reinterpretation and worker paths |
| Targeted PostgreSQL atomic-recovery test | **1 pass, 18 skipped** | live-lease rejection, expired recovery, dead continuation semantics through the repository facade |
| Provider worker artifact collector | **4/4 pass** | full provider artifact boots after worker composition wiring |
| Changed-file ESLint | **PASS** | every changed implementation file |
| `git diff --check` | **PASS** | final candidate |
| Next.js production build | **PASS** | Webpack compile, TypeScript, page data, 50/50 static pages, route trace |

The default Turbopack build was also attempted but stopped before application compilation because the managed worktree's `node_modules` symlink points outside Turbopack's filesystem root. Re-running the same Next.js production build with its supported Webpack path compiled and completed successfully; this is a harness/worktree limitation, not a source failure.

The repository-wide unit command is not a valid release aggregate in this checkout: private `runtime-store.json` and migration-control fixtures are absent, and several globally parallel environment/worktree tests interfere. Its actionable observations remain the audit's already-open P1 Weight full-ISO `RangeError` and two stale Training durability assertions. The new/affected focused suites above are clean; this report does not misstate the unrelated full run as passing.

## Exact changed surface

The candidate contains 31 changed files relative to the exact live Server baseline: 1,408 insertions and 64 deletions across the two commits.

- Memory and harness: `scripts/operations/memory/dexaConfirmationMemoryHarness.mjs`, `scripts/operations/memory/dexaConfirmationMemoryScenario.mjs`, `src/platform/jobs/EvidenceProcessingMemoryBudget.js` and its test.
- Confirmation entry/orchestration: `src/app/evidence/review/[reviewId]/actions.js`, its bounded continuation test, `EvidenceReviewService.js`, `PostConfirmationOrchestrator.js`, `DexaConfirmationBoundedSteps.js`, `ConfirmationBoundedWriters.js`, and their tests.
- Bounded persistence: `productionApplicationComposition.js`, `providerBriefingCadenceComposition.js`, `PostgresDexaConfirmationReadStore.js` and its test.
- Durable state and user truth: `EvidenceProcessingState.js` and its test, `LogReadService.js` and its test.
- Detection and recovery: `EvidenceReviewRepository.js`, `EvidenceReviewRecovery.test.js`, `PostgresEvidenceProcessingReliabilityStore.js`, `EvidenceProcessingReliabilityMonitor.js`, their tests, `PostgresFounderRepositoryFacade.js` and its test, `canonicalWriteSurfaceInventory.js`, and `runFoundationWorker.mjs`.
- Operations: `docs/operations/EVIDENCE_PROCESSING_RELIABILITY.md`.

No Native, HealthKit, release pointer, deployment, infrastructure, Recovery, Goal Adaptation, or DEXA Evidence presentation file changed.

## Remaining risks and severity-ranked next actions

### P0 release operations

1. **Deploy only under separate authorization.** Build and release the exact Server candidate `fb1efab8a53f56a1446a98e878077ae56eb148b6`; do not substitute a moving branch head.
2. **Connect alert routing.** Route the candidate's structured evidence alerts to a durable operator channel and prove review-age, queue-age, dead-letter, heartbeat/restart, RSS, and CPU notifications. Source-only structured logs are not sufficient for an unattended beta.
3. **Run a controlled acceptance window.** Repeat realistic DEXA confirmation plus cadence contention on the deployed service and observe at least seven clean days: p95 RSS below 75%, every operation below 85%, at least 30% headroom, zero OOM restarts, zero unalerted dead continuations, and no review beyond two leases.
4. **Prove client presentation.** Build the later consolidated Native candidate so all durable pending/retrying/failed states are rendered from Server truth after termination/return. Build 95 itself was not changed in this round.

### P1 gates retained from the comprehensive audit

1. Fix Weight full-ISO normalization and pass provider/legacy regressions.
2. Bring Home/Goals/Log and evidence reads inside the proposed p95/p99 targets without database-pool waiting or oversized payloads.
3. Bring HealthKit ingest below p95 3 seconds and p99 5 seconds.
4. Explain and eliminate current production 500/statement-timeout paths.
5. Reconcile and prevent the duplicate active Nutrition day under separate authorization.
6. Implement production note intake or remove the unsupported note promise.
7. Prove killed-app/next-open notification behavior and new-user Production pairing recovery.
8. Move cadence eligibility ahead of remaining expensive hydration; further bound the 35-collection DEXA briefing.

## Go/no-go assessment

- **P0-A source candidate:** GO. It meets all measured synthetic memory thresholds, materially improves entry allocation, safely defers concurrency, and produces no OOM in the tested larger-account fixture.
- **P0-B source candidate:** GO for controlled rollout. Durable state, detection, bounded retry, lease safety, and crash recovery are implemented and focused tests pass. External notification routing still requires authorized production configuration and verification.
- **External beta:** **NO-GO.** The candidate is not deployed, production acceptance evidence does not yet exist, operator alert routing is not connected, Native has not yet incorporated the consolidated durable-state presentation, and the audit's P1 beta gates remain open.
- **Founder-only operation:** Continue only with existing active observation and recovery runbooks until the controlled rollout and acceptance window are separately authorized and completed.

This publication is report-only. It adds this file to `main`; `latest.md`, `latest.json`, release pointers, production, TestFlight, and the queued DEXA Evidence cleanup remain unchanged.
