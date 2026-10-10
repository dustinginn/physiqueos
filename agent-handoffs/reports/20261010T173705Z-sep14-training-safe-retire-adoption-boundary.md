# September 14 Training safe retirement and historical-work adoption boundary — COMPLETE

- Published: `2026-10-10T17:37:05Z`
- Assignment baseline: `02f129f6b379d6ae7ddabfeca2af275df8ec19aa`
- P0 candidate base: `fb1efab8a53f56a1446a98e878077ae56eb148b6`
- Exact next Server candidate: [`60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde`](https://github.com/dustinginn/physiqueos/commit/60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde)
- Candidate branch: [`codex/sep14-training-safe-retire-adoption-boundary-20261010`](https://github.com/dustinginn/physiqueos/tree/codex/sep14-training-safe-retire-adoption-boundary-20261010)
- Production disposition: **PASS — exact stale review retired**
- Candidate decision: **GO for a separately authorized guarded Server rollout**
- External beta: **NO-GO pending rollout, routed alerts, Native state integration, observation window, and open P1 gates**

## Executive result

The September 14 Training confirmation was safely closed without reconstructing or replaying historical processing. A bounded owner-scoped production proof established that the real workout, all set detail, the canonical session relationship, session history, and five performance events were already durable and internally consistent. One exactly identified stale Evidence Review was then changed from version 19 `committing` to version 20 `retired` under a serialized, version/status/timestamp/full-payload fence. No remaining checkpoint ran.

An independent read-only postflight proved that the workout, performance events, session history, Goal records, briefing records, Training records, and outbox audit history were byte-for-byte/aggregate-seal unchanged. The disposition embeds the prior version, payload seal, timestamps, state, claim, and processing reliability data as a rollback anchor.

The new Server candidate adds a durable build-adoption boundary. Stranded work predating the new build stays visible in metrics and alerts but cannot be automatically resumed. Work created after adoption retains the existing bounded recovery behavior across worker restarts. This candidate was not deployed.

## Production authority and safety

Final authority recheck after all candidate gates:

| Gate | Verified result |
|---|---|
| App | `bf57cf56-48cc-4cd6-90e4-a23ee5381741` (`physiqueos-foundation-staging`, historical name) |
| Active deployment | `40122906-34f0-4d0a-91cf-8c943a15e603`, `ACTIVE`, 9/9 successful |
| In-progress deployment | none |
| Live web/worker source and runtime | `85a9802587de0ef23ff2021e803258dea825254d` |
| Build | `physiqueos-85a98025-20261009` |
| Capacity | one 1 GiB web and one 1 GiB worker |
| Health | live HTTP 200 `ok`; ready HTTP 200 `ready`, 9 checks |

The proof and postflight used one bounded connection, `REPEATABLE READ READ ONLY`, explicit `transaction_read_only=on`, owner-scoped `SELECT` statements, sanitized output, and `ROLLBACK`. The apply used a serializable transaction and the owner advisory lock. No deployment, infrastructure, Recovery activation, Native/TestFlight release, Goal Adaptation change, or DEXA Evidence presentation merge occurred. Free disk remained 16 GiB, above the 12 GiB floor.

## Preservation proof

| Evidence | Verified result |
|---|---|
| Target review | exact MD5 identity fence `a413c0b4c9a5…`; version 19; payload SHA-256 `38b3e48780970b0375ac95d5ac18fccd8e5690bd6b58c43f4966ef4e65786cd1` |
| Canonical workout | exactly one source-matched row, one active row, and one semantic instance; payload SHA-256 `2e00e2fa962888c8f4a65fe8005f1be436ba97585220b50a24291a0b1dfb80ba` |
| Workout detail | 4/4 exercises identified; 16/16 sets have reps, loads, and load units; observed timestamp present; review and canonical semantics exactly match |
| Session history | target present among 5 relevant sessions in a bounded 64-row window; SHA-256 `cb60ee631078b776b790babdb1daa97f8a63026e1d3c6a14eca2078db8e71a1a` |
| Performance | 5 unique, structurally complete durable PR events; all five payload seals fixed; the production event producer reproduced the exact persisted event identities and achievement semantics from an existing durable Training analysis |
| Duplicates | no second source-matched/active/semantic workout and no duplicate performance-event identity |
| Continuations | 1 dead audit row and 4 succeeded rows; no pending or processing continuation |

The old checkpoint-named analysis artifact was not itself present. It was not reconstructed. Instead, the existing durable analysis plus the production performance-event algorithm deterministically matched all five stored PR events. This was sufficient to prove that the user-facing workout/performance result was complete without replaying historical work.

The review and canonical workout do not contain separate explicit start/end timestamps; both contain the same observed workout timestamp. This is source parity, not data loss introduced by the disposition.

## Exact disposition and rollback anchor

Authorization reference: `Founder prompt 02f129f6 / 2026-10-10 Sep14 Training safe retirement`.

| Field | Before | After |
|---|---|---|
| Row/payload version | 19 | 20 |
| State | `committing` | `retired` |
| Claim | `available` | `failed`, reason `historical_confirmation_safely_retired` |
| Processing reliability | prior value preserved in anchor | `operator_retired` |
| Payload SHA-256 | `38b3e48780970b0375ac95d5ac18fccd8e5690bd6b58c43f4966ef4e65786cd1` | `37c4b8e395995e62cabf78839702e1fd5a84e8c762eceb9eaf15e7f222f74968` |
| Completed checkpoints | analysis, canonical commit, compatibility writes, scheduled completion | unchanged |
| Rows changed | — | exactly 1 Evidence Review |

The rollback anchor stores the prior version, payload hash, row/payload timestamps, status, commit error, full claim, and prior reliability state. The retained dead continuation remains the audit marker. Because `retired` is outside the watchdog's recoverable state query, this review cannot be selected for automatic recovery.

The first apply attempt safely affected zero rows and rolled back because PostgreSQL retained sub-millisecond row precision beyond the JavaScript seal. The fence was corrected to the exact verified millisecond interval while retaining the owner, collection, full identity hash, version, status, and full prior-payload predicates. A repeated read-only dry run passed before the successful apply. Apply bundle SHA-256: `616819f57d5576ea3554b87c41a9434d5331b3d1e82472ae10e87d65a9f05a08`.

Independent postflight preserved these owner aggregates exactly:

| Protected surface | Count | Digest |
|---|---:|---|
| Goals | 13 | `254b12f7bf836699b1b49f4712856214` |
| Briefings | 61 | `4c2454439ac9ce48a59a7601f59fb3d7` |
| Training | 14,807 | `cbfcaa75599401452c2d7ad414693709` |

## Historical-work adoption boundary

Candidate `60d08a22` derives the adoption watermark from the earlier of the current process start and the earliest persisted worker heartbeat for the immutable build identity:

- on the first process, process start closes the gap before its first heartbeat;
- on later ticks and worker restarts, the earliest same-build heartbeat keeps post-deployment failures adopted;
- reviews older than the watermark remain fully counted and alerting but are never passed to recovery;
- missing/invalid review update timestamps fail closed as historical;
- adopted failures retain the P0 limit of one recovery candidate per tick, lease safety, dead-message revival, and two automatic resumes maximum.

There is no migration or infrastructure dependency. The boundary uses the existing durable heartbeat table and existing immutable build ID.

## Verification

| Check | Result |
|---|---|
| Focused reliability/crash/resume/outbox/cadence/retirement suite | **19 files, 150/150 pass** |
| PostgreSQL atomic recovery/lease/dead-message test | **1 pass, 18 intentionally skipped by name filter** |
| Nine confirmation crash boundaries | **PASS** through `DexaConfirmationCrashMatrix` and resume regressions |
| Historical alert-only + same-build restart adoption tests | **PASS** |
| Provider worker artifact boot collector | **4/4 included and passing** |
| Changed-file ESLint | **PASS** |
| `git diff --check` | **PASS** |
| Next.js production Webpack build | **PASS**; compile, TypeScript, 50/50 static pages, route traces |

One exploratory aggregate test command also encountered the audit's already-open Weight full-ISO `RangeError`, and the manual action suite requires an intentionally absent private `runtime-store.json` fixture. Neither touches this candidate. They were excluded from the final focused aggregate rather than misreported as candidate failures.

## Memory and concurrency remeasurement

Conditions: production-shaped 87.9 MiB synthetic Founder runtime, 150 MiB retained process ballast, Node `--max-old-space-size=512`, nominal 1,024 MiB service limit.

| Scenario | Peak RSS | Limit use | Headroom | Outcome |
|---|---:|---:|---:|---|
| Confirmation entry | 329 MiB | 32.1% | 67.9% | PASS |
| Bounded compatibility write | 333 MiB | 32.5% | 67.5% | PASS |
| Bounded analysis | 340 MiB | 33.2% | 66.8% | PASS |
| Bounded Goal evaluation | 337 MiB | 32.9% | 67.1% | PASS |
| Bounded briefing | 666 MiB | 65.0% | 35.0% | PASS; residual peak |
| Full bounded DEXA confirmation | 661 MiB | 64.6% | 35.4% | PASS |
| Confirmation/cadence contention | 662 MiB | 64.6% | 35.4% | PASS; cadence retryably deferred |

All scenarios completed with zero OOM/restart. The measured maximum stays below the proposed 75% steady/p95 and 85% single-operation ceilings and preserves at least 30% headroom. The pre-remediation audit entry baseline was 885 MiB (86.4%, 13.6% headroom); the remeasured candidate entry is 329 MiB.

## Next deploy gate and remaining risks

The next Server candidate is exactly `60d08a221ee8ba2ad5453f75b6c93d49bdcc3dde`; do not deploy the moving branch or substitute `fb1efab8`. A separate Founder authorization is required. At that time, repeat the authority/health/no-drift preflight, verify Recovery remains OFF, deploy that exact SHA, and perform bounded read-only postflight for runtime identity, health, worker heartbeat, the deployment watermark, historical alert-only classification, and zero unexpected recovery.

Remaining release risks:

1. External operational alert routing is still not active; structured alert logs alone are not sufficient for unattended beta.
2. Native durable processing-state presentation remains a separately reviewed, unreleased plan.
3. Production has not observed this new candidate through the required clean acceptance window.
4. The prior audit's P1 Weight, performance, HealthKit, timeout, note-intake, notification, and new-user recovery gates remain open.
5. DEXA briefing generation remains the memory peak at 666 MiB, although it passes the current thresholds.

The DEXA Evidence page cleanup remains queued for a later consolidated Native build. `latest.md`, `latest.json`, release pointers, Recovery state, production infrastructure, and TestFlight remain unchanged.
