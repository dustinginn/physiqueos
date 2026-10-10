# Pre-beta optimization Round 5 — HealthKit ingest and Goals tail latency

- Published: `2026-10-10T22:42:17Z`
- Instruction commit: `579a9fa3b33f8c610a9bc9062b79c216684a0670`
- Prior report: `agent-handoffs/reports/20261010T222132Z-prebeta-round4-storage-healthkit-preview-latency.md` (`251c6aaf` on main)
- Live production Server, unchanged: [`2e4af15c67e1899933f315e9ea0c4922151c8803`](https://github.com/dustinginn/physiqueos/commit/2e4af15c67e1899933f315e9ea0c4922151c8803)
- Preserved Round 4 Server parent: [`b9198382f7c01b8071dfcc35e7c5e6023ff2f6c8`](https://github.com/dustinginn/physiqueos/commit/b9198382f7c01b8071dfcc35e7c5e6023ff2f6c8)
- Round 5 Server candidate: [`46dc86c6963154f6a3bf2785beb3982969272fe2`](https://github.com/dustinginn/physiqueos/commit/46dc86c6963154f6a3bf2785beb3982969272fe2)
- Server branch: [`codex/prebeta-round5-healthkit-goals-tail-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/prebeta-round5-healthkit-goals-tail-20261010)
- Preserved consolidated Native candidate: [`9c58105990fa465c0a4d7d6898d21c271931191f`](https://github.com/dustinginn/physiqueos/commit/9c58105990fa465c0a4d7d6898d21c271931191f)
- Preserved dormant alert-routing candidate: [`a1b4039c65f0c1db6685a04db5a0217104df8dfb`](https://github.com/dustinginn/physiqueos/commit/a1b4039c65f0c1db6685a04db5a0217104df8dfb)
- Result: **source candidate published; no deployment, infrastructure change, alert activation, HealthKit import, Native archive, or TestFlight upload occurred**
- External beta assessment: **NO-GO**

## Executive result

Round 5 identifies a concrete HealthKit-ingest amplification problem and removes it without changing the command or canonical-data contract. The former path read every stored HealthKit observation and canonical day, and made three separate configuration reads, on every batch. On the current larger production account, its initial load shape was 10 queries, 2,630 rows, and 5.33 MB. The candidate loads only the incoming observation identities, the source observations referenced by the 49 canonical workouts, and the affected canonical days; it batches configuration and relationship collections. The same read-only production snapshot measures 6 queries, 1,349 rows, and 2.84 MB: 40% fewer queries, 48.7% fewer rows, and 46.6% fewer bytes. Median initial-load time improves 559.4 to 404.6 ms and p95 improves 857.3 to 477.7 ms.

This is a material source-only improvement, but it does not explain all of the live 6.5–25.8 second command duration. Canonical Training evidence and relationship reassessment remain substantial, and current production lacks stage timing. The candidate therefore adds disabled-by-default, privacy-safe command instrumentation that separates pool wait, advisory-lock wait, transaction/query work, HealthKit normalization, initial hydration, observation reconciliation, relationship reassessment, commit, and total time. It emits only operation names, durations, query/count aggregates, and bounded collection counts—never record identifiers, dates, Health values, payloads, or source names. Existing Native command diagnostics continue to provide authorization and client/network timing for residual attribution.

Active Goal now makes four database queries instead of eleven when a briefing is selected, while returning the exact same response. The final ten-sample run reports 609.0 ms median and 909.0 ms p95 versus the fresh Round 5 baseline's 499.1 / 1,402.9 ms and the Round 4 observed 493.7 / 4,374.5 ms. That is a meaningful tail reduction, not a complete close: an intermediate five-query candidate still produced one 5,456.4 ms outlier, proving database variability remains. Aggregate Goals retains its already bounded two-query/source shape and exact response, but the final run was 1,322.7 / 1,730.6 ms. Both remain above the proposed core-read beta target of p95 below 750 ms. No speculative Training JSON projection or global-sort change was repeated.

Production remains exact `2e4af15c`, Recovery remains OFF, and the seven-day observation remains in progress until approximately `2026-10-17T19:46:50Z`. The newest Worker samples preserve the original durable adoption boundary, contain no active/stale/historical/queued/dead evidence work, and show about 20.9% RSS. One 100% CPU sample occurred two seconds after the authorized restart and raised the expected startup alert; no later alert or recovery event appears. The latest 5,000 Web lines contain 20 successful HealthKit ingests with 6,494.74 ms median, 16,633.33 ms p95, and 25,836.56 ms maximum, with zero timeout-like or internal-error failures.

## Lane A — HealthKit ingest diagnosis and bounded candidate

### Root cause found

`ingestHealthKitObservations` ran under the per-owner advisory lock and loaded the following before processing even a one-observation batch:

1. every `healthKitObservations` row;
2. every `healthKitCanonicalDays` row;
3. the three policy/configuration records through three separate queries;
4. canonical workouts, links, and claims through three separate queries; and
5. all canonical Evidence and its immutable storage metadata for relationship assessment.

The unbounded observation/day reads grow with account lifetime and lengthen the owner-serialized transaction. Concurrent commands then wait behind that transaction even when their own work is small. The recent live pattern supports this diagnosis but does not prove it is the only cause: successful HealthKit receipts remain much longer than the isolated initial-load benchmark.

### Candidate behavior

The candidate adds owner-scoped `getMany` and `listMany` canonical-store primitives and changes HealthKit ingestion to:

- load incoming observation identities plus the source observation of each existing canonical workout;
- load only canonical day identities affected by the incoming daily batch;
- load the three exact configuration identities in one bounded query;
- load workout/link/claim relationship collections in one owner-scoped query;
- retain the full historical observation scan only as a lazy collision-recovery fallback, preserving the exact next-revision diagnostic contract; and
- retain the full canonical Training Evidence and storage-metadata load because relationship matching still requires it.

The one-observation/1,200-history focused case confirms no full `healthKitObservations` list occurs on the normal path. Existing identity-drift, purpose-immutability, daily-revision recovery, concurrent duplicate delivery, quarantine, workout matching, canonical-day, graduation, and production-shaped HealthKit tests remain green.

### Read-only production load benchmark

The committed benchmark runner gates exact production SHA and owner, opens one `REPEATABLE READ READ ONLY` transaction, rejects non-SELECT/WITH and multi-statements, alternates baseline/candidate order over ten repetitions, explicitly rolls back, and outputs aggregate counts/timings only. It selected 51 relevant observation identities (the current canonical-workout sources plus two recent observations) and two canonical days; no identity or date was emitted.

| Initial HealthKit load | Baseline | Candidate | Change |
|---|---:|---:|---:|
| Queries | 10 | 6 | **-40.0%** |
| Rows | 2,630 | 1,349 | **-48.7%** |
| Serialized source bytes | 5,328,161 | 2,843,891 | **-46.6%** |
| Median | 559.4 ms | 404.6 ms | **-27.7%** |
| p95 / max | 857.3 ms | 477.7 ms | **-44.3%** |

This benchmark measures the database hydration stage, not a synthetic claim that the full command will fall by the same percentage. Canonical Evidence remains about 2.5–2.8 MB of the candidate load, and per-domain processing/relationship writes were intentionally not executed against production.

### Privacy-safe diagnostics contract

When `PHYSIQUEOS_PROVIDER_COMMAND_DIAGNOSTICS=1` is separately approved, one `provider.phase3_command.complete` event per command reports:

- total transaction, pool wait, begin, work, commit/rollback;
- application-query count, summed query time, and slowest query;
- advisory-lock wait;
- HealthKit normalization, bounded initial load, observation loop, relationship reassessment, and command-port total; and
- batch observation count, loaded observation/day counts, canonical Evidence/workout counts, and relationship-assessment count.

The sink is non-authoritative: synchronous throws and rejected promises are swallowed, so diagnostics cannot change commit/rollback behavior. The flag is absent in production and was not activated. End-to-end attribution after a later authorized rollout should compare existing Native request timing and `native.command.received.authDurationMs` with the new Server stages; the remaining residual is transport/app scheduling rather than being mislabeled as database time.

## Lane B — Goals and Active Goal

### Active Goal

The prior read performed a Goal query; seven small collection queries; a phase-scoped Training Evidence query; a briefing-candidate query; and, when present, one selected-artifact query. The candidate loads Goal plus all seven small collections in one owner-scoped multi-table query, then runs only the phase-scoped Evidence and briefing reads, followed by the one selected artifact. Selected-briefing query count falls **11 to 4**; rows remain 346 and the API response is byte-for-byte identical.

| Active Goal | Fresh Round 5 baseline | Final candidate | Round 4 tail reference |
|---|---:|---:|---:|
| Queries | 11 | **4** | 11 |
| Median | 499.1 ms | 609.0 ms | 493.7 ms |
| p95 / max | 1,402.9 ms | **909.0 ms** | 4,374.5 ms |
| Response bytes | 11,331 | 11,331 | 11,331 |
| Exact response hash | baseline | **identical** | identical |

The p95 improves 35.2% against the fresh baseline and 79.2% against the Round 4 outlier. Median is slower in this small shared-database sample. An intermediate ten-sample run had 654.9 / 741.2 ms, and a second had 556.1 / 5,456.4 ms; this variability is why the result is not represented as meeting the 750 ms p95 beta gate.

### Aggregate Goals

Aggregate Goals already uses two queries and the bounded Home/Goals projections from `6e68af61`. Round 5 deliberately did not repeat the reverted Training projection that hit the 15-second statement timeout or the global-sort removal that regressed latency. Its response and source shape remained exact: 983 rows, 1,783,214 bytes, 3,291 response bytes.

| Aggregate Goals | Fresh baseline | Final candidate |
|---|---:|---:|
| Median | 839.5 ms | 1,322.7 ms |
| p95 | 1,114.0 ms | 1,730.6 ms |
| Queries | 2 | 2 |
| Exact response hash | baseline | **identical** |

The code path is unchanged; the slower final sample coincided with higher database time across other unchanged reads. It remains above the 750 ms core-read target and is an explicit open blocker, not a hidden success. The next safe step is stage/query-plan evidence under representative pool concurrency, followed by a route-specific indexed/projection design that proves exact response parity before adoption.

## Lane C — production observation checkpoint

Current App Platform state is ACTIVE with Web and Worker both exact `2e4af15c`, build `physiqueos-2e4af15c-20261010`, and the authorized deployment/restart still at 9/9 successful steps. No new deployment or restart occurred.

Latest bounded evidence:

- 20 successful HealthKit observation ingests: median 6,494.74 ms, p95 16,633.33 ms, maximum 25,836.56 ms.
- No statement-timeout, PostgreSQL `57014`, `ETIMEDOUT`, internal-error, or HTTP 500 class appears in the bounded failure aggregation. The observed request failures were 16 ordinary expired-access-token responses and one resource-not-found response.
- Durable adoption boundary remains `2026-10-10T19:44:17.378Z` across the same Worker process.
- Latest sample: active 0, stale 0, adopted-stale 0, historical-stale 0, queued-too-long 0, dead continuation 0; heartbeat age 586 ms; RSS fraction 20.88%; CPU 1.46%.
- One `EVIDENCE_PROCESS_CPU_HIGH` event at `19:46:40Z` sampled 100% CPU two seconds after the controlled restart. Subsequent samples are normal and there was no recovery, recovery failure, or alert-routing failure.

Recovery remained OFF. No historical confirmation replayed. The observation began around `2026-10-10T19:46:50Z`; only approximately three hours had elapsed at this checkpoint, so the seven-day gate cannot be claimed complete before approximately `2026-10-17T19:46:50Z`.

## Validation

| Gate | Result |
|---|---:|
| Foundation suite | **39/39 pass** across 9 files |
| Phase 4 suite | **160/160 pass** across 17 files |
| Phase 5 suite | **82/82 pass** across 10 files |
| Focused HealthKit/Goals regression slice | **298/298 pass** across 15 files |
| Additional command/store focused slice | **39/39 pass** across 5 files |
| Active Goal/Weight post-amend slice | **3/3 pass** |
| Changed-file lint | **pass** |
| Whitespace/diff check | **pass** |
| Read-only production HealthKit load benchmark | **20 alternating samples, rollback, no failure** |
| Read-only core response benchmark | **all response hashes stable and baseline-identical** |
| Source branches | **pushed and clean** |

One broad Phase 3 run produced 322 passing tests and one environment-only failure because this detached Server worktree intentionally has no `private/founder/runtime-store.json`; the same failure is unrelated to changed files. An unscoped all-unit invocation is not a valid gate in this worktree because numerous production-fixture tests require that private file and local HTTP tests cannot bind inside the sandbox. Focused and phase-owned suites above are the valid gates.

## Preserved Native candidate and physical acceptance

Native remains exact clean `9c581059`; Round 5 made no Native edit. It therefore still contains the Founder-only, value-free historical Apple Health preview, HealthKit authorization correction, Watch workout amber styling/footer removal, Today widget Weight removal, priority schedule deduplication, and durable evidence-processing UI. The DEXA Evidence cosmetic cleanup remains queued. Claude's Goal Adaptation work was not read, changed, rebased, or merged.

The already committed physical-device checklist at `docs/operations/APPLE_HEALTH_HISTORICAL_PREVIEW_ACCEPTANCE.md` remains required. Before any TestFlight upload, run the consolidated iPhone/Watch matrix for: repeated launch/background/foreground with no repeated HealthKit sheet; genuinely new permission request; automatic sync; workout start/complete; widget layout/actions; priority cadence; durable processing-state resume after force-quit; and historical preview no-prompt, cancel/retry, force-quit/no-autostart, source/day/gap counts, and before/after production-record parity.

No device preview was run in this round, no historical Health values were uploaded, and no import authority exists.

## Guarded rollout plan — not authorization

Candidate `46dc86c6` is source-review ready, not deployment-authorized. A later guarded rollout should:

1. reverify Founder deployment authority, exact candidate SHA/branch integrity, clean source, current production `2e4af15c`, Web/Worker parity, 9/9 health, migration `000014`, Recovery OFF, durable adoption boundary, no stale/queued/dead work, and unchanged canonical Evidence/performance-record digests;
2. require the seven-day observation to complete without unexplained restart, sustained memory/CPU, stale processing, dead continuation, boundary drift, timeout, or 500;
3. deploy exact `46dc86c6963154f6a3bf2785beb3982969272fe2` only, with no schema/data migration and no simultaneous Native, alert-route, or historical-import change;
4. leave `PHYSIQUEOS_PROVIDER_COMMAND_DIAGNOSTICS` OFF unless a separate, explicit environment-change decision approves bounded temporary telemetry; external alert delivery remains OFF;
5. postflight exact Web/Worker/runtime SHA and 9/9 readiness, Recovery OFF, adoption-boundary continuity, no historical replay, no evidence/performance drift, and representative Home/Goals/Active Goal/Log reads;
6. observe real HealthKit commands with the stage diagnostics if separately enabled, then disable the flag after the bounded window; and
7. roll back to current production `2e4af15c` on SHA/health/data/replay/reliability drift. No database rollback is required because the candidate has no migration.

## Remaining beta-readiness blockers

1. The seven-day production observation is still in progress until approximately Oct 17.
2. Aggregate Goals and Active Goal remain above the proposed p95-below-750-ms core-read gate; the intermediate Active Goal outlier requires representative pool-concurrency observation.
3. HealthKit full-command duration is still 6.5 s median / 25.8 s max in current production. The candidate materially reduces initial loading, but post-rollout stage evidence is required before closing the issue.
4. Consolidated Native physical iPhone/Watch acceptance is pending, including historical preview and durable processing-state recovery; no TestFlight authorization has been exercised.
5. External app-level alert delivery still lacks approved operators, destinations, acknowledgement/escalation, retention/security, and cost decisions. The alert candidate remains dormant.
6. Any Apple Health historical import remains a separately reviewed and separately authorized Stage 3 operation after value-free physical preview evidence.

## Safety flags

- `SERVER_ROUND5_CANDIDATE=46dc86c6963154f6a3bf2785beb3982969272fe2`
- `SERVER_PARENT=b9198382f7c01b8071dfcc35e7c5e6023ff2f6c8`
- `NATIVE_CONSOLIDATED_CANDIDATE=9c58105990fa465c0a4d7d6898d21c271931191f`
- `PRODUCTION_SERVER_CHANGED=NO`
- `RECOVERY_AUTHORITY=OFF`
- `COMMAND_DIAGNOSTICS_ACTIVE=NO`
- `ALERT_ROUTING_ACTIVE=NO`
- `PRODUCTION_DATA_MUTATED=NO`
- `HISTORICAL_HEALTHKIT_IMPORTED=NO`
- `HEALTH_VALUES_UPLOADED=NO`
- `NATIVE_RELEASED=NO`
- `TESTFLIGHT_UPLOADED=NO`
- `PHYSICAL_ACCEPTANCE=PENDING`
- `SEVEN_DAY_OBSERVATION=IN_PROGRESS_NOT_COMPLETE`
- `DEXA_EVIDENCE_COSMETIC=QUEUED_SEPARATELY`
- `GOAL_ADAPTATION_TOUCHED=NO`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. It does not move `latest.json`, `latest.md`, an accepted release pointer, production runtime, infrastructure, alert destination, Recovery authority, canonical data, or TestFlight state.
