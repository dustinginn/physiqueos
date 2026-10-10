# PhysiqueOS pre-beta comprehensive reliability audit — NO-GO

- Generated: `2026-10-10T06:35:09Z`
- Assignment: `a11890bbb56d5dcbb939d7e0a896d7fb2111f99e`
- Audited production Server: `85a9802587de0ef23ff2021e803258dea825254d`
- Audited TestFlight Native build: `1.0 (95)`, source `59223a41052201121ca1ade24aaf3a4ad0db637e`
- Production app/deployment: `bf57cf56-48cc-4cd6-90e4-a23ee5381741` / `40122906-34f0-4d0a-91cf-8c943a15e603`
- Scope: read-only production investigation and synthetic local testing only
- Decision: **NO-GO for an external beta**

## Executive assessment

PhysiqueOS is not ready for an external beta. The current release preserves user evidence well and has strong idempotency, authentication recovery, canonical-write, and focused Native startup coverage. The October 9 DEXA is now complete and internally consistent. However, the audit found two release-blocking reliability conditions:

1. The DEXA confirmation path still operates too close to the 1 GB service limit. The exact deployed bounded implementation survives the synthetic constrained-memory harness, but its confirmation-entry scope reached **887 MB RSS**. The legacy compatibility path reproduced a process OOM. There is not enough demonstrated margin for production concurrency, runtime overhead, or larger accounts.
2. Production has no CPU, memory, restart, queue-age, or dead-letter alerts and no independent watchdog for a stranded evidence review. The October 9 UI acknowledged confirmation while work was stalled, so the same class of failure can remain silent to both the user and operator.

Additional beta-impacting P1 findings include slow and oversized core read models, database-pool waiting, a valid-timestamp crash in the Weight read model, HealthKit ingestion latency, unexplained production 500s, a duplicated active Nutrition day, process-local notification delivery, an unassisted first-run path that defaults to Sandbox, and production copy advertising a note path that does not exist.

Founder-only use can continue with active observation and the existing recovery runbooks. External beta enrollment should wait until the P0 gates and the specified P1 correctness gates are closed and re-measured.

## Safety, authority, and limitations

- No production data, configuration, deployment, deployed application branch, database row, object, notification, or TestFlight build was modified. This report-only publication changes repository documentation on `main`.
- Production inspection was limited to public health probes, platform metadata/specification, sanitized logs, and an approved read-only console runner.
- The approved runner was attempted once for aggregate production benchmarks. Its console transport timed out after 300 seconds without a success marker. Per the fail-closed/no-retry rule, it was not retried and no alternate console was used. Fresh sanitized service logs supplied the production read-latency evidence below.
- Synthetic testing used the exact deployed Server source and exact Build 95 Native source. No synthetic data was sent to production.
- No load or stress test was directed at production. Public health timing used 25 sequential requests per endpoint with a 100 ms pause.
- Raw identifiers and private records are intentionally omitted. Counts, timings, states, and invariant outcomes are retained where necessary to substantiate findings.
- The proposed DEXA Evidence presentation cleanup at `a26d89ad` remains queued for a later consolidated Native build. This audit neither shipped nor promoted it.

## Severity-ranked findings

