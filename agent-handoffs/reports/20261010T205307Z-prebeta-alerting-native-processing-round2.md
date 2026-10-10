# Pre-beta optimization Round 2 — alerting and Native processing candidates ready

- Published: `2026-10-10T20:53:07Z`
- Task id: `prebeta-alerting-native-processing-round2-20261010`
- Instruction commit: `54f3408e`
- Live production Server observed: [`2e4af15c67e1899933f315e9ea0c4922151c8803`](https://github.com/dustinginn/physiqueos/commit/2e4af15c67e1899933f315e9ea0c4922151c8803)
- Live deployment/restart operation: `78a7ea18-764e-4774-b3b1-17f96cf9c8b1`, ACTIVE 9/9
- Server alert-routing candidate: [`a1b4039c65f0c1db6685a04db5a0217104df8dfb`](https://github.com/dustinginn/physiqueos/commit/a1b4039c65f0c1db6685a04db5a0217104df8dfb)
- Server branch: [`codex/prebeta-round2-alerting-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/prebeta-round2-alerting-20261010)
- Consolidated Native candidate: [`f83422a3ec5fe9f750dfc970424fedf4aa7ef7e4`](https://github.com/dustinginn/physiqueos/commit/f83422a3ec5fe9f750dfc970424fedf4aa7ef7e4)
- Native branch: [`codex/prebeta-round2-native-processing-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/prebeta-round2-native-processing-20261010)
- Result: **both source candidates are pushed and verified; no deploy, alert activation, archive, or TestFlight upload occurred**
- External beta assessment: **NO-GO**

## Executive result

Round 2 closes the two implementation gaps left after the P0 watchdog deployment without changing production.

The Server candidate adds a dormant, fail-closed operational delivery path for application-level evidence-processing incidents. It converts watchdog observations into durable opened, escalated, and resolved transitions in the existing PostgreSQL outbox; preserves dedupe, retry, lease recovery, dead-letter state, and delivery receipts; and sends only allowlisted aggregate metrics. Routing remains completely inert unless a later authorized deployment supplies both an explicit enable flag and an approved HTTPS destination. The existing provider alerts for deployment/domain failure and Web/Worker CPU, memory, and restart signals remain unchanged.

The Native candidate descends from exact reviewed consolidated candidate `8ba52df9` and consumes the Server's durable processing contract. Accepted, queued, processing, retrying, ready, failed, and forward-compatible unknown states now remain monotonic, survive process termination, restore from last-known data offline, and prefer Server truth over a local accepted receipt. Accepted work never renders a false success or a second confirmation action. Failures identify required action and deep-link to the exact review. Offline review snapshots are explicitly labeled and cannot expose stale confirm/dismiss or Workout Match mutation controls.

The previously completed HealthKit authorization boundary, Watch workout footer/amber styling, and Today widget Weight removal are preserved unchanged in the consolidated Native lineage. DEXA Evidence cosmetic candidate `a26d89ad` remains separate and queued. Goal Adaptation was untouched.

## Lane A — durable operator alert routing

### Candidate behavior

The watchdog now has an optional router that observes healthy samples as well as alert samples, allowing durable recovery notifications. The router creates one outbox message per incident transition:

- `opened` on the first failing sample;
- `escalated` once after 15 continuously failing minutes;
- `resolved` once after a subsequent healthy sample.

The transition identity is deterministic by alert code, incident-open timestamp, and transition. PostgreSQL advisory locking serializes reconciliation, the unique outbox key prevents duplicate delivery work, and the existing worker supplies retry, lease recovery, succeeded/dead timestamps, and delivery receipts. Alert delivery failure cannot stop watchdog inspection or safe recovery.

Covered signals are invalid/missing immutable adoption boundary, stale review, stale queue, dead continuation, stale Worker heartbeat, high/critical RSS, and high CPU. The delivery payload contains only alert code, severity, transition, timestamps, build identity, and allowlisted aggregate counts/utilization. It excludes user, review, evidence, Worker, destination, authorization, and free-text identities. HTTPS is mandatory; URL credentials and fragments are rejected; authorization is read only from a secret and never enters the payload or logs.

### Thresholds and ownership

| Signal | Open threshold | Escalation |
|---|---:|---|
| immutable adoption boundary unavailable | any sample | immediate operational investigation; automatic recovery remains fenced |
| stale review | over 2 minutes | inspect review/claim/outbox; never replay historical work |
| stale queue | over 2 minutes | inspect claims and Worker queue |
| dead continuation | any | inspect dead-letter receipt and saved review state |
| Worker heartbeat stale | over 90 seconds | correlate with provider restart/deployment telemetry |
| process RSS | warning 70%, critical 85% of 1 GiB | correlate with provider memory and restart telemetry |
| process CPU | at least 85% | correlate with sustained load and queue age |

No external destination was invented. Activation still requires a named primary operator and backup, an approved webhook/provider, acknowledgement expectation, escalation path, security/retention review, and any monthly-cost approval. No monthly cost can be stated until the human-selected destination is known. A source-only preview reports `active:false` even when synthetic configuration is present, and redacts the destination.

### Server validation

| Gate | Result |
|---|---:|
| alert routing/store, watchdog, memory, outbox, review projection | **8 files, 49/49 pass at final source** |
| focused memory/routing subset | **4 files, 14/14 pass** |
| changed-file lint and whitespace | **pass** |
| source-only preview, disabled and synthetically configured | **pass; active false, destination redacted** |
| provider Worker artifact collection/safety scan | **PASS; 572 files, 6,635,319 bytes** |
| exact final Server production build | **pass; 50/50 static pages** |

The candidate adds no migration and makes no default runtime change. Activation and deployment both require later authority.

## Lane B — Native durable processing state

### User-visible contract

- The Log and review-detail reads decode the Server's nested durable state and valid completed/total step counts.
- Counts are clamped to a valid range and progress cannot move backward when stale or out-of-order responses arrive. Authoritative terminal ready/failed states win immediately.
- A durable local receipt bridges only the command/read-projection race. It persists across termination and relaunch, but never overrides newer Server truth.
- Exact-query, validated queue and review snapshots provide explicitly labeled last-known state offline. Stale snapshots never expose destructive or duplicate confirmation controls.
- Accepted/queued/processing/retrying remain waiting states with honest progress and “Check Now”; they do not show a green success check.
- A terminal failure restores actionable review semantics and the Log button opens the exact failed review.
- Unknown future states remain safe waiting states instead of decoding failure or duplicate action.
- Pairing changes, revocation, rejected refresh, and explicit session retirement remove the persisted processing state.

### Native validation

| Gate | Result |
|---|---:|
| processing projection/persistence/source-truth unit suite | **6/6 pass** |
| offline relaunch and snapshot allowlist regressions | **2/2 pass** |
| evidence-flow UI suite | **5/5 pass** |
| unsigned Debug compile, iPhone + Watch + widget | **pass** |
| unsigned Release compile, iPhone + Watch + widget | **pass** |
| whitespace and clean-worktree checks | **pass** |

The UI suite exercised DEXA PDF gating, Progress Photos fixture gating, generic photo/screenshot-style upload selection, manual Nutrition entry, Training handoff, DEXA correction/review actions, loading/failure/not-found/refresh/accepted lifecycle states, and the nonactionable processing state. The accepted-processing state also passed at accessibility extra-extra-extra-large text size in both Dark and Mineral appearances, with named assistive-technology actions and no confirm/dismiss controls.

The exact parent `8ba52df9` validation remains credited because Round 2 is an additive descendant: 154 focused iPhone HealthKit/DEXA/sync/widget/workout-theme tests with zero failures and one opt-in render skip, final iPhone authorization 18/18, Watch authorization 8/8, Watch footer/actions 4/4, and widget 27/27. Thus repeated launch/background/update/new-permission control flow, denied/decided authorization handling, Watch amber/footer behavior, and Weight-free widget behavior remain in the same candidate. Physical-device confirmation of OS permission-sheet behavior is still required.

## Lane C — production observation baseline

This is an initial postdeployment observation window, **not seven clean days**. The seven-day gate began with the controlled exact-build Worker restart at approximately `2026-10-10T19:46:50Z` and cannot complete before approximately `2026-10-17T19:46:50Z`.

Read-only observation covered 52 Worker samples from `2026-10-10T19:46:40.744Z` through `2026-10-10T20:12:16.676Z` (25 minutes 36 seconds), plus a bounded read-only PostgreSQL snapshot. Production remained exact `2e4af15c`, Web/Worker/runtime parity held, readiness was 9/9, and Recovery remained OFF.

| Metric | Available observation |
|---|---:|
| Worker RSS | p50 35.91%; p95 40.58%; max 40.62%; latest 19.76% |
| Worker CPU | p95 41.01%; max 100%; latest 1% |
| watchdog heartbeat age | max 923 ms; latest 360 ms |
| active/failed or stale reviews | 0 |
| recovery/recovery-failed events | 0 / 0 |
| new pending/processing continuation messages | 0 / 0 |
| historical continuation dead letters | 13 known legacy rows; no new/live work |
| OOM/unplanned restart observed | 0 / 0 in the sampled window |
| synthetic bounded confirmation/cadence peak | 662 MiB, 64.65% of 1 GiB; 35.35% headroom |

One transient `EVIDENCE_PROCESS_CPU_HIGH` event occurred because a single sample reached 100%; p95 was 41.01% and the latest sample returned to 1%. That event is a reason to continue observation, not evidence of a sustained incident.

PostgreSQL showed a healthy heartbeat, immutable deployment boundary `2026-10-10T19:44:17.378Z`, zero historical-eligible work, zero active/failed reviews, the retired September 14 Training review still fenced with `autoResumeCount=0`, and continuation outbox totals of 728 succeeded plus the 13 known historical dead rows. The transaction was read-only and rolled back. Canonical evidence and performance records were unchanged.

Two measurement gaps remain explicit:

1. Provider logs do not supply a reliable operation-attributed live peak RSS series, so the 662 MiB operation peak is the exact candidate's synthetic larger-account/concurrency measurement, not a production claim.
2. No post-P0 endpoint latency histogram was available in the sampled provider/Worker telemetry. The last reproducible pre-P0 reference remains Home p95 4.798 s, Goals 3.385 s, Log 3.301 s, with 7–9.65 MB payloads and database-pool wait max 10 against max 5. These are P1 baselines, not claims about the short postdeployment window.

## Staged P1 sequence

1. Fix and regress the Weight full-ISO parsing defect as a small isolated Native candidate.
2. Instrument and bound Home/Goals/Log/evidence reads: p95/p99 latency, response size, query count, and pool wait; then remove oversized payload/query work without mixing user-visible redesign.
3. Establish HealthKit ingestion p95 below 3 seconds and p99 below 5 seconds with repeated-background/update coverage.
4. Reproduce and close unexplained HTTP 500/statement-timeout paths with bounded query evidence.
5. Investigate the duplicate active Nutrition day separately; any Founder data repair requires explicit authorization.
6. Reconcile note-intake product promises with the supported evidence contract.
7. Validate killed-app review notification delivery and new-user production pairing/recovery on physical devices.
8. Move cadence eligibility checks before expensive hydration and further bound DEXA briefing work.

No P1 implementation or production data correction was started in this task.

## Rollout plan and remaining decisions

1. Review Server `a1b4039c`; select the operator/destination and resolve security, retention, cost, ownership, and acknowledgement policy.
2. Under separate authority, deploy the exact Server candidate with routing still disabled, verify 9/9 and watchdog parity, then exercise the destination in an isolated staffed window before activation.
3. Continue the seven-day read-only observation through the full gate; investigate any sustained CPU/RSS, restart, stale work, or new dead letter.
4. Review Native `f83422a3`; run physical iPhone/Watch acceptance for repeated launch/background/update, genuine new permission request, offline relaunch, failed-review deep link, Dynamic Type/VoiceOver, Dark/Mineral, widget, and workout controls.
5. Only after approval, generate one consolidated signed Native archive and TestFlight build. Do not create a standalone processing-state build.

## Beta assessment

The candidates are **GO for code review and controlled later rollout preparation**. External beta remains **NO-GO** until all of the following are true:

- durable alert delivery has an accountable destination and has been activated/exercised under separate authority;
- the consolidated Native candidate passes physical iPhone/Watch acceptance and an authorized release;
- the full seven-day production observation gate completes without OOM, unplanned restart, unalerted dead continuation, review stranded beyond two leases, adoption-boundary drift, or memory-threshold breach;
- the highest-risk P1 latency/timeout and new-user recovery gates have bounded evidence.

## Safety and storage

- No Server deploy, production infrastructure mutation, external alert activation, production data write/repair, Recovery activation, Native archive, TestFlight upload, or release-pointer movement occurred.
- Goal Adaptation and DEXA Evidence cosmetic work were untouched.
- Free disk was 15 GiB before intensive validation, briefly 13 GiB after builds, and 15 GiB after removing only the task-owned `/tmp/physiqueos-round2-tests` plus two regenerated provider-artifact directories. The 12 GiB floor was preserved. Active worktrees, source, prior archives, credentials, and unrelated artifacts were retained.

## Flags

- `SERVER_ALERT_CANDIDATE=a1b4039c65f0c1db6685a04db5a0217104df8dfb`
- `NATIVE_CONSOLIDATED_CANDIDATE=f83422a3ec5fe9f750dfc970424fedf4aa7ef7e4`
- `ALERT_ROUTING_ACTIVE=NO`
- `ALERT_DESTINATION_SELECTED=NO`
- `PRODUCTION_SERVER_CHANGED=NO`
- `RECOVERY_AUTHORITY=OFF`
- `NATIVE_RELEASED=NO`
- `TESTFLIGHT_UPLOADED=NO`
- `SEVEN_DAY_OBSERVATION=IN_PROGRESS_NOT_COMPLETE`
- `DEXA_EVIDENCE_COSMETIC=QUEUED_SEPARATELY`
- `GOAL_ADAPTATION_TOUCHED=NO`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. It does not move `latest.json`, `latest.md`, any accepted Native release pointer, production infrastructure, alert destinations, Server runtime, Recovery authority, or TestFlight state.
