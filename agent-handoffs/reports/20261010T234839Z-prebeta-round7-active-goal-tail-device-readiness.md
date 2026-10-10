# Pre-beta optimization Round 7 — Active Goal tail and device readiness

- Published: `2026-10-10T23:48:39Z`
- Instruction commit: `e423f962dc28c582d359f0645ff6d49e511f25b3`
- Prior report: `agent-handoffs/reports/20261010T230811Z-prebeta-round6-native-device-gate-goals.md`
- Live production Server, unchanged: [`2e4af15c67e1899933f315e9ea0c4922151c8803`](https://github.com/dustinginn/physiqueos/commit/2e4af15c67e1899933f315e9ea0c4922151c8803)
- Preserved Round 6 Server candidate: [`8162dd89f13aef470a03dd21b7e396f1555b338a`](https://github.com/dustinginn/physiqueos/commit/8162dd89f13aef470a03dd21b7e396f1555b338a)
- Round 7 Server candidate: [`5f70d59a140aeff9773eab9fbbc2c060523a78a8`](https://github.com/dustinginn/physiqueos/commit/5f70d59a140aeff9773eab9fbbc2c060523a78a8)
- Server review branch: [`codex/prebeta-round7-active-goal-tail-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/prebeta-round7-active-goal-tail-20261010)
- Preserved consolidated Native candidate: [`9c58105990fa465c0a4d7d6898d21c271931191f`](https://github.com/dustinginn/physiqueos/commit/9c58105990fa465c0a4d7d6898d21c271931191f)
- Native tree: `a09d5aec928fae8da974e8a0812a384166879fb6`
- Result: **bounded Active Goal Server candidate accepted; physical-device process prepared; no production deployment, restart, Native install/archive, TestFlight upload, historical import, data repair, or external-alert activation occurred**
- External beta assessment: **NO-GO pending physical iPhone/Watch acceptance and completion of the seven-day reliability observation**

## Executive result

Round 7 resolves the remaining measured Active Goal tail at the source boundary without changing its response, briefing selection, Confidence presentation, training calculation, or canonical data.

The investigation first disproved the Round 6 hypothesis that the selected full briefing was the primary 4.96 MB cost. Projecting that artifact alone removed only 42.5 KB and did not produce a repeatable tail improvement, so that experiment was not accepted by itself. Query-level and collection-level attribution then identified `goalConfidenceHistory` as 4,049,513 bytes of the 4,962,953-byte route. Active Goal was transporting V3 Confidence construction envelopes that the established Home/Goals presentation boundary already discards.

Candidate `5f70d59a` applies that same five-field V3 projection inside PostgreSQL while leaving all non-V3 history byte-for-byte intact. It also retains the safe selected-briefing projection, now backed by exact parity tests for Weekly, Midweek, Monthly, DEXA Event, and Photo Event artifacts. The existing combined collection query and four-query route shape remain intact.

In a paired 20-wave, three-connection read-only production-snapshot run, the legacy and candidate Active Goal requests returned the identical stable response hash `2cbac6ebdc6198b7`. Candidate source hydration fell from 4,962,953 to 1,369,275 bytes, median from 1,225.4 to 762.8 ms, p95 from 4,626.5 to 1,154.1 ms, and p99 from 5,390.4 to 1,322.6 ms. No pool waiting, disk block read, temporary block, mutation, command, or production-code change occurred.

The Native candidate remains exact and clean. Current Xcode inventory still reports both the Founder iPhone and Apple Watch unavailable; therefore no local installation was attempted. The compact physical acceptance sequence below is ready for the moment both devices are connected, unlocked, and verified.

Production remains exact `2e4af15c`, ACTIVE and 9/9 ready. Through `23:47:13Z`, 480 watchdog samples retain the single durable adoption boundary, every work-state risk counter is zero, and peak measured evidence-processing RSS remains 42.7%. The seven-day observation continues to approximately `2026-10-17T19:46:50Z`.

## Lane A — Active Goal tail correction

### Root cause attribution

The committed benchmark now reports p95 and p99 over 20 same-wave samples and attributes serialized source bytes by query and collection. Each wave issues one aggregate Goals request, one legacy Active Goal request, and one candidate Active Goal request simultaneously through a pool capped at three connections. Every request owns a `REPEATABLE READ READ ONLY` transaction, accepts only `SELECT`/`WITH`, disables application commands, and explicitly rolls back.

The baseline 4,962,953 bytes were:

| Legacy Active Goal source | Bytes |
|---|---:|
| Combined canonical collections | 4,290,179 |
| └─ `goalConfidenceHistory` | **4,049,513** |
| Phase-scoped Training Evidence | 614,748 |
| Latest V3 briefing candidates | 9,654 |
| Selected briefing artifact | 48,372 |
| **Total** | **4,962,953** |

This corrects the earlier inference: the selected briefing contributed less than 1% of the route, while Confidence history construction envelopes contributed 81.6%.

### Bounded source contract

For V3 Confidence history only, the database returns the persisted assessment minus exactly these construction-only envelopes:

- `strategicInterpretation`
- `coachingState`
- `confidenceProjection`
- `narrativePlan`
- `evidenceEligibility`

This is the same established projection already used by `createCompactRuntime(..., "goals")`. Active Goal's user-facing Confidence, explanation model, source cutoff, chronology, snapshot binding, briefing binding, history order, and validator-visible presentation fields remain present. The `CASE` applies only to `canonical_confidence_assessment_v3`; V1/V2 compatibility history is unchanged.

The selected briefing read returns only fields consumed by the shared Coach's Take projection. It preserves:

- publication/lifecycle, evidence-window, goal/phase and Confidence lineage;
- canonical Narrative V3;
- Midweek presentation inputs and section suppression behavior;
- Weekly, Midweek and Monthly labels;
- DEXA/Photo event identity through existence markers; and
- exact response structure at the Active Goal boundary.

The repository fallback projects the same artifact shape, so PostgreSQL and compatibility behavior cannot silently diverge.

### Paired performance and parity result

| Three-way paired concurrency, 20 samples each | Legacy Active Goal | Round 7 candidate | Change |
|---|---:|---:|---:|
| Source payload | 4,962,953 B | **1,369,275 B** | **-72.4%** |
| Confidence-history bytes | 4,049,513 B | **498,359 B** | **-87.7%** |
| Selected-artifact bytes | 48,372 B | **5,848 B** | **-87.9%** |
| Median | 1,225.4 ms | **762.8 ms** | **-37.8%** |
| p95 | 4,626.5 ms | **1,154.1 ms** | **-75.1%** |
| p99 / max | 5,390.4 ms | **1,322.6 ms** | **-75.5%** |
| Queue p95 | 0.5 ms | 1.3 ms | immaterial |
| Response hash | `2cbac6ebdc6198b7` | **identical** | exact parity |
| Stable output | yes | **yes** | 20/20 each |

The simultaneous aggregate Goals control remained stable at hash `f9fbff8375cdd576`, 912.2 ms median, 1,153.2 ms p95, and 1,170.7 ms p99. Maximum observed pool waiters remained zero.

The candidate's combined-collection query spends 11.6 ms in PostgreSQL versus 1.9 ms for the legacy full-payload query because JSONB projection has a small CPU cost. That cost is bounded and is outweighed by removing 3.59 MB of network transfer/decoding per request. Its four plans used shared cache only, with zero disk reads and zero temporary blocks; the remaining statements completed in 6.8, 23.3, and 0.8 ms.

The reported latency is representative bounded concurrency against the current production snapshot, not a production load test. Candidate p95 is now effectively level with the concurrent Goals control rather than exhibiting the prior 4–6 second Active Goal tail.

### Rejected intermediate

The initial artifact-only projection produced exact hash parity but moved bytes only from 4,962,953 to 4,920,429. Across repeated 20-wave runs it showed mixed p95/p99 due managed-database variability and did not meet the instruction's “demonstrably better” requirement. It was retained only after the independently justified Confidence-history correction made the complete candidate materially better; it is not cited as the tail fix by itself.

## Lane B — validation

| Gate | Result |
|---|---:|
| Focused Active Goal store/domain/presentation slice | **55/55 pass** across 3 files |
| Store-focused post-SQL-correction rerun | **4/4 pass** |
| Foundation suite | **39/39 pass** across 9 files |
| Phase 4 suite | **161/161 pass** across 17 files |
| Phase 5 suite | **83/83 pass** across 10 files |
| Package 7 broad run | **635 pass / 4 environment-fixture failures** |
| Phase 6 broad run | **567 pass / 3 failures and 1 fixture-blocked suite** |
| Changed-file ESLint | **pass** |
| Whitespace/diff check | **pass** |
| Paired production-snapshot benchmark | **60 measured requests; exact parity; rollback; no failure** |

The Package 7 failures are all four `EnergyEvidenceService` tests and are caused by the intentionally absent untracked `private/founder/migration-control.json` in this candidate worktree. Phase 6 has two tests/suites blocked by absent `private/founder/runtime-store.json`, the existing `/var` versus `/private/var` temporary-path expectation on macOS, and an existing Photos route source-string expectation. Candidate `5f70d59a` changes none of those files or behaviors. They are recorded rather than masked and are not treated as passes.

The live SQL exercise caught two draft JSONB-operator syntax defects before acceptance. Both executions failed before producing an application result, inside read-only transactions that rolled back. The final explicit `text[]` key-removal expression passed the actual PostgreSQL run and all parity gates.

## Lane C — physical iPhone and Watch readiness

### Current gate

| Device | OS/model | State |
|---|---|---|
| Dustin's Phone (`00008150-000970321420401C`) | iPhone 17 Pro / iOS 27.0.1 | **unavailable** |
| Dustin's Apple Watch Ultra (`00008310-0008D5C03C40E01E`) | Apple Watch Ultra 3 / watchOS 27.0.1 | **unavailable** |
| B91 Evidence iPhone 17 Pro | simulator | available |

Native source remains exact `9c58105990fa465c0a4d7d6898d21c271931191f`, tree `a09d5aec928fae8da974e8a0812a384166879fb6`, clean, and connectivity-valid. Round 6's fresh simulator build/tests remain the latest execution evidence: 115/115 selected tests passed while building both iPhone and Watch targets. No Native source or build state changed in Round 7.

### Compact physical process — prepared, not executed

1. Founder connects and unlocks the iPhone by cable, accepts trust if requested, and confirms Developer Mode. Keep the paired Watch unlocked, charged, nearby, and connected to the phone.
2. Re-run Xcode device discovery. Stop unless both physical identifiers above report `available` and Xcode exposes the phone plus paired Watch destination.
3. Reverify exact Native SHA/tree, a clean worktree, at least 12 GiB free, the existing bundle/signing target, and no concurrent archive/upload.
4. Obtain the still-required local-install go-ahead. Use Xcode Run to upgrade the existing device install and embedded Watch companion from exact `9c581059`; do not increment a release build, archive, upload, or use TestFlight.
5. Run **Apple Health History Preview first**: entry must not prompt; only the explicit preview action may query; cancel/restart, background/foreground, and force-quit/reopen; finish 21 bounded seven-day chunks; display only source-separated counts/gaps; prove production records and coaching unchanged.
6. Run three cold launches, three background/foreground cycles, force-quit/relaunch, and update-path checks on iPhone and Watch. A Health permission sheet is allowed only for a genuinely new requested type.
7. Verify Watch amber Ready/Complete/equivalent workout actions and no bottom bar; Today widgets without Weight; `Daily · 5:00 PM` Foam Rolling and other priority cadence/date/time deduplication; and durable Evidence processing/retry/action-required state after app closure and reconnect.
8. Record SHA, device/OS/timezone, timings, screenshots/video, and bounded before/after production counts/digests. Stop on any permission regression, historical value upload, canonical mutation, implicit preview, lost workout action, visual regression, or source/signing drift.

The detailed committed references remain `docs/operations/PREBETA_NATIVE_PHYSICAL_ACCEPTANCE.md` and `docs/operations/APPLE_HEALTH_HISTORICAL_PREVIEW_ACCEPTANCE.md` at the exact Native candidate.

## Lane D — seven-day production reliability observation

The existing window remains anchored to deployment `78a7ea18-764e-4774-b3b1-17f96cf9c8b1` and is not reset by this source-only work.

- App Platform is ACTIVE; Web and Worker both report exact `2e4af15c67e1899933f315e9ea0c4922151c8803` and remain on the same deployment.
- Public liveness returns HTTP 200/`ok`; readiness returns HTTP 200/`ready` with all 9 checks true, including migration `000014`.
- From `2026-10-10T19:46:40.744Z` through `23:47:13.104Z`, 480 reliability samples report one immutable durable adoption boundary: `2026-10-10T19:44:17.378Z`.
- Worker identity and exact build match every sample; maximum heartbeat age is 1,007 ms.
- Maximum active, stale, adopted-stale, historical-stale, queued-too-long, and dead-continuation counts are all zero. No recovery, recovery failure, or Worker crash event appears.
- Maximum reliability-sample RSS is 41.07%. Across 47 memory-budget samples, peak RSS is 42.7% and maximum admission queue wait is 12 ms; the 70% target and 85% hard ceiling remain untouched.
- The only processing alert is the already documented `EVIDENCE_PROCESS_CPU_HIGH` at `19:46:40.745Z`, during Worker startup, with active/stale counts zero and RSS 22.29%. No later processing alert exists.
- Current app configuration still has no command-diagnostics key and no evidence-alert routing enablement, webhook, or bearer-token key. External delivery remains OFF. Recovery publication authority was previously verified absent/OFF, no deployment or configuration mutation occurred, and the observation shows no recovery event.

The window is approximately 4 hours complete. It cannot be called seven-day clean before approximately `2026-10-17T19:46:50Z`.

## Lane E — storage headroom

Round 7 began near the 12 GiB floor. Five clean, already-published report-only worktrees were safely removed; their branches and commits remain recoverable in Git:

- `prebeta-round6-report`
- `p0-immutable-adoption-watermark-report`
- `p0-60d08a22-deploy-report`
- `next-native-widget-remove-weight-report`
- `sep14-training-report`

Free space rose from about 14 GiB to 18 GiB. Creating this clean report worktree uses approximately 653 MiB; current free space is about 17 GiB, five GiB above the hard floor. Server and Native candidate worktrees, DerivedData needed for later device acceptance, user data, ignored private material, and all active work were preserved.

## Guarded Server rollout plan — not authorization

Exact candidate `5f70d59a140aeff9773eab9fbbc2c060523a78a8` is a strict descendant of Round 6 candidate `8162dd89` and live `2e4af15c`. It adds source projection and benchmark/test evidence only; there is no schema, index, migration, data repair, alert activation, Recovery change, or infrastructure change.

A later guarded rollout should:

1. normally wait for the seven-day observation to close unless the Founder explicitly re-scopes that gate;
2. reverify exact deployment authority, candidate integrity/ancestry, clean source, Web/Worker parity, 9/9 health, schema `000014`, the immutable adoption boundary, no active/stale/queued/dead work, Recovery OFF, and canonical Evidence/performance digests;
3. deploy exact `5f70d59a` as the sole Server change, leaving diagnostics, external alerts, Native, TestFlight, historical import, and Goal Adaptation untouched;
4. require exact Web/Worker/runtime SHA parity and 9/9 readiness before acceptance;
5. compare representative Home, Goals, Log, and Active Goal responses, confirm the Active Goal hash/size contract, verify watchdog/memory/no-replay state, and retain bounded logs; and
6. use the documented rollback to exact `2e4af15c` on SHA, readiness, response, data, replay, memory, or latency drift. No database rollback should be required.

## Remaining beta-readiness requirements

1. **Founder device action:** connect/unlock the exact iPhone and paired Watch. Once both are available, separately authorize the prepared direct local install and complete the physical matrix, beginning with the historical Apple Health preview/no-mutation gate.
2. **Reliability:** continue the existing observation through approximately Oct 17. Investigate any restart, adoption-boundary change, sustained memory/CPU pressure, stranded work, or alert.
3. **Server release:** review exact candidate `5f70d59a`; no production deployment is authorized by this report.
4. **HealthKit:** after a separately authorized Server rollout, measure real end-to-end ingest timings. Historical import remains a separate decision after physical preview acceptance.
5. **Operations:** external alert routing still requires destination/operator/acknowledgement/escalation/retention decisions and explicit activation authority.
6. **Release:** TestFlight remains blocked until physical acceptance. Keep at least 12 GiB free before any local install, archive, or simulator rebuild.
7. **Isolation:** keep the DEXA Evidence cosmetic cleanup queued and leave Claude's Goal Adaptation work untouched.

## Safety flags

- `SERVER_ROUND7_CANDIDATE=5f70d59a140aeff9773eab9fbbc2c060523a78a8`
- `SERVER_PARENT=8162dd89f13aef470a03dd21b7e396f1555b338a`
- `NATIVE_CONSOLIDATED_CANDIDATE=9c58105990fa465c0a4d7d6898d21c271931191f`
- `NATIVE_TREE=a09d5aec928fae8da974e8a0812a384166879fb6`
- `PRODUCTION_SERVER_CHANGED=NO`
- `RECOVERY_AUTHORITY=OFF_UNCHANGED`
- `COMMAND_DIAGNOSTICS_ACTIVE=NO`
- `ALERT_ROUTING_ACTIVE=NO`
- `PRODUCTION_DATA_MUTATED=NO`
- `HISTORICAL_HEALTHKIT_IMPORTED=NO`
- `HEALTH_VALUES_UPLOADED=NO`
- `NATIVE_INSTALLED=NO`
- `NATIVE_RELEASED=NO`
- `TESTFLIGHT_UPLOADED=NO`
- `PHYSICAL_ACCEPTANCE=BLOCKED_DEVICES_UNAVAILABLE`
- `SEVEN_DAY_OBSERVATION=IN_PROGRESS_NOT_COMPLETE`
- `DISK_FLOOR_12_GIB=PRESERVED_AT_APPROX_17_GIB`
- `DEXA_EVIDENCE_COSMETIC=QUEUED_SEPARATELY`
- `GOAL_ADAPTATION_TOUCHED=NO`
- `EXTERNAL_BETA=NO_GO`

This publication is report-only and additive. It does not move a release pointer, deploy code, restart a component, alter infrastructure or configuration, activate alerts or Recovery, mutate production data, install or release Native, import historical HealthKit data, or touch Goal Adaptation.