| Severity | Finding | Verified evidence | Beta consequence | Required disposition |
|---|---|---|---|---|
| **P0** | DEXA confirmation lacks safe memory headroom | Exact deployed source, 512 MB V8 heap plus 150 MB synthetic ballast: confirmation entry peaked at **887 MB RSS** on the same nominal 1 GB service class; legacy compatibility reproduced OOM | Concurrent work or a larger account can repeat the intervention class even though the original compatibility writer is bounded | Bound the entry scope and remaining whole-runtime steps, or demonstrate at least 30% service headroom on a deliberately sized runtime under representative concurrency |
| **P0** | Silent stranded-processing risk | Current app spec has deployment/domain failure alerts only; no CPU, memory, restart, queue age, dead-letter, or review-age alert; user-facing confirmation previously reported no action required while the review was stalled | Beta users can lose trust and operators may discover failures only after a complaint | Add truthful pending/failed UI, review-age watchdog, queue/dead-letter/restart/memory alerts, and an exercised automatic or operator recovery path |
| **P1** | Core read models miss beta latency goals and saturate the DB pool | Production log p95: Home 4.798 s, Goals 3.385 s, Log 3.301 s; payloads observed at 7.03–9.65 MB; pool wait reached 10 with pool max 5 | Slow startup/navigation, timeout amplification, contention across unrelated screens | Bound projections/fan-out, reduce payloads, add query plans and per-route percentiles, then meet the proposed acceptance targets |
| **P1** | Valid Weight timestamps can crash the read model | Exact-source tests reproduce `RangeError: Invalid time value` for full ISO timestamps; production-shaped/provider entries use that representation | Weight/Progress can return a server error for valid historical data | Normalize date-only versus instant values once, add provider/legacy regression fixtures, and verify Weight all/build/lean-mass paths |
| **P1** | HealthKit ingestion is too slow | Current production committed-ingest n=12: p50 4.842 s, p95/p99 15.855 s | Foreground sync can feel hung and collide with request/DB deadlines | Profile batch size, transaction scope, and downstream projection work; meet p95 <3 s and p99 <5 s |
| **P1** | Unexplained production failures remain | Six sanitized `INTERNAL_ERROR` 500s after deployment; one verified SQLSTATE `57014` statement timeout; route/resource absent from error logs | Unknown beta-visible failure surface and weak diagnosis | Add route/resource-safe correlation, eliminate the statement-timeout path, and run a clean acceptance window |
| **P1** | Canonical Nutrition uniqueness is violated | Current logs repeatedly report multiple active Nutrition days for one historical date | Reads/corrections can select ambiguous canonical state | Reconcile the duplicate under a separately authorized correction and enforce/test the invariant |
| **P1** | Production upload promise exceeds production capability | UI advertises “photo, PDF, or note” and “Add details without an asset”; production General/Other is explicitly unavailable and provides no free-form note field | User reaches a dead end after being promised a supported path | Implement a canonical note intake or remove/qualify the claims before beta |
| **P1** | Evidence-ready notifications are process-local | Evidence, briefing, and workout readiness rely on app-owned tasks/local scheduling; no server push or durable background notifier was verified | App termination can suppress the proactive notification until next open/sync | Establish a killed-app delivery strategy or make the limitation explicit and test next-open recovery |
| **P1** | First-run production recovery is not self-guiding | Fresh install defaults to Sandbox; production pairing is under You/connection and requires a short-lived 43-character credential | A beta user can remain unknowingly disconnected or fail setup | Add first-run authority choice, guided pairing, expiry recovery, and an end-to-end clean-install test |
| **P1** | Idle cadence work loads the full runtime | Every roughly five-minute cadence tick loads canonical runtime/bindings before determining `lockAcquired:false`/ineligible | Avoidable memory/DB pressure on the same constrained worker | Decide eligibility from bounded metadata before runtime hydration |
| **P2** | Test-gate drift obscures signal | Five assertions describe superseded contracts; one suite requires a private founder fixture unavailable from the repository archive | False red gates and incomplete reproducibility | Update assertions and provide a sanitized deterministic fixture or explicit gated test profile |
| **P2** | Activity upload copy contradicts current behavior | Manual Activity says direct device-health sync is not enabled, while production HealthKit activity ingestion is active | Confusing source-of-truth and duplicate-entry decisions | Rewrite the scenario copy to explain automatic HealthKit versus manual correction |

## Priority investigation: October 9 DEXA lifecycle

### Incident identity correction

The priority brief described two separate October 9 DEXA submissions/confirmations that required intervention. The retained evidence supports **one distinct October 9 upload/intake/review/canonical DEXA and two Native confirm-command attempts**, not two separate October 9 submissions. Recent HealthKit receipt activity does not establish a second upload. This distinction matters: inventing a second evidence object would obscure an idempotency/retry failure as a duplicate-upload failure.

An older September 12 DEXA had a separate canonical-null stall and September 13 intervention, but it is not a second October 9 submission.

### Verified upload-to-confirmation timeline

| UTC, October 9 | Verified transition |
|---|---|
| 14:24:24 | One roughly 1.6 MB PDF intake was stored and media-verified |
| 14:24:25–14:24:28 | Interpretation attempt 1 succeeded; one rich pending review and one DEXA scan were created |
| 14:25:19 | Native submitted the first confirm command |
| 14:25:37 | Canonical commit completed; the legacy entry path rewrote the 595-row evidence collection |
| 14:25:44 | Durable continuation began |
| about 14:26 | Mark Complete correctly refused to bypass unfinished durable work |
| 14:27:30 | Body Fat % and Lean Body Mass HealthKit receipts were saved |
| 14:28:10 | Worker restarted during compatibility work |
| 14:28:37 | Continuation exhausted and became dead at `compatibility_writes`; no failure record made the stuck state operationally obvious |
| 14:37:10 | HealthKit replay returned `already_present`; no duplicate receipt was created |
| 14:37:19 | Native submitted the second confirm command |
| 14:37:25–14:38:06 | Web process attempted compatibility work, then restarted |
| 14:47 onward | Lease expired; review remained committing, with only 1/9 durable steps complete |
| 18:02:41 | Separately founder-authorized recovery inserted exactly one continuation after the bounded Server fix was deployed |
| 18:03:02 | Previously failing compatibility step succeeded on its first bounded attempt |
| 18:06:48 | Review reached confirmed with 9/9 steps complete |

The first upload was durable, the canonical DEXA was durable, and HealthKit receipts were durable before intervention. Missing downstream effects were the legacy compatibility row, appointment completion, analyses, briefing, Goal Confidence update, and priority clearance. The user-facing Native state nevertheless said confirmation was accepted with no action required. That status was materially more certain than the server state.

Final recovery verification found exactly one active October 9 DEXA revision 1, one legacy row, the completed appointment, the expected analysis and Goal Confidence additions, one DEXA Event briefing, unchanged two HealthKit receipts, one historical dead continuation, eight succeeded continuations, and no duplicate evidence or feedback.

### Root cause and residual risk

The retained incident telemetry and local reproduction support OOM termination as the high-confidence cause. The old confirmation path hydrated and rewrote a whole runtime; its logical serialized state was only about 84.4 MB, but transient object graphs and serialization multiplied process memory. Process exits interrupted both worker and web attempts.

The deployed bounded fix removed the original full-collection compatibility rewrite and made durable steps resumable. It does not fully bound confirmation entry or every downstream computation.

| Exact deployed-source memory scenario | Result | Elapsed | Collection loads | Peak heap growth | Max RSS |
|---|---:|---:|---:|---:|---:|
| Bounded confirmation entry scope | PASS | 1,025 ms | 42 | 318 MB | **887 MB** |
| Bounded compatibility writes | PASS | 23 ms | 1 | 13 MB | 339 MB |
| Scheduled-item completion | PASS | 45 ms | — | 13 MB | 343 MB |
| Bounded analysis | PASS | 1,020 ms | 3 | 180 MB | 652 MB |
| Bounded Goal evaluation | PASS | 1,059 ms | 7 | 175 MB | 680 MB |
| Bounded briefing | PASS | 1,480 ms | 35 | 230 MB | 663 MB |
| Legacy compatibility writes | **OOM / SIGABRT** | — | — | — | — |
| Legacy briefing | PASS | 3,630 ms | — | 331 MB | 898 MB |

Harness conditions were `--max-old-space-size=512` with 150 MB synthetic ballast and an approximately 87.9 MB serialized runtime. V8 reported a roughly 560 MB heap limit. The 887 MB RSS observation is about 89% of the nominal service memory before allowing for container/system margin or request concurrency. Passing this harness is evidence that the fix is real, not evidence of adequate beta headroom.

## Manual evidence submission matrix

All paths below were inspected at exact release source and exercised through focused synthetic tests where a deterministic harness exists.

| User intent | Production entry path | Durable/processing behavior verified | Failure/retry coverage | Assessment |
|---|---|---|---|---|
| DEXA PDF | Dedicated DEXA scenario; one BodySpec PDF expected | Media validation, async intake, interpretation, review, canonical commit, HealthKit receipts, resumable 9-step confirmation | Malformed/truncated/media mismatch; 3 MB realistic file; crash/resume/retry/idempotency; bounded and legacy memory harnesses | Correctness is strong; **P0 memory/operability remains** |
| Progress photos | Staged original files with pose metadata | Originals including HEIC/HEIF/DNG, multi-pose analysis, durable transfer and resume | Duplicate/lost acknowledgement, concurrent transfers, partial analysis, dead-letter | Strong durability; killed-app readiness notification remains P1 |
| Nutrition screenshot/photo/PDF | Explicit Nutrition or Automatic classification | Interpretation/review/canonical day; direct manual daily upsert with date-specific read-after-write | Duplicate, stale revision, correction, replay and mixed-category tests | Functionally covered; existing active-day duplicate is P1 |
| Activity screenshot/photo/PDF | Explicit Activity or Automatic classification | Interpretation/review/canonical activity; manual direct upsert | Correction, replay, stale state, HealthKit activity coexistence | Functionally covered; copy contradicts HealthKit behavior |
| Training screenshot/photo/PDF | Automatic classification | Training evidence interpretation and canonical sync | Screenshot/parser, duplicate and provider-upload tests | Supported, but discoverability differs from explicit Training |
| Structured training | Explicit Training routes to Workout Logger | Draft/session persistence, exercise logging, supersets and reconciliation | Draft recovery, logger, screenshot/provider and durability tests | Strong focused coverage |
| Manual weight | Explicit Weight routes to Manual Weigh-In | Validation, date handling, correction and idempotency | Focused direct-entry tests | Write path passes; read-model full-ISO bug is P1 |
| Manual nutrition | Scenario form, no asset required | Date-keyed canonical update plus read-after-write | Existing web-authored revision diverts to screenshot review | Supported with guarded conflict behavior |
| Manual activity | Scenario form, no asset required | Date-keyed canonical update plus read-after-write | Correction/replay/stale tests | Supported; explanatory copy is inaccurate |
| Free-form note / General / Other | Advertised by Log/Upload shell | Production scenario explicitly unavailable; no canonical note field | UI test confirms unavailable state | **Not actually supported; P1 promise mismatch** |

The production upload shell accepts images and PDFs and Automatic can classify nutrition, activity, training, and DEXA. Explicit Training and Weight intentionally redirect to purpose-built entry surfaces. The Sandbox note affordance must not be mistaken for a production note pipeline.

## Synthetic test results

| Group | Files | Assertions | Result | Interpretation |
|---|---:|---:|---|---|
| Evidence intake, storage, DEXA, photos, media and async processing | 20 | 173 pass, 2 fail, 1 skip | Conditional | One file could not load a private founder runtime fixture; two Training durability assertions were stale after intentional canonical-sync behavior changed |
| Manual domains, HealthKit, worker/outbox and duplicate handling | 26 | **325/325 pass** | PASS | Weight/training/nutrition/activity write paths and HealthKit canonical flows are well covered |
| Authentication, navigation, briefings, notifications and read models | 32 | 298 pass, 5 fail | Conditional | Three failures are stale shape/name expectations; two reproduce the real Weight full-ISO timestamp bug |
| **Total** | **78** | **796 pass, 7 fail, 1 skip** | Not a release pass | Five stale assertions, two real failures, one unavailable private fixture suite |

The Weight bug is not test-only. `canonicalWeightEntries` accepts and retains full ISO instants, `weightPoint` passes that value as `date`, and `rollingWeightAverage` appends `T00:00:00.000Z`, producing an invalid date from an already complete timestamp. Provider/legacy production-shaped rows use full instants.

Exact Build 95 retained result bundles add:

- focused Native units: **20/20 pass**, total test duration 0.342 s, slowest 0.211 s;
- focused Native UI: **4/4 pass**, total 96.594 s, slowest 34.257 s;
- delayed eight-second cold launch reached authoritative content without a false error;
- earlier exact-candidate affected units: **352/352 pass** and unsigned Release compilation;
- earlier accepted release baseline: **2,224 unit passes** with one designed skip.

## Production performance baselines

### Public health endpoints

Measured with 25 sequential requests per endpoint; all returned successful status.

| Endpoint | Success | p50 | p95 | p99 | Max |
|---|---:|---:|---:|---:|---:|
| `/health/live` | 25/25 | 80.5 ms | 101.1 ms | 348.4 ms | 348.4 ms |
| `/health/ready` | 25/25 | 106.0 ms | 125.1 ms | 199.5 ms | 199.5 ms |

Readiness presently reports access gate, provider configuration, database, database identity, product owner, schema, runtime authority, object storage, and deadline as ready. Three historical current-deployment readiness failures were attributable to object-storage health timeout at roughly 3.1 seconds; the final audit probes were green.

### Production read-model latency from sanitized current-deployment logs

Percentiles use nearest-rank over available samples. These are server durations, before client networking, decoding, rendering, or retry.

| Read model | n | p50 | p95 | p99 | Observed concern |
|---|---:|---:|---:|---:|---|
| Home | 11 | 2,491 ms | 4,798 ms | 4,798 ms | 7.12 MB response observed |
| Goals | 7 | 2,092 ms | 3,385 ms | 3,385 ms | 7.03 MB response observed |
| Log | 34 | 1,182 ms | 3,301 ms | 6,896 ms | 9.65 MB response observed |
| Active Goal | 4 | 474 ms | 1,492 ms | 1,492 ms | Tail above target |
| Activity evidence | 40 | 218 ms | 943 ms | 5,534 ms | Severe tail |
| Nutrition evidence | 20 | 129 ms | 1,710 ms | 2,686 ms | Tail above target |
| Weight evidence | 23 | 85 ms | 1,355 ms | 1,517 ms | Tail above target plus correctness bug |
| DEXA evidence | 4 | 18 ms | 800 ms | 800 ms | Small sample |
| Photos | 2 | 920 ms | 1,416 ms | 1,416 ms | Small sample |
| Training landing | 2 | 746 ms | 1,215 ms | 1,215 ms | Small sample |
| Training library | 2 | 765 ms | 1,231 ms | Small sample |
| Native briefing artifact | 5 | 91 ms | 281 ms | 281 ms | Meets proposed read target |

An evidence fan-out drove database pool waiting to 10 while the deployed pool maximum is 5. No live environment override for pool maximum, connection timeout, or statement timeout was present, so source defaults apply: pool 5, connection timeout 5 seconds, statement timeout 15 seconds. Pool enlargement alone is not the remedy; the fan-out, oversized projections, and query/transaction boundaries should be reduced first.

### Commands, authentication, and processing

| Operation | n | p50 | p95/p99 | Assessment |
|---|---:|---:|---:|---|
| HealthKit DEXA writeback committed | 6 | 39.73 ms | 309.28 ms | Good |
| HealthKit DEXA writeback replay | 6 | 15.88 ms | 122.50 ms | Good; idempotent |
| HealthKit observations ingest committed | 12 | 4,841.98 ms | 15,855.13 ms | **Fails proposed target** |
| HealthKit observations replay | 2 | 21.48 ms | 215.68 ms | Good; small sample |
| Auth refresh challenge | 7 | 16.50 ms | 69.97 ms | Good |
| Auth refresh success | 7 | 42.37 ms | 53.33 ms | Good |

Eight access-token-expired 401s were observed and recovered through the expected refresh path. Pairing, session rotation, request authentication, passkey, sender, reconnect-required, and offline-last-known tests pass. Authentication is robust after pairing; onboarding into that paired state is the weakness.

## Proposed beta acceptance targets

These are **proposed acceptance thresholds**, not existing production SLOs.

| Surface | Proposed beta threshold | Current result |
|---|---|---|
| Public live/ready | p95 <250 ms, p99 <500 ms | PASS in sequential sample |
| Cached Native first usable Home | p95 <1 s | Focused delayed-start behavior passes; population metric absent |
| Authoritative Home | p95 <2 s, p99 <3 s end-to-end | FAIL on server duration alone |
| Core Server reads | p95 <750 ms, p99 <1.5 s | Home, Goals and Log FAIL |
| Evidence stream reads | p95 <750 ms, p99 <1.5 s | Activity/Nutrition/Weight tails FAIL |
| Durable upload acceptance | p95 <3 s | No production percentile available |
| Interpretation ready | DEXA/screenshots p95 <60 s; photos p95 <120 s; stalled at 2× SLA | No durable production SLA/watchdog available |
| HealthKit ingest | p95 <3 s, p99 <5 s | FAIL |
| Outbox queue | age p95 <10 s, p99 <60 s; none beyond two leases; zero unalerted dead | Not measurable/alerted; FAIL operationally |
| DB pool | p95 waiting 0; waiting >0 on <1% requests | FAIL in observed fan-out |
| Service memory | steady <60%; p95 <75%; single operation <85%; zero OOM restarts | DEXA entry FAILS at about 89% nominal memory |
| Server errors | <0.1%; zero unexplained 500/statement timeout in acceptance window | FAIL |
| Auth refresh | p95 <250 ms | PASS |
| Evidence notification | Arrives within processing SLA after app termination, or explicit tested next-open contract | FAIL / unverified killed-app delivery |

## Area-by-area audit

### Startup and navigation

Build 95 materially improves startup ownership. One structured SwiftUI task arbitrates initial load, activation, day rollover, and canonical Priority refresh. Persisted last-known Home content can paint while authoritative content loads, and delayed-start UI tests verify no false error. Five independent navigation stacks—Home, Goals, Log, Evidence, You—preserve tab history and focused routing tests pass.

Residual risk is primarily upstream: authoritative Home is slow enough to erase the benefit for uncached/new users. There is also no production population telemetry for first usable paint, authoritative settlement, tab transition, or blank/error duration.

### Server, worker, and database

The deployment is ACTIVE, both components run the exact expected SHA, public liveness/readiness are green, and no current-deployment restart was present in the final log window. Web and worker each use one `apps-s-1vcpu-1gb-fixed` instance. This is a single-instance topology with no capacity redundancy.

The worker polls at roughly one-second intervals and uses leases/retries/dead-letter behavior, but there is no independent queue-age/dead alert. Cadence evaluation runs around every five minutes and hydrates too much state before discovering that work is ineligible. The October 9 continuation demonstrated that a dead item can coexist with a misleading client success state.

The database is healthy at final check, yet core reads fan out across large canonical collections, generate multi-megabyte payloads, and can exhaust the five-connection application pool. A statement timeout has already occurred. Query-level percentiles, rows scanned, bytes returned, and pool wait should become release evidence.

### Authentication and recovery

Once paired, challenge/refresh is fast and tested. Access-token expiry recovers, session states distinguish recovering/offline/reconnect-required, and last-known content is retained. A new install, however, selects Sandbox by default and does not force or explain production pairing. The production connection entry is buried in You and depends on a short-lived credential. This is unsuitable for unsupervised beta onboarding.

### HealthKit

Observer registration occurs during process initialization and a foreground catch-up is requested, which is the right recovery shape. DEXA writeback receipts are idempotent and fast, including replay. General observation ingestion is slow enough to exceed the proposed p95/p99 thresholds. HealthKit provenance, permission-denial, background-delivery, clock/day-boundary, and large-batch tests should be part of the beta matrix; killed-app background behavior needs device evidence rather than simulator/source inference.

### Briefings, priorities, and notifications

Briefing cadence, concurrency, settlement, schedule, priority, and morning-recovery focused tests pass. The October 9 recovery created exactly one DEXA Event briefing and cleared its priority without duplication. Briefing read latency is healthy in the available sample.

Notification reliability is weaker than the underlying durable records. Review-ready observation is owned by an in-process task; termination ends it. Local notifications can be scheduled only when the app learns that work is ready. The safe fallback is that pending reviews and briefings remain discoverable on next open, but that is not equivalent to a proactive beta notification contract.

### Processing reliability

Intake, storage verification, idempotency keys, retries, durable continuations, canonical revision handling, and read-after-write verification are strong. The current weakness is failure visibility and boundedness, not basic data preservation. Every asynchronous workflow should expose accepted, queued, working, retrying, ready, failed, and recovered states from durable server truth. A client command acknowledgement must not collapse those states into “no action required.”

## Remediation plan and release gates

### P0 — required before external beta

1. **Close DEXA memory risk.** Remove confirmation-entry whole-runtime hydration and bound remaining analysis/Goal/briefing inputs. Re-run the exact constrained-memory harness with representative concurrency and larger-account fixtures. If instance resizing is used as an interim mitigation, require measured p95 <75% and single-operation <85% of service memory with at least 30% operational headroom—not nominal capacity arithmetic alone.
2. **Make stranded work observable and recoverable.** Add durable review-age and outbox-age metrics, dead-letter count, worker/web restart and RSS/CPU alerts, and an operator-visible correlation from upload through review/command/step. Exercise an injected-crash test that proves automatic retry or a page-worthy alert. Make Native show durable pending/retrying/failed state truthfully.

### P1 — required correctness/reliability gates

3. Fix Weight date normalization and add full-ISO, date-only, provider, and legacy regressions.
4. Remove unexplained 500s and the statement-timeout path; emit safe route/resource and request correlation on every error.
5. Reduce Home/Goals/Log projection size and fan-out; meet the proposed p95/p99 targets without pool waiting.
6. Profile and bound HealthKit observation ingestion; meet p95 <3 seconds and p99 <5 seconds.
7. Reconcile the duplicate active Nutrition day through a separately authorized, sealed correction; enforce uniqueness in write and test paths.
8. Align upload copy with reality: implement production note intake or remove note claims; explain Training/Weight redirects and automatic HealthKit coexistence.
9. Add a guided clean-install flow for Sandbox versus Production, pairing, expired credential, offline, reconnect, and first authoritative Home.
10. Define and device-test the notification contract with the app suspended/terminated. If server push is deferred, explicitly promise next-open discovery rather than background delivery.
11. Move cadence eligibility/lock decisions ahead of expensive runtime hydration.

### P2 — hardening and evidence quality

12. Update the five stale tests and replace the private founder runtime dependency with a scrubbed deterministic fixture or a named optional test profile.
13. Add stable end-to-end trace identifiers and dashboards so retries cannot be misdescribed as multiple uploads.
14. Collect device-side startup/navigation percentiles and Server-side upload-to-ready/confirm-to-complete percentiles rather than relying on focused tests and log samples.
15. Keep `a26d89ad` as a presentation-only candidate for a later consolidated Native build; do not mix it into reliability remediation.

## Efficient ongoing test strategy

Use a layered gate so high-signal checks run often without turning every change into a full release exercise:

1. **Per change:** deterministic unit/contract tests for the changed domain, including idempotency and invalid input; stale assertions are not waived.
2. **Server merge gate:** representative small/large account fixtures; DB query/payload budgets; outbox crash-at-each-step replay; constrained-memory DEXA and cadence harnesses.
3. **Native merge gate:** cold/warm/offline/expired-session startup, five-tab navigation, upload affordance contract, killed/relaunched pending-work recovery, and accessibility/layout checks.
4. **Nightly synthetic local:** every manual evidence route—PDF, photo, screenshot, note contract, weight, training, nutrition, activity—through accept, processing, correction, duplicate, retry, and dead-letter scenarios.
5. **Pre-beta production read-only acceptance:** seven clean days of alerts/metrics with no unexplained 500, statement timeout, dead review, or OOM restart; measured latency and queue targets reported by percentile and sample count.
6. **Device acceptance:** fresh install/pairing, denied and partial HealthKit permissions, background/terminated notification behavior, poor network, large upload, and recovery after process termination.

## Go/no-go checklist

| Gate | Status |
|---|---|
| Exact release identities and active deployment verified | PASS |
| Public live/readiness healthy at close | PASS |
| Evidence preservation, idempotency, and Oct 9 recovery verified | PASS |
| Manual write-domain synthetic coverage | PASS with note-contract exception |
| DEXA memory headroom | **FAIL** |
| Stalled-processing alert and recovery | **FAIL** |
| Weight read-model correctness | **FAIL** |
| Core read and HealthKit latency | **FAIL** |
| Clean server error window | **FAIL** |
| Canonical Nutrition uniqueness | **FAIL** |
| Killed-app notification contract | **FAIL / not evidenced** |
| Unsupervised new-user onboarding | **FAIL** |

**Final assessment: NO-GO for external beta.** Reassess after the two P0 items and the P1 correctness gates above are implemented and the acceptance targets are measured over a clean window. A narrow founder/internal-only phase may continue with active monitoring, known recovery procedures, and no claim that the system is beta-ready.

## Evidence index

Primary retained repository evidence:

- [`20261009T150500Z-dexa-oct9-processing-readonly-triage.md`](./20261009T150500Z-dexa-oct9-processing-readonly-triage.md)
- [`20261009T154708Z-dexa-bounded-confirmation-fix-recovery-candidate.md`](./20261009T154708Z-dexa-bounded-confirmation-fix-recovery-candidate.md)
- [`20261009T180727Z-dexa-oct9-recovery-executed-verified.md`](./20261009T180727Z-dexa-oct9-recovery-executed-verified.md)
- [`20261010T055736Z-dexa-healthkit-assurance-evidence-cleanup-complete.md`](./20261010T055736Z-dexa-healthkit-assurance-evidence-cleanup-complete.md)
- [`20261010T052621Z-build95-testflight-valid.md`](./20261010T052621Z-build95-testflight-valid.md)

Additional audit evidence was produced locally from exact release sources: grouped test outputs, retained Native xcresult summaries, constrained-memory DEXA scenarios, public health samples, current deployment/spec inspection, and sanitized production-log aggregates. Private raw output, credentials, record identifiers, and local mode-600 runner artifacts are intentionally not published.

## Separation statement

This audit performed read-only production investigation and synthetic local testing only. It did not deploy, change production configuration, mutate production data, send notifications, upload a Native build, move `latest.md`/`latest.json`, or activate recovery. The only publication is this additive report. DEXA Evidence page cleanup remains queued for a later consolidated Native build.
